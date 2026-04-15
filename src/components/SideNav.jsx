// src/components/SideNav.jsx
// PC 전용 좌측 사이드바 — BottomNav와 동일한 3개 탭 (HOME / INVENTORY / MY)
// 기본 56px (icon only), hover 시 200px 확장 (overlay — 컨텐츠 밀리지 않음)

import { NAV_TABS } from './BottomNav'
import s from './SideNav.module.css'

const ITEMS = [
  { key: NAV_TABS.HOME,      label: '홈',   icon: '🏠' },
  { key: NAV_TABS.INVENTORY, label: '재고', icon: '📦' },
  { key: NAV_TABS.MY,        label: '마이', icon: '👤' },
]

// active, onSelect — App.jsx에서 탭 전환에 사용
// onLogout — 하단 로그아웃 버튼
export default function SideNav({ active, onSelect, onLogout }) {
  return (
    <aside className={s.nav}>
      <div className={s.logo}>F</div>

      <div className={s.items}>
        {ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${s.item} ${active === item.key ? s.active : ''}`}
            onClick={() => onSelect(item.key)}
            title={item.label}
          >
            <span className={s.icon}>{item.icon}</span>
            <span className={s.label}>{item.label}</span>
          </button>
        ))}
      </div>

      <button type="button" className={s.logoutBtn} onClick={onLogout} title="로그아웃">
        <span className={s.icon}>⏻</span>
        <span className={s.label}>로그아웃</span>
      </button>
    </aside>
  )
}
