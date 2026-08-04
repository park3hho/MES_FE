// pages/process/manage/RotorBondRollbackPage.jsx
// 로터 본딩 롤백 (2026-08-04) — 요크 개수 잘못 입력해 과다 발급한 본딩(BO) 취소.
//   흐름: 본딩(BO) LOT QR 스캔 → 그 요크 배치·복원될 자석 확인 → 롤백
//         (BO 무효 + 요크 1개 배치 복원 + 소비 자석 창고 원복 + 수불대장 역기록).
//   RT 완성·검사·폐기된 로터는 롤백 불가(BE 가 409 반환 → 스캔 단계에서 에러 토스트).
//   BE: GET /inventory/rotor/rollback-bo/{bo}(미리보기), POST /inventory/rotor/rollback-bo {bo_lot}(실행).
import { useState } from 'react'

import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { previewRboRollback, rollbackRbo } from '@/api'

export default function RotorBondRollbackPage({ onLogout, onBack }) {
  const [step, setStep] = useState('scan')   // 'scan' | 'confirm' | 'done'
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const reset = () => { setStep('scan'); setPreview(null); setResult(null); setBusy(false); setErr(null) }

  const doRollback = async () => {
    if (!preview || busy) return
    setBusy(true); setErr(null)
    try {
      const r = await rollbackRbo(preview.bo_lot)
      setResult(r); setStep('done')
    } catch (e) {
      setErr(e.message || '롤백 실패')
    } finally { setBusy(false) }
  }

  if (step === 'scan') {
    return (
      <QRScanner
        processLabel="본딩 롤백 · BO LOT 스캔"
        banner={<p style={{ color: 'var(--color-text-sub)', margin: 0 }}>잘못 발급한 본딩(BO) 라벨의 LOT 을 스캔하세요</p>}
        onScan={async (val) => {
          const bo = (val || '').trim()
          if (!bo) throw new Error('빈 값입니다.')
          const p = await previewRboRollback(bo)   // 없거나 롤백불가면 404/409 throw → 재스캔 허용
          setPreview(p); setStep('confirm')
        }}
        onLogout={onLogout}
        onBack={onBack}
      />
    )
  }

  return (
    <div className="page-flat">
      <PageHeader title="로터 본딩 롤백" subtitle="과다 발급한 본딩 취소 + 요크·자석 되돌리기" onBack={reset} />
      <div className="page-content" style={{ maxWidth: 480 }}>
        {step === 'confirm' && preview && (
          <>
            <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{preview.bo_lot}</p>
            <p style={{ color: 'var(--color-text-sub)', margin: '0 0 12px' }}>
              Φ{preview.phi} {preview.motor_type}
            </p>
            <p style={{ margin: '0 0 4px' }}>
              요크 배치 <b>{preview.ea_lot || '—'}</b> 에 <b>+{preview.yoke_restore}개</b> 복원
            </p>
            <p style={{ margin: '0 0 4px' }}>복원될 자석</p>
            {(!preview.magnets || preview.magnets.length === 0) ? (
              <p style={{ color: 'var(--color-text-sub)', margin: '0 0 12px' }}>없음 (기록된 자석 소비 없음)</p>
            ) : (
              <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                {preview.magnets.map((m, i) => (
                  <li key={i}>{m.item_name || m.lot_no} — {m.qty}개</li>
                ))}
              </ul>
            )}
            {err && <p style={{ color: 'var(--color-danger, #d23f3f)', fontWeight: 600, marginBottom: 12 }}>{err}</p>}
            <button type="button" className="btn-danger btn-lg btn-full" disabled={busy} onClick={doRollback}>
              {busy ? '처리 중…' : '롤백 (무효 + 복원)'}
            </button>
            <button type="button" className="btn-text" style={{ marginTop: 12 }} onClick={reset}>취소 · 다시 스캔</button>
          </>
        )}
        {step === 'done' && result && (
          <>
            <p style={{ margin: '0 0 12px', fontWeight: 700, color: 'var(--color-primary, #2b7)' }}>✅ 롤백 완료</p>
            <p style={{ margin: '0 0 4px' }}>본딩 <b>{result.bo_lot}</b> 무효 처리</p>
            <p style={{ margin: '0 0 4px' }}>요크 배치 <b>{result.ea_lot || '—'}</b> +{result.yoke_restored}개 복원</p>
            <p style={{ margin: '0 0 16px' }}>자석 {result.magnets_restored?.length || 0}종 창고 복원</p>
            <button type="button" className="btn-primary btn-lg btn-full" onClick={reset}>다음 스캔</button>
          </>
        )}
      </div>
    </div>
  )
}
