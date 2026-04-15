import { useState, useEffect, useRef } from 'react'

import { getInventorySummary, getBoxSummary } from '@/api'
import { FaradayLogo } from '@/components/FaradayLogo'
import { PROCESS_LIST } from '@/constants/processConst'
import { useMobile } from '@/hooks/useMobile'
import { useIsDesktop } from '@/hooks/useBreakpoint'

import InventoryCell from './InventoryCell'
import DetailPanel from './DetailPanel'
import s from './Inventory.module.css'

// ════════════════════════════════════════════
// 재고 대시보드 — 전 공정 실시간 재고 + 상세
// ════════════════════════════════════════════

// RM~HT는 재고 수치가 실제 현황과 안 맞아 기본 숨김 (토글로 펼침)
const HIDDEN_PROCESSES = ['RM', 'MP', 'EA', 'HT']

// onLogout, onBack — App.jsx에서 전달
export default function InventoryDashboard({ onLogout, onBack }) {
  const isMobile = useMobile()
  const isDesktop = useIsDesktop()
  const [data, setData] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)
  const [selectedProcess, setSelectedProcess] = useState(null)
  const [detailProcess, setDetailProcess] = useState(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const intervalRef = useRef(null)

  // ────────────────────────────────────────────
  // 요약 데이터 fetch — 5초 간격 폴링
  // ────────────────────────────────────────────

  const fetchSummary = async () => {
    try {
      const invData = await getInventorySummary()

      // UB/MB 박스 수량 별도 조회
      for (const proc of ['UB', 'MB']) {
        try {
          const boxData = await getBoxSummary(proc)
          const boxes = boxData.boxes || []
          const filled = boxes.filter((b) => !b.empty).length
          const empty = boxes.filter((b) => b.empty).length
          invData[proc] = { filled, empty, total: boxes.length }
        } catch {
          /* 무시 */
        }
      }

      setData(invData)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    fetchSummary()
    intervalRef.current = setInterval(fetchSummary, 5000)
    return () => clearInterval(intervalRef.current)
  }, [])

  // ────────────────────────────────────────────
  // 셀 클릭 → 상세 패널 토글 (애니메이션 딜레이 포함)
  // ────────────────────────────────────────────

  const handleCellClick = (key) => {
    if (selectedProcess === key) {
      setDetailVisible(false)
      setTimeout(() => {
        setSelectedProcess(null)
        setDetailProcess(null)
      }, 350)
    } else if (selectedProcess) {
      setDetailVisible(false)
      setTimeout(() => {
        setSelectedProcess(key)
        setDetailProcess(key)
        setTimeout(() => setDetailVisible(true), 50)
      }, 300)
    } else {
      setSelectedProcess(key)
      setDetailProcess(key)
      setTimeout(() => setDetailVisible(true), 50)
    }
  }

  const handleClose = () => {
    setDetailVisible(false)
    setTimeout(() => {
      setSelectedProcess(null)
      setDetailProcess(null)
    }, 350)
  }

  const formatTime = (date) => (date ? date.toLocaleTimeString('ko-KR') : '-')

  // 셀 한 개 렌더 — 두 그리드에서 공유
  const renderCell = ({ key, label }) => {
    let cellQty = data ? (data[key] ?? 0) : null
    // 신규 스키마 {total, today, phi_dist} 에서 today / phi_dist 추출
    let todayCount = null
    let phiDist = null
    if (cellQty && typeof cellQty === 'object') {
      if ('today' in cellQty) todayCount = cellQty.today
      if ('phi_dist' in cellQty) phiDist = cellQty.phi_dist
    }

    // OQ: 검사중(PENDING+RECHECK) 메인 + PROBE(조사)는 서브 표시
    if (key === 'OQ' && cellQty && typeof cellQty === 'object') {
      const pending = cellQty.total
        - (cellQty.completed || 0)
        - (cellQty.fail || 0)
        - (cellQty.probe || 0)
      cellQty = {
        oqPending: Math.max(0, pending),
        probe: cellQty.probe || 0,
      }
    }
    // BE 신규 스키마 {total, today, phi_dist} — 평면 공정은 total만 셀에 전달
    // (UB/MB: {filled,empty,total} — FE에서 별도 셋업 / OQ: 위에서 처리 / kg: {weight,qty,unit})
    else if (
      cellQty &&
      typeof cellQty === 'object' &&
      'total' in cellQty &&
      !('filled' in cellQty) &&
      !('completed' in cellQty) &&
      !('unit' in cellQty)
    ) {
      cellQty = cellQty.total
    }

    return (
      <InventoryCell
        key={key}
        processKey={key}
        label={key === 'OQ' ? '검사중' : label}
        qty={cellQty}
        today={todayCount}
        phiDist={phiDist}
        selected={selectedProcess === key}
        onClick={() => handleCellClick(key)}
      />
    )
  }

  // PROCESS_LIST를 숨김/표시 그룹으로 분리
  const hiddenCells = PROCESS_LIST.filter(({ key }) => HIDDEN_PROCESSES.includes(key))
  const visibleCells = PROCESS_LIST.filter(({ key }) => !HIDDEN_PROCESSES.includes(key))

  // ════════════════════════════════════════════
  // 렌더링
  // ════════════════════════════════════════════

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <FaradayLogo size={isMobile ? 'sm' : 'md'} />
          {/* 데스크탑에선 SideNav로 탐색 — 뒤로/로그아웃 버튼 중복 제거 */}
          {!isDesktop && (
            <div className={s.headerBtns}>
              <button className={s.backBtn} onClick={onBack}>
                ← 뒤로
              </button>
              <button className={s.logoutBtn} onClick={onLogout}>
                로그아웃
              </button>
            </div>
          )}
        </div>

        <div className={s.titleRow}>
          <h2 className={s.title}>실시간 재고 현황</h2>
          <span className={s.updated} style={{ color: error ? '#e05555' : '#8a93a8' }}>
            {error ? '⚠ 연결 오류' : `업데이트: ${formatTime(lastUpdated)}`}
          </span>
        </div>

        {/* RM~HT 토글 */}
        <div className={s.toggleRow}>
          <button
            className={`${s.toggleBtn} ${showHidden ? s.toggleBtnOpen : ''}`}
            onClick={() => setShowHidden((v) => !v)}
          >
            <span className={s.toggleArrow}>▾</span>
            RM~HT {showHidden ? '숨기기' : '펼치기'}
          </button>
        </div>

        {/* RM~HT 그리드 — 애니메이션 접힘/펼침 (grid-template-rows 0fr → 1fr) */}
        <div className={`${s.hiddenWrap} ${showHidden ? s.hiddenWrapOpen : ''}`}>
          <div className={s.hiddenInner}>
            <div className={s.grid}>
              {hiddenCells.map(renderCell)}
            </div>
          </div>
        </div>

        {/* BO~OB 그리드 — 항상 표시 */}
        <div className={s.grid}>
          {visibleCells.map(renderCell)}
        </div>

        <DetailPanel
          process={detailProcess}
          visible={detailVisible}
          onClose={handleClose}
          isMobile={isMobile}
        />
      </div>
    </div>
  )
}
