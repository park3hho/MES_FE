import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './QRScanPage.module.css'

export default function QRScanPage({ processLabel, onScan, onLogout, onBack }) {
  const [manualInput, setManualInput] = useState('')
  const [error,       setError]       = useState(null)
  const [scanning,    setScanning]    = useState(false)
  const scannerRef = useRef(null)
  const html5QrRef = useRef(null)

  useEffect(() => {
    const qr = new Html5Qrcode('qr-reader')
    html5QrRef.current = qr

    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        setScanning(false)
        qr.stop().catch(() => {})
        onScan(decodedText)
      },
      () => {}
    )
      .then(() => setScanning(true))
      .catch(() => setError('카메라를 시작할 수 없습니다.'))

    return () => { qr.stop().catch(() => {}) }
  }, [])

  const handleManualSubmit = () => {
    const val = manualInput.trim()
    if (!val) return
    if (html5QrRef.current) html5QrRef.current.stop().catch(() => {})
    onScan(val)
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <FaradayLogo size="md" />
          <p className={s.processLabel}>{processLabel}</p>
        </div>

        <p className={s.sectionTitle}>QR 입력</p>
        <div className={s.viewfinderWrap}>
          <div id="qr-reader" ref={scannerRef} className={s.viewfinder} />
          {!scanning && !error && (
            <div className={s.overlay}>
              <div className={s.overlayText}>카메라 로딩 중...</div>
            </div>
          )}
          {error && (
            <div className={s.overlay}>
              <div className={s.overlayText}>{error}</div>
            </div>
          )}
          <div className={`${s.corner} ${s.cornerTL}`} />
          <div className={`${s.corner} ${s.cornerTR}`} />
          <div className={`${s.corner} ${s.cornerBL}`} />
          <div className={`${s.corner} ${s.cornerBR}`} />
        </div>

        <div className={s.manualRow}>
          <input
            className={s.input}
            type="text"
            placeholder="직접 입력 (ETC)"
            value={manualInput}
            onChange={e => setManualInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleManualSubmit() } }}
          />
          <button className={s.confirmBtn} onClick={handleManualSubmit} disabled={!manualInput.trim()}>
            확인
          </button>
        </div>

        <button className={s.textBtn} onClick={onBack ?? onLogout}>
          {onBack ? '이전으로' : '로그아웃'}
        </button>
      </div>
    </div>
  )
}