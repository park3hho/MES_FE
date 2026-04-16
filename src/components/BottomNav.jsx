// src/components/BottomNav.jsx
// 하단 고정 네비게이션 바 (ADM 탑레벨 전용)
// 탭: HOME (ADM) / INVENTORY (재고) / MY (마이페이지)
// 아이콘: SideNav와 동일 SVG (lucide 계열) — 이모지 → SVG 통일 (2026-04-16)

import s from './BottomNav.module.css'

// 탭 키 상수 — App.jsx에서 import해서 활성 탭 판별에 사용
export const NAV_TABS = {
  HOME: 'HOME',
  INVENTORY: 'INVENTORY',
  MY: 'MY',
}

// SVG 아이콘 — SideNav와 동일 (stroke 기반, 22px)
const IconHome = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const IconBox = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const IconUser = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const ITEMS = [
  { key: NAV_TABS.HOME,      label: '홈',   Icon: IconHome },
  { key: NAV_TABS.INVENTORY, label: '재고', Icon: IconBox  },
  { key: NAV_TABS.MY,        label: '마이', Icon: IconUser },
]

export default function BottomNav({ active, onSelect }) {
  return (
    <nav className={s.nav}>
      {ITEMS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          className={`${s.item} ${active === key ? s.active : ''}`}
          onClick={() => onSelect(key)}
        >
          <span className={s.icon}><Icon /></span>
          <span className={s.label}>{label}</span>
        </button>
      ))}
    </nav>
  )
}

// 페이지 하단에 BottomNav만큼 여백 확보하는 스페이서 컴포넌트
export function BottomNavSpacer() {
  return <div className={s.spacer} />
}
