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
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 100, height: 100 }, aspectRatio: 1.0 },
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
      scanner.stop().catch(() => {})
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
