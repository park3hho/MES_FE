// src/components/Inventory/index.jsx
// 재고 대시보드 — 카드 뷰(기본) ↔ 목록 뷰 전환 + 화면(고정자·회전자·원자재) 전환 + 데이터 폴링 루트
// 데이터 fetch/상태를 모두 여기서 관리하고 자식 뷰에 props로 전달

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { getInventorySummary, getBoxSummary, getRotorInventorySummary, getRmWarehouseSummary } from '@/api'
import { useMobile } from '@/hooks/useMobile'

import InventoryListView from './InventoryListView'
import InventoryBoardView from './InventoryBoardView'
import { INVENTORY_LINES, DEFAULT_INVENTORY_LINE } from './inventoryHelpers'

// 뷰 전환 애니메이션 — 페이드 + 미세 위로 슬라이드 (토스 톤)
const VIEW_VARIANTS = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
}
const VIEW_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] }

const POLL_MS = 5000
const VIEWS = ['board', 'list']
const LINE_KEYS = INVENTORY_LINES.map((l) => l.key)
// 마지막에 본 화면·뷰를 기억한다 — 회전자 담당은 매번 회전자를 다시 누르지 않는다.
const LS_LINE = 'mes.inv.line'
const LS_VIEW = 'mes.inv.view'

// 사생활 보호 모드 등에서 localStorage 가 막혀도 화면은 떠야 한다 — 못 읽으면 기본값, 못 쓰면 조용히 넘어간다.
const readChoice = (key, allowed, fallback) => {
  try {
    const v = window.localStorage.getItem(key)
    return allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
const writeChoice = (key, value) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* 저장 실패는 무시 — 다음에 기본 화면으로 열릴 뿐이다 */
  }
}

// 호출부(ProcessInventoryPage · 내 대시보드 위젯)는 onLogout/onBack/presenting 을 넘기지만 여기선 쓰지 않는다 —
//   머리줄(뒤로가기·로그아웃)은 앱 셸(AdmLayout)이 그리고, 보기 전용(F11)에서도 화면 전환 토글은 남겨야 하기 때문.
export default function InventoryDashboard() {
  const isMobile = useMobile()

  // 뷰 — 카드(board)가 기본 (2026-09-21: 폰도 큰 글씨 2열 카드가 기본. 예전엔 폰만 목록이 기본이었다)
  const [view, setView] = useState(() => readChoice(LS_VIEW, VIEWS, 'board'))
  // 화면 — 고정자 / 회전자 / 원자재 (2026-09-21 분리)
  const [line, setLine] = useState(() => readChoice(LS_LINE, LINE_KEYS, DEFAULT_INVENTORY_LINE))

  // 공용 데이터 상태
  const [data, setData] = useState(null)             // 고정자 공정 요약
  const [rotorData, setRotorData] = useState(null)   // 회전자 공정 요약 {EA,BO,RT} (2026-06-17)
  const [rmData, setRmData] = useState(null)         // 원자재(RM) 분류별 요약 (Warehouse, 2026-06-17)
  // 최종 출하(OB)는 고정자+회전자 통합 수치라 두 화면에 같이 보인다 — 회전자 화면에서도 쓰려고 따로 든다.
  const [obRaw, setObRaw] = useState(null)
  // 마지막 성공 시각 — **화면별로** 든다 { stator, rotor, rm }. 하나로 두면 화면을 바꿨을 때
  //   다른 화면의 성공 시각이 지금 보이는 (묵은) 숫자의 시각처럼 찍힌다.
  const [updatedAt, setUpdatedAt] = useState({})
  const [error, setError] = useState(null)
  const [showHidden, setShowHidden] = useState(false)
  // 재고 범위 토글 — 'all'(전체) | 'meta'(메타 파이만) (2026-06-17). 기본 = 메타 (2026-08-04 사용자 요청)
  const [invScope, setInvScope] = useState('meta')

  // Board 뷰 전용 — 셀 선택 → 하단 상세 패널
  const [selectedProcess, setSelectedProcess] = useState(null)
  const [detailProcess, setDetailProcess] = useState(null)
  const [detailVisible, setDetailVisible] = useState(false)

  // ────────────────────────────────────────────
  // 요약 데이터 fetch — 5초 간격 폴링
  //   ★ **보고 있는 화면 것만** 부른다 (2026-09-21). 예전엔 세 API 를 5초마다 전부 불렀다.
  //   alive() = 이 폴링이 아직 유효한가 — 화면을 바꾼 뒤 늦게 도착한 응답이 상태를 덮지 않게 한다.
  // ────────────────────────────────────────────

  const fetchStator = async (alive) => {
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

    if (!alive()) return
    setData(invData)
    setObRaw(invData.OB ?? 0)
  }

  const fetchRotor = async (alive) => {
    // OB 는 곁가지 — 같이 출발시키되 **기다리지 않는다**(await 하면 '업데이트' 시각·오류 해제까지 무거운 고정자 요약에 묶인다).
    //   실패·지연돼도 회전자 카드는 먼저 뜨고 OB 는 직전 값 유지. catch 가 붙어 있어 떼어 놓아도 unhandled rejection 없음.
    getInventorySummary()
      .then((d) => {
        if (alive()) setObRaw(d.OB ?? 0)
      })
      .catch(() => { /* OB 조회 실패 무시 */ })
    const rotor = await getRotorInventorySummary()
    if (!alive()) return
    setRotorData(rotor)
  }

  const fetchRm = async (alive) => {
    const rm = await getRmWarehouseSummary()
    if (!alive()) return
    setRmData(rm)
  }

  useEffect(() => {
    let live = true
    const alive = () => live
    const run = async () => {
      try {
        if (line === 'rm') await fetchRm(alive)
        else if (line === 'rotor') await fetchRotor(alive)
        else await fetchStator(alive)
        if (!live) return
        // 클로저의 line = 이 폴링이 맡은 화면
        setUpdatedAt((m) => ({ ...m, [line]: new Date() }))
        setError(null)
      } catch (e) {
        if (live) setError(e.message)
      }
    }
    run()
    const timer = setInterval(run, POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
    // fetch* 는 매 렌더 새로 만들어지지만 state setter 만 쓴다 — line 이 바뀔 때만 폴링을 다시 건다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line])

  // ────────────────────────────────────────────
  // Board 뷰 핸들러 — 셀 클릭으로 하단 상세 패널 토글
  // ────────────────────────────────────────────

  // 패널 애니메이션용 지연 타이머 — 모아 뒀다가 화면·뷰 전환(resetDetail)과 언마운트 때 지운다.
  //   안 지우면 '카드 누르고 곧바로 회전자 탭' 에서 밀린 타이머가 발화해 다른 화면의 상세가 다시 열린다.
  const timersRef = useRef([])
  const later = (fn, ms) => {
    timersRef.current.push(setTimeout(fn, ms))
  }
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }
  // 언마운트 때 남은 타이머 정리 — clearTimers 는 매 렌더 새로 만들어져도 ref 만 읽으므로 첫 렌더 것으로 충분하다
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => clearTimers, [])

  const handleCellClick = (key) => {
    clearTimers()
    if (selectedProcess === key) {
      setDetailVisible(false)
      later(() => {
        setSelectedProcess(null)
        setDetailProcess(null)
      }, 350)
    } else if (selectedProcess) {
      setDetailVisible(false)
      later(() => {
        setSelectedProcess(key)
        setDetailProcess(key)
        later(() => setDetailVisible(true), 50)
      }, 300)
    } else {
      setSelectedProcess(key)
      setDetailProcess(key)
      later(() => setDetailVisible(true), 50)
    }
  }

  const handleDetailClose = () => {
    clearTimers()
    setDetailVisible(false)
    later(() => {
      setSelectedProcess(null)
      setDetailProcess(null)
    }, 350)
  }

  // ────────────────────────────────────────────
  // 뷰 · 화면 전환 — Board 패널 state 리셋 (다른 화면의 공정 상세가 열린 채 남지 않게)
  // ────────────────────────────────────────────

  const resetDetail = () => {
    clearTimers()
    setSelectedProcess(null)
    setDetailProcess(null)
    setDetailVisible(false)
  }

  const handleSwitchView = (next) => {
    setView(next)
    writeChoice(LS_VIEW, next)
    resetDetail()
  }

  const handleLineChange = (next) => {
    if (next === line) return
    setLine(next)
    writeChoice(LS_LINE, next)
    setError(null)
    resetDetail()
  }

  // ────────────────────────────────────────────
  // 공통 props
  // ────────────────────────────────────────────

  const commonProps = {
    line,
    onLineChange: handleLineChange,
    data,
    rotorData,
    rmData,
    obRaw,
    lastUpdated: updatedAt[line] ?? null,
    error,
    showHidden,
    onToggleHidden: () => setShowHidden((v) => !v),
    invScope,
    onInvScopeChange: setInvScope,
    isMobile,
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
