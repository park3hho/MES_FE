// CertAutoUpdate.jsx — cert.* 도메인 전용 자동 업데이트 (2026-05-02)
// ════════════════════════════════════════════════════════════
// lot.* 도메인의 UpdateBanner 와 분리:
//   · lot.*  : 작업자가 process 페이지에서 데이터 입력 중 → 수동 새로고침 필수
//   · cert.* : 외부 고객 조회용 → FE 푸쉬할 때마다 즉시 반영되어야 함 (자동)
//
// 동작:
//   1. usePWAUpdate 가 /version.json 폴링 (탭 활성화 시점 + 10분 throttle)
//   2. hasUpdate 감지되면 2초 카운트다운 + 영문 알림 표시
//   3. 카운트다운 종료 시 reload() — 캐시 무시 hard reload
//
// 사용처: App.jsx 의 isPublicCert 분기에서 마운트 (lot.* 에는 안 마운트)

import { useEffect, useState } from 'react'
import { usePWAUpdate } from '@/hooks/usePWAUpdate'

const COUNTDOWN_SECONDS = 2

export default function CertAutoUpdate() {
  const { hasUpdate, reload } = usePWAUpdate()
  const [secondsLeft, setSecondsLeft] = useState(null)

  useEffect(() => {
    if (!hasUpdate) {
      setSecondsLeft(null)
      return
    }
    setSecondsLeft(COUNTDOWN_SECONDS)
    const tick = setInterval(() => {
      setSecondsLeft((n) => (n > 0 ? n - 1 : 0))
    }, 1000)
    const fire = setTimeout(() => {
      reload()
    }, COUNTDOWN_SECONDS * 1000)
    return () => {
      clearInterval(tick)
      clearTimeout(fire)
    }
  }, [hasUpdate, reload])

  if (secondsLeft == null) return null

  // 인라인 스타일 — cert 페이지는 자체 토큰 시스템 (CertFlow.module.css) 과
  // 글로벌 variables.css 둘 다 의존하지 않게 하드코드. 단순 fixed 알림 배너.
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '10px 16px',
        background: 'linear-gradient(90deg, #1a2677 0%, #ff7a45 100%)',
        color: '#fff',
        fontSize: 13,
        fontWeight: 500,
        boxShadow: '0 2px 12px rgba(26, 38, 119, 0.25)',
        textAlign: 'center',
      }}
    >
      <span aria-hidden="true">🎉</span>
      <span>
        A new version is available. Refreshing in <strong>{secondsLeft}s</strong>...
      </span>
    </div>
  )
}
