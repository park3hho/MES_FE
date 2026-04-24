// src/components/SideNav.jsx
// PC 전용 좌측 사이드바 — BottomNav와 동일한 5탭 (공정/QR/홈/대시보드/마이)
// 기본 64px (icon only), hover 시 200px 확장 (overlay — 컨텐츠 밀리지 않음)
// 아이콘은 SVG — 이모지 폭 편차로 인한 좌측 쏠림 방지

import { NAV_TABS } from './BottomNav'
import s from './SideNav.module.css'

// ── SVG 아이콘 (stroke 기반, 22px — BottomNav 와 공유) ──
const IconProcess = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

const IconQR = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const IconDashboard = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="3" y1="20" x2="3" y2="10" />
    <line x1="9" y1="20" x2="9" y2="4" />
    <line x1="15" y1="20" x2="15" y2="13" />
    <line x1="21" y1="20" x2="21" y2="7" />
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

// 순서: 공정 → QR → 홈(중앙) → 대시보드 → 마이
const ITEMS = [
  { key: NAV_TABS.PROCESS,   label: '공정',     Icon: IconProcess   },
  { key: NAV_TABS.TRACE,     label: 'QR',       Icon: IconQR        },
  { key: NAV_TABS.HOME,      label: '홈',       Icon: IconHome      },
  { key: NAV_TABS.DASHBOARD, label: '대시보드', Icon: IconDashboard },
  { key: NAV_TABS.MY,        label: '마이',     Icon: IconUser      },
]

// active, onSelect — App.jsx에서 탭 전환에 사용
// onLogout — 하단 로그아웃 버튼
// dashboardView, onDashboardViewChange — 대시보드 탭 활성 시 서브메뉴로 공정/완제품/진척률 뷰 전환 (PC 전용)
export default function SideNav({ active, onSelect, onLogout, dashboardView, onDashboardViewChange }) {
  const handleSubClick = (view) => {
    // onDashboardViewChange 가 /inventory/<view> 로 navigate → 탭 상태는 URL에서 자동 파생
    onDashboardViewChange?.(view)
  }

  return (
    <aside className={s.nav}>
      <div className={s.logo}>F</div>

      <div className={s.items}>
        {ITEMS.map(({ key, label, Icon }) => {
          // 대시보드 탭 활성 + 서브뷰가 결정돼 있으면 접힘 상태에서 우측 점 인디케이터 표시
          const hasSubActive =
            key === NAV_TABS.DASHBOARD &&
            active === NAV_TABS.DASHBOARD &&
            (dashboardView === 'process' || dashboardView === 'finished' || dashboardView === 'progress')
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
            {/* 대시보드 탭 활성 시 공정/완제품/진척률 서브메뉴 (확장 시에만 label 노출) */}
            {key === NAV_TABS.DASHBOARD && active === NAV_TABS.DASHBOARD && (
              <>
                <button
                  type="button"
                  className={`${s.subItem} ${dashboardView === 'process' ? s.subActive : ''}`}
                  onClick={() => handleSubClick('process')}
                  title="공정 재고"
                >
                  <span className={s.subBullet}>•</span>
                  <span className={s.label}>공정 재고</span>
                </button>
                <button
                  type="button"
                  className={`${s.subItem} ${dashboardView === 'finished' ? s.subActive : ''}`}
                  onClick={() => handleSubClick('finished')}
                  title="완제품 재고"
                >
                  <span className={s.subBullet}>•</span>
                  <span className={s.label}>완제품 재고</span>
                </button>
                <button
                  type="button"
                  className={`${s.subItem} ${dashboardView === 'progress' ? s.subActive : ''}`}
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
