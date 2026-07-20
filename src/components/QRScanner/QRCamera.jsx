import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

import { useQrDetector } from '@/hooks/useQrDetector'
import s from './QRScanner.module.css'

// 인스턴스별 고유 reader DOM id seq — 고정 'qr-reader' 는 QRCamera 가 연속/동시 마운트되면
//   한쪽 cleanup(비동기 stop 후 innerHTML='') 이 다른 쪽 카메라 DOM 을 비우는 race 발생 (2026-06-15).
let _readerSeq = 0

// ════════════════════════════════════════════
// QR 카메라 — 하이브리드 (2026-07-16)
//   1순위: 네이티브 BarcodeDetector (고해상도 detect→crop→decode, 주로 Android)
//   fallback: html5-qrcode (미지원 기기 — iOS Safari 등), 고해상도 캡처 + qrbox crop
// ════════════════════════════════════════════

// onScan(decodedText) — 인식 성공 콜백
// onError(message) — 카메라/인식 에러 콜백
// continuous — true면 연속 스캔(리스트용), false면 1회 스캔 후 정지
export default function QRCamera({ onScan, onError, continuous = false }) {
  // ── 네이티브 경로 (BarcodeDetector) ──
  const { supported, videoRef, overlayRef, ready: nativeReady, error: nativeError } = useQrDetector(onScan, { continuous })

  useEffect(() => {
    if (nativeError) onError(nativeError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeError])

  // ── fallback 경로 (html5-qrcode) — supported === false 일 때만 ──
  const html5QrRef = useRef(null)
  const scannedRef = useRef(false)
  const readerIdRef = useRef(null)
  if (readerIdRef.current === null) readerIdRef.current = `qr-reader-${_readerSeq++}`
  const [fbReady, setFbReady] = useState(false)

  useEffect(() => {
    if (supported !== false) return   // 네이티브 지원(또는 판별 중)이면 html5-qrcode 미사용

    const readerId = readerIdRef.current
    const qr = new Html5Qrcode(readerId)
    html5QrRef.current = qr
    const cooldownRef = { current: false }
    let cancelled = false

    const onDecode = async (rawText) => {
      const decodedText = rawText.trim()
      if (continuous) {
        if (cooldownRef.current) return
        cooldownRef.current = true
        try {
          await onScan(decodedText)
        } catch (e) {
          onError(e.message || 'QR 인식 실패')
        } finally {
          setTimeout(() => { cooldownRef.current = false }, 300)
        }
        return
      }
      if (scannedRef.current) return
      scannedRef.current = true
      try {
        await onScan(decodedText)
      } catch (e) {
        scannedRef.current = false
        onError(e.message || 'QR 인식 실패')
      }
    }

    // iOS(Safari) 는 카메라 단일 소비자만 허용 → 이전 스캔 화면의 스트림이 아직 안 풀렸으면
    // start() 가 NotReadableError/AbortError 로 실패한다. 해제될 시간을 주며 몇 번 재시도 (2026-07-17 fix).
    const startWithRetry = async () => {
      // 고해상도 캡처 후 중앙 70% 정사각만 디코딩(qrbox)
      const cameraConfig = { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      const scanConfig = {
        fps: 10,
        qrbox: (vw, vh) => {
          const size = Math.floor(Math.min(vw, vh) * 0.7)
          return { width: size, height: size }
        },
        disableFlip: false,
      }
      const MAX = 4
      for (let attempt = 0; attempt < MAX; attempt++) {
        if (cancelled) return
        try {
          await qr.start(cameraConfig, scanConfig, onDecode, () => {})
          if (cancelled) { qr.stop().catch(() => {}); return }
          setFbReady(true)
          const video = document.querySelector(`#${readerId} video`)
          if (video) {
            video.style.width = '100%'
            video.style.height = '100%'
            video.style.objectFit = 'cover'
          }
          return
        } catch (err) {
          // html5-qrcode 는 DOMException 이 아니라 문자열/무명 객체로 reject 하기도 함(그래서 err.name 이 빔)
          //  → name·message·전체 문자열을 합쳐 소문자로 분류 (2026-07-17)
          const detail = [err?.name, err?.message, String(err ?? '')]
            .filter(Boolean).join(' ').trim()
          const hay = detail.toLowerCase()
          // 카메라 점유(직전 스트림 미해제) → 잠깐 뒤 재시도
          const isBusy = hay.includes('notreadable') || hay.includes('aborterror')
            || hay.includes('could not start') || hay.includes('starting video')
            || hay.includes('start video source')
          if (isBusy && attempt < MAX - 1) {
            await new Promise((r) => setTimeout(r, 350 * (attempt + 1)))
            continue
          }
          const isDenied = hay.includes('notallowed') || hay.includes('permission') || hay.includes('denied')
          const isNoCamera = hay.includes('notfound') || hay.includes('notsupported')
            || hay.includes('overconstrained') || hay.includes('not supported') || hay.includes('not found')
            || typeof navigator === 'undefined' || !navigator.mediaDevices
          onError(
            isDenied ? '__denied__'
            : isNoCamera ? '__no_camera__'
            : `카메라 시작 실패: ${detail.slice(0, 90) || '원인 미상'}`,   // 실제 에러 전문 노출(진단)
          )
          return
        }
      }
    }
    startWithRetry()

    return () => {
      cancelled = true
      const qrToStop = html5QrRef.current
      html5QrRef.current = null

      // iOS: 다음 마운트가 카메라를 곧바로 잡을 수 있도록 트랙을 즉시(동기) 정지 —
      // async stop() 완료를 기다리지 않고 먼저 해제해야 NotReadableError 를 막는다.
      document.querySelectorAll(`#${readerId} video`).forEach((v) => {
        v.srcObject?.getTracks().forEach((t) => t.stop())
        v.srcObject = null
      })

      if (!qrToStop) return
      const clear = () => {
        const el = document.getElementById(readerId)
        if (el) el.innerHTML = ''
      }
      try {
        const state = qrToStop.getState()
        if (state === 1 || state === 2) qrToStop.stop().catch(() => {}).finally(clear)
        else clear()
      } catch { clear() }
    }
  }, [supported])   // eslint-disable-line react-hooks/exhaustive-deps

  const ready = supported ? nativeReady : fbReady

  // ── 렌더 ──
  return (
    <>
      {supported
        ? (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: ready ? 1 : 0,
                transition: 'opacity 0.3s ease',
              }}
            />
            {/* 감지 위치 오버레이 (BarcodeDetector cornerPoints) */}
            <canvas
              ref={overlayRef}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          </div>
        )
        : (
          <div
            id={readerIdRef.current}
            style={{
              width: '100%',
              height: '100%',
              opacity: ready ? 1 : 0,
              transition: 'opacity 0.3s ease',
            }}
          />
        )}
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
