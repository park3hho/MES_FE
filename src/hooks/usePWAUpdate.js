// ══════════════════════════════════════════════════════════════
// usePWAUpdate — 배포된 최신 버전 감지 훅
// ══════════════════════════════════════════════════════════════
// 원리:
//   1. 빌드 시점에 vite.config.js 가 public/version.json 생성
//   2. 클라이언트는 __APP_VERSION__ (build 시 embed) 보관
//   3. "탭이 활성화되는 순간"에만 /version.json 체크 (폴링 X)
//   4. 값이 다르면 UpdateBanner 표시 → 사용자가 새로고침 클릭
//
// 체크 타이밍:
//   - 앱 최초 진입 시 1회
//   - 탭이 다시 보이는 순간 (visibilitychange 'visible')
//   - 단, 마지막 체크 이후 10분 이내면 skip (throttle)

import { useEffect, useRef, useState } from 'react'

// eslint-disable-next-line no-undef
const CURRENT_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

const MIN_CHECK_INTERVAL_MS = 10 * 60 * 1000   // 체크 간 최소 10분 throttle
const VERSION_URL = '/version.json'

export function usePWAUpdate() {
  const [hasUpdate, setHasUpdate] = useState(false)
  const [latestVersion, setLatestVersion] = useState(null)
  const lastCheckRef = useRef(0)

  useEffect(() => {
    // dev 모드나 SSR은 패스
    if (CURRENT_VERSION === 'dev' || typeof window === 'undefined') return

    const check = async () => {
      // 마지막 체크로부터 10분 이내면 skip (탭 전환 남발 방어)
      const now = Date.now()
      if (now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return
      lastCheckRef.current = now

      try {
        const r = await fetch(`${VERSION_URL}?t=${now}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        })
        if (!r.ok) return
        const data = await r.json()
        if (data.version && data.version !== CURRENT_VERSION) {
          setLatestVersion(data.version)
          setHasUpdate(true)
        }
      } catch {
        // 네트워크 실패는 조용히 무시 (다음 기회에 재시도)
      }
    }

    // 초기 체크 (앱 진입 직후)
    check()

    // 탭이 다시 보이는 순간만 체크 (폴링 없음)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // 새로고침 — 캐시 무시하고 강제 reload
  const reload = () => {
    // Service Worker 업데이트 먼저 강제 (vite-plugin-pwa 호환)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.update())
      })
    }
    // 하드 리로드 (쿼리 파라미터로 캐시 버스팅)
    const url = new URL(window.location.href)
    url.searchParams.set('_v', Date.now().toString())
    window.location.replace(url.toString())
  }

  return {
    hasUpdate,          // boolean: 새 버전 감지됨
    latestVersion,      // string|null: 서버의 최신 버전
    currentVersion: CURRENT_VERSION,
    reload,             // function(): 새로고침 (캐시 무시)
  }
}
