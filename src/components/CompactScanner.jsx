// src/components/CompactScanner.jsx
// ★ 풀/컴팩트 겸용 QR 스캐너
// compact=false → 카메라 크게, 안내 텍스트 표시
// compact=true  → 카메라 작게, 리스트용

import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './CompactScanner.module.css'

export default function CompactScanner({
  onScan,
  placeholder = '직접 입력',
  compact = false, // ★ 크기 모드
  label = '', // ★ 풀 모드 타이틀
  sublabel = '', // ★ 풀 모드 서브텍스트
}) {
  const containerId = useRef(`cs-${Math.random().toString(36).slice(2, 8)}`).current
  const scannerRef = useRef(null)
  const onScanRef = useRef(onScan)
  const cooldownRef = useRef(false)

  const [input, setInput] = useState('')
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const [cameraFailed, setCameraFailed] = useState(false)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 140, height: 140 }, aspectRatio: 1.0 },
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
      .then(() => setReady(true))
      .catch(() => {
        setCameraFailed(true)
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
    <div className={`${s.wrap} ${compact ? s.wrapCompact : s.wrapFull}`}>
      {/* ── 풀 모드: 로고 + 타이틀 (compact 시 사라짐) ── */}
      <div className={`${s.headerArea} ${compact ? s.headerHidden : ''}`}>
        <FaradayLogo size="md" />
        <p className={s.label}>{label}</p>
        <p className={s.sublabel}>{sublabel}</p>
        <p className={s.sectionTitle}>QR 입력</p>
      </div>

      {/* ── 컴팩트 모드: 작은 안내 ── */}
      <div className={`${s.compactLabel} ${compact ? s.compactLabelShow : ''}`}>{placeholder}</div>

      {/* ── 카메라 ── */}
      <div className={`${s.cameraBox} ${compact ? s.cameraSmall : s.cameraLarge}`}>
        <div className={s.camera} id={containerId} />

        {/* 로딩 */}
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

        {/* 카메라 실패 */}
        {cameraFailed && ready && (
          <div className={s.failedOverlay}>
            <p className={s.failedText}>📷 카메라 사용 불가</p>
            <p className={s.failedSub}>아래에 직접 입력하세요</p>
          </div>
        )}

        {/* 코너 */}
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
          placeholder={compact ? placeholder : '직접 입력 (ETC)'}
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
