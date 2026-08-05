// pages/process/manage/YokeDiscardPage.jsx
// 요크 폐기 — IPQ 측정과 진입점 분리 (2026-08-05). 요크 LOT 스캔 → 배치/측정 요약 → 불량 개수만 부분 폐기.
//   ★ 본딩 전(자석 미부착) 단계 → 자석 차감 없음. 배치(N개) 중 입력 개수만 폐기, 나머지 양품은 본딩으로.
//   검사(측정)를 먼저 해야 폐기 가능(BE 가드). 자석 붙은 채 폐기는 RotorDiscardPage(별도).
import { useState } from 'react'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { getYokeIpqData, discardYokeIpq } from '@/api'
import s from './YokeIpqPage.module.css'

const MOTOR_LABEL = { inner: '내전', outer: '외전', axial: '축' }
const J_LABEL = { OK: '양호', FAIL: '불량', PENDING: '미검사' }

export default function YokeDiscardPage({ onLogout, onBack }) {
  const [step, setStep] = useState('scan')      // 'scan' | 'form'
  const [data, setData] = useState(null)
  const [samples, setSamples] = useState([])
  const [count, setCount] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)         // {discarded, remaining}

  const reset = () => {
    setStep('scan'); setData(null); setSamples([]); setCount('')
    setConfirm(false); setError(null); setDone(null)
  }

  const onScan = async (val) => {
    const lot = (val || '').trim()
    if (!lot) return
    const r = await getYokeIpqData(lot)   // 요크 아님/이력 없음 시 QRScanner 가 에러 표시
    setData(r)
    setSamples(r.inspections || [])
    const fail = (r.inspections || []).filter((sp) => sp.judgment === 'FAIL').length
    setCount(String(fail))                // 기본값 = 불량 측정 개수
    setConfirm(false); setError(null); setDone(null)
    setStep('form')
  }

  const okCount = samples.filter((sp) => sp.judgment === 'OK').length
  const failCount = samples.filter((sp) => sp.judgment === 'FAIL').length
  const batchQty = data?.quantity ?? 0

  const doDiscard = async () => {
    if (saving) return
    const cnt = parseInt(count, 10)
    if (isNaN(cnt) || cnt <= 0) { setError('폐기 개수를 1 이상 입력하세요.'); return }
    setSaving(true); setError(null)
    try {
      const r = await discardYokeIpq(data.lot_ea_no, cnt, '요크 IPQ 불량 폐기')
      setDone({ discarded: r.discarded, remaining: r.remaining })
      setTimeout(reset, 1800)
    } catch (e) {
      setError(e.message || '폐기 실패'); setConfirm(false)
    } finally {
      setSaving(false)
    }
  }

  if (step === 'scan') {
    return (
      <QRScanner processLabel="요크 폐기 · 요크(EA) LOT 스캔" onScan={onScan} onLogout={onLogout} onBack={onBack} />
    )
  }

  const subtitle = [
    `Φ${data.phi}`,
    MOTOR_LABEL[data.motor_type] || data.motor_type,
    data.model_name || null,
    data.vendor ? `${data.vendor}호기` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="page-flat">
      <PageHeader title="요크 폐기" subtitle={subtitle} onBack={() => setStep('scan')} />

      {done ? (
        <div className={s.doneBox}>
          <p className={s.doneJudge} data-j="FAIL">폐기 완료</p>
          <p className={s.doneSub}>{done.discarded}개 폐기 · 잔여 {done.remaining}개</p>
        </div>
      ) : (
        <div className={s.dispose}>
          <div className={s.lotLine}>{data.lot_ea_no}</div>

          <div className={s.sumGrid}>
            <div className={s.sumCell}><span>배치</span><b>{batchQty}</b></div>
            <div className={s.sumCell}><span>측정</span><b>{samples.length}</b></div>
            <div className={s.sumCell}><span>양호</span><b data-j="OK">{okCount}</b></div>
            <div className={s.sumCell}><span>불량</span><b data-j="FAIL">{failCount}</b></div>
          </div>

          {samples.length > 0 && (
            <div className={s.sampleList}>
              {samples.map((sp) => (
                <span key={sp.sample_no} className={s.sampleChip}>
                  <span className={s.chipNo}>#{sp.sample_no}</span>
                  <span className={s.chipJ} data-j={sp.judgment}>{J_LABEL[sp.judgment]}</span>
                </span>
              ))}
            </div>
          )}

          <label className={s.discLabel}>폐기 개수
            <input
              className={s.mInput} type="number" inputMode="numeric" min="0" max={batchQty}
              value={count} onChange={(e) => setCount(e.target.value)}
              placeholder="폐기할 불량 개수"
            />
          </label>
          <p className={s.hint}>배치 {batchQty}개 중 입력 개수만 폐기하고, 나머지는 그대로 본딩으로 넘어갑니다. (자석 차감 없음)</p>

          {error && <p className={s.err}>⚠ {error}</p>}

          {confirm ? (
            <>
              <p className={s.confirmMsg}>{count || 0}개를 폐기합니다. 되돌릴 수 없습니다.</p>
              <div className={s.dispBtns}>
                <button className="btn-secondary btn-md" onClick={() => setConfirm(false)} disabled={saving}>취소</button>
                <button className="btn-danger btn-md" onClick={doDiscard} disabled={saving}>
                  {saving ? '폐기 중…' : '폐기 확인'}
                </button>
              </div>
            </>
          ) : (
            <div className={s.dispBtns}>
              <button className="btn-secondary btn-lg" onClick={() => setStep('scan')} disabled={saving}>← 다시 스캔</button>
              <button
                className="btn-danger btn-lg" disabled={saving}
                onClick={() => {
                  const c = parseInt(count, 10)
                  if (isNaN(c) || c <= 0) { setError('폐기 개수를 1 이상 입력하세요.'); return }
                  setError(null); setConfirm(true)
                }}
              >폐기</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
