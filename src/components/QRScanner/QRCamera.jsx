import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

import s from './QRScanner.module.css'

// 인스턴스별 고유 reader DOM id seq — 고정 'qr-reader' 는 QRCamera 가 연속/동시 마운트되면
//   한쪽 cleanup(비동기 stop 후 innerHTML='') 이 다른 쪽 카메라 DOM 을 비우는 race 발생 (2026-06-15).
let _readerSeq = 0

// ════════════════════════════════════════════
// QR 카메라 — html5-qrcode 초기화 + cleanup
// ════════════════════════════════════════════

// onScan(decodedText) — 인식 성공 콜백
// onError(message) — 카메라/인식 에러 콜백
// continuous — true면 연속 스캔(리스트용), false면 1회 스캔 후 정지
export default function QRCamera({ onScan, onError, continuous = false }) {
  const html5QrRef = useRef(null)
  const scannedRef = useRef(false)
  const readerIdRef = useRef(null)
  if (readerIdRef.current === null) readerIdRef.current = `qr-reader-${_readerSeq++}`
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const readerId = readerIdRef.current
    const qr = new Html5Qrcode(readerId)
    html5QrRef.current = qr
    const cooldownRef = { current: false }

    qr.start(
      // 고해상도로 캡처(모듈당 픽셀↑, 흐린 인쇄 QR 인식 여유↑) 후 중앙만 디코딩(qrbox) — 2026-07-16
      //   width/height 는 ideal 이라 미지원 기기는 자동 하향. crop 은 프레임의 70% 정사각(비율 고정).
      { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      {
        fps: 10,
        qrbox: (vw, vh) => {
          const size = Math.floor(Math.min(vw, vh) * 0.7)
          return { width: size, height: size }
        },
        disableFlip: false,
      },
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
        const video = document.querySelector(`#${readerId} video`)
        if (video) {
          video.style.width = '100%'
          video.style.height = '100%'
          video.style.objectFit = 'cover'
        }
      })
      .catch((err) => {
        // 에러 분류 (2026-04-23):
        //   NotAllowedError / Permission — 권한 거부 → __denied__
        //   NotFoundError / NotSupported / mediaDevices 없음 — 카메라 없음 → __no_camera__
        //   그 외 — 기타 에러
        const name = err?.name || ''
        const msg = String(err || '')
        const isDenied = name === 'NotAllowedError' || msg.includes('Permission')
        const isNoCamera = (
          name === 'NotFoundError' ||
          name === 'NotSupportedError' ||
          name === 'OverconstrainedError' ||
          msg.includes('not supported') ||
          msg.includes('not found') ||
          typeof navigator === 'undefined' ||
          !navigator.mediaDevices
        )
        onError(
          isDenied ? '__denied__'
          : isNoCamera ? '__no_camera__'
          : '카메라를 시작할 수 없습니다.',
        )
      })

    // ────────────────────────────────────────────
    // cleanup — 카메라 스트림 + DOM 정리
    // ────────────────────────────────────────────

    return () => {
      const qrToStop = html5QrRef.current
      if (!qrToStop) return
      html5QrRef.current = null

      const cleanup = () => {
        document.querySelectorAll(`#${readerId} video`).forEach((v) => {
          v.srcObject?.getTracks().forEach((t) => t.stop())
          v.srcObject = null
        })
        const el = document.getElementById(readerId)
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
        id={readerIdRef.current}
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
