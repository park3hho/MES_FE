// hooks/useMobile.js
// window resize 반응형 훅
// 브레이크포인트 기준값 → constants/breakpoints.js (하드코딩 금지)

import { useState, useEffect } from 'react'
import { BP } from '@/constants/breakpoints'

export function useMobile(breakpoint = BP.mobile) {
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth <= breakpoint
  )

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])

  return isMobile
}
