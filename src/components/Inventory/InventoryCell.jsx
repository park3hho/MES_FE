import { useState, useEffect, useRef } from 'react'

import { PROCESS_INPUT, PHI_SPECS, MOTOR_LABEL } from '@/constants/processConst'
import { JUDGMENT, JUDGMENT_LABELS, JUDGMENT_COLORS } from '@/constants/etcConst'
import { Skeleton } from '@/components/Skeleton'
import { useModels } from '@/hooks/useModels'

import { qtySizeStep } from './inventoryHelpers'
import s from './Inventory.module.css'

// ════════════════════════════════════════════
// 재고 셀 — 공정 하나의 재고량 표시
//   ★ 큰 글씨 카드 (2026-09-21, 목업 M2 — 사용자 선택). "카드 안 숫자가 작아서 안 보인다" 가 출발점:
//     머리줄 = [공정키] [공정명] ..... [+오늘] / 그 아래 수량 / 그 아래 Φ 분포를 **세로 한 줄씩**(숫자 오른쪽 정렬).
//     글자 크기는 CSS 변수(--inv-*)로 두고 상자 폭(@container)에 따라 키운다 — Inventory.module.css '카드 크기 단계'.
//   ★ 0 인 Φ 는 줄을 만들지 않는다. 예전엔 등록된 Φ 를 전부 흐리게 깔아 칩 위치를 고정했지만(가로 칩 시절),
//     세로 목록에서는 0 줄이 카드 높이만 늘린다 — 폰에서 스크롤이 길어지는 쪽이 더 손해다.
// ════════════════════════════════════════════

const QTY_STEP_CLASS = { long: s.qtyLong, xlong: s.qtyXLong }

// processKey — 'RM', 'EA' 등, qty — 숫자 또는 { weight, qty, unit } 또는 { filled, empty, total } 또는 { oqPending, probe }
// today — 오늘 생산량 (숫자 또는 null), todayRepair — 그 중 되돌리기로 들어온 수
// phiDist — 파이 분포 { "87": 3, "70": 1, ... } (파이 공정만) — 레거시, motorDist로 점진 마이그레이션
// motorDist — 파이×모터 분포 { "87": {"outer":3,"inner":2}, ... } (BE Phase B 신규)
// selected — 현재 선택 여부, onClick — 셀 클릭 콜백(하단 상세 패널)
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
  // 데이터에 있는데 모델 등록 안 된 phi 도 줄로 노출 (운영 중 신규 phi 데이터가 먼저 들어온 경우)
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

  // ★ 상태 훅은 스켈레톤 early return **위에** 둔다 (2026-09-21 리뷰 fix).
  //   예전엔 return 아래에 있었다 — useModels 가 useContext 하나뿐이라 우연히 안 죽었을 뿐,
  //   거기에 useState/useMemo 가 하나라도 생기면 loading→loaded 렌더에서 'Rendered more hooks' 로 화면 전체가 죽는다.
  const [flash, setFlash] = useState(false)
  const [fading, setFading] = useState(false)
  // 초기 마운트 시 flash 방지 — 항상 null로 시작해서 null 가드가 걸리게 함
  // (qty 원본으로 초기화하면 객체 qty(RM/MP/OQ 등) 셀에서 첫 렌더에 flash 오발동)
  const prevQty = useRef(null)

  const qtyKey = typeof qty === 'object' ? (qty?.weight ?? qty?.total ?? qty?.oqPending) : qty

  // 수량 변경 시 flash 효과 — 2.5초 후 자동 해제
  // 첫 렌더 or qty가 null → 숫자 로 바뀌는 최초 데이터 도착에는 flash 안 뜸 (스켈레톤 동안은 아예 건너뛴다)
  useEffect(() => {
    if (loading) return undefined
    if (prevQty.current !== null && prevQty.current !== qtyKey) {
      setFlash(true)
      setFading(false)
      const t1 = setTimeout(() => setFading(true), 100)
      const t2 = setTimeout(() => { setFlash(false); setFading(false) }, 2500)
      prevQty.current = qtyKey
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    prevQty.current = qtyKey
    return undefined
  }, [qtyKey, loading])

  // ── 스켈레톤 모드: 실제 .cell 구조 유지하면서 콘텐츠만 bone으로 치환 ──
  //   치수는 CSS(.sk*)가 --inv-* 변수로 잡는다 — 큰 화면 단계에서도 실제 카드와 높이가 맞아 데이터 도착 때 덜 튄다.
  if (loading) {
    return (
      <div className={`${s.cell} ${s.cellSkeleton}`}>
        <div className={s.cellHeader}>
          <span className={s.skKey}><Skeleton w="100%" h="100%" r={4} /></span>
          <span className={s.skLabel}><Skeleton w="100%" h="100%" r={4} /></span>
        </div>
        <div className={s.cellMain}>
          <span className={s.skQty}><Skeleton w="100%" h="100%" r={6} /></span>
        </div>
        <div className={s.cellFooter}>
          <span className={s.skRow}><Skeleton w="100%" h="100%" r={4} /></span>
          <span className={s.skRow}><Skeleton w="100%" h="100%" r={4} /></span>
          <span className={s.skRow}><Skeleton w="100%" h="100%" r={4} /></span>
        </div>
      </div>
    )
  }

  const isKg = typeof qty === 'object' && qty?.unit === 'kg'
  const isBox = typeof qty === 'object' && qty?.total != null && qty?.filled != null
  // OQ 는 inventoryHelpers.processCellData 가 항상 { oqPending, probe } 로 바꿔 준다.
  //   (옛 '완료/T1만/T2만/재검사/불합격' 상세 분기는 도달 불가능한 죽은 코드라 2026-09-21 에 걷어냈다.)
  const isOQSimple = typeof qty === 'object' && qty?.oqPending != null
  const isEmpty = isKg ? qty?.weight === 0
    : isBox ? qty?.filled === 0
    : isOQSimple ? (qty?.oqPending === 0 && (qty?.probe || 0) === 0)
    : qty === 0
  const isLoading = qty === null
  const defaultColor = isEmpty ? '#c0c8d8' : '#1a2540'
  const unit = PROCESS_INPUT[processKey]?.unit || '개'

  const flashColor = flash ? '#F99535' : defaultColor
  const transition = fading ? 'color 2.4s ease' : 'none'

  // 수량 표시 문자열 — 자리수가 많으면 글씨를 한 단계 줄인다(카드 폭 넘침 방지, inventoryHelpers.qtySizeStep)
  const qtyText = isLoading ? '...'
    : isKg ? qty.weight.toLocaleString()
    : isOQSimple ? String(qty.oqPending)
    : isBox ? String(qty.filled)
    : qty.toLocaleString()
  const qtyCls = `${s.qty} ${QTY_STEP_CLASS[qtySizeStep(qtyText)] || ''}`

  // ── Φ 분포 줄 — DB ModelRegistry 기준 동적 (2026-05-06) ──
  // total은 phi_dist(총합) 기준 — motor_type 미기재(unknown) 행까지 포함.
  // 모터 분리는 DB 에 motor 옵션 ≥ 2 인 phi 만, 그리고 외전+내전 합이 total 과 맞을 때만(미기재가 섞이면 총합 한 줄).
  const phiRows = []
  for (const phi of phiOrder) {
    let total = 0
    if (phiDist && phi in phiDist) {
      total = phiDist[phi] || 0
    } else if (motorDist && motorDist[phi]) {
      total = Object.values(motorDist[phi]).reduce((a, b) => a + (b || 0), 0)
    }
    if (total <= 0) continue
    const outer = motorDist && motorDist[phi] ? (motorDist[phi].outer || 0) : 0
    const inner = motorDist && motorDist[phi] ? (motorDist[phi].inner || 0) : 0
    const splitMotor = (outer + inner) === total && !!phiHasMultiMotor[phi]
    if (splitMotor) {
      if (outer > 0) phiRows.push({ id: `${phi}-outer`, phi, sub: MOTOR_LABEL.outer, count: outer })
      if (inner > 0) phiRows.push({ id: `${phi}-inner`, phi, sub: MOTOR_LABEL.inner, count: inner })
    } else {
      phiRows.push({ id: phi, phi, sub: '', count: total })
    }
  }
  const hasToday = today != null && today > 0
  // OQ 조사(PROBE) 카운트 — 분포 줄 끝에 한 줄로 표시
  const probeCount = isOQSimple && (qty?.probe || 0) > 0 ? qty.probe : 0

  // ────────────────────────────────────────────
  // 렌더링 — kg / 박스 / OQ / 일반 분기
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
      {/* ── 머리줄: 공정키 · 공정명 · 오늘 +N (되돌리기 분리 표시) ── */}
      <div className={s.cellHeader}>
        <span className={s.processKey}>{processKey}</span>
        <span className={s.processLabel}>{label}</span>
        {hasToday && (
          <span className={s.cellToday}>
            <span className={s.todayNum} title="오늘 들어온 수량">+{today}</span>
            {/* 되돌리기 분리 표시 (2026-04-27) — 0 이면 숨김 */}
            {todayRepair > 0 && (
              <span className={s.todayRepair} title={`되돌리기로 들어온 ${todayRepair}건`}>
                🔧 {todayRepair}
              </span>
            )}
          </span>
        )}
      </div>

      {/* ── 수량 ── */}
      <div className={s.cellMain}>
        {isLoading ? (
          <span className={qtyCls} style={{ color: defaultColor }}>{qtyText}</span>
        ) : isKg ? (
          <>
            <span className={qtyCls} style={{ color: flashColor, transition }}>{qtyText}</span>
            <span className={s.unit}>kg</span>
            {processKey !== 'RM' && <span className={s.subQty}>{qty.qty}개</span>}
          </>
        ) : isOQSimple ? (
          <>
            <span className={qtyCls} style={{ color: flashColor, transition }}>{qtyText}</span>
            <span className={s.unit}>개</span>
          </>
        ) : isBox ? (
          <>
            <span className={qtyCls} style={{ color: flash ? '#F99535' : qty.filled > 0 ? '#1a2540' : '#c0c8d8', transition }}>{qtyText}</span>
            <span className={s.unit}>박스</span>
            {qty.empty > 0 && <span className={s.subQty}>빈 {qty.empty}</span>}
          </>
        ) : (
          <>
            <span className={qtyCls} style={{ color: flashColor, transition }}>{qtyText}</span>
            <span className={s.unit}>{unit}</span>
          </>
        )}
      </div>

      {/* ── Φ 분포 (세로 한 줄씩 · 숫자 오른쪽 정렬) + 조사 ── */}
      {(phiRows.length > 0 || probeCount > 0) && (
        <div className={s.cellFooter}>
          <div className={s.phiList}>
            {phiRows.map((r) => (
              <span key={r.id} className={s.phiItem}>
                <span className={s.phiDot} style={{ background: resolveColor(r.phi) }} />
                <span className={s.phiLabel}>Φ{r.phi}{r.sub ? ` ${r.sub}` : ''}</span>
                <span className={s.phiCount}>{r.count.toLocaleString()}</span>
              </span>
            ))}
            {probeCount > 0 && (
              <span className={s.phiItem}>
                <span className={s.phiDot} style={{ background: JUDGMENT_COLORS[JUDGMENT.PROBE] }} />
                <span className={s.phiLabel} style={{ color: JUDGMENT_COLORS[JUDGMENT.PROBE] }}>{JUDGMENT_LABELS[JUDGMENT.PROBE]}</span>
                <span className={s.phiCount} style={{ color: JUDGMENT_COLORS[JUDGMENT.PROBE] }}>{probeCount}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
