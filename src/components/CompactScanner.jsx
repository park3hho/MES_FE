// src/components/CompactScanner.jsx
// ★ 워크스페이스용 소형 QR 스캐너 — 하이브리드 (2026-07-16)
//   1순위: 네이티브 BarcodeDetector (고해상도 detect→crop→decode)
//   fallback: html5-qrcode (미지원 기기), 고해상도 캡처 + qrbox crop
// 호출: BoxManager.jsx → workspace 상단

import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useQrDetector } from '@/hooks/useQrDetector'
import s from './CompactScanner.module.css'

export default function CompactScanner({ onScan, placeholder = '직접 입력' }) {
  const containerId = useRef(`cs-${Math.random().toString(36).slice(2, 8)}`).current
  const onScanRef = useRef(onScan)
  const cooldownRef = useRef(false)

  const [input, setInput] = useState('')
  const [error, setError] = useState(null)
  const [fbReady, setFbReady] = useState(false)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  // ── 네이티브 경로 (BarcodeDetector), 연속 스캔 ──
  const { supported, videoRef, overlayRef, ready: nativeReady, error: nativeError } = useQrDetector(onScan, { continuous: true })

  useEffect(() => {
    if (!nativeError || nativeError.startsWith('__')) return  // 권한/카메라 시그널은 여기선 조용히
    setError(nativeError)
    const t = setTimeout(() => setError(null), 2000)
    return () => clearTimeout(t)
  }, [nativeError])

  // ── fallback 경로 (html5-qrcode) — supported === false 일 때만 ──
  useEffect(() => {
    if (supported !== false) return

    const scanner = new Html5Qrcode(containerId)
    scanner
      .start(
        // ⚠️ 첫 인자(카메라 선택)는 키 1개만 허용 — 해상도는 videoConstraints 로 (2026-07-17 fix)
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (vw, vh) => {
            const size = Math.floor(Math.min(vw, vh) * 0.8)
            return { width: size, height: size }
          },
          aspectRatio: 1.0,
          videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        (text) => {
          if (cooldownRef.current) return
          cooldownRef.current = true
          Promise.resolve(onScanRef.current(text))
            .catch((e) => {
              setError(e.message)
              setTimeout(() => setError(null), 2000)
            })
            .finally(() => {
              setTimeout(() => { cooldownRef.current = false }, 300)
            })
        },
        () => {},
      )
      .then(() => setFbReady(true))
      .catch(() => setFbReady(true))

    return () => {
      try {
        const ret = scanner.stop()
        if (ret && typeof ret.then === 'function') ret.catch(() => {})
      } catch {
        /* 스캐너 미동작 — stop 불가, 무시 */
      }
    }
  }, [supported])   // eslint-disable-line react-hooks/exhaustive-deps

  const ready = supported ? nativeReady : fbReady

  const handleManual = async () => {
    const val = input.trim()
    if (!val) return
    try {
      await onScan(val)
      setInput('')
      setError(null)
    } catch (e) {
      setError(e.message)
      setTimeout(() => setError(null), 2000)
    }
  }

  return (
    <div className={s.wrap}>
      <div className={s.cameraBox}>
        {supported
          ? (
            <>
              <video
                ref={videoRef}
                muted
                playsInline
                className={s.camera}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <canvas
                ref={overlayRef}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
              />
            </>
          )
          : <div className={s.camera} id={containerId} />}
        {/* 중앙 스캔 박스 (반투명 마스크) + 브랜드 오렌지 코너 + 스캔 라인 */}
        <div className={s.scanBox}>
          <span className={`${s.corner} ${s.cornerTL}`} />
          <span className={`${s.corner} ${s.cornerTR}`} />
          <span className={`${s.corner} ${s.cornerBL}`} />
          <span className={`${s.corner} ${s.cornerBR}`} />
          <span className={s.scanLine} />
        </div>
        {!ready && <div className={s.loading}>카메라 준비 중...</div>}
      </div>
      <div className={s.inputRow}>
        <input
          className={s.input}
          type="text"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleManual()
            }
          }}
        />
        <button className={s.btn} onClick={handleManual} disabled={!input.trim()}>
          확인
        </button>
      </div>
      {error && <div className={s.error}>✕ {error}</div>}
    </div>
  )
}
