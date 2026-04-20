// src/components/Inventory/InventoryRow.jsx
// 리스트 뷰 한 행 — 공정명/수량/파이분포/오늘 + 클릭 시 인라인 상세
// DetailPanel을 inline 모드로 재사용

import { PROCESS_INPUT, PHI_SPECS } from '@/constants/processConst'
import { JUDGMENT, JUDGMENT_LABELS, JUDGMENT_COLORS } from '@/constants/etcConst'
import { Skeleton } from '@/components/Skeleton'

import DetailPanel from './DetailPanel'
import { expandByMotorType, motorBadge } from './inventoryHelpers'
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
  // OQ 객체 — probe는 메타 영역에서 별도 chip으로 표시 (sub 금지)
  if (typeof qty === 'object' && qty?.oqPending != null) {
    return {
      main: `${qty.oqPending} 개`,
      sub: null,
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
// motorDist — Phase B 신규 (phi×motor 분리 집계)
// isOpen, onToggle — 확장 제어
// isMobile — DetailPanel 폰트 크기 분기
// loading — true면 실제 DOM 구조 유지하면서 값 자리에 스켈레톤 박스 렌더 (레이아웃 점프 방지)
export default function InventoryRow({
  process,
  label,
  qty,
  today,
  phiDist,
  motorDist,
  isOpen,
  onToggle,
  isMobile,
  loading = false,
}) {
  // ── 스켈레톤 모드: 실제 .row/.rowHeader 구조 그대로 — 로딩→실제 데이터 전환 시 점프 없음 ──
  if (loading) {
    return (
      <div className={s.row}>
        <div className={s.rowHeader} style={{ cursor: 'default' }}>
          <div className={s.rowLeft}>
            <Skeleton w={28} h={14} r={4} />
            <Skeleton w={72} h={12} r={4} />
          </div>
          <div className={s.rowCenter}>
            <Skeleton w={80} h={16} r={4} />
          </div>
          <div className={s.rowMeta}>
            <Skeleton w={100} h={14} r={4} />
          </div>
          <span className={s.rowArrow} style={{ opacity: 0.3 }}>▾</span>
        </div>
      </div>
    )
  }

  const { main, sub } = formatQtyDisplay(qty, process)
  const empty = isEmptyQty(qty)

  // Phase B: motorDist 우선 (phi×motor 분리), 없으면 phiDist fallback
  const motorRows = motorDist ? expandByMotorType(motorDist) : []
  const hasMotorDist = motorRows.length > 0

  const phiEntries = (!hasMotorDist && phiDist)
    ? Object.keys(PHI_SPECS)
        .filter((p) => (phiDist[p] || 0) > 0)
        .map((p) => [p, phiDist[p]])
    : []

  // OQ 조사(PROBE) 카운트 — rowMeta의 rowPhis에 chip으로 표시
  const probeCount =
    typeof qty === 'object' && qty?.oqPending != null && (qty?.probe || 0) > 0
      ? qty.probe
      : 0

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
          {(hasMotorDist || phiEntries.length > 0 || probeCount > 0) && (
            <div className={s.rowPhis}>
              {/* Phase B: motorDist 있으면 phi×motor 분리 */}
              {hasMotorDist && motorRows.map(({ phi, motor, count }) => (
                <span key={`${phi}-${motor}`} className={s.rowPhi}>
                  <span
                    className={s.rowPhiDot}
                    style={{ background: PHI_SPECS[phi]?.color || '#ccc' }}
                  />
                  <span className={s.rowPhiLabel}>Φ{phi}-{motorBadge(motor)}</span>
                  <span className={s.rowPhiCount}>{count}</span>
                </span>
              ))}
              {/* Fallback: 레거시 phiDist */}
              {!hasMotorDist && phiEntries.map(([phi, count]) => (
                <span key={phi} className={s.rowPhi}>
                  <span
                    className={s.rowPhiDot}
                    style={{ background: PHI_SPECS[phi]?.color || '#ccc' }}
                  />
                  <span className={s.rowPhiLabel}>Φ{phi}</span>
                  <span className={s.rowPhiCount}>{count}</span>
                </span>
              ))}
              {probeCount > 0 && (
                <span className={s.rowPhi}>
                  <span className={s.rowPhiDot} style={{ background: JUDGMENT_COLORS[JUDGMENT.PROBE] }} />
                  <span className={s.rowPhiLabel} style={{ color: JUDGMENT_COLORS[JUDGMENT.PROBE] }}>{JUDGMENT_LABELS[JUDGMENT.PROBE]}</span>
                  <span className={s.rowPhiCount} style={{ color: JUDGMENT_COLORS[JUDGMENT.PROBE] }}>{probeCount}</span>
                </span>
              )}
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
