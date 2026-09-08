// hooks/useFullscreen.js
// 브라우저가 전체화면인지 (2026-09-02) — 현황판(보기 전용) 모드 진입 판정용.
//
// ★ F11 은 Fullscreen API 가 아니다 — `document.fullscreenElement` 가 null 이라 그것만
//   보면 F11 을 절대 못 잡는다. 그래서 두 신호를 OR 로 본다:
//     ① document.fullscreenElement  — requestFullscreen() 으로 들어간 경우
//     ② (display-mode: fullscreen)  — F11. Chrome·Edge·Firefox·Safari 가 이렇게 보고한다
//
// ★★ `innerHeight >= screen.height` 폴백은 **폐기했다 (2026-09-08)**.
//   전체화면이 아닌데도 참이 되어 대시보드 nav 가 상시 사라졌다. `screen.height` 는
//   브라우저 확대/축소를 innerHeight 와 같은 방식으로 반영하지 않아서, 화면을 축소해 보면
//   (대시보드에서 흔하다) innerHeight 가 screen.height 를 넘어선다.
//   **이 판정은 틀리면 조용하지 않다** — nav 가 통째로 사라져 이동 자체가 막힌다.
//   그래서 '못 잡는 것'(F11 인데 압축이 안 됨)보다 '잘못 잡는 것'이 훨씬 비싸다.
//   폴백 없이 ①②만 쓴다. 이 둘은 실제 전체화면일 때만 참이고, 나가는 길(F11/Esc)도 있다.
//   ※ 새 폴백을 넣고 싶어지면: 창 크기로 전체화면을 추정하지 말 것. 그게 이 버그였다.
import { useEffect, useState } from 'react'

const FS_QUERY = '(display-mode: fullscreen)'

function read() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false
  if (document.fullscreenElement) return true
  try {
    return window.matchMedia(FS_QUERY).matches
  } catch { /* matchMedia 미지원 — 전체화면 아님으로 본다 (오탐보다 안전) */ }
  return false
}

export function useFullscreen() {
  const [full, setFull] = useState(read)

  useEffect(() => {
    const sync = () => setFull(read())
    let mq = null
    try { mq = window.matchMedia(FS_QUERY) } catch { /* 미지원 */ }

    document.addEventListener('fullscreenchange', sync)
    // resize 는 판정에 안 쓰지만, mq change 를 놓친 경우의 재동기화로 남긴다 (F11 은 리사이즈를 동반)
    window.addEventListener('resize', sync)
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
