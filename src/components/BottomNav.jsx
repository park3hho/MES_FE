// src/components/BottomNav.jsx
// 하단 고정 네비게이션 바 (ADM 탑레벨 전용)
// 탭: HOME (ADM) / INVENTORY (재고) / MY (마이페이지)
// 아이콘: SideNav와 동일 SVG (lucide 계열)
// INVENTORY 탭은 long-press(500ms)로 팝오버 — 공정/완제품 뷰 선택 (2026-04-17)

import { useRef, useState } from 'react'

import s from './BottomNav.module.css'

// 탭 키 상수 — App.jsx에서 import해서 활성 탭 판별에 사용
export const NAV_TABS = {
  HOME: 'HOME',
  INVENTORY: 'INVENTORY',
  MY: 'MY',
}

const LONG_PRESS_MS = 500

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

// active — 활성 탭 key, onSelect(key) — 탭 전환 콜백
// inventoryView — 'process' | 'finished' (재고 탭 현재 뷰)
// onInventoryViewChange(view) — 재고 뷰 전환 콜백 (long-press 팝오버에서 호출)
export default function BottomNav({ active, onSelect, inventoryView, onInventoryViewChange }) {
  const [showInventoryMenu, setShowInventoryMenu] = useState(false)
  const timerRef = useRef(null)
  const longPressFiredRef = useRef(false)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // 재고 탭 전용 — long-press 감지
  const handleInventoryPointerDown = (e) => {
    e.preventDefault()
    longPressFiredRef.current = false
    clearTimer()
    timerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      setShowInventoryMenu(true)
      timerRef.current = null
    }, LONG_PRESS_MS)
  }

  const handleInventoryPointerUp = (e) => {
    e.preventDefault()
    clearTimer()
    // long-press 발동 안 했으면 → 짧은 탭 → 기본 동작
    if (!longPressFiredRef.current) {
      onSelect(NAV_TABS.INVENTORY)
    }
    longPressFiredRef.current = false
  }

  const handleInventoryPointerLeave = () => {
    clearTimer()
  }

  const handleViewSelect = (view) => {
    // onInventoryViewChange 가 /inventory/<view> 로 navigate → 탭 상태는 URL에서 자동 파생
    // (onSelect(INVENTORY) 함께 호출하면 클로저에 캡처된 옛 inventoryView로 덮어써져 경쟁)
    onInventoryViewChange?.(view)
    setShowInventoryMenu(false)
  }

  // 팝오버 배경 — 바깥 탭하면 닫기
  const handleBackdropPointerDown = (e) => {
    if (e.target === e.currentTarget) {
      setShowInventoryMenu(false)
    }
  }

  return (
    <>
      {/* 팝오버 backdrop + 메뉴 */}
      {showInventoryMenu && (
        <div className={s.popoverBackdrop} onPointerDown={handleBackdropPointerDown}>
          <div className={s.inventoryPopover} onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`${s.popoverItem} ${inventoryView === 'process' ? s.popoverItemActive : ''}`}
              onPointerDown={(e) => { e.preventDefault(); handleViewSelect('process') }}
            >
              공정 재고
            </button>
            <button
              type="button"
              className={`${s.popoverItem} ${inventoryView === 'finished' ? s.popoverItemActive : ''}`}
              onPointerDown={(e) => { e.preventDefault(); handleViewSelect('finished') }}
            >
              완제품 재고
            </button>
          </div>
        </div>
      )}

      <nav className={s.nav}>
        {ITEMS.map(({ key, label, Icon }) => {
          const isInventory = key === NAV_TABS.INVENTORY
          return (
            <button
              key={key}
              type="button"
              className={`${s.item} ${active === key ? s.active : ''}`}
              onPointerDown={isInventory ? handleInventoryPointerDown : undefined}
              onPointerUp={isInventory ? handleInventoryPointerUp : undefined}
              onPointerLeave={isInventory ? handleInventoryPointerLeave : undefined}
              onPointerCancel={isInventory ? handleInventoryPointerLeave : undefined}
              onClick={isInventory ? undefined : () => onSelect(key)}
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
