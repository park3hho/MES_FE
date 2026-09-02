// hooks/useFullscreen.js
// 브라우저가 전체화면인지 (2026-09-02) — 현황판(보기 전용) 모드 진입 판정용.
//
// ★ F11 은 Fullscreen API 가 아니다 — `document.fullscreenElement` 가 null 이라 그것만
//   보면 F11 을 절대 못 잡는다. 그래서 세 신호를 OR 로 본다:
//     ① document.fullscreenElement  — requestFullscreen() 으로 들어간 경우
//     ② (display-mode: fullscreen)  — F11. Chrome·Edge·Firefox 가 이렇게 보고한다
//     ③ innerHeight >= screen.height — ②를 안 주는 브라우저용 폴백(브라우저 크롬이 없으면 같아진다)
//   ③ 은 창 크기가 화면과 딱 맞는 환경에서 오탐할 수 있다 — 그래서 호출부(App.jsx)는
//   이 값을 **조회 전용 화면에서만** 쓴다. 입력 화면에서 nav 가 사라지면 빠져나갈 길이 없다.
import { useEffect, useState } from 'react'

const FS_QUERY = '(display-mode: fullscreen)'

function read() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false
  if (document.fullscreenElement) return true
  try {
    if (window.matchMedia(FS_QUERY).matches) return true
  } catch { /* matchMedia 미지원 — 다음 신호로 */ }
  const sh = window.screen?.height
  return !!sh && window.innerHeight >= sh
}

export function useFullscreen() {
  const [full, setFull] = useState(read)

  useEffect(() => {
    const sync = () => setFull(read())
    let mq = null
    try { mq = window.matchMedia(FS_QUERY) } catch { /* 미지원 */ }

    document.addEventListener('fullscreenchange', sync)
    window.addEventListener('resize', sync)   // ③ 폴백용 — F11 은 리사이즈를 동반한다
    // Safari 구버전은 MediaQueryList.addEventListener 가 없다 → addListener 폴백
    if (mq?.addEventListener) mq.addEventListener('change', sync)
    else mq?.addListener?.(sync)

    sync()   // 마운트 시점에 이미 전체화면일 수 있다 (F11 상태로 새로고침)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      window.removeEventListener('resize', sync)
      if (mq?.removeEventListener) mq.removeEventListener('change', sync)
      else mq?.removeListener?.(sync)
    }
  }, [])

  return full
}
