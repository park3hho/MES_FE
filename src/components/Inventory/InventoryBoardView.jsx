// src/components/Inventory/InventoryBoardView.jsx
// 재고 전광판 뷰 — 기존 카드 그리드 (시각화 전용, 나중에 전광판으로 표출 예정)
// 부모(index.jsx)가 data/error 등 폴링 상태를 props로 전달

import Section from '@/components/common/Section'
import { PROCESS_LIST, PRODUCE_LIST, INSPECT_LIST, SHIPPING_LIST, FP_ITEM } from '@/constants/processConst'
import { useIsDesktop } from '@/hooks/useBreakpoint'

import InventoryCell from './InventoryCell'
import DetailPanel from './DetailPanel'
import { processCellData, filterRawToMeta } from './inventoryHelpers'
import ScopeToggle from './ScopeToggle'
import RmSection from './RmSection'
import s from './Inventory.module.css'

// RM~HT는 토글로 숨김/펼침 (재고 수치가 실제와 안 맞는 공정)
const HIDDEN_PROCESSES = ['RM', 'MP', 'EA', 'HT']
// IQ·IPQ 는 대시보드에서 제외 (IPQ 미사용, 2026-06-17)
const INSPECT_EXCLUDE = ['IQ', 'IPQ']
// 회전자 셀 — 공정(EA/BO/RT) + 출하(UB/MB) 한 줄에 (2026-06-17). RT=완성(완제품), UB/MB=박스 투입
const ROTOR_CELLS = [
  { key: 'EA', label: '요크가공' },
  { key: 'BO', label: '본딩' },
  { key: 'RT', label: '완성' },
  { key: 'UB', label: '유닛 박스' },
  { key: 'MB', label: '마스터 박스' },
]

const formatTime = (date) => (date ? date.toLocaleTimeString('ko-KR') : '-')

export default function InventoryBoardView({
  data,
  rotorData,
  rmData,
  lastUpdated,
  error,
  showHidden,
  onToggleHidden,
  invScope,
  onInvScopeChange,
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
    let raw = data ? (data[key] ?? 0) : null
    if (invScope === 'meta') raw = filterRawToMeta(raw)
    const { qty, today, todayRepair, phiDist, motorDist } = processCellData(key, raw)
    return (
      <InventoryCell
        key={key}
        processKey={key}
        label={key === 'OQ' ? '검사중' : label}
        qty={qty}
        today={today}
        todayRepair={todayRepair}
        phiDist={phiDist}
        motorDist={motorDist}
        selected={selectedProcess === key}
        onClick={() => onCellClick(key)}
      />
    )
  }

  // 회전자 셀 — 별도 데이터(rotorData). 클릭 상세는 'ROTOR:{key}' 합성키로 DetailPanel 재사용 (2026-06-17)
  const renderRotorCell = ({ key, label }) => {
    let raw = rotorData ? (rotorData[key] ?? 0) : null
    if (invScope === 'meta') raw = filterRawToMeta(raw)
    const { qty, today, todayRepair, phiDist, motorDist } = processCellData(key, raw)
    const ck = `ROTOR:${key}`
    return (
      <InventoryCell
        key={`R-${key}`}
        processKey={key}
        label={label}
        qty={qty}
        today={today}
        todayRepair={todayRepair}
        phiDist={phiDist}
        motorDist={motorDist}
        selected={selectedProcess === ck}
        onClick={() => onCellClick(ck)}
      />
    )
  }

  // RM 은 별도 '원자재' 섹션(분류별)으로 분리 — 숨김 그리드에서도 제외 (2026-06-17 B안)
  const hiddenCells = PROCESS_LIST.filter(({ key }) => HIDDEN_PROCESSES.includes(key) && key !== 'RM')

  // 섹션별 그룹핑 — ADM 홈의 "제작 / 검사 / 출하" 구조와 동일
  const produceCells = PRODUCE_LIST.filter(({ key }) => !HIDDEN_PROCESSES.includes(key))
  const inspectCells = INSPECT_LIST.filter(({ key }) => !INSPECT_EXCLUDE.includes(key))
  // OB(최종 출하)는 분리해 맨 아래 별도 섹션으로 (고정자+회전자 통합 출하, 2026-06-17)
  const shippingCells = [FP_ITEM, ...SHIPPING_LIST.filter(({ key }) => key !== 'OB')]
  const obCell = SHIPPING_LIST.find(({ key }) => key === 'OB')

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

        {/* 메타/전체 범위 토글 (2026-06-17) */}
        <ScopeToggle scope={invScope} onChange={onInvScopeChange} />

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

        {/* 고정자 = 제작 + 검사 한 줄 (줄 절약, 2026-06-17) / 출하 별도 */}
        {renderSection('고정자', [...produceCells, ...inspectCells])}
        {renderSection('출하', shippingCells)}

        {/* ── 회전자 (RT) — 공정 수가 달라 구분선 아래 별도 섹션 (2026-06-17) ── */}
        {rotorData && (
          <>
            <div className={s.lineDivider} />
            <Section label="회전자">
              <div className={s.grid}>
                {ROTOR_CELLS.map(renderRotorCell)}
              </div>
            </Section>
          </>
        )}

        {/* ── 원자재 (RM) — Warehouse 분류별. 카드 클릭 → 상세 ── */}
        <RmSection rmData={rmData} onSelect={onCellClick} selectedKey={selectedProcess} />

        {/* ── 출하(OB) — 최종 출하, 맨 아래 별도 섹션 (고정자+회전자 통합, 2026-06-17) ── */}
        {obCell && (
          <>
            <div className={s.lineDivider} />
            {renderSection('출하', [obCell])}
          </>
        )}

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
