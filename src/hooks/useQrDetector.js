// hooks/useQrDetector.js
// 네이티브 BarcodeDetector 기반 QR 스캔 훅 (2026-07-16)
//   지원 기기(주로 Android Chrome/삼성)에서 고해상도 스트림을 네이티브 엔진이
//   detect → crop → decode. 미지원(iOS Safari 등)이면 supported=false 반환 →
//   호출부가 html5-qrcode 로 fallback.
//
// 반환: { supported, videoRef, ready, error }
//   supported: null(판별 중) | true(네이티브 경로) | false(fallback 필요)
//   videoRef : supported=true 일 때 <video ref>에 연결
//   error    : '__denied__' | '__no_camera__' | 메시지 | null
import { useRef, useState, useEffect } from 'react'

export function useQrDetector(onScan, { continuous = false } = {}) {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)   // 감지 위치 표시용 <canvas>
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  const [supported, setSupported] = useState(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    let stream = null
    let raf = 0
    const scanned = { current: false }
    const cooldown = { current: false }

    async function init() {
      // 1) 지원 판별 — BarcodeDetector + qr_code 포맷 + mediaDevices
      if (typeof window === 'undefined'
        || !('BarcodeDetector' in window)
        || !navigator.mediaDevices?.getUserMedia) {
        setSupported(false); return
      }
      // ★ iOS(iPhone/iPad) 는 항상 fallback(html5-qrcode) — 최신 iOS Safari 가 BarcodeDetector 를
      //   노출하지만 detect() 가 QR 을 못 잡는 사례(카메라는 뜨는데 인식만 안 됨) → 네이티브 경로 배제 (2026-08-04).
      //   (iPadOS 는 UA 가 Macintosh 로 나올 수 있어 터치포인트로 보조 판별.)
      const ua = navigator.userAgent || ''
      const isIOS = /iPhone|iPad|iPod/i.test(ua)
        || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1)
      if (isIOS) { setSupported(false); return }
      try {
        const fmts = await window.BarcodeDetector.getSupportedFormats()
        if (!fmts.includes('qr_code')) { setSupported(false); return }
      } catch { setSupported(false); return }
      if (cancelled) return
      setSupported(true)

      // 2) 고해상도 스트림 확보 (ideal 이라 미지원 기기는 자동 하향)
      let detector
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } },
        })
      } catch (e) {
        if (cancelled) return
        const name = e?.name || ''
        setError(
          name === 'NotAllowedError' || String(e).includes('Permission') ? '__denied__'
          : (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotSupportedError') ? '__no_camera__'
          : '카메라를 시작할 수 없습니다.',
        )
        return
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }

      const video = videoRef.current
      if (!video) { stream.getTracks().forEach((t) => t.stop()); return }
      video.srcObject = stream
      video.muted = true
      video.setAttribute('playsinline', 'true')
      try { await video.play() } catch { /* autoplay 예외 무시 */ }
      if (cancelled) return
      setReady(true)

      // 감지 위치를 오버레이 <canvas>에 그림 — video 원본좌표 → 표시좌표(object-fit:cover) 변환
      const drawOverlay = (codes) => {
        const canvas = overlayRef.current
        if (!canvas || !video) return
        const dispW = video.clientWidth
        const dispH = video.clientHeight
        if (!dispW || !dispH) return
        if (canvas.width !== dispW) canvas.width = dispW
        if (canvas.height !== dispH) canvas.height = dispH
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, dispW, dispH)
        const vw = video.videoWidth
        const vh = video.videoHeight
        if (!codes || !codes.length || !vw || !vh) return
        const scale = Math.max(dispW / vw, dispH / vh)   // object-fit: cover
        const offX = (dispW - vw * scale) / 2
        const offY = (dispH - vh * scale) / 2
        for (const code of codes) {
          const pts = (code.cornerPoints || []).map((p) => ({ x: p.x * scale + offX, y: p.y * scale + offY }))
          if (pts.length < 3) continue
          ctx.beginPath()
          ctx.moveTo(pts[0].x, pts[0].y)
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
          ctx.closePath()
          ctx.fillStyle = 'rgba(255, 107, 44, 0.18)'
          ctx.fill()
          ctx.lineWidth = 4
          ctx.strokeStyle = '#FF6B2C'
          ctx.stroke()
        }
      }

      // 3) detect 루프 — 매 프레임 네이티브 탐지 (엔진이 위치 찾아 crop·decode).
      //    detect·오버레이는 항상, onScan 만 busy(쿨다운/1회완료)로 gate.
      //    ★ detect 가 한 번도 성공 못 하고 연속 실패하면 = "지원한다고 답해놓고 detect 는 고장"인
      //      기기(일부 iOS 등) → 네이티브 포기하고 fallback(html5-qrcode) 전환 (2026-08-04 안전망).
      let detectOk = false
      let detectFails = 0
      const tick = async () => {
        if (cancelled) return
        if (video.readyState >= 2) {
          try {
            const codes = await detector.detect(video)
            detectOk = true
            drawOverlay(codes)
            const busy = cooldown.current || (!continuous && scanned.current)
            if (!busy && codes && codes.length) {
              const val = (codes[0].rawValue || '').trim()
              if (val) {
                if (continuous) {
                  cooldown.current = true
                  Promise.resolve(onScanRef.current(val))
                    .catch((e) => setError(e.message || 'QR 인식 실패'))
                    .finally(() => setTimeout(() => { cooldown.current = false }, 1500))
                } else {
                  scanned.current = true
                  Promise.resolve(onScanRef.current(val))
                    .catch((e) => { scanned.current = false; setError(e.message || 'QR 인식 실패') })
                }
              }
            }
          } catch {
            // detect 일시 실패 — 다음 프레임 재시도. 단, 성공 이력 없이 연속 실패가 쌓이면
            // detect 자체가 고장난 기기 → 스트림 정리 후 fallback 전환 (effect deps 에 supported 가
            // 없어 cleanup 이 안 돌므로 여기서 직접 정지).
            detectFails += 1
            if (!detectOk && detectFails >= 15) {
              stream?.getTracks().forEach((t) => t.stop())
              setReady(false)
              setSupported(false)   // → QRCamera fallback(html5-qrcode) 시작 (busy 재시도 내장)
              return                // raf 재예약 안 함 = 루프 종료
            }
          }
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    init()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continuous])

  return { supported, videoRef, overlayRef, ready, error }
}
