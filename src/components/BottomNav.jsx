// src/components/BottomNav.jsx
// 인스타그램 스타일 하단 고정 네비게이션 바 (ADM 탑레벨 전용)
// 탭: HOME (ADM) / INVENTORY (재고) / MY (마이페이지)

import s from './BottomNav.module.css'

// 탭 키 상수 — App.jsx에서 import해서 활성 탭 판별에 사용
export const NAV_TABS = {
  HOME: 'HOME',
  INVENTORY: 'INVENTORY',
  MY: 'MY',
}

const ITEMS = [
  { key: NAV_TABS.HOME, label: '홈', icon: '🏠' },
  { key: NAV_TABS.INVENTORY, label: '재고', icon: '📦' },
  { key: NAV_TABS.MY, label: '마이', icon: '👤' },
]

export default function BottomNav({ active, onSelect }) {
  return (
    <nav className={s.nav}>
      {ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`${s.item} ${active === item.key ? s.active : ''}`}
          onClick={() => onSelect(item.key)}
        >
          <span className={s.icon}>{item.icon}</span>
          <span className={s.label}>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

// 페이지 하단에 BottomNav만큼 여백 확보하는 스페이서 컴포넌트
export function BottomNavSpacer() {
  return <div className={s.spacer} />
}
