// src/components/BottomNav.jsx
// 하단 고정 네비게이션 바 (5탭, 2026-04-24 확장)
// 탭: 공정 / QR / 홈 / 대시보드 / 마이 — 홈이 중앙
// 아이콘: SideNav와 동일 SVG (lucide 계열)
// DASHBOARD 탭은 long-press(500ms)로 팝오버 — 공정/완제품/진척률 뷰 선택

import { useRef, useState } from 'react'

import s from './BottomNav.module.css'

// 탭 키 상수 — App.jsx에서 import해서 활성 탭 판별에 사용
export const NAV_TABS = {
  PROCESS:   'PROCESS',   // 공정 선택 (ADMPage)
  TRACE:     'TRACE',     // QR/이력 조회 (TracePage)
  HOME:      'HOME',      // 홈 (릴리스 노트/뉴스레터 — 추후)
  DASHBOARD: 'DASHBOARD', // 대시보드 (재고/완제품/진척률)
  MY:        'MY',        // 마이페이지
}

const LONG_PRESS_MS = 500

// ── SVG 아이콘 (stroke 기반, 22px — SideNav와 공유) ──
const IconProcess = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

const IconQR = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3z" />
    <path d="M20 14v3" />
    <path d="M14 20h3" />
    <path d="M20 20h1" />
  </svg>
)

const IconHome = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const IconDashboard = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="20" x2="3" y2="10" />
    <line x1="9" y1="20" x2="9" y2="4" />
    <line x1="15" y1="20" x2="15" y2="13" />
    <line x1="21" y1="20" x2="21" y2="7" />
  </svg>
)

const IconUser = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

// 순서: 공정 → QR → 홈(중앙) → 대시보드 → 마이
const ITEMS = [
  { key: NAV_TABS.PROCESS,   label: '공정',     Icon: IconProcess   },
  { key: NAV_TABS.TRACE,     label: 'QR',       Icon: IconQR        },
  { key: NAV_TABS.HOME,      label: '홈',       Icon: IconHome      },
  { key: NAV_TABS.DASHBOARD, label: '대시보드', Icon: IconDashboard },
  { key: NAV_TABS.MY,        label: '마이',     Icon: IconUser      },
]

// active — 활성 탭 key, onSelect(key) — 탭 전환 콜백
// dashboardView — 'process' | 'finished' | 'progress' (대시보드 탭 현재 뷰)
// onDashboardViewChange(view) — 대시보드 뷰 전환 콜백 (long-press 팝오버에서 호출)
export default function BottomNav({ active, onSelect, dashboardView, onDashboardViewChange }) {
  const [showDashboardMenu, setShowDashboardMenu] = useState(false)
  const timerRef = useRef(null)
  const longPressFiredRef = useRef(false)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // 대시보드 탭 전용 — long-press 감지
  const handleDashboardPointerDown = (e) => {
    e.preventDefault()
    longPressFiredRef.current = false
    clearTimer()
    timerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      setShowDashboardMenu(true)
      timerRef.current = null
    }, LONG_PRESS_MS)
  }

  const handleDashboardPointerUp = (e) => {
    e.preventDefault()
    clearTimer()
    if (!longPressFiredRef.current) {
      onSelect(NAV_TABS.DASHBOARD)
    }
    longPressFiredRef.current = false
  }

  const handleDashboardPointerLeave = () => {
    clearTimer()
  }

  const handleViewSelect = (view) => {
    // onDashboardViewChange 가 /inventory/<view> 로 navigate → 탭 상태는 URL에서 자동 파생
    onDashboardViewChange?.(view)
    setShowDashboardMenu(false)
  }

  // 팝오버 배경 — 바깥 탭하면 닫기
  const handleBackdropPointerDown = (e) => {
    if (e.target === e.currentTarget) {
      setShowDashboardMenu(false)
    }
  }

  return (
    <>
      {/* 팝오버 backdrop + 메뉴 (대시보드 탭 long-press) */}
      {showDashboardMenu && (
        <div className={s.popoverBackdrop} onPointerDown={handleBackdropPointerDown}>
          <div className={s.inventoryPopover} onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`${s.popoverItem} ${dashboardView === 'process' ? s.popoverItemActive : ''}`}
              onPointerDown={(e) => { e.preventDefault(); handleViewSelect('process') }}
            >
              공정 재고
            </button>
            <button
              type="button"
              className={`${s.popoverItem} ${dashboardView === 'finished' ? s.popoverItemActive : ''}`}
              onPointerDown={(e) => { e.preventDefault(); handleViewSelect('finished') }}
            >
              완제품 재고
            </button>
            <button
              type="button"
              className={`${s.popoverItem} ${dashboardView === 'progress' ? s.popoverItemActive : ''}`}
              onPointerDown={(e) => { e.preventDefault(); handleViewSelect('progress') }}
            >
              진척률 상황
            </button>
          </div>
        </div>
      )}

      <nav className={s.nav}>
        {ITEMS.map(({ key, label, Icon }) => {
          const isDashboard = key === NAV_TABS.DASHBOARD
          return (
            <button
              key={key}
              type="button"
              className={`${s.item} ${active === key ? s.active : ''}`}
              onPointerDown={isDashboard ? handleDashboardPointerDown : undefined}
              onPointerUp={isDashboard ? handleDashboardPointerUp : undefined}
              onPointerLeave={isDashboard ? handleDashboardPointerLeave : undefined}
              onPointerCancel={isDashboard ? handleDashboardPointerLeave : undefined}
              onClick={isDashboard ? undefined : () => onSelect(key)}
            >
              <span className={s.icon}><Icon /></span>
              <span className={s.label}>{label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}

// 페이지 하단에 BottomNav만큼 여백 확보하는 스페이서 컴포넌트
export function BottomNavSpacer() {
  return <div className={s.spacer} />
}
