import { useState, useEffect, useRef } from 'react'

import { FaradayLogo } from '@/components/FaradayLogo'
import { PROCESS_LIST } from '@/constants/processConst'
import { useMobile } from '@/hooks/useMobile'

import InventoryCell from './InventoryCell'
import DetailPanel from './DetailPanel'
import s from './InventoryPage.module.css'

const BASE_URL = import.meta.env.VITE_API_URL || ''

// ════════════════════════════════════════════
// 재고 대시보드 — 전 공정 실시간 재고 + 상세
// ════════════════════════════════════════════

// onLogout, onBack — App.jsx에서 전달
export default function InventoryDashboard({ onLogout, onBack }) {
  const isMobile = useMobile()
  const [data, setData] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)
  const [selectedProcess, setSelectedProcess] = useState(null)
  const [detailProcess, setDetailProcess] = useState(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const intervalRef = useRef(null)

  // ────────────────────────────────────────────
  // 요약 데이터 fetch — 5초 간격 폴링
  // ────────────────────────────────────────────

  const fetchSummary = async () => {
    try {
      const res = await fetch(`${BASE_URL}/inventory/summary`, { credentials: 'include' })
      if (!res.ok) throw new Error('조회 실패')
      const invData = await res.json()

      // UB/MB 박스 수량 별도 조회
      for (const proc of ['UB', 'MB']) {
        try {
          const boxRes = await fetch(`${BASE_URL}/box/summary/${proc}`, { credentials: 'include' })
          if (boxRes.ok) {
            const boxData = await boxRes.json()
            const boxes = boxData.boxes || []
            const filled = boxes.filter((b) => !b.empty).length
            const empty = boxes.filter((b) => b.empty).length
            invData[proc] = { filled, empty, total: boxes.length }
          }
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

  // ════════════════════════════════════════════
  // 렌더링
  // ════════════════════════════════════════════

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <FaradayLogo size={isMobile ? 'sm' : 'md'} />
          <div className={s.headerBtns}>
            <button className={s.backBtn} onClick={onBack}>
              ← 뒤로
            </button>
            <button className={s.logoutBtn} onClick={onLogout}>
              로그아웃
            </button>
          </div>
        </div>

        <div className={s.titleRow}>
          <h2 className={s.title}>실시간 재고 현황</h2>
          <span className={s.updated} style={{ color: error ? '#e05555' : '#8a93a8' }}>
            {error ? '⚠ 연결 오류' : `업데이트: ${formatTime(lastUpdated)}`}
          </span>
        </div>

        {/* 12개 공정 그리드 */}
        <div className={s.grid}>
          {PROCESS_LIST.map(({ key, label }) => (
            <InventoryCell
              key={key}
              processKey={key}
              label={label}
              qty={data ? (data[key] ?? 0) : null}
              selected={selectedProcess === key}
              onClick={() => handleCellClick(key)}
            />
          ))}
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
