// src/components/CompactScanner.jsx
// ★ 워크스페이스용 소형 QR 스캐너
// 호출: BoxManager.jsx → workspace 상단

import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import s from './CompactScanner.module.css'

export default function CompactScanner({ onScan, placeholder = '직접 입력' }) {
  const containerId = useRef(`cs-${Math.random().toString(36).slice(2, 8)}`).current
  const onScanRef = useRef(onScan)
  const cooldownRef = useRef(false)

  const [input, setInput] = useState('')
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId)
    scanner
      .start(
        // 고해상도 캡처 후 중앙만 디코딩(qrbox) — 인라인 스캐너라 720p 로 (부하 절충), 2026-07-16
        { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        {
          fps: 10,
          qrbox: (vw, vh) => {
            const size = Math.floor(Math.min(vw, vh) * 0.8)
            return { width: size, height: size }
          },
          aspectRatio: 1.0,
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
              setTimeout(() => {
                cooldownRef.current = false
              }, 300)
            })
        },
        () => {},
      )
      .then(() => setReady(true))
      .catch(() => setReady(true))

    return () => {
      // scanner.stop() 은 스캐너가 SCANNING/PAUSED 가 아니면 동기로 throw 함
      // ("Cannot stop, scanner is not running or paused"). start() 가 아직
      // pending 이거나 실패(데스크탑 카메라 없음/권한 거부 등)면 그 상태가 됨.
      // .catch() 는 Promise reject 만 잡아 동기 throw 를 못 막으므로 try 로 감싼다.
      // (QRCamera 와 동일한 방어 — 2026-05-22)
      try {
        const ret = scanner.stop()
        if (ret && typeof ret.then === 'function') ret.catch(() => {})
      } catch {
        /* 스캐너 미동작 — stop 불가, 무시 */
      }
    }
  }, [])

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
        <div className={s.camera} id={containerId} />
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
