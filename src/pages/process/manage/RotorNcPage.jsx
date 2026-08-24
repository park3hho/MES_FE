// pages/process/manage/RotorNcPage.jsx
// 회전자 부적합 처리 (IPQ, 2026-08-11) — 스캔 → 단계 판별 → 불량유형 + 붙인 자석 입력 →
//   부적합 격리(NCR 생성 + 재고 nonconforming + 붙인 자석 창고 차감). createNc(source_type='IPQ') 재사용.
//   ★ 요크/BO1 = 자석 붙이는 중이라 붙인 개수 입력 / BO2 = 자석 이미 다 차감돼 입력 불필요.
import { useState } from 'react'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { classifyRotorDiscard, createNc } from '@/api'
import s from './YokeIpqPage.module.css'

const MOTOR_LABEL = { inner: '내전', outer: '외전', axial: '축' }

export default function RotorNcPage({ onLogout, onBack }) {
  const [info, setInfo] = useState(null)   // classify 결과 {route, bo_lot, lot_ea_no, phi, motor_type, bo2_done}
  const [defectType, setDefectType] = useState('')
  const [defectDetail, setDefectDetail] = useState('')
  const [mags, setMags] = useState({ N: '', S: '', AZ: '' })
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  const reset = () => {
    setInfo(null); setDefectType(''); setDefectDetail(''); setMags({ N: '', S: '', AZ: '' })
    setConfirm(false); setError(null); setDone(null)
  }

  const onScan = async (val) => {
    const l = (val || '').trim()
    if (!l) return
    const r = await classifyRotorDiscard(l)   // 이력 없음 시 QRScanner 가 에러 표시
    if (r.route === 'bonded_ea') {
      throw new Error('이 요크는 전량 본딩되었습니다 — 본딩(BO/BM) 번호를 스캔하세요.')
    }
    setInfo(r); setError(null)
  }

  const targetLot = info ? (info.route === 'bo' ? (info.bo_lot || info.scanned) : (info.lot_ea_no || info.scanned)) : ''
  const isBo = info?.route === 'bo'
  const isBo2 = isBo && info?.bo2_done   // BO2 = 자석(N/S/AZ) 이미 다 차감됨 → 추가 입력 불필요
  // 단계별로 '아직 소비 안 된(붙이던) 극'만 입력 — BO1 은 N·S 를 1차 때 이미 차감했으니 2차 AZ 만,
  //   요크(EA)는 본딩 전이라 붙이던 1차 N·S. BO2 는 전부 소비 → 없음. (BE 도 이중차감을 방어)
  const openPoles = isBo2 ? [] : isBo ? ['AZ'] : ['N', 'S']

  const submit = async () => {
    if (saving) return
    if (!defectType.trim()) { setError('불량유형을 입력하세요.'); return }
    setSaving(true); setError(null)
    try {
      const magnets = Object.fromEntries(
        openPoles.map((p) => [p, parseInt(mags[p], 10) || 0]).filter(([, n]) => n > 0))
      const r = await createNc({
        source_type: 'IPQ',
        lot_no: targetLot,
        defect_type: defectType.trim(),
        defect_detail: defectDetail.trim(),
        quantity: 1,
        magnets: Object.keys(magnets).length ? magnets : null,
      })
      setDone(r)
      setTimeout(reset, 1800)
    } catch (e) {
      setError(e.message || '부적합 처리 실패'); setConfirm(false)
    } finally {
      setSaving(false)
    }
  }

  if (!info) {
    return (
      <QRScanner
        processLabel="회전자 부적합 · LOT 스캔 (요크/본딩)"
        onScan={onScan} onLogout={onLogout} onBack={onBack}
      />
    )
  }

  const subtitle = [
    `Φ${info.phi || ''}`, MOTOR_LABEL[info.motor_type] || info.motor_type,
    isBo ? (info.bo2_done ? '본딩 BO2' : '본딩 BO1') : '요크(EA)',
  ].filter(Boolean).join(' · ')

  return (
    <div className="page-flat">
      <PageHeader title="회전자 부적합 처리" subtitle={subtitle} onBack={reset} />

      {done ? (
        <div className={s.doneBox}>
          <p className={s.doneJudge} data-j="FAIL">부적합 격리</p>
          <p className={s.doneSub}>{done.nc_no || targetLot}</p>
        </div>
      ) : (
        <div className={s.dispose}>
          <div className={s.lotLine}>{targetLot}</div>

          <label className={s.remarkLabel}>불량유형 *</label>
          <input
            className={s.mInput} value={defectType} autoFocus
            onChange={(e) => setDefectType(e.target.value)}
            placeholder="예: 자극 불량 / 외관 / 치수"
          />

          <div style={{ marginTop: 12 }}>
            <label className={s.remarkLabel}>불량내용 (선택)</label>
            <textarea
              className={s.remarkInput} rows={2} maxLength={200}
              value={defectDetail} onChange={(e) => setDefectDetail(e.target.value)}
              placeholder="상세 불량 내용"
            />
          </div>

          {/* 자석 입력 — 아직 소비 안 된(붙이던) 극만. BO1=2차 AZ / 요크=1차 N·S / BO2=없음 */}
          {isBo2 ? (
            <p className={s.hint} style={{ marginTop: 12 }}>
              2차 본딩(BO2) 완료분 — 자석(N·S·AZ)은 이미 창고에서 차감돼 있어 추가 입력이 없습니다.
            </p>
          ) : (
            <div className={s.magBox}>
              <span className={s.remarkLabel}>붙인 자석 개수 (극별 · 창고에서 함께 차감)</span>
              <div className={s.magRow}>
                {openPoles.map((p) => (
                  <label key={p} className={s.magCell}>{p}극
                    <input
                      type="text" inputMode="numeric" value={mags[p]}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v !== '' && !/^\d+$/.test(v)) return
                        setMags((m) => ({ ...m, [p]: v }))
                      }}
                      placeholder="0"
                    />
                  </label>
                ))}
              </div>
              <span className={s.magHint}>
                {isBo
                  ? '1차 본딩 완료분 — N·S 는 1차 때 이미 차감됨. 2차(AZ) 붙이다 불량 난 개수만 입력'
                  : '안 붙었으면 0 · 붙이다 불량 난 개수만 입력'}
              </span>
            </div>
          )}

          {error && <p className={s.err}>⚠ {error}</p>}

          {confirm ? (
            <>
              <p className={s.confirmMsg}>부적합품으로 격리합니다 (재고에서 빠짐).</p>
              <div className={s.dispBtns}>
                <button className="btn-secondary btn-md" onClick={() => setConfirm(false)} disabled={saving}>취소</button>
                <button className="btn-danger btn-md" onClick={submit} disabled={saving}>
                  {saving ? '처리 중…' : '부적합 확인'}
                </button>
              </div>
            </>
          ) : (
            <div className={s.dispBtns}>
              <button className="btn-secondary btn-lg" onClick={reset} disabled={saving}>← 다시 스캔</button>
              <button
                className="btn-danger btn-lg"
                onClick={() => {
                  if (!defectType.trim()) { setError('불량유형을 입력하세요.'); return }
                  setError(null); setConfirm(true)
                }}
              >부적합 처리</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
