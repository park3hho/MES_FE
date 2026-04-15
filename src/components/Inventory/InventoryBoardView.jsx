// src/components/Inventory/InventoryBoardView.jsx
// 재고 전광판 뷰 — 기존 카드 그리드 (시각화 전용, 나중에 전광판으로 표출 예정)
// 부모(index.jsx)가 data/error 등 폴링 상태를 props로 전달

import { FaradayLogo } from '@/components/FaradayLogo'
import { PROCESS_LIST } from '@/constants/processConst'
import { useIsDesktop } from '@/hooks/useBreakpoint'

import InventoryCell from './InventoryCell'
import DetailPanel from './DetailPanel'
import { processCellData } from './inventoryHelpers'
import s from './Inventory.module.css'

const HIDDEN_PROCESSES = ['RM', 'MP', 'EA', 'HT']

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
    const { qty, today, phiDist } = processCellData(key, raw)
    return (
      <InventoryCell
        key={key}
        processKey={key}
        label={key === 'OQ' ? '검사중' : label}
        qty={qty}
        today={today}
        phiDist={phiDist}
        selected={selectedProcess === key}
        onClick={() => onCellClick(key)}
      />
    )
  }

  const hiddenCells = PROCESS_LIST.filter(({ key }) => HIDDEN_PROCESSES.includes(key))
  const visibleCells = PROCESS_LIST.filter(({ key }) => !HIDDEN_PROCESSES.includes(key))

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <FaradayLogo size={isMobile ? 'sm' : 'md'} />
          {/* 뒤로/로그아웃 버튼 제거 — BottomNav/SideNav로 이동 가능 */}
        </div>

        <div className={s.titleRow}>
          <h2 className={s.title}>실시간 재고 현황 (전광판)</h2>
          <div className={s.titleRight}>
            <button
              type="button"
              className={s.viewSwitch}
              onClick={onSwitchToList}
              title="목록 뷰로 보기"
            >
              📋 목록
            </button>
            <span
              className={s.updated}
              style={{ color: error ? '#e05555' : '#8a93a8' }}
            >
              {error ? '⚠ 연결 오류' : `업데이트: ${formatTime(lastUpdated)}`}
            </span>
          </div>
        </div>

        {/* RM~HT 토글 */}
        <div className={s.toggleRow}>
          <button
            className={`${s.toggleBtn} ${showHidden ? s.toggleBtnOpen : ''}`}
            onClick={onToggleHidden}
          >
            <span className={s.toggleArrow}>▾</span>
            RM~HT {showHidden ? '숨기기' : '펼치기'}
          </button>
        </div>

        {/* RM~HT 그리드 — 애니메이션 접힘/펼침 */}
        <div className={`${s.hiddenWrap} ${showHidden ? s.hiddenWrapOpen : ''}`}>
          <div className={s.hiddenInner}>
            <div className={s.grid}>{hiddenCells.map(renderCell)}</div>
          </div>
        </div>

        {/* BO~OB 그리드 */}
        <div className={s.grid}>{visibleCells.map(renderCell)}</div>

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
