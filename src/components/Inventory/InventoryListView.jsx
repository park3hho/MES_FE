// src/components/Inventory/InventoryListView.jsx
// 재고 목록 뷰 — 공정당 한 행, 클릭 시 인라인 상세 펼침
// 화면은 카드 뷰와 같이 셋으로 나뉜다 — 고정자 / 회전자 / 원자재 (line, 2026-09-21).
// 부모(index.jsx)가 data/error 등 폴링 상태를 props로 전달

import { useState } from 'react'

import Section from '@/components/common/Section'
import { PROCESS_LIST, PRODUCE_LIST, INSPECT_LIST, SHIPPING_LIST, FP_ITEM } from '@/constants/processConst'

import InventoryRow from './InventoryRow'
import { processCellData, filterRawToMeta } from './inventoryHelpers'
import LineToggle from './LineToggle'
import ScopeToggle from './ScopeToggle'
import RmSection from './RmSection'
import s from './Inventory.module.css'

// RM~HT는 재고 수치가 실제 현황과 안 맞아 기본 숨김 (토글로 펼침)
const HIDDEN_PROCESSES = ['RM', 'MP', 'EA', 'HT']
// IQ·IPQ 는 대시보드에서 제외 (IPQ 미사용, 2026-06-17)
const INSPECT_EXCLUDE = ['IQ', 'IPQ']
// 회전자 행 — 공정(EA/BO)과 출하(RT/UB/MB) 분리. RT(완성)=완제품이라 고정자 FP 처럼 출하로 (2026-08-05)
const ROTOR_PROC_CELLS = [
  { key: 'EA', label: '요크가공' },
  { key: 'BO1', label: '본딩 중' },              // 1차 본딩만 (2차 대기) — bo2_at NULL (2026-07-30)
  { key: 'BO', label: '본딩', display: 'BO2' },  // 2차 본딩 완료 — bo2_at 존재 (배지=BO2, 데이터키 'BO' 유지)
]
const ROTOR_SHIP_CELLS = [
  { key: 'RT', label: '완성' },                  // 완제품 — 고정자 FP 대응
  { key: 'UB', label: '유닛 박스' },
  { key: 'MB', label: '마스터 박스' },
]

const formatTime = (date) => (date ? date.toLocaleTimeString('ko-KR') : '-')

export default function InventoryListView({
  line,
  onLineChange,
  data,
  rotorData,
  rmData,
  obRaw,
  lastUpdated,
  error,
  showHidden,
  onToggleHidden,
  invScope,
  onInvScopeChange,
  isMobile,
  onSwitchToBoard,
}) {
  // 한 번에 하나의 행만 펼침 (accordion)
  const [openProcess, setOpenProcess] = useState(null)

  // 화면(고정자↔회전자↔원자재)이 바뀌면 펼친 행을 접는다 — 안 그러면 돌아왔을 때 열린 채 다시 조회하고,
  //   두 화면 공통인 '통합 출하' 행은 열린 채로 따라온다. (렌더 중 비교 — effect 없이 한 번에 반영)
  const [prevLine, setPrevLine] = useState(line)
  if (prevLine !== line) {
    setPrevLine(line)
    setOpenProcess(null)
  }

  const handleRowToggle = (key) => {
    setOpenProcess((prev) => (prev === key ? null : key))
  }

  // 고정자 행 — 펼치면 LOT 상세. source 가 아직 없으면(첫 로드) 스켈레톤.
  const renderRow = ({ key, label }, source) => {
    if (!source) return <InventoryRow key={key} process={key} label={label} loading />
    let raw = source[key] ?? 0
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
        invScope={invScope}
      />
    )
  }

  // 회전자 행 — 별도 데이터(rotorData), 펼침 상세 없음 (display-only)
  const renderRotorRow = ({ key, label, display }) => {
    if (!rotorData) return <InventoryRow key={`R-${key}`} process={display || key} label={label} loading />
    let raw = rotorData[key] ?? 0
    if (invScope === 'meta') raw = filterRawToMeta(raw)
    const { qty, today, todayRepair, phiDist, motorDist } = processCellData(key, raw)
    return (
      <InventoryRow
        key={`R-${key}`}
        process={display || key}
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

  // RM 은 별도 '원자재' 화면(분류별)으로 분리 — 숨김 목록에서도 제외 (2026-06-17 B안)
  const hiddenRows = PROCESS_LIST.filter(({ key }) => HIDDEN_PROCESSES.includes(key) && key !== 'RM')
  const produceRows = PRODUCE_LIST.filter(({ key }) => !HIDDEN_PROCESSES.includes(key))
  const inspectRows = INSPECT_LIST.filter(({ key }) => !INSPECT_EXCLUDE.includes(key))
  // OB(최종 출하)는 고정자+회전자 통합 수치 — 두 화면의 '출하' 섹션 마지막 행으로 둔다 (2026-09-21, 카드 뷰와 동일)
  const shippingRows = [FP_ITEM, ...SHIPPING_LIST.filter(({ key }) => key !== 'OB')]
  const obBase = SHIPPING_LIST.find(({ key }) => key === 'OB')
  const obRow = obBase ? { ...obBase, label: '통합 출하' } : null
  const obSource = obRaw == null ? null : { OB: obRaw }

  const renderSection = (title, rows, source, withOb = false) => (
    <Section label={title}>
      <div className={s.list}>
        {rows.map((r) => renderRow(r, source))}
        {withOb && obRow && renderRow(obRow, obSource)}
      </div>
    </Section>
  )

  const isStator = line === 'stator'
  const isRm = line === 'rm'

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.titleRow}>
          <h2 className={s.title}>실시간 재고 현황</h2>
          <div className={s.titleRight}>
            {/* 오류 중에도 마지막 성공 시각을 남긴다 — 화면의 숫자가 얼마나 묵었는지 보이게 */}
            <span className={`${s.updated} ${error ? s.updatedError : ''}`}>
              {error ? `⚠ 연결 오류 · 마지막 ${formatTime(lastUpdated)}` : `업데이트 ${formatTime(lastUpdated)}`}
            </span>
          </div>
        </div>

        {/* 조작 줄 — 폰: 두 줄 / 넓은 화면: 한 줄 (카드 뷰와 동일) */}
        <div className={s.controlBar}>
          {/* 화면 전환 — 고정자 / 회전자 / 원자재 (2026-09-21) */}
          <LineToggle line={line} onChange={onLineChange} />

          {/* 범위(메타/전체) · 앞공정 펼치기 · 뷰 전환 — 한 줄 */}
          <div className={s.controlRow}>
            {!isRm && <ScopeToggle scope={invScope} onChange={onInvScopeChange} />}
            {isStator && (
              <button
                type="button"
                className={`${s.toggleBtn} ${showHidden ? s.toggleBtnOpen : ''}`}
                onClick={onToggleHidden}
              >
                <span className={s.toggleArrow}>▾</span>
                RM~HT {showHidden ? '숨기기' : '펼치기'}
              </button>
            )}
            <button
              type="button"
              className={s.viewSwitch}
              onClick={onSwitchToBoard}
              title="카드 뷰로 보기"
              aria-label="카드 뷰로 보기"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
          </div>
        </div>

        {isStator && (
          <>
            {/* RM~HT 목록 — 애니메이션 접힘 */}
            <div className={`${s.hiddenWrap} ${showHidden ? s.hiddenWrapOpen : ''}`}>
              <div className={s.hiddenInner}>
                <div className={s.list}>{hiddenRows.map((r) => renderRow(r, data))}</div>
              </div>
            </div>
            {renderSection('공정', [...produceRows, ...inspectRows], data)}
            {renderSection('출하', shippingRows, data, true)}
          </>
        )}

        {line === 'rotor' && (
          <>
            <Section label="공정">
              <div className={s.list}>{ROTOR_PROC_CELLS.map(renderRotorRow)}</div>
            </Section>
            <Section label="출하">
              <div className={s.list}>
                {ROTOR_SHIP_CELLS.map(renderRotorRow)}
                {obRow && renderRow(obRow, obSource)}
              </div>
            </Section>
          </>
        )}

        {/* ── 원자재 (RM) — Warehouse 분류별. 목록 뷰는 상세 패널이 없어 품목을 카드 안에 **전부** 보여 준다.
             .board 로 감싸야 카드 열 수·글자 크기 단계(@container)가 걸린다 — 안 감싸면 넓은 화면에서도 1열 고정. ── */}
        {isRm && (
          <div className={s.board}>
            {rmData
              ? <RmSection rmData={rmData} />
              : <p className={s.rmEmpty}>불러오는 중…</p>}
          </div>
        )}

      </div>
    </div>
  )
}
