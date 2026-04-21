// src/components/SideNav.jsx
// PC 전용 좌측 사이드바 — BottomNav와 동일한 3개 탭 (HOME / INVENTORY / MY)
// 기본 64px (icon only), hover 시 200px 확장 (overlay — 컨텐츠 밀리지 않음)
// 아이콘은 SVG — 이모지 폭 편차로 인한 좌측 쏠림 방지

import { NAV_TABS } from './BottomNav'
import s from './SideNav.module.css'

// SVG 아이콘 — 22px, stroke 기반 (lucide 계열)
const IconHome = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const IconBox = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const IconUser = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const IconPower = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    <line x1="12" y1="2" x2="12" y2="12" />
  </svg>
)

const ITEMS = [
  { key: NAV_TABS.HOME,      label: '홈',   Icon: IconHome },
  { key: NAV_TABS.INVENTORY, label: '재고', Icon: IconBox  },
  { key: NAV_TABS.MY,        label: '마이', Icon: IconUser },
]

// active, onSelect — App.jsx에서 탭 전환에 사용
// onLogout — 하단 로그아웃 버튼
// inventoryView, onInventoryViewChange — 재고 탭 활성 시 서브메뉴로 공정/완제품 뷰 전환 (PC 전용)
export default function SideNav({ active, onSelect, onLogout, inventoryView, onInventoryViewChange }) {
  const handleSubClick = (view) => {
    // onInventoryViewChange 가 /inventory/<view> 로 navigate → 탭 상태는 URL에서 자동 파생
    // (onSelect(INVENTORY) 함께 호출하면 클로저에 캡처된 옛 inventoryView로 덮어써져 경쟁)
    onInventoryViewChange?.(view)
  }

  return (
    <aside className={s.nav}>
      <div className={s.logo}>F</div>

      <div className={s.items}>
        {ITEMS.map(({ key, label, Icon }) => {
          // 재고 탭 활성 + 서브뷰가 결정돼 있으면 접힘 상태에서 우측 점 인디케이터 표시
          const hasSubActive =
            key === NAV_TABS.INVENTORY &&
            active === NAV_TABS.INVENTORY &&
            (inventoryView === 'process' || inventoryView === 'finished')
          return (
          <div key={key}>
            <button
              type="button"
              className={`${s.item} ${active === key ? s.active : ''} ${hasSubActive ? s.hasSubActive : ''}`}
              onClick={() => onSelect(key)}
              title={label}
            >
              <span className={s.icon}><Icon /></span>
              <span className={s.label}>{label}</span>
            </button>
            {/* 재고 탭 활성 시 공정/완제품 서브메뉴 (확장 시에만 label 노출되므로 expand 상태에서만 보임) */}
            {key === NAV_TABS.INVENTORY && active === NAV_TABS.INVENTORY && (
              <>
                <button
                  type="button"
                  className={`${s.subItem} ${inventoryView === 'process' ? s.subActive : ''}`}
                  onClick={() => handleSubClick('process')}
                  title="공정 재고"
                >
                  <span className={s.subBullet}>•</span>
                  <span className={s.label}>공정 재고</span>
                </button>
                <button
                  type="button"
                  className={`${s.subItem} ${inventoryView === 'finished' ? s.subActive : ''}`}
                  onClick={() => handleSubClick('finished')}
                  title="완제품 재고"
                >
                  <span className={s.subBullet}>•</span>
                  <span className={s.label}>완제품 재고</span>
                </button>
                <button
                  type="button"
                  className={`${s.subItem} ${inventoryView === 'progress' ? s.subActive : ''}`}
                  onClick={() => handleSubClick('progress')}
                  title="진척률 상황"
                >
                  <span className={s.subBullet}>•</span>
                  <span className={s.label}>진척률 상황</span>
                </button>
              </>
            )}
          </div>
          )
        })}
      </div>

      <button type="button" className={s.logoutBtn} onClick={onLogout} title="로그아웃">
        <span className={s.icon}><IconPower /></span>
        <span className={s.label}>로그아웃</span>
      </button>
    </aside>
  )
}
