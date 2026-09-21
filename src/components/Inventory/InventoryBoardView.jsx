// src/components/Inventory/InventoryBoardView.jsx
// 재고 카드 뷰 — 큰 글씨 카드 그리드 (2026-09-21 목업 M2). 폰 2열이 기본이고 상자 폭에 따라 3열·4열로 넓어진다.
// 화면은 셋으로 나뉜다 — 고정자 / 회전자 / 원자재 (line). 부모(index.jsx)가 data/error 등 폴링 상태를 props로 전달.

import { useEffect, useRef } from 'react'

import Section from '@/components/common/Section'
import { PROCESS_LIST, PRODUCE_LIST, INSPECT_LIST, SHIPPING_LIST, FP_ITEM } from '@/constants/processConst'

import InventoryCell from './InventoryCell'
import DetailPanel from './DetailPanel'
import { processCellData, filterRawToMeta } from './inventoryHelpers'
import LineToggle from './LineToggle'
import ScopeToggle from './ScopeToggle'
import RmSection from './RmSection'
import s from './Inventory.module.css'

// RM~HT는 토글로 숨김/펼침 (재고 수치가 실제와 안 맞는 공정)
const HIDDEN_PROCESSES = ['RM', 'MP', 'EA', 'HT']
// IQ·IPQ 는 대시보드에서 제외 (IPQ 미사용, 2026-06-17)
const INSPECT_EXCLUDE = ['IQ', 'IPQ']
// 회전자 셀 — 공정(EA/BO)과 출하(RT/UB/MB) 분리. RT(완성)=완제품이라 고정자 FP 처럼 출하로 (2026-08-05)
const ROTOR_PROC_CELLS = [
  { key: 'EA', label: '요크가공' },
  { key: 'BO1', label: '본딩 중' },              // 1차 본딩만 완료 (2차 대기) — bo2_at NULL (2026-07-30)
  { key: 'BO', label: '본딩', display: 'BO2' },  // 2차 본딩 완료 — bo2_at 존재 (배지 표시=BO2, 데이터키는 'BO' 유지)
]
const ROTOR_SHIP_CELLS = [
  { key: 'RT', label: '완성' },                  // 완제품 — 고정자 FP 대응
  { key: 'UB', label: '유닛 박스' },
  { key: 'MB', label: '마스터 박스' },
]
const RM_SKELETON = ['a', 'b', 'c']

const formatTime = (date) => (date ? date.toLocaleTimeString('ko-KR') : '-')

export default function InventoryBoardView({
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
  // 하단 상세 패널 제어
  selectedProcess,
  detailProcess,
  detailVisible,
  onCellClick,
  onDetailClose,
  onSwitchToList,
}) {
  // 상세 패널은 카드 전부의 **아래**에 하나만 있다 — 큰 글씨 카드는 폰에서 세로로 길어(2열 × 5줄) 맨 위 카드를 누르면
  //   패널이 화면 밖에서 열려 '눌러도 아무 일도 없는' 것처럼 보인다. 열리면 화면 안으로 데려온다.
  //   패널은 max-height 0.5s 로 펼쳐지므로 다 펼쳐진 뒤에 맞춘다('nearest' = 이미 보이면 안 움직인다).
  const panelRef = useRef(null)
  useEffect(() => {
    if (!detailVisible) return undefined
    const t = setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 520)
    return () => clearTimeout(t)
  }, [detailVisible, detailProcess])

  // 셀 하나 — source 가 아직 없으면(첫 로드) 스켈레톤.
  //   prefix: 상세 패널 합성키 앞머리. 회전자는 'ROTOR:{key}' 로 DetailPanel 을 재사용한다 (2026-06-17)
  const renderCell = ({ key, label, display }, source, prefix = '') => {
    const ck = prefix ? `${prefix}:${key}` : key
    if (!source) {
      return <InventoryCell key={ck} processKey={display || key} label={label} loading />
    }
    let raw = source[key] ?? 0
    if (invScope === 'meta') raw = filterRawToMeta(raw)
    const { qty, today, todayRepair, phiDist, motorDist } = processCellData(key, raw)
    return (
      <InventoryCell
        key={ck}
        processKey={display || key}
        label={key === 'OQ' ? '검사중' : label}
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

  // withOb — 출하 섹션 끝에 통합 출하(OB) 카드를 붙인다. OB 는 데이터 출처(obRaw)와 상세 키('OB')가 달라 따로 그린다.
  const renderSection = (title, cells, source, prefix, withOb = false) => (
    <Section label={title}>
      <div className={s.grid}>
        {cells.map((c) => renderCell(c, source, prefix))}
        {withOb && obCell && renderCell(obCell, obSource)}
      </div>
    </Section>
  )

  // RM 은 별도 '원자재' 화면(분류별)으로 분리 — 숨김 그리드에서도 제외 (2026-06-17 B안)
  const hiddenCells = PROCESS_LIST.filter(({ key }) => HIDDEN_PROCESSES.includes(key) && key !== 'RM')
  const produceCells = PRODUCE_LIST.filter(({ key }) => !HIDDEN_PROCESSES.includes(key))
  const inspectCells = INSPECT_LIST.filter(({ key }) => !INSPECT_EXCLUDE.includes(key))
  // OB(최종 출하)는 고정자+회전자 통합 수치 — 두 화면의 '출하' 섹션 마지막 카드로 둔다 (2026-09-21).
  //   예전엔 카드 한 장짜리 섹션이 따로 있어 한 줄을 통째로 차지했다 — 큰 글씨 카드에서는 그 한 줄이 아깝다.
  const shippingCells = [FP_ITEM, ...SHIPPING_LIST.filter(({ key }) => key !== 'OB')]
  const obBase = SHIPPING_LIST.find(({ key }) => key === 'OB')
  const obCell = obBase ? { ...obBase, label: '통합 출하' } : null
  const obSource = obRaw == null ? null : { OB: obRaw }

  const isStator = line === 'stator'
  const isRm = line === 'rm'

  return (
    <div className={s.page}>
      <div className={`${s.card} ${s.cardWide}`}>
        <div className={s.titleRow}>
          <h2 className={s.title}>실시간 재고 현황</h2>
          <div className={s.titleRight}>
            {/* 오류 중에도 마지막 성공 시각을 남긴다 — 화면의 숫자가 얼마나 묵었는지 보이게 */}
            <span className={`${s.updated} ${error ? s.updatedError : ''}`}>
              {error ? `⚠ 연결 오류 · 마지막 ${formatTime(lastUpdated)}` : `업데이트 ${formatTime(lastUpdated)}`}
            </span>
          </div>
        </div>

        {/* 조작 줄 — 폰: 화면 전환(위) / 범위·펼치기·뷰(아래) 두 줄. 넓은 화면: 한 줄로 합쳐 세로 자리를 아낀다. */}
        <div className={s.controlBar}>
          {/* 화면 전환 — 고정자 / 회전자 / 원자재 (2026-09-21) */}
          <LineToggle line={line} onChange={onLineChange} />

          {/* 범위(메타/전체) · 앞공정 펼치기 · 뷰 전환 — 한 줄. 원자재 화면엔 Φ 가 없어 범위 토글이 없다. */}
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
              onClick={onSwitchToList}
              title="목록 뷰로 보기"
              aria-label="목록 뷰로 보기"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* 카드 영역 — 이 상자 폭이 카드 열 수·글자 크기를 정한다(@container). 내 대시보드 ⅓ 폭 위젯에서도 맞는다. */}
        <div className={s.board}>
          {isStator && (
            <>
              {/* RM~HT 그리드 — 애니메이션 접힘/펼침 */}
              <div className={`${s.hiddenWrap} ${showHidden ? s.hiddenWrapOpen : ''}`}>
                <div className={s.hiddenInner}>
                  <div className={s.grid}>{hiddenCells.map((c) => renderCell(c, data))}</div>
                </div>
              </div>
              {renderSection('공정', [...produceCells, ...inspectCells], data)}
              {renderSection('출하', shippingCells, data, '', true)}
            </>
          )}

          {line === 'rotor' && (
            <>
              {renderSection('공정', ROTOR_PROC_CELLS, rotorData, 'ROTOR')}
              {renderSection('출하', ROTOR_SHIP_CELLS, rotorData, 'ROTOR', true)}
            </>
          )}

          {isRm && (
            rmData
              ? <RmSection rmData={rmData} onSelect={onCellClick} selectedKey={selectedProcess} />
              : (
                <Section label="원자재">
                  <div className={s.rmGrid}>
                    {RM_SKELETON.map((k) => <InventoryCell key={k} processKey="" label="" loading />)}
                  </div>
                </Section>
              )
          )}

        </div>

        <div ref={panelRef}>
          <DetailPanel
            process={detailProcess}
            visible={detailVisible}
            onClose={onDetailClose}
            isMobile={isMobile}
            invScope={invScope}
          />
        </div>
      </div>
    </div>
  )
}
