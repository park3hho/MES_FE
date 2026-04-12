import { useState, useEffect, useRef } from 'react'

import { getInventorySummary, getBoxSummary } from '@/api'
import { FaradayLogo } from '@/components/FaradayLogo'
import { PROCESS_LIST } from '@/constants/processConst'
import { useMobile } from '@/hooks/useMobile'

import InventoryCell from './InventoryCell'
import DetailPanel from './DetailPanel'
import s from './Inventory.module.css'

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

        {/* 공정 그리드 + 완제품 셀 (OQ 옆) */}
        <div className={s.grid}>
          {PROCESS_LIST.map(({ key, label }) => {
            let cellQty = data ? (data[key] ?? 0) : null

            // OQ: 검사중만 (completed/fail 제외)
            if (key === 'OQ' && cellQty && typeof cellQty === 'object') {
              const pending = cellQty.total - (cellQty.completed || 0) - (cellQty.fail || 0)
              cellQty = Math.max(0, pending)
            }

            const items = [(
              <InventoryCell
                key={key}
                processKey={key}
                label={key === 'OQ' ? '검사중' : label}
                qty={cellQty}
                selected={selectedProcess === key}
                onClick={() => handleCellClick(key)}
              />
            )]

            // OQ 바로 뒤에 FP(완제품) 삽입
            if (key === 'OQ' && data) {
              const fpQty = typeof data.OQ === 'object' ? (data.OQ.completed || 0) : 0
              items.push(
                <InventoryCell
                  key="FP"
                  processKey="FP"
                  label="완제품"
                  qty={fpQty}
                  selected={selectedProcess === 'FP'}
                  onClick={() => handleCellClick('OQ')}
                />
              )
            }

            return items
          })}
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
