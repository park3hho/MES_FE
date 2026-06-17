// src/components/Inventory/InventoryListView.jsx
// 재고 목록 뷰 — 공정당 한 행, 클릭 시 인라인 상세 펼침
// 부모(index.jsx)가 data/error 등 폴링 상태를 props로 전달

import { useState } from 'react'

import Section from '@/components/common/Section'
import { PROCESS_LIST, PRODUCE_LIST, INSPECT_LIST, SHIPPING_LIST, FP_ITEM } from '@/constants/processConst'
import { useIsDesktop } from '@/hooks/useBreakpoint'

import InventoryRow from './InventoryRow'
import { processCellData, filterRawToMeta } from './inventoryHelpers'
import ScopeToggle from './ScopeToggle'
import RmSection from './RmSection'
import s from './Inventory.module.css'

// RM~HT는 재고 수치가 실제 현황과 안 맞아 기본 숨김 (토글로 펼침)
const HIDDEN_PROCESSES = ['RM', 'MP', 'EA', 'HT']
// IQ·IPQ 는 대시보드에서 제외 (IPQ 미사용, 2026-06-17)
const INSPECT_EXCLUDE = ['IQ', 'IPQ']
// 회전자 행 — 공정(EA/BO/RT) + 출하(UB/MB) (2026-06-17). RT=완성(완제품), UB/MB=박스 투입
const ROTOR_CELLS = [
  { key: 'EA', label: '요크가공' },
  { key: 'BO', label: '본딩' },
  { key: 'RT', label: '완성' },
  { key: 'UB', label: '유닛 박스' },
  { key: 'MB', label: '마스터 박스' },
]

const formatTime = (date) => (date ? date.toLocaleTimeString('ko-KR') : '-')

export default function InventoryListView({
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
  onSwitchToBoard,
}) {
  const isDesktop = useIsDesktop()
  // 한 번에 하나의 행만 펼침 (accordion)
  const [openProcess, setOpenProcess] = useState(null)

  const handleRowToggle = (key) => {
    setOpenProcess((prev) => (prev === key ? null : key))
  }

  const renderRow = ({ key, label }) => {
    let raw = data ? (data[key] ?? 0) : null
    if (invScope === 'meta') raw = filterRawToMeta(raw)
    const { qty, today, todayRepair, phiDist, motorDist } = processCellData(key, raw)
    return (
      <InventoryRow
        key={key}
        process={key}
        label={key === 'OQ' ? '검사중' : label}
        qty={qty}
        today={today}
        todayRepair={todayRepair}
        phiDist={phiDist}
        motorDist={motorDist}
        isOpen={openProcess === key}
        onToggle={() => handleRowToggle(key)}
        isMobile={isMobile}
      />
    )
  }

  // 회전자 행 — 별도 데이터(rotorData), 펼침 상세 없음 (display-only)
  const renderRotorRow = ({ key, label }) => {
    let raw = rotorData ? (rotorData[key] ?? 0) : null
    if (invScope === 'meta') raw = filterRawToMeta(raw)
    const { qty, today, todayRepair, phiDist, motorDist } = processCellData(key, raw)
    return (
      <InventoryRow
        key={`R-${key}`}
        process={key}
        label={label}
        qty={qty}
        today={today}
        todayRepair={todayRepair}
        phiDist={phiDist}
        motorDist={motorDist}
        isOpen={false}
        onToggle={() => {}}
        isMobile={isMobile}
      />
    )
  }

  // RM 은 별도 '원자재' 섹션(분류별)으로 분리 — 숨김 목록에서도 제외 (2026-06-17 B안)
  const hiddenRows = PROCESS_LIST.filter(({ key }) => HIDDEN_PROCESSES.includes(key) && key !== 'RM')

  // 섹션별 그룹핑 — 보드뷰와 동일
  const produceRows = PRODUCE_LIST.filter(({ key }) => !HIDDEN_PROCESSES.includes(key))
  const inspectRows = INSPECT_LIST.filter(({ key }) => !INSPECT_EXCLUDE.includes(key))
  // OB(최종 출하)는 분리해 맨 아래 별도 섹션으로 (2026-06-17)
  const shippingRows = [FP_ITEM, ...SHIPPING_LIST.filter(({ key }) => key !== 'OB')]
  const obRow = SHIPPING_LIST.find(({ key }) => key === 'OB')

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

        {/* 고정자 = 제작 + 검사 한 줄 (줄 절약, 2026-06-17) / 출하 별도 */}
        {renderSection('고정자', [...produceRows, ...inspectRows])}
        {renderSection('출하', shippingRows)}

        {/* ── 회전자 (RT) — 공정 수가 달라 구분선 아래 별도 섹션 (2026-06-17) ── */}
        {rotorData && (
          <>
            <div className={s.lineDivider} />
            <Section label="회전자">
              <div className={s.list}>
                {ROTOR_CELLS.map(renderRotorRow)}
              </div>
            </Section>
          </>
        )}

        {/* ── 원자재 (RM) — Warehouse 분류별 ── */}
        <RmSection rmData={rmData} />

        {/* ── 출하(OB) — 최종 출하, 맨 아래 별도 섹션 (2026-06-17) ── */}
        {obRow && (
          <>
            <div className={s.lineDivider} />
            {renderSection('출하', [obRow])}
          </>
        )}
      </div>
    </div>
  )
}
