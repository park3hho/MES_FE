// src/components/Inventory/InventoryListView.jsx
// 재고 목록 뷰 — 공정당 한 행, 클릭 시 인라인 상세 펼침
// 부모(index.jsx)가 data/error 등 폴링 상태를 props로 전달

import { useState } from 'react'

import { FaradayLogo } from '@/components/FaradayLogo'
import Section from '@/components/common/Section'
import { PROCESS_LIST, PRODUCE_LIST, INSPECT_LIST, SHIPPING_LIST, FP_ITEM } from '@/constants/processConst'
import { useIsDesktop } from '@/hooks/useBreakpoint'

import InventoryRow from './InventoryRow'
import { processCellData } from './inventoryHelpers'
import s from './Inventory.module.css'

// RM~HT는 재고 수치가 실제 현황과 안 맞아 기본 숨김 (토글로 펼침)
const HIDDEN_PROCESSES = ['RM', 'MP', 'EA', 'HT']
// IQ는 재고 속성이 아님 — 대시보드에서 완전 제외 (토글 대상도 아님)
const INSPECT_EXCLUDE = ['IQ']

const formatTime = (date) => (date ? date.toLocaleTimeString('ko-KR') : '-')

export default function InventoryListView({
  data,
  lastUpdated,
  error,
  showHidden,
  onToggleHidden,
  isMobile,
  onBack,
  onLogout,
  onSwitchToBoard,
}) {
  const isDesktop = useIsDesktop()
  // 한 번에 하나의 행만 펼침 (accordion)
  const [openProcess, setOpenProcess] = useState(null)

  const handleRowToggle = (key) => {
    setOpenProcess((prev) => (prev === key ? null : key))
  }

  const renderRow = ({ key, label }) => {
    const raw = data ? (data[key] ?? 0) : null
    const { qty, today, phiDist, motorDist } = processCellData(key, raw)
    return (
      <InventoryRow
        key={key}
        process={key}
        label={key === 'OQ' ? '검사중' : label}
        qty={qty}
        today={today}
        phiDist={phiDist}
        motorDist={motorDist}
        isOpen={openProcess === key}
        onToggle={() => handleRowToggle(key)}
        isMobile={isMobile}
      />
    )
  }

  const hiddenRows = PROCESS_LIST.filter(({ key }) => HIDDEN_PROCESSES.includes(key))

  // 섹션별 그룹핑 — 보드뷰와 동일
  const produceRows = PRODUCE_LIST.filter(({ key }) => !HIDDEN_PROCESSES.includes(key))
  const inspectRows = INSPECT_LIST.filter(({ key }) => !INSPECT_EXCLUDE.includes(key))
  const shippingRows = [FP_ITEM, ...SHIPPING_LIST]

  // 섹션 렌더 헬퍼 — 공용 <Section> (글로벌 .section-label) 사용
  const renderSection = (title, rows) => (
    <Section label={title}>
      <div className={s.list}>
        {data
          ? rows.map(renderRow)
          : rows.map(({ key, label }) => (
              <InventoryRow key={key} process={key} label={label} loading />
            ))}
      </div>
    </Section>
  )

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <FaradayLogo size={isMobile ? 'sm' : 'md'} />
          {/* 뒤로/로그아웃 버튼 제거 — BottomNav/SideNav로 이동 가능 */}
        </div>

        <div className={s.titleRow}>
          <h2 className={s.title}>실시간 재고 현황</h2>
          <div className={s.titleRight}>
            <span
              className={s.updated}
              style={{ color: error ? 'var(--color-error)' : 'var(--color-gray)' }}
            >
              {error ? '⚠ 연결 오류' : `업데이트: ${formatTime(lastUpdated)}`}
            </span>
          </div>
        </div>

        {/* RM~HT 토글 + 뷰 전환 */}
        <div className={s.toggleRow}>
          <button
            className={`${s.toggleBtn} ${showHidden ? s.toggleBtnOpen : ''}`}
            onClick={onToggleHidden}
          >
            <span className={s.toggleArrow}>▾</span>
            RM~HT {showHidden ? '숨기기' : '펼치기'}
          </button>
          <button
            type="button"
            className={s.viewSwitch}
            onClick={onSwitchToBoard}
            title="카드 뷰로 보기"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
        </div>

        {/* RM~HT 목록 — 애니메이션 접힘 */}
        <div className={`${s.hiddenWrap} ${showHidden ? s.hiddenWrapOpen : ''}`}>
          <div className={s.hiddenInner}>
            <div className={s.list}>
              {data
                ? hiddenRows.map(renderRow)
                : hiddenRows.map(({ key, label }) => (
                    <InventoryRow key={key} process={key} label={label} loading />
                  ))}
            </div>
          </div>
        </div>

        {/* 섹션별 목록 — 제작 / 검사 / 출하 */}
        {renderSection('제작', produceRows)}
        {renderSection('검사', inspectRows)}
        {renderSection('출하', shippingRows)}
      </div>
    </div>
  )
}
