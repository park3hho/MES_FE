// src/components/Inventory/InventoryRow.jsx
// 리스트 뷰 한 행 — 공정명/수량/파이분포/오늘 + 클릭 시 인라인 상세
// DetailPanel을 inline 모드로 재사용

import { PROCESS_INPUT, PHI_SPECS } from '@/constants/processConst'

import DetailPanel from './DetailPanel'
import s from './Inventory.module.css'

// 수량 표시 문자열화 — kg / box / OQ / 평면 분기
function formatQtyDisplay(qty, processKey) {
  if (qty == null) return { main: '…', sub: null }
  const unit = PROCESS_INPUT[processKey]?.unit || '개'

  // kg 객체 (RM, MP)
  if (typeof qty === 'object' && qty?.unit === 'kg') {
    return {
      main: `${qty.weight.toLocaleString()} kg`,
      sub: processKey !== 'RM' ? `${qty.qty}개` : null,
    }
  }
  // 박스 객체 (UB, MB)
  if (typeof qty === 'object' && qty?.filled != null) {
    return {
      main: `${qty.filled} 박스`,
      sub: qty.empty > 0 ? `빈 ${qty.empty}` : null,
    }
  }
  // OQ 객체
  if (typeof qty === 'object' && qty?.oqPending != null) {
    return {
      main: `${qty.oqPending} 개`,
      sub: qty.probe > 0 ? `조사 ${qty.probe}` : null,
    }
  }
  // 평면 숫자
  return {
    main: `${Number(qty).toLocaleString()} ${unit}`,
    sub: null,
  }
}

// 빈 상태 판정
function isEmptyQty(qty) {
  if (qty == null) return false
  if (typeof qty === 'object') {
    if (qty.weight === 0) return true
    if (qty.filled === 0) return true
    if (qty.oqPending === 0 && (qty.probe || 0) === 0) return true
    return false
  }
  return qty === 0
}

// process, label, qty, today, phiDist — 표시 데이터
// isOpen, onToggle — 확장 제어
// isMobile — DetailPanel 폰트 크기 분기
export default function InventoryRow({
  process,
  label,
  qty,
  today,
  phiDist,
  isOpen,
  onToggle,
  isMobile,
}) {
  const { main, sub } = formatQtyDisplay(qty, process)
  const empty = isEmptyQty(qty)

  // 파이 분포 리스트화 (PHI_SPECS 순서)
  const phiEntries = phiDist
    ? Object.keys(PHI_SPECS)
        .filter((p) => (phiDist[p] || 0) > 0)
        .map((p) => [p, phiDist[p]])
    : []

  return (
    <div className={`${s.row} ${isOpen ? s.rowOpen : ''} ${empty ? s.rowEmpty : ''}`}>
      <button type="button" className={s.rowHeader} onClick={onToggle}>
        <div className={s.rowLeft}>
          <span className={s.rowKey}>{process}</span>
          <span className={s.rowLabel}>{label}</span>
        </div>

        <div className={s.rowCenter}>
          <span className={`${s.rowQty} ${empty ? s.rowQtyEmpty : ''}`}>{main}</span>
          {sub && <span className={s.rowSub}>{sub}</span>}
        </div>

        <div className={s.rowMeta}>
          {phiEntries.length > 0 && (
            <div className={s.rowPhis}>
              {phiEntries.map(([phi, count]) => (
                <span key={phi} className={s.rowPhi}>
                  <span
                    className={s.rowPhiDot}
                    style={{ background: PHI_SPECS[phi]?.color || '#ccc' }}
                  />
                  <span className={s.rowPhiLabel}>Φ{phi}</span>
                  <span className={s.rowPhiCount}>{count}</span>
                </span>
              ))}
            </div>
          )}
          {today != null && today > 0 && (
            <span className={s.rowToday}>
              <span className={s.rowTodayDot}>●</span>
              오늘 +{today}
            </span>
          )}
        </div>

        <span className={`${s.rowArrow} ${isOpen ? s.rowArrowOpen : ''}`}>▾</span>
      </button>

      {/* 인라인 상세 — isOpen일 때만 process 전달 (lazy fetch) */}
      <DetailPanel
        process={isOpen ? process : null}
        visible={isOpen}
        onClose={onToggle}
        isMobile={isMobile}
        inline
      />
    </div>
  )
}
