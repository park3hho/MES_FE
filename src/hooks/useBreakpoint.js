// hooks/useBreakpoint.js
// 현재 viewport의 breakpoint 이름 반환 ('mobile' | 'tablet' | 'laptop' | 'desktop')
// 사용처: App.jsx — 데스크탑일 때 SideNav, 아니면 BottomNav 등

import { useState, useEffect } from 'react'
import { BP } from '@/constants/breakpoints'

const getBreakpoint = () => {
  const w = window.innerWidth
  if (w >= BP.desktop) return 'desktop'
  if (w >= BP.laptop) return 'laptop'
  if (w >= BP.tablet) return 'tablet'
  return 'mobile'
}

export function useBreakpoint() {
  const [bp, setBp] = useState(getBreakpoint)

  useEffect(() => {
    const handler = () => setBp(getBreakpoint())
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return bp
}

// 데스크탑 전용 간편 훅 — 사이드바 레이아웃 분기에 사용
export function useIsDesktop() {
  return useBreakpoint() === 'desktop'
}
