import { useState, useEffect, useRef } from 'react'

import { PROCESS_INPUT, PHI_SPECS } from '@/constants/processConst'

import s from './Inventory.module.css'

// ════════════════════════════════════════════
// 재고 셀 — 공정 하나의 재고량 표시
// ════════════════════════════════════════════

// processKey — 'RM', 'EA' 등, qty — 숫자 또는 { weight, qty, unit } 또는 { filled, empty, total }
// today — 오늘 생산량 (숫자 또는 null)
// phiDist — 파이 분포 { "87": 3, "70": 1, ... } (파이 공정만)
// selected — 현재 선택 여부, onClick — 셀 클릭 콜백
export default function InventoryCell({ processKey, label, qty, today, phiDist, selected, onClick }) {
  const [flash, setFlash] = useState(false)
  const [fading, setFading] = useState(false)
  // 초기 마운트 시 flash 방지 — 항상 null로 시작해서 null 가드가 걸리게 함
  // (qty 원본으로 초기화하면 객체 qty(RM/MP/OQ 등) 셀에서 첫 렌더에 flash 오발동)
  const prevQty = useRef(null)

  const qtyKey = typeof qty === 'object' ? (qty?.weight ?? qty?.total ?? qty?.completed ?? qty?.oqPending) : qty

  // 수량 변경 시 flash 효과 — 2.5초 후 자동 해제
  // 첫 렌더 or qty가 null → 숫자 로 바뀌는 최초 데이터 도착에는 flash 안 뜸
  useEffect(() => {
    if (prevQty.current !== null && prevQty.current !== qtyKey) {
      setFlash(true)
      setFading(false)
      const t1 = setTimeout(() => setFading(true), 100)
      const t2 = setTimeout(() => { setFlash(false); setFading(false) }, 2500)
      prevQty.current = qtyKey
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    prevQty.current = qtyKey
  }, [qtyKey])

  const isKg = typeof qty === 'object' && qty?.unit === 'kg'
  const isBox = typeof qty === 'object' && qty?.total != null && qty?.filled != null
  const isOQ = typeof qty === 'object' && qty?.completed != null
  const isOQSimple = typeof qty === 'object' && qty?.oqPending != null
  const isEmpty = isKg ? qty?.weight === 0
    : isBox ? qty?.filled === 0
    : isOQ ? qty?.total === 0
    : isOQSimple ? (qty?.oqPending === 0 && (qty?.probe || 0) === 0)
    : qty === 0
  const isLoading = qty === null
  const defaultColor = isEmpty ? '#c0c8d8' : '#1a2540'
  const unit = PROCESS_INPUT[processKey]?.unit || '개'

  const flashColor = flash ? '#F99535' : defaultColor
  const transition = fading ? 'color 2.4s ease' : 'none'

  // ── 파이 분포: PHI_SPECS 순서대로 정렬, 0이 아닌 것만 ──
  const phiEntries = phiDist
    ? Object.keys(PHI_SPECS)
        .filter((p) => (phiDist[p] || 0) > 0)
        .map((p) => [p, phiDist[p]])
    : []
  const hasPhiDist = phiEntries.length > 0
  const hasToday = today != null && today > 0

  // ────────────────────────────────────────────
  // 렌더링 — kg / 박스 / 일반 분기
  // ────────────────────────────────────────────

  return (
    <div
      className={s.cell}
      onClick={onClick}
      style={{
        borderColor: selected ? '#F99535' : isEmpty ? '#e0e4ef' : '#1a2f6e',
        background: flash ? '#e8eeff' : selected ? '#fffaf5' : '#fff',
      }}
    >
      {/* ── 상단: 공정명 ── */}
      <div className={s.cellHeader}>
        <span className={s.processKey}>{processKey}</span>
        <span className={s.processLabel}>{label}</span>
      </div>

      {/* ── 중단: 메인 수량 ── */}
      <div className={s.cellMain}>
        {isLoading ? (
          <span className={s.qty} style={{ color: defaultColor }}>...</span>
        ) : isKg ? (
          <>
            <span className={s.qty} style={{ color: flashColor, transition }}>
              {qty.weight.toLocaleString()}
            </span>
            <span className={s.unit}>kg</span>
            {processKey !== 'RM' && <span className={s.subQty}>{qty.qty}개</span>}
          </>
        ) : isOQ ? (
          <>
            <span className={s.qty} style={{ color: flashColor, transition }}>
              {qty.total}
            </span>
            <span className={s.unit}>개</span>
            <div className={s.oqDetail}>
              {qty.completed > 0 && <span style={{ color: '#1a9e75' }}>완료 {qty.completed}</span>}
              {qty.test1_only > 0 && <span style={{ color: '#e67e22' }}>T1만 {qty.test1_only}</span>}
              {qty.test2_only > 0 && <span style={{ color: '#e67e22' }}>T2만 {qty.test2_only}</span>}
              {qty.recheck > 0 && <span style={{ color: '#2e86c1' }}>재검사 {qty.recheck}</span>}
              {qty.probe > 0 && <span style={{ color: '#8e44ad' }}>조사 {qty.probe}</span>}
              {qty.fail > 0 && <span style={{ color: '#c0392b' }}>불합격 {qty.fail}</span>}
            </div>
          </>
        ) : isOQSimple ? (
          <>
            <span className={s.qty} style={{ color: flashColor, transition }}>
              {qty.oqPending}
            </span>
            <span className={s.unit}>개</span>
            {qty.probe > 0 && (
              <div className={s.oqDetail}>
                <span style={{ color: '#8e44ad' }}>🔍 조사 {qty.probe}</span>
              </div>
            )}
          </>
        ) : isBox ? (
          <>
            <span className={s.qty} style={{ color: flash ? '#F99535' : qty.filled > 0 ? '#1a2540' : '#c0c8d8', transition }}>
              {qty.filled}
            </span>
            <span className={s.unit}>박스</span>
            {qty.empty > 0 && <span className={s.subQty}>빈 {qty.empty}</span>}
          </>
        ) : (
          <>
            <span className={s.qty} style={{ color: flashColor, transition }}>
              {qty.toLocaleString()}
            </span>
            <span className={s.unit}>{unit}</span>
          </>
        )}
      </div>

      {/* ── 하단: 파이 분포 + 오늘 생산량 ── */}
      {(hasPhiDist || hasToday) && (
        <div className={s.cellFooter}>
          {hasPhiDist && (
            <div className={s.phiList}>
              {phiEntries.map(([phi, count]) => (
                <span key={phi} className={s.phiItem}>
                  <span
                    className={s.phiDot}
                    style={{ background: PHI_SPECS[phi]?.color || '#ccc' }}
                  />
                  <span className={s.phiLabel}>Φ{phi}</span>
                  <span className={s.phiCount}>{count}</span>
                </span>
              ))}
            </div>
          )}
          {hasToday && (
            <div className={s.todayLine}>
              <span className={s.todayDot}>●</span>
              <span className={s.todayText}>오늘</span>
              <span className={s.todayNum}>+{today}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
