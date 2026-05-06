import { useState, useEffect, useRef } from 'react'

import { PROCESS_INPUT, PHI_SPECS } from '@/constants/processConst'
import { JUDGMENT, JUDGMENT_LABELS, JUDGMENT_COLORS } from '@/constants/etcConst'
import { Skeleton } from '@/components/Skeleton'
import { useModels } from '@/hooks/useModels'

import s from './Inventory.module.css'

// ════════════════════════════════════════════
// 재고 셀 — 공정 하나의 재고량 표시
// ════════════════════════════════════════════

// processKey — 'RM', 'EA' 등, qty — 숫자 또는 { weight, qty, unit } 또는 { filled, empty, total }
// today — 오늘 생산량 (숫자 또는 null)
// phiDist — 파이 분포 { "87": 3, "70": 1, ... } (파이 공정만) — 레거시, motorDist로 점진 마이그레이션
// motorDist — 파이×모터 분포 { "87": {"outer":3,"inner":2}, ... } (BE Phase B 신규)
// selected — 현재 선택 여부, onClick — 셀 클릭 콜백
// loading — true면 실제 DOM 구조 그대로 유지하면서 값 자리에 스켈레톤 박스 렌더 (레이아웃 점프 방지)
export default function InventoryCell({ processKey, label, qty, today, todayRepair, phiDist, motorDist, selected, onClick, loading = false }) {
  // color: DB ModelRegistry 로 이관 (2026-04-24 PR-6) — motor_type 미상이라 3단 fallback
  const { models, findModel } = useModels()
  const resolveColor = (phi) =>
    findModel(phi, 'inner')?.color_hex ??
    findModel(phi, 'outer')?.color_hex ??
    PHI_SPECS[phi]?.color ??
    '#ccc'

  // 동적 phi 순서 — DB ModelRegistry 의 is_active 모델에서 phi 모음 (display_order 정렬, 2026-05-06)
  // motorDist / phiDist 에 있는데 DB 등록 안 된 phi 도 있을 수 있어 union 으로 보강.
  // fallback: PHI_SPECS 키 (DB 비어있을 때 안전망).
  const phiOrderFromDb = (() => {
    const seen = new Map()
    for (const m of (models || [])) {
      if (!m.is_active) continue
      if (!seen.has(m.phi)) seen.set(m.phi, m.display_order ?? 999)
    }
    if (seen.size === 0) {
      return Object.keys(PHI_SPECS).sort((a, b) => Number(b) - Number(a))
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([phi]) => phi)
  })()
  // 데이터에 있는데 모델 등록 안 된 phi 도 chip 으로 노출 (운영 중 신규 phi 데이터가 먼저 들어온 경우)
  const phiOrder = (() => {
    const set = new Set(phiOrderFromDb)
    if (motorDist) for (const k of Object.keys(motorDist)) set.add(k)
    if (phiDist) for (const k of Object.keys(phiDist)) set.add(k)
    return Array.from(set)
  })()

  // 어느 phi 에 motor 옵션이 2개 이상인지 (DB 기준) — 분리 표시 결정용 (Φ20 만 분리하던 하드코딩 제거)
  const phiHasMultiMotor = (() => {
    const m = {}
    for (const mod of (models || [])) {
      if (!mod.is_active) continue
      if (!m[mod.phi]) m[mod.phi] = new Set()
      m[mod.phi].add(mod.motor_type)
    }
    const out = {}
    for (const k of Object.keys(m)) out[k] = m[k].size >= 2
    return out
  })()

  // ── 스켈레톤 모드: 실제 .cell 구조 유지하면서 콘텐츠만 bone으로 치환 ──
  if (loading) {
    return (
      <div className={s.cell} style={{ borderColor: '#e0e4ef', cursor: 'default' }}>
        <div className={s.cellHeader}>
          <Skeleton w={28} h={12} r={4} />
          <Skeleton w={60} h={11} r={4} />
        </div>
        <div className={s.cellMain}>
          <Skeleton w={60} h={32} r={6} />
          <Skeleton w={24} h={11} r={4} style={{ marginTop: 4 }} />
        </div>
        <div className={s.cellFooter}>
          <Skeleton w="90%" h={14} r={4} />
        </div>
      </div>
    )
  }

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

  // ── phi chip — DB ModelRegistry 기준 동적 (2026-05-06) ──
  // 새 phi (예: Φ100, Φ30) 등록 시 자동으로 chip 추가됨. 0이면 dim 처리.
  // total은 phi_dist(총합) 기준 — motor_type 미기재(unknown) 행까지 포함.
  // motor 분리 표시는 DB 에 motor 옵션 ≥ 2 인 phi 만 (이전 Φ20 하드코딩 제거).
  const hasAnyPhiData = Boolean(motorDist || phiDist)
  const phiChips = phiOrder.map((phi) => {
    let total = 0
    if (phiDist && phi in phiDist) {
      total = phiDist[phi] || 0
    } else if (motorDist && motorDist[phi]) {
      total = Object.values(motorDist[phi]).reduce((a, b) => a + (b || 0), 0)
    }
    const outer = motorDist && motorDist[phi] ? (motorDist[phi].outer || 0) : 0
    const inner = motorDist && motorDist[phi] ? (motorDist[phi].inner || 0) : 0
    // O/I 합이 total과 일치해야 motor 분기 신뢰 가능 (unknown 있으면 그냥 총합만 표시)
    const motorCovered = (outer + inner) === total && total > 0
    // DB 기준 multi-motor phi 만 분리 표시 — Φ20 외에도 추후 axial 등 추가되면 자동 적용
    const splitMotor = motorCovered && !!phiHasMultiMotor[phi]
    return { phi, outer, inner, total, hasMotor: motorCovered, splitMotor }
  })
  const hasToday = today != null && today > 0
  // OQ 조사(PROBE) 카운트 — cellFooter의 chip으로 표시
  const probeCount = isOQSimple && (qty?.probe || 0) > 0 ? qty.probe : 0

  // ────────────────────────────────────────────
  // 렌더링 — kg / 박스 / 일반 분기
  // ────────────────────────────────────────────

  return (
    <div
      className={s.cell}
      onClick={onClick}
      style={{
        borderColor: selected ? '#F99535' : flash ? '#F99535' : undefined,
        background: flash ? '#fff7ec' : selected ? '#fffaf5' : '#fff',
        opacity: isEmpty ? 0.7 : 1,
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
            {/* probe 는 cellFooter phiList 내부에 chip으로 표시 (정렬 통일) */}
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

      {/* ── 하단: 4개 phi chip 고정 + probe + 오늘 생산량 ── */}
      {(hasAnyPhiData || hasToday || probeCount > 0) && (
        <div className={s.cellFooter}>
          {hasAnyPhiData && (
            <div className={s.phiList}>
              {phiChips.map(({ phi, outer, inner, total, splitMotor }) => {
                // 표시 규칙 (2026-05-06 — DB 기준 동적):
                //   DB 에 motor 옵션 ≥ 2 인 phi (현재 Φ20, 추후 추가) + total>0 : "Φ20 12·5" (외전·내전)
                //   그 외 (Φ87/70/45 = motor 고정) : 총합만 "Φ87 6"
                const label = `Φ${phi}`
                const countNode = (splitMotor && total > 0) ? (
                  <span className={s.phiCount} title={`외전 ${outer} · 내전 ${inner}`}>
                    {outer}<span className={s.phiMotorSep}>·</span>{inner}
                  </span>
                ) : (
                  <span className={s.phiCount}>{total}</span>
                )
                return (
                  <span
                    key={phi}
                    className={`${s.phiItem} ${total === 0 ? s.phiItemEmpty : ''}`}
                  >
                    <span
                      className={s.phiDot}
                      style={{ background: resolveColor(phi) }}
                    />
                    <span className={s.phiLabel}>{label}</span>
                    {countNode}
                  </span>
                )
              })}
              {probeCount > 0 && (
                <span className={s.phiItem} style={{ color: JUDGMENT_COLORS[JUDGMENT.PROBE] }}>
                  <span className={s.phiDot} style={{ background: JUDGMENT_COLORS[JUDGMENT.PROBE] }} />
                  <span className={s.phiLabel} style={{ color: JUDGMENT_COLORS[JUDGMENT.PROBE] }}>{JUDGMENT_LABELS[JUDGMENT.PROBE]}</span>
                  <span className={s.phiCount} style={{ color: JUDGMENT_COLORS[JUDGMENT.PROBE] }}>{probeCount}</span>
                </span>
              )}
            </div>
          )}
          {hasToday && (
            <div className={s.todayLine}>
              <span className={s.todayDot}>●</span>
              <span className={s.todayText}>오늘</span>
              <span className={s.todayNum}>+{today}</span>
              {/* 되돌리기 분리 표시 (2026-04-27) — 0 이면 숨김 */}
              {todayRepair > 0 && (
                <span className={s.todayRepair} title={`되돌리기로 들어온 ${todayRepair}건`}>
                  🔧 {todayRepair}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
