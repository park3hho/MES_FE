// pages/process/manage/BODiscardPage.jsx
// 본딩품(BO) 폐기 (2026-08-11) — 발급된 BO 로터를 BO 재고 기준으로 폐기 (요크 EA 경유 X).
//   ★ 자석은 발급 때 이미 차감(1차 N·S / 2차 AZ)돼 있어 기본은 '재고 마킹만'.
//     추가 부착분(BO1 상태에서 2차 AZ 붙이다 불량 등 ledger 미반영분)만 극별 입력 → 창고 차감.
//   회전자 폐기 라우터(RotorDiscardRouter)가 BO 스캔 판별 후 이 화면으로 진입.
import { useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { discardBo } from '@/api'
import s from './YokeIpqPage.module.css'

const MOTOR_LABEL = { inner: '내전', outer: '외전', axial: '축' }

export default function BODiscardPage({ boLot, bo2Done, phi, motorType, onBack }) {
  const [reason, setReason] = useState('')
  const [mags, setMags] = useState({ N: '', S: '', AZ: '' })
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  const doDiscard = async () => {
    if (saving) return
    if (!reason.trim()) { setError('폐기 사유를 입력하세요.'); return }
    setSaving(true); setError(null)
    try {
      const magnets = Object.fromEntries(
        ['N', 'S', 'AZ'].map((p) => [p, parseInt(mags[p], 10) || 0]).filter(([, n]) => n > 0))
      const r = await discardBo(boLot, reason.trim(), Object.keys(magnets).length ? magnets : null)
      setDone(r)
      setTimeout(() => onBack?.(), 1800)
    } catch (e) {
      setError(e.message || '폐기 실패'); setConfirm(false)
    } finally {
      setSaving(false)
    }
  }

  const subtitle = [
    `Φ${phi}`, MOTOR_LABEL[motorType] || motorType,
    bo2Done ? '2차 완료(BO2)' : '1차만(BO1)',
  ].filter(Boolean).join(' · ')

  return (
    <div className="page-flat">
      <PageHeader title="본딩품(BO) 폐기" subtitle={subtitle} onBack={onBack} />

      {done ? (
        <div className={s.doneBox}>
          <p className={s.doneJudge} data-j="FAIL">폐기 완료</p>
          <p className={s.doneSub}>{boLot}</p>
        </div>
      ) : (
        <div className={s.dispose}>
          <div className={s.lotLine}>{boLot} · {bo2Done ? 'BO2' : 'BO1'}</div>
          <p className={s.hint}>
            발급 시 붙인 자석(1차 N·S{bo2Done ? ' / 2차 AZ' : ''})은 이미 창고에서 차감돼 있습니다 — 재고만 폐기 처리됩니다.
          </p>

          <label className={s.remarkLabel}>폐기 사유 *</label>
          <input
            className={s.mInput} value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 본딩 불량 / 자극 불량"
          />

          {!bo2Done && (
            <div className={s.magBox}>
              <span className={s.remarkLabel}>추가 부착 자석 (선택) — 2차(AZ) 붙이다 불량 시만 입력</span>
              <div className={s.magRow}>
                {['N', 'S', 'AZ'].map((p) => (
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
            </div>
          )}

          {error && <p className={s.err}>⚠ {error}</p>}

          {confirm ? (
            <>
              <p className={s.confirmMsg}>이 본딩품을 폐기합니다. 되돌릴 수 없습니다.</p>
              <div className={s.dispBtns}>
                <button className="btn-secondary btn-md" onClick={() => setConfirm(false)} disabled={saving}>취소</button>
                <button className="btn-danger btn-md" onClick={doDiscard} disabled={saving}>
                  {saving ? '폐기 중…' : '폐기 확인'}
                </button>
              </div>
            </>
          ) : (
            <div className={s.dispBtns}>
              <button className="btn-secondary btn-lg" onClick={onBack} disabled={saving}>← 다시 스캔</button>
              <button
                className="btn-danger btn-lg"
                onClick={() => {
                  if (!reason.trim()) { setError('폐기 사유를 입력하세요.'); return }
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
