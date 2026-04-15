// src/pages/mypage/MyPage.jsx
// 마이페이지 — 사용자 정보 + 앱 정보(버전/빌드) + 서브 뷰 전환 (LinesChart)

import { useState } from 'react'
import { FaradayLogo } from '@/components/FaradayLogo'
import LinesChartPage from '@/pages/adm/manage/LinesChartPage'
import s from './MyPage.module.css'

// vite.config.js define 으로 주입되는 전역 상수 (빌드 시점)
// eslint-disable-next-line no-undef
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
// eslint-disable-next-line no-undef
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''

// ISO → "2026-04-15 17:23" (KST)
const formatBuildTime = (iso) => {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

export default function MyPage({ user, onLogout }) {
  const [view, setView] = useState('main') // 'main' | 'lines'

  // 서브 뷰: 코드 라인 추이
  if (view === 'lines') {
    return (
      <LinesChartPage
        onLogout={onLogout}
        onBack={() => setView('main')}
      />
    )
  }

  return (
    <div className="page">
      <div className={`card ${s.card}`}>
        <FaradayLogo size="sm" />

        <div className={s.avatar}>👤</div>
        <h2 className={s.name}>{user?.id || '사용자'}</h2>
        <p className={s.loginId}>{user?.login_id || '-'}</p>

        {/* ── 정보 섹션 ── */}
        <div className={s.section}>
          <div className={s.sectionHeader}>
            <span className={s.sectionTitle}>정보</span>
            <span className={s.sectionBadge}>WEB</span>
          </div>

          <div className={s.infoRow}>
            <span className={s.infoKey}>버전</span>
            <span className={s.infoVal}>{APP_VERSION}</span>
          </div>
          <div className={s.infoRow}>
            <span className={s.infoKey}>빌드</span>
            <span className={s.infoVal}>{formatBuildTime(BUILD_TIME)}</span>
          </div>

          <button className={s.linkBtn} onClick={() => setView('lines')}>
            <span>📊 코드 라인 추이</span>
            <span className={s.linkArrow}>›</span>
          </button>
        </div>

        <button className="btn-ghost btn-sm" onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </div>
  )
}
