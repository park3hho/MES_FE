// src/components/CompactScanner.jsx
// ★ 워크스페이스용 소형 QR 스캐너
// 호출: BoxManager.jsx → workspace 단계에서 화면 상단에 배치
// 역할: 카메라 + 수동입력 → onScan(val) 콜백 호출
//        스캔 대상 구분(박스 vs 아이템)은 부모가 처리

import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import s from './CompactScanner.module.css'

export default function CompactScanner({ onScan, placeholder = '직접 입력' }) {
  // ── Html5Qrcode는 고유 DOM id 필요 ──
  const containerId = useRef(`cs-${Math.random().toString(36).slice(2, 8)}`).current
  const scannerRef = useRef(null)
  const onScanRef = useRef(onScan)
  const cooldownRef = useRef(false)

  const [input, setInput] = useState('')
  const [error, setError] = useState(null)

  // onScan prop이 바뀌어도 콜백 ref는 최신 유지
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  // ── 카메라 마운트 / 언마운트 ──
  useEffect(() => {
    const scanner = new Html5Qrcode(containerId)
    scannerRef.current = scanner

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
              }, 1500)
            })
        },
        () => {},
      )
      .catch(() => {}) // 카메라 없으면 수동입력만

    return () => {
      scanner.stop().catch(() => {})
    }
  }, [])

  // ── 수동 입력 제출 ──
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
      <div className={s.camera} id={containerId} />
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
