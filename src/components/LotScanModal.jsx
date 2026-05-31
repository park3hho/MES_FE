// components/LotScanModal.jsx
// LOT 스캔 모달 — QC IQ/IPQ 등 인라인 폼에서 LOT 입력칸 옆에 두는 카메라 트리거 (2026-05-31)
//
// 사용:
//   const [open, setOpen] = useState(false)
//   <input value={lot} ... />
//   <button onClick={() => setOpen(true)}>📷 스캔</button>
//   <LotScanModal open={open} onClose={() => setOpen(false)} onScan={(val) => { setLot(val); setOpen(false) }} />
//
// 기존 QRScanner 컴포넌트가 풀스크린이라 인라인 폼에 안 맞음 → 작은 모달 안에서 <QRCamera> 만 띄움.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCamera from './QRScanner/QRCamera'


export default function LotScanModal({ open, onClose, onScan, title = 'LOT 스캔' }) {
  const [err, setErr] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 열릴 때마다 에러 리셋
  useEffect(() => {
    if (open) { setErr(''); setRetryKey((k) => k + 1) }
  }, [open])

  if (!open) return null

  const onSuccess = (val) => {
    const v = (val || '').trim()
    if (!v) { setErr('빈 값입니다.'); return }
    onScan(v)
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, padding: 16, maxWidth: 380, width: '90%',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>📷 {title}</h3>
          <button onClick={onClose} className="btn-ghost btn-sm" aria-label="닫기">✕</button>
        </div>

        {/* 카메라 영역 — html5-qrcode 가 그리는 #qr-reader div 가 들어감 */}
        <div style={{ width: '100%', minHeight: 280, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
          <div id="qr-reader" style={{ width: '100%' }} />
          {/* 매 open 마다 QRCamera 재마운트 시키려고 key 사용 */}
          <QRCamera
            key={retryKey}
            onScan={onSuccess}
            onError={(msg) => setErr(msg)}
            continuous={false}
          />
        </div>

        {err && (
          <div style={{
            padding: '6px 10px', background: '#fee2e2', color: '#991b1b',
            borderRadius: 6, fontSize: 12,
          }}>
            {err}
            <button
              onClick={() => { setErr(''); setRetryKey((k) => k + 1) }}
              className="btn-text"
              style={{ marginLeft: 8 }}
            >
              재시도
            </button>
          </div>
        )}

        <p style={{ margin: 0, fontSize: 11.5, color: '#6b7280', textAlign: 'center' }}>
          QR 코드를 카메라 중앙에 맞춰주세요. Esc 또는 바깥 클릭으로 닫기.
        </p>
      </div>
    </div>,
    document.body,
  )
}
