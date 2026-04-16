import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

import s from './QRScanner.module.css'

// ════════════════════════════════════════════
// QR 카메라 — html5-qrcode 초기화 + cleanup
// ════════════════════════════════════════════

// onScan(decodedText) — 인식 성공 콜백
// onError(message) — 카메라/인식 에러 콜백
// continuous — true면 연속 스캔(리스트용), false면 1회 스캔 후 정지
export default function QRCamera({ onScan, onError, continuous = false }) {
  const html5QrRef = useRef(null)
  const scannedRef = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const qr = new Html5Qrcode('qr-reader')
    html5QrRef.current = qr
    const cooldownRef = { current: false }

    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: undefined, disableFlip: false },
      async (rawText) => {
        const decodedText = rawText.trim()
        // 연속 모드: 1.5초 쿨다운 (CompactScanner와 동일)
        if (continuous) {
          if (cooldownRef.current) return
          cooldownRef.current = true
          try {
            await onScan(decodedText)
          } catch (e) {
            onError(e.message || 'QR 인식 실패')
          } finally {
            setTimeout(() => {
              cooldownRef.current = false
            }, 300)
          }
          return
        }

        // 단건 모드: 1회 스캔 후 정지, 에러 시 카메라 재시작
        if (scannedRef.current) return
        scannedRef.current = true
        try {
          await onScan(decodedText)
        } catch (e) {
          scannedRef.current = false
          onError(e.message || 'QR 인식 실패')
        }
      },
      () => {},
    )
      .then(() => {
        setReady(true)
        const video = document.querySelector('#qr-reader video')
        if (video) {
          video.style.width = '100%'
          video.style.height = '100%'
          video.style.objectFit = 'cover'
        }
      })
      .catch((err) => {
        const isDenied = err?.name === 'NotAllowedError' || String(err).includes('Permission')
        onError(isDenied ? '__denied__' : '카메라를 시작할 수 없습니다.')
      })

    // ────────────────────────────────────────────
    // cleanup — 카메라 스트림 + DOM 정리
    // ────────────────────────────────────────────

    return () => {
      const qrToStop = html5QrRef.current
      if (!qrToStop) return
      html5QrRef.current = null

      const cleanup = () => {
        document.querySelectorAll('#qr-reader video').forEach((v) => {
          v.srcObject?.getTracks().forEach((t) => t.stop())
          v.srcObject = null
        })
        const el = document.getElementById('qr-reader')
        if (el) el.innerHTML = ''
      }

      try {
        const state = qrToStop.getState()
        if (state === 1 || state === 2) {
          qrToStop
            .stop()
            .catch(() => {})
            .finally(cleanup)
        } else {
          cleanup()
        }
      } catch {
        cleanup()
      }
    }
  }, [])

  // ────────────────────────────────────────────
  // 렌더링
  // ────────────────────────────────────────────

  return (
    <>
      <div
        id="qr-reader"
        style={{
          width: '100%',
          height: '100%',
          opacity: ready ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />
      <div
        className={s.overlay}
        style={{
          zIndex: 2,
          opacity: ready ? 0 : 1,
          transition: 'opacity 0.3s ease',
          pointerEvents: ready ? 'none' : 'auto',
        }}
      >
        <div className={s.scanLine} />
        <p className={s.overlayText}>카메라 준비 중...</p>
        <div className={s.loadingDots}>
          <span className={s.dot} />
          <span className={s.dot} />
          <span className={s.dot} />
        </div>
      </div>
    </>
  )
}
