// ══════════════════════════════════════════════════════════════
// UpdateBanner — 새 버전 감지 시 상단 고정 배너
// ══════════════════════════════════════════════════════════════
// usePWAUpdate 훅이 /version.json 폴링으로 배포 감지
// 사용자가 "새로고침" 누르면 캐시 무시하고 reload

import { useState } from 'react'
import { usePWAUpdate } from '@/hooks/usePWAUpdate'
import s from './UpdateBanner.module.css'

export default function UpdateBanner() {
  const { hasUpdate, reload } = usePWAUpdate()
  const [dismissed, setDismissed] = useState(false)

  if (!hasUpdate || dismissed) return null

  return (
    <div className={s.banner} role="alert">
      <span className={s.icon}>🎉</span>
      <span className={s.msg}>새 버전이 준비되었습니다.</span>
      <button className={s.reloadBtn} onClick={reload}>
        새로고침
      </button>
      <button
        className={s.dismissBtn}
        onClick={() => setDismissed(true)}
        aria-label="나중에"
        title="나중에"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}
