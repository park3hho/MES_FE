// src/components/Inventory/InventoryBoardView.jsx
// 재고 전광판 뷰 — 기존 카드 그리드 (시각화 전용, 나중에 전광판으로 표출 예정)
// 부모(index.jsx)가 data/error 등 폴링 상태를 props로 전달

import Section from '@/components/common/Section'
import { PROCESS_LIST, PRODUCE_LIST, INSPECT_LIST, SHIPPING_LIST, FP_ITEM } from '@/constants/processConst'
import { useIsDesktop } from '@/hooks/useBreakpoint'

import InventoryCell from './InventoryCell'
import DetailPanel from './DetailPanel'
import { processCellData } from './inventoryHelpers'
import s from './Inventory.module.css'

// RM~HT는 토글로 숨김/펼침 (재고 수치가 실제와 안 맞는 공정)
const HIDDEN_PROCESSES = ['RM', 'MP', 'EA', 'HT']
// IQ는 재고 속성이 아님 — 대시보드에서 완전 제외 (토글 대상도 아님)
const INSPECT_EXCLUDE = ['IQ']

const formatTime = (date) => (date ? date.toLocaleTimeString('ko-KR') : '-')

export default function InventoryBoardView({
  data,
  lastUpdated,
  error,
  showHidden,
  onToggleHidden,
  isMobile,
  onBack,
  onLogout,
  // 하단 상세 패널 제어
  selectedProcess,
  detailProcess,
  detailVisible,
  onCellClick,
  onDetailClose,
  onSwitchToList,
}) {
  const isDesktop = useIsDesktop()

  const renderCell = ({ key, label }) => {
    const raw = data ? (data[key] ?? 0) : null
    const { qty, today, phiDist, motorDist } = processCellData(key, raw)
    return (
      <InventoryCell
        key={key}
        processKey={key}
        label={key === 'OQ' ? '검사중' : label}
        qty={qty}
        today={today}
        phiDist={phiDist}
        motorDist={motorDist}
        selected={selectedProcess === key}
        onClick={() => onCellClick(key)}
      />
    )
  }

  const hiddenCells = PROCESS_LIST.filter(({ key }) => HIDDEN_PROCESSES.includes(key))

  // 섹션별 그룹핑 — ADM 홈의 "제작 / 검사 / 출하" 구조와 동일
  const produceCells = PRODUCE_LIST.filter(({ key }) => !HIDDEN_PROCESSES.includes(key))
  const inspectCells = INSPECT_LIST.filter(({ key }) => !INSPECT_EXCLUDE.includes(key))
  const shippingCells = [FP_ITEM, ...SHIPPING_LIST]

  // 섹션 렌더 헬퍼 — 공용 <Section> (글로벌 .section-label) 사용
  const renderSection = (title, cells) => (
    <Section label={title}>
      <div className={s.grid}>
        {data
          ? cells.map(renderCell)
          : cells.map(({ key, label }) => (
              <InventoryCell key={key} processKey={key} label={label} loading />
            ))}
      </div>
    </Section>
  )

  return (
    <div className={s.page}>
      <div className={s.card}>
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

        {/* RM~HT 토글 + 뷰 전환 — 위치 고정 (목록뷰와 동일) */}
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
            onClick={onSwitchToList}
            title="목록 뷰로 보기"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>

        {/* RM~HT 그리드 — 애니메이션 접힘/펼침 */}
        <div className={`${s.hiddenWrap} ${showHidden ? s.hiddenWrapOpen : ''}`}>
          <div className={s.hiddenInner}>
            <div className={s.grid}>
              {data
                ? hiddenCells.map(renderCell)
                : hiddenCells.map(({ key, label }) => (
                    <InventoryCell key={key} processKey={key} label={label} loading />
                  ))}
            </div>
          </div>
        </div>

        {/* 섹션별 그리드 — 제작 / 검사 / 출하 */}
        {renderSection('제작', produceCells)}
        {renderSection('검사', inspectCells)}
        {renderSection('출하', shippingCells)}

        <DetailPanel
          process={detailProcess}
          visible={detailVisible}
          onClose={onDetailClose}
          isMobile={isMobile}
        />
      </div>
    </div>
  )
}
