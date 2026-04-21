// src/components/Inventory/index.jsx
// 재고 대시보드 — 목록 뷰(기본) ↔ 전광판 뷰 전환 + 데이터 폴링 루트
// 데이터 fetch/상태를 모두 여기서 관리하고 자식 뷰에 props로 전달

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { getInventorySummary, getBoxSummary } from '@/api'
import { useMobile } from '@/hooks/useMobile'
import { useIsDesktop } from '@/hooks/useBreakpoint'

import InventoryListView from './InventoryListView'
import InventoryBoardView from './InventoryBoardView'

// 뷰 전환 애니메이션 — 페이드 + 미세 위로 슬라이드 (토스 톤)
const VIEW_VARIANTS = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
}
const VIEW_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] }

// onLogout, onBack — App.jsx에서 전달
export default function InventoryDashboard({ onLogout, onBack }) {
  const isMobile = useMobile()
  const isDesktop = useIsDesktop()

  // 뷰 전환 — 데스크탑은 전광판(board)이 기본, 그 외는 목록(list)
  // 최초 마운트 시점에만 결정 (이후 뷰 전환은 사용자 버튼 조작)
  const [view, setView] = useState(isDesktop ? 'board' : 'list')

  // 공용 데이터 상태
  const [data, setData] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)
  const [showHidden, setShowHidden] = useState(false)

  // Board 뷰 전용 — 셀 선택 → 하단 상세 패널
  const [selectedProcess, setSelectedProcess] = useState(null)
  const [detailProcess, setDetailProcess] = useState(null)
  const [detailVisible, setDetailVisible] = useState(false)

  const intervalRef = useRef(null)

  // ────────────────────────────────────────────
  // 요약 데이터 fetch — 5초 간격 폴링
  // ────────────────────────────────────────────

  const fetchSummary = async () => {
    try {
      const invData = await getInventorySummary()

      // UB/MB 박스 수량 별도 조회 + phi 분포 집계
      for (const proc of ['UB', 'MB']) {
        try {
          const boxData = await getBoxSummary(proc)
          const boxes = boxData.boxes || []
          const filled = boxes.filter((b) => !b.empty).length
          const empty = boxes.filter((b) => b.empty).length
          // phi 분포 집계 — UB: phi_spec별 박스 수, MB: 내부 ST 기준 phi_counts 합산
          const phi_dist = {}
          for (const b of boxes) {
            if (b.empty) continue
            if (proc === 'UB' && b.spec) {
              phi_dist[b.spec] = (phi_dist[b.spec] || 0) + 1
            } else if (proc === 'MB' && b.phi_counts) {
              for (const [phi, cnt] of Object.entries(b.phi_counts)) {
                phi_dist[phi] = (phi_dist[phi] || 0) + cnt
              }
            }
          }
          invData[proc] = { filled, empty, total: boxes.length, phi_dist }
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
  // Board 뷰 핸들러 — 셀 클릭으로 하단 상세 패널 토글
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

  const handleDetailClose = () => {
    setDetailVisible(false)
    setTimeout(() => {
      setSelectedProcess(null)
      setDetailProcess(null)
    }, 350)
  }

  // ────────────────────────────────────────────
  // 뷰 전환 — Board 패널 state 리셋
  // ────────────────────────────────────────────

  const handleSwitchView = (next) => {
    setView(next)
    setSelectedProcess(null)
    setDetailProcess(null)
    setDetailVisible(false)
  }

  // ────────────────────────────────────────────
  // 공통 props
  // ────────────────────────────────────────────

  const commonProps = {
    data,
    lastUpdated,
    error,
    showHidden,
    onToggleHidden: () => setShowHidden((v) => !v),
    isMobile,
    onBack,
    onLogout,
  }

  // ────────────────────────────────────────────
  // 뷰 렌더링
  // ────────────────────────────────────────────

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={view}
        variants={VIEW_VARIANTS}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={VIEW_TRANSITION}
      >
        {view === 'board' ? (
          <InventoryBoardView
            {...commonProps}
            selectedProcess={selectedProcess}
            detailProcess={detailProcess}
            detailVisible={detailVisible}
            onCellClick={handleCellClick}
            onDetailClose={handleDetailClose}
            onSwitchToList={() => handleSwitchView('list')}
          />
        ) : (
          <InventoryListView
            {...commonProps}
            onSwitchToBoard={() => handleSwitchView('board')}
          />
        )}
      </motion.div>
    </AnimatePresence>
  )
}
