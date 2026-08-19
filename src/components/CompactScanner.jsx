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
  // 카메라 스트림의 실제 종횡비 (width/height). 기본 4:3 은 첫 프레임 전 임시값.
  //   ★ 컨테이너 비율을 스트림에 맞추는 게 핵심이다 (2026-08-18).
  //     html5-qrcode 는 widthRatio=videoWidth/clientWidth, heightRatio=videoHeight/clientHeight 로
  //     잘라낼 영역을 계산한 뒤 qrbox 크기 캔버스에 그린다. 컨테이너가 정사각인데 스트림이 16:9 면
  //     두 비율이 달라져 QR 이 가로로 눌린 채 디코딩된다 — 안 그래도 작은 캔버스에서 치명적.
  const [camRatio, setCamRatio] = useState(4 / 3)

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
          // ★ qrbox = 디코딩 캔버스 크기다 (라이브러리가 이 크기 캔버스에 축소해 그린 뒤 디코딩).
          //   즉 여기 값이 곧 인식 해상도의 상한 — 정사각 min() 으로 잡으면 짧은 변에 묶여
          //   버려지는 픽셀이 생긴다. 뷰파인더 거의 전체를 쓰고, 사람이 겨냥하는 사각 가이드는
          //   이 영역 '안쪽' 에 그린다(보이는 곳은 항상 인식되는 방향으로만 어긋나게).
          qrbox: (vw, vh) => ({
            width: Math.floor(vw * 0.92),
            height: Math.floor(vh * 0.92),
          }),
          // ⚠️ aspectRatio 를 강제하지 않는다 — width/height 를 함께 주던 기존 설정과 모순이라
          //   iOS 에서 16:9 스트림이 정사각 컨테이너에 들어가 종횡비가 깨졌다.
          //   가로 해상도만 요청하고 비율은 기기에 맡긴 뒤, 컨테이너를 그 비율에 맞춘다.
          videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1920 },
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

    // 라이브러리가 만든 <video> 의 실제 해상도를 읽어 컨테이너 비율을 맞춘다.
    //   start() 가 resolve 돼도 첫 프레임 전이면 videoWidth 가 0 이라 잠깐 폴링한다(최대 5초).
    let tries = 0
    const iv = setInterval(() => {
      const v = document.getElementById(containerId)?.querySelector('video')
      if (v?.videoWidth && v?.videoHeight) {
        setCamRatio(v.videoWidth / v.videoHeight)
        clearInterval(iv)
      } else if (++tries > 25) {
        clearInterval(iv)
      }
    }, 200)

    return () => {
      clearInterval(iv)
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
      {/* 종횡비는 스트림에서 읽은 동적 값이라 인라인 (FE 헌법상 동적 값은 허용) */}
      <div className={s.cameraBox} style={{ aspectRatio: String(camRatio) }}>
        {supported
          ? (
            <>
              <video
                ref={videoRef}
                muted
                playsInline
                className={s.camera}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  if (v.videoWidth && v.videoHeight) setCamRatio(v.videoWidth / v.videoHeight)
                }}
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
