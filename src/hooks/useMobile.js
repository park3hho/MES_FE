// window resize도 감지하는 훅 — 기존 isMobile 상수 대체
import { useState, useEffect } from 'react'

export function useMobile(breakpoint = 480) {
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth <= breakpoint  // 초기값
  )

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)  // 클린업
  }, [breakpoint])

  return isMobile
}