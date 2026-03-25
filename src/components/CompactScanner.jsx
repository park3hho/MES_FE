// src/components/CompactScanner.jsx
// ★ 워크스페이스용 소형 QR 스캐너
// 호출: BoxManager.jsx → main 화면 상단
// 역할: 카메라 + 수동입력 + 로딩/에러 상태 표시

import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import s from './CompactScanner.module.css'

export default function CompactScanner({ onScan, placeholder = '직접 입력' }) {
  const containerId = useRef(`cs-${Math.random().toString(36).slice(2, 8)}`).current
  const scannerRef = useRef(null)
  const onScanRef = useRef(onScan)
  const cooldownRef = useRef(false)

  const [input, setInput] = useState('')
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false) // ★ 카메라 준비 완료 여부
  const [cameraFailed, setCameraFailed] = useState(false) // ★ 카메라 실패

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  // ── 카메라 마운트 ──
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
      .then(() => setReady(true)) // ★ 카메라 성공
      .catch(() => {
        setCameraFailed(true) // ★ 카메라 실패 → 수동 입력만
        setReady(true)
      })

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
      {/* ── 카메라 영역 ── */}
      <div className={s.cameraBox}>
        <div className={s.camera} id={containerId} />

        {/* ★ 로딩 오버레이 */}
        {!ready && (
          <div className={s.loadingOverlay}>
            <div className={s.scanLine} />
            <p className={s.loadingText}>카메라 준비 중...</p>
            <div className={s.dots}>
              <span className={s.dot} />
              <span className={s.dot} />
              <span className={s.dot} />
            </div>
          </div>
        )}

        {/* ★ 카메라 실패 오버레이 */}
        {cameraFailed && ready && (
          <div className={s.failedOverlay}>
            <p className={s.failedText}>📷 카메라 사용 불가</p>
            <p className={s.failedSub}>아래에 직접 입력하세요</p>
          </div>
        )}

        {/* ★ 코너 장식 */}
        <div className={`${s.corner} ${s.tl}`} />
        <div className={`${s.corner} ${s.tr}`} />
        <div className={`${s.corner} ${s.bl}`} />
        <div className={`${s.corner} ${s.br}`} />
      </div>

      {/* ── 수동 입력 ── */}
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

      {/* ── 에러 ── */}
      {error && <div className={s.error}>✕ {error}</div>}
    </div>
  )
}
