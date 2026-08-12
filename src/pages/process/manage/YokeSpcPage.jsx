// pages/process/manage/YokeSpcPage.jsx
// 요크 X̄-R 관리도 (SPC) — 2026-08-06 · UI 전면 재설계 2026-08-07
//   IPQ 검사 이력(yoke_ipq_inspection)의 실측값으로 공정 산포를 본다.
//   계산은 utils/spc.js (순수 함수), 이 파일은 필터 + SVG 렌더만.
//
// ⚠️ 파이는 반드시 하나만 — 20파이 외경과 70파이 외경을 같은 관리도에 섞으면 산포가 아니라
//    치수 차이를 보게 된다. 측정 항목도 마찬가지로 단일 선택.
// ⚠️ 규격선(공차)은 일부러 안 그린다 — 규격은 '개별 제품'에 적용되는 값이고,
//    X̄ 차트의 점은 부분군 평균이라 둘을 겹치면 공정능력을 과대평가하게 된다(SPC 기본 원칙).
// ⚠️ 차트는 CDN·외부 라이브러리 없이 인라인 SVG — 공장 내부망에서도 뜨게.
// ★ UI (2026-08-07): 설명 배너 전부 제거 → 각 요소 옆 (i) 툴팁으로. 화면엔 숫자·차트만.
//   데이터 품질 경고(부분군 부족·나머지 제외 등 actionable)만 상시 노출.
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, useId } from 'react'

import { listYokeIpq } from '@/api'
import { TableSkeleton } from '@/components/Skeleton'
import { PHI_SPECS } from '@/constants/processConst'
import { todayKst, kstDaysAgo } from '@/utils/dateConvert'
import {
  SPC_METRICS, SPC_N_MAX, SPC_PURGE_MIN_KEEP, SPC_SIGMA_INFLATION_WARN, rowDate,
  buildFixedSubgroups, buildDailySubgroups, computeXbarR,
} from '@/utils/spc'
import c from './YokeSpcPage.module.css'

const FILTER_KEY = 'yokeSpcFilters_v1'
const FIXED_SIZES = [2, 3, 4, 5, 6, 8, 10]
// 관리도는 긴 구간을 봐야 의미가 있다 — 목록 화면보다 넉넉히 (BE 상한 20000)
const FETCH_LIMIT = 20000

const getDefaultFilters = () => ({
  date_from: kstDaysAgo(89),   // 기본 90일 — 부분군이 최소 20~25개는 나와야 관리한계가 안정적
  date_to: todayKst(),
  metric: 'outer_dia',
  mode: 'fixed',               // 'fixed' | 'daily'
  size: 5,
  phi: '',                     // '' = 데이터 최다 파이 자동 선택
  vendor: '',                  // '' = 전체 호기
  purge: false,                // 해석용 정제 — 이탈군을 한계 계산에서 제외 (Phase I 개정한계)
  useBaseline: true,           // 고정 기준이 있으면 그걸로 판정 (Phase II 관리용)
})

// ── 고정 기준(baseline) 저장 — 관리도 정석의 '동결' ────────────────
// 저장하는 건 한계선이 아니라 **공정 모수(X̄̄, σ̂)** 다. 한계는 부분군 n 으로 그때그때 산출하므로,
// 모수를 고정해두면 n 이 달라져도(일자별 모드) 같은 기준으로 판정된다 — ISO 7870 'standards given'.
// ⚠️ localStorage = 브라우저별 저장이라 사람마다 다를 수 있다. 공장 공용 기준으로 쓰려면 DB 이관 필요.
const BASELINE_KEY = 'yokeSpcBaselines_v1'
const baselineKeyOf = (phi, metric, vendor) => `${phi}|${metric}|${vendor || 'ALL'}`
const loadBaselines = () => {
  try { return JSON.parse(localStorage.getItem(BASELINE_KEY) || '{}') || {} } catch { return {} }
}
const saveBaselines = (obj) => {
  try { localStorage.setItem(BASELINE_KEY, JSON.stringify(obj)) } catch { /* 저장 실패 무시 */ }
}
// 교과서 권장 최소 부분군 수 — 이보다 적은 구간을 기준으로 고정하면 경고
const BASELINE_MIN_GROUPS = 20

const loadFilters = () => {
  const d = getDefaultFilters()
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null')
    if (saved) return { ...d, ...saved }
  } catch { /* 파싱 실패 시 기본값 */ }
  return d
}

const fmt = (v, digits = 3) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '-'

// 부분군이 수천 개까지 갈 수 있어 Math.min(...arr) 스프레드는 쓰지 않는다 (인자 수 한계).
const minOf = (arr) => arr.reduce((m, v) => (v < m ? v : m), Infinity)
const maxOf = (arr) => arr.reduce((m, v) => (v > m ? v : m), -Infinity)

// ── (i) 툴팁 — 탭하면 열리고, 바깥 탭/ESC/포커스 이탈로 닫힌다 ──────
//   설명을 상시 배너로 깔지 않기 위한 장치 (2026-08-07). 아이콘은 인라인 SVG (Tabler 폰트 없음).
//   ★ 위치: 열린 뒤 말풍선 '실제 폭'을 재서 화면 안으로 클램프 — 고정 임계값 방식은
//     좁은 화면에서 반대쪽 여유를 안 보고 정렬해 화면 밖으로 넘쳤다 (리뷰 지적).
//   ★ 접근성: aria-describedby 로 본문 연결(스크린리더 낭독), label 로 버튼마다 이름 구분,
//     Tab 이탈(focusout) 시에도 닫혀 다음 컨트롤을 가리지 않는다.
function InfoTip({ label = '항목', children }) {
  const [open, setOpen] = useState(false)
  const [shift, setShift] = useState(0)   // tipWrap 기준 left(px) — 동적 계산값이라 인라인 허용
  const ref = useRef(null)
  const popRef = useRef(null)
  const tipId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // 페인트 전에 실제 폭으로 위치 확정 — 깜빡임 없이 화면 안에 들어온다
  useLayoutEffect(() => {
    if (!open || !popRef.current || !ref.current) return
    const pw = popRef.current.offsetWidth
    const r = ref.current.getBoundingClientRect()
    let left = r.left + r.width / 2 - pw / 2            // 버튼 중앙 기준
    left = Math.max(12, Math.min(left, window.innerWidth - pw - 12))
    setShift(left - r.left)
  }, [open])

  return (
    <span ref={ref} className={c.tipWrap}
      onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget)) setOpen(false) }}>
      <button type="button" className={c.tipBtn} aria-label={`${label} 설명`}
        aria-expanded={open} aria-describedby={open ? tipId : undefined}
        onClick={() => setOpen((o) => !o)}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="4.8" r="0.95" fill="currentColor" />
          <rect x="7.25" y="6.8" width="1.5" height="4.7" rx="0.75" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <span id={tipId} role="tooltip" ref={popRef} className={c.tipPop}
          style={{ left: shift }}>{children}</span>
      )}
    </span>
  )
}

// 물결(축 단절) 경로 — x0~x1 을 사인 모양으로. 정확히 x1 에서 끝나도록 주기를 나눠 쓴다.
function wavePath(x0, x1, yc, amp = 2.6, period = 13) {
  const n = Math.max(1, Math.round((x1 - x0) / period))
  const p = (x1 - x0) / n
  let d = `M ${x0} ${yc}`
  for (let i = 0; i < n; i += 1) {
    d += ` q ${p / 4} ${-amp * 2} ${p / 2} 0 q ${p / 4} ${amp * 2} ${p / 2} 0`
  }
  return d
}

// ── 관리도 SVG ────────────────────────────────────────────────
// 관리한계가 부분군마다 다를 수 있어(일자별 모드) 한계선도 점열로 그린다.
// 고정 n 이면 값이 전부 같아 결과적으로 직선으로 보인다.
//
// ★ Y축 단절 (2026-08-06): 관리한계에서 크게 벗어난 점 하나가 전체 축을 늘려버려
//   정작 봐야 할 관리한계 구간이 한 줄로 뭉개지는 문제 → 축을 물결(⌇)로 접는다.
//   · 중심 구간(core) = 관리한계 ± 여유 + '많이 안 벗어난' 점들 → 세로 대부분을 차지
//   · 멀리 벗어난 점 = 위/아래 압축 구간에 몰아넣고 경계에 물결 표시
//   압축 구간도 '값 순서'는 보존하므로 어느 쪽으로 얼마나 튀었는지는 그대로 읽힌다.
function ControlChart({ points, valueOf, uclOf, lclOf, clOf, outOf, label, unit, nonNegative }) {
  // 탭한 점의 상세값 — SVG <title> 은 호버 전용이라 터치 기기(현장 태블릿)에선 안 보인다 (2026-08-07).
  //   ⚠️ 훅은 아래 조기 return 보다 먼저 호출돼야 한다.
  const [sel, setSel] = useState(null)
  useEffect(() => { setSel(null) }, [points])

  const PAD = { l: 56, r: 14, t: 12, b: 34 }
  const H = 240
  const STEP = Math.max(14, Math.min(46, Math.round(760 / Math.max(points.length, 1))))
  const W = PAD.l + PAD.r + STEP * Math.max(points.length - 1, 1) + STEP

  const shown = points.filter((p) => valueOf(p) !== null)
  if (!shown.length) return null

  const vals = shown.map(valueOf).filter(Number.isFinite)
  const uclAll = shown.map(uclOf).filter(Number.isFinite)
  const lclAll = shown.map(lclOf).filter(Number.isFinite)
  const clAll = shown.map(clOf).filter(Number.isFinite)
  const ucl = maxOf(uclAll.length ? uclAll : vals)
  const lcl = minOf(lclAll.length ? lclAll : vals)
  const band = ucl - lcl

  // ★ R 관리도는 범위(최대−최소)라 음수가 존재할 수 없다 (2026-08-07).
  //   여백 12% 를 그냥 빼면 축 하한이 0 아래로 내려가 '-0.003' 같은 불가능한 눈금이 찍힌다.
  //   → nonNegative 차트는 축 바닥을 0 에서 자른다.
  const floor0 = !!nonNegative
  const clampLo = (v) => (floor0 ? Math.max(0, v) : v)

  const dataLo = clampLo(Math.min(minOf(vals), lcl, minOf(clAll)))
  const dataHi = Math.max(maxOf(vals), ucl, maxOf(clAll))

  // LCL 이 전 구간 0 = D3(n)=0 (n<7) → '하한 관리한계 없음'. 축 바닥에 붙는 선은 x축과 구분이
  //   안 되고 의미도 없어 그리지 않는다 (상세줄·툴팁에는 LCL 0.000 그대로 표기).
  const lclAllZero = floor0 && lclAll.length > 0 && lclAll.every((v) => v <= 1e-12)

  // 중심 구간 결정 — 관리한계 폭의 2.5배 안쪽 점은 '가까운 점'으로 보고 그대로 담는다.
  //   (조금 벗어난 점까지 압축하면 이탈 정도를 못 읽는다 — 크게 튄 것만 접는 게 목적)
  let coreLo
  let coreHi
  let hasLow = false
  let hasHigh = false
  if (band > 0) {
    const far = band * 2.5
    const near = vals.filter((v) => v >= lcl - far && v <= ucl + far)
    const rawLo = Math.min(lcl, near.length ? minOf(near) : lcl, minOf(clAll))
    const rawHi = Math.max(ucl, near.length ? maxOf(near) : ucl, maxOf(clAll))
    // 여백은 기존과 동일한 12% — 이탈점이 없으면 접기 전 스케일과 완전히 같아진다(무회귀)
    const pad = (rawHi - rawLo) * 0.12 || band * 0.12
    coreLo = clampLo(rawLo - pad)
    coreHi = rawHi + pad
    hasLow = dataLo < coreLo - 1e-9
    hasHigh = dataHi > coreHi + 1e-9
  } else {
    // 관리한계 폭이 0(전부 동일값 등) — 접을 근거가 없으니 기존 선형 스케일
    const span = dataHi - dataLo || Math.abs(dataHi) * 0.02 || 1
    coreLo = clampLo(dataLo - span * 0.12)
    coreHi = dataHi + span * 0.12
  }

  const plotTop = PAD.t
  const plotBot = H - PAD.b
  const totalH = plotBot - plotTop
  const OUT_FRAC = 0.13                       // 압축 구간이 차지하는 세로 비율
  const highH = hasHigh ? totalH * OUT_FRAC : 0
  const lowH = hasLow ? totalH * OUT_FRAC : 0
  const coreH = totalH - highH - lowH
  const breakHiY = plotTop + highH            // 위쪽 단절 경계
  const breakLoY = plotBot - lowH             // 아래쪽 단절 경계

  const x = (i) => PAD.l + STEP / 2 + i * STEP
  const y = (v) => {
    if (hasHigh && v > coreHi) {
      const t = Math.min(1, (v - coreHi) / ((dataHi - coreHi) || 1))
      return plotTop + highH * (1 - t)
    }
    if (hasLow && v < coreLo) {
      const t = Math.min(1, (coreLo - v) / ((coreLo - dataLo) || 1))
      return plotBot - lowH * (1 - t)
    }
    const t = Math.max(0, Math.min(1, (v - coreLo) / ((coreHi - coreLo) || 1)))
    return breakHiY + coreH * (1 - t)
  }

  // y축 눈금 — 중심 구간에만 (압축 구간은 양 끝 실제값만 따로 표기)
  const ticks = Array.from({ length: 5 }, (_, k) => coreLo + ((coreHi - coreLo) * k) / 4)
  // x축 라벨 — 겹치지 않을 만큼만
  const labelEvery = Math.ceil((points.length * 52) / 760) || 1

  const path = (accessor) => points
    .map((p, i) => (Number.isFinite(accessor(p)) ? `${x(i)},${y(accessor(p))}` : null))
    .filter(Boolean).join(' ')

  // 단절 표시 — 데이터 위에 덮어 선을 '끊고' 물결 두 줄을 얹는다.
  //   라벨은 항상 압축 구간(음영) 쪽에 둔다 — 중심 구간의 데이터를 가리지 않게.
  const renderBreak = (yc, note, below) => (
    <g>
      <rect x={PAD.l} y={yc - 5} width={W - PAD.r - PAD.l} height="10"
        fill="var(--color-surface)" />
      <path d={wavePath(PAD.l, W - PAD.r, yc - 3)} fill="none"
        stroke="var(--chart-tick)" strokeWidth="1" opacity="0.75" />
      <path d={wavePath(PAD.l, W - PAD.r, yc + 3)} fill="none"
        stroke="var(--chart-tick)" strokeWidth="1" opacity="0.75" />
      <text x={PAD.l + 4} y={below ? yc + 14 : yc - 8}
        fontSize="9" fill="var(--chart-tick)">{note}</text>
    </g>
  )

  const selPoint = sel != null && points[sel] && Number.isFinite(valueOf(points[sel]))
    ? points[sel] : null

  return (
    <div className={c.chartScroll}>
      <svg className={c.chartSvg} width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        role="img" aria-label={`${label} 관리도${hasLow || hasHigh ? ' (Y축 일부 생략)' : ''}`}>
        {/* 압축 구간 음영 — 여기는 축척이 다르다는 신호 */}
        {hasHigh && (
          <rect x={PAD.l} y={plotTop} width={W - PAD.r - PAD.l} height={highH}
            fill="var(--chart-grid)" opacity="0.14" />
        )}
        {hasLow && (
          <rect x={PAD.l} y={breakLoY} width={W - PAD.r - PAD.l} height={lowH}
            fill="var(--chart-grid)" opacity="0.14" />
        )}
        {/* 격자 + y 눈금 */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)}
              stroke="var(--chart-grid)" strokeWidth="1" strokeDasharray="2 3" />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end"
              fontSize="10" fill="var(--chart-tick)">{fmt(t, 3)}</text>
          </g>
        ))}
        {/* 관리한계 (UCL/LCL) + 중심선 */}
        <polyline points={path(uclOf)} fill="none" stroke="var(--chart-red)"
          strokeWidth="1.5" strokeDasharray="5 4" />
        {!lclAllZero && (
          <polyline points={path(lclOf)} fill="none" stroke="var(--chart-red)"
            strokeWidth="1.5" strokeDasharray="5 4" />
        )}
        <polyline points={path(clOf)} fill="none" stroke="var(--chart-emerald)" strokeWidth="1.5" />
        {/* 데이터 선 */}
        <polyline points={path(valueOf)} fill="none" stroke="var(--chart-blue)" strokeWidth="1.5" />
        {/* Y축 단절(물결) — 선을 끊는다. ★ 점보다 먼저 그린다 (2026-08-07 fix):
            밴드가 점 위에 오면 단절 경계 근처의 완만한 이탈점이 밴드에 가려 안 보였다. */}
        {hasHigh && renderBreak(breakHiY, '↑ 이 위 구간 축소', false)}
        {hasLow && renderBreak(breakLoY, '↓ 이 아래 구간 축소', true)}
        {/* 데이터 점 — 밴드 위에 그려 항상 보이게. 탭하면 하단에 상세값 (터치 대응) */}
        {points.map((p, i) => {
          const v = valueOf(p)
          if (!Number.isFinite(v)) return null
          const bad = outOf(p)
          const exc = !!p.excluded    // 한계 계산에서 뺀 군 — 회색 테두리로 구분
          return (
            <g key={i}>
              {exc && (
                <circle cx={x(i)} cy={y(v)} r="7.5" fill="none"
                  stroke="var(--chart-tick)" strokeWidth="1" strokeDasharray="2 2" />
              )}
              {sel === i && (
                <circle cx={x(i)} cy={y(v)} r="7" fill="none"
                  stroke="var(--chart-blue)" strokeWidth="1.5" />
              )}
              <circle cx={x(i)} cy={y(v)} r={bad ? 4.5 : 2.8}
                fill={bad ? 'var(--chart-red)' : 'var(--chart-blue)'}
                stroke="var(--color-surface)" strokeWidth={bad ? 1.5 : 0} />
              {/* 히트 영역 — 점이 작아 그대로는 못 누른다. 호버 title 도 최상단인 여기에 */}
              <circle cx={x(i)} cy={y(v)} r="11" fill="transparent" className={c.hitDot}
                onClick={() => setSel(sel === i ? null : i)}>
                <title>{`${p.label} (n=${p.n})\n${label} ${fmt(v)}${unit}\nUCL ${fmt(uclOf(p))} / CL ${fmt(clOf(p))} / LCL ${fmt(lclOf(p))}${exc ? '\n※ 한계 계산에서 제외된 군' : ''}`}</title>
              </circle>
            </g>
          )
        })}
        {hasHigh && (
          <text x={PAD.l - 6} y={plotTop + 9} textAnchor="end"
            fontSize="10" fill="var(--chart-tick)">{fmt(dataHi, 3)}</text>
        )}
        {hasLow && (
          <text x={PAD.l - 6} y={plotBot - 2} textAnchor="end"
            fontSize="10" fill="var(--chart-tick)">{fmt(dataLo, 3)}</text>
        )}
        {/* x축 라벨 */}
        {points.map((p, i) => (i % labelEvery === 0 ? (
          <text key={i} x={x(i)} y={H - 12} textAnchor="middle"
            fontSize="10" fill="var(--chart-tick)">{p.label}</text>
        ) : null))}
      </svg>
      {/* 탭한 점 상세 — sticky 라 가로 스크롤해도 왼쪽에 고정 */}
      {selPoint && (
        <div className={c.pointInfo}>
          <b>{selPoint.label}</b> · n={selPoint.n} · {label} {fmt(valueOf(selPoint))}{unit}
          {' · '}UCL {fmt(uclOf(selPoint))} · CL {fmt(clOf(selPoint))} · LCL {fmt(lclOf(selPoint))}
          {selPoint.excluded ? ' · 계산 제외' : ''}
        </div>
      )}
    </div>
  )
}

export default function YokeSpcPage({ onBack }) {
  const [filters, setFilters] = useState(loadFilters)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)) } catch { /* 저장 실패 무시 */ }
  }, [filters])

  // 조회 — 기간이 바뀔 때만 다시 부른다. 파이·항목·부분군은 클라이언트 계산이라 재조회 불필요.
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const f = { limit: FETCH_LIMIT }
      if (filters.date_from) f.date_from = filters.date_from
      if (filters.date_to) f.date_to = filters.date_to
      const r = await listYokeIpq(f)
      setRows(r.items || [])
    } catch (e) {
      setError(e.message || '불러오기 실패')
      setRows([])
    } finally { setLoading(false) }
  }, [filters.date_from, filters.date_to])

  useEffect(() => { load() }, [load])

  // 파이 옵션 — 데이터에 실제로 있는 것만, 측정값이 많은 순
  const phiOptions = useMemo(() => {
    const cnt = new Map()
    for (const r of rows) {
      const p = String(r.phi || '').trim()
      if (!p) continue
      if (Number.isFinite(r[filters.metric])) cnt.set(p, (cnt.get(p) || 0) + 1)
    }
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ phi: p, n }))
  }, [rows, filters.metric])

  // 저장된 파이가 현재 항목/기간엔 측정이 없을 수 있다 → 그럴 땐 빈 화면 대신 최다 파이로 넘어간다.
  const activePhi = (filters.phi && phiOptions.some((o) => o.phi === filters.phi))
    ? filters.phi
    : (phiOptions[0]?.phi || '')

  const vendorOptions = useMemo(() => {
    const set = new Set()
    for (const r of rows) {
      if (String(r.phi || '').trim() !== activePhi) continue
      const v = String(r.vendor || '').trim()
      if (v) set.add(v)
    }
    return [...set].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
  }, [rows, activePhi])

  // 저장된 호기가 현재 파이엔 없을 수 있다(파이 자동 폴백 등, 2026-08-07 fix) — 그대로 필터에 쓰면
  // 데이터가 통째로 사라지고 호기 select 는 빈 값으로 렌더된다. 목록에 없으면 '전체'로 취급.
  const activeVendor = vendorOptions.includes(filters.vendor) ? filters.vendor : ''

  const target = useMemo(() => rows.filter((r) => {
    if (String(r.phi || '').trim() !== activePhi) return false
    if (activeVendor && String(r.vendor || '').trim() !== activeVendor) return false
    return true
  }), [rows, activePhi, activeVendor])

  const built = useMemo(() => (
    filters.mode === 'daily'
      ? buildDailySubgroups(target, filters.metric)
      : buildFixedSubgroups(target, filters.metric, filters.size)
  ), [target, filters.mode, filters.metric, filters.size])

  // 일자별 모드에서 하루 1건뿐인 날만 있으면 R 을 정의할 수 없어 stats 가 null 이 된다 —
  //   '부분군 부족' 안내와 원인이 달라 메시지를 구분한다 (2026-08-07 리뷰 반영).
  const allSingleton = built.groups.length > 0 && built.groups.every((g) => g.values.length < 2)

  // 고정 기준 — (파이 · 측정항목 · 호기) 조합별로 따로 보관. 조건이 다르면 다른 공정이므로.
  const [baselines, setBaselines] = useState(loadBaselines)
  const blKey = baselineKeyOf(activePhi, filters.metric, activeVendor)
  const baseline = baselines[blKey] || null
  const baselineOn = !!baseline && filters.useBaseline !== false

  const stats = useMemo(
    () => computeXbarR(built.groups, {
      purge: filters.purge,
      baseline: baselineOn ? baseline : null,
    }),
    [built.groups, filters.purge, baselineOn, baseline],
  )

  const metric = SPC_METRICS.find((m) => m.key === filters.metric) || SPC_METRICS[0]
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))

  // 현재 화면의 한계를 '기준'으로 동결 — 정제(purge)를 켠 상태면 개정한계가 그대로 기준이 된다.
  // ★ 반드시 baseline 없이 **다시 계산**한다 (2026-08-07 fix): 기준 적용(Phase II) 상태의 stats 는
  //   grandMean/sigmaHat 이 기존 기준값 그대로라, 그걸 저장하면 '갱신' 버튼이 옛 값을 재저장하며
  //   기준기간 메타만 새로 찍히는 조용한 무동작(no-op)이 된다.
  const freezeBaseline = () => {
    const fresh = computeXbarR(built.groups, { purge: filters.purge, baseline: null })
    if (!fresh) return
    const next = {
      ...baselines,
      [blKey]: {
        grandMean: fresh.grandMean,
        sigmaHat: fresh.sigmaHat,
        from: filters.date_from,
        to: filters.date_to,
        groups: fresh.points.length - fresh.excludedCount,
        excludedCount: fresh.excludedCount,
        purged: fresh.purged,
        mode: filters.mode,
        size: filters.size,
        savedAt: todayKst(),
      },
    }
    setBaselines(next)
    saveBaselines(next)
    set({ useBaseline: true })
  }
  const clearBaseline = () => {
    const next = { ...baselines }
    delete next[blKey]
    setBaselines(next)
    saveBaselines(next)
  }

  const outliers = useMemo(
    () => (stats?.points || []).filter((p) => p.xOut || p.rOut),
    [stats],
  )

  const phiColor = PHI_SPECS[activePhi]?.color || 'var(--color-gray-light)'
  const totalOut = stats ? stats.outX + stats.outR : 0

  return (
    <div className="page-flat">
      <div className={c.headerRow}>
        <div className={`page-header ${c.headerMain}`}>
          <h1 className="page-title">요크 관리도 (X̄-R)</h1>
          <p className="page-subtitle">IPQ 실측 기반 공정 산포 · 관리한계 이탈 감시</p>
        </div>
        {onBack && <button type="button" className={c.backLink} onClick={onBack}>← 이전</button>}
      </div>

      {/* ── 필터 ── */}
      <div className={c.filters}>
        <div className={c.fRow}>
          <div className={c.fGroup}>
            <span className={c.fLabel}>기간</span>
            <div className={c.dateRange}>
              <input className={c.dateInput} type="date" value={filters.date_from}
                onChange={(e) => set({ date_from: e.target.value })} />
              <span className={c.dateSep}>~</span>
              <input className={c.dateInput} type="date" value={filters.date_to}
                onChange={(e) => set({ date_to: e.target.value })} />
            </div>
          </div>

          <div className={c.fGroup}>
            <span className={c.fLabel}>측정 항목</span>
            <select className={c.select} value={filters.metric}
              onChange={(e) => set({ metric: e.target.value })}>
              {SPC_METRICS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className={c.fGroup}>
            <span className={c.fLabel}>호기</span>
            <select className={c.select} value={activeVendor}
              onChange={(e) => set({ vendor: e.target.value })}>
              <option value="">전체</option>
              {vendorOptions.map((v) => <option key={v} value={v}>{v}호기</option>)}
            </select>
          </div>

          <div className={c.fGroup}>
            <span className={c.fLabel}>
              부분군
              <InfoTip label="부분군 묶는 방식">
                연속된 측정 몇 개를 한 묶음(부분군)으로 봅니다.
                <b> 고정 크기</b>: 측정 순서대로 n개씩. <b>일자별</b>: 하루 측정 전체가 한 군(n 가변).
              </InfoTip>
            </span>
            <div className={c.sizeRow}>
              <select className={c.select} value={filters.mode}
                onChange={(e) => set({ mode: e.target.value })}>
                <option value="fixed">고정 크기</option>
                <option value="daily">일자별</option>
              </select>
              {filters.mode === 'fixed' && (
                <select className={c.select} value={filters.size}
                  onChange={(e) => set({ size: Number(e.target.value) })}>
                  {FIXED_SIZES.map((n) => <option key={n} value={n}>n = {n}</option>)}
                </select>
              )}
            </div>
          </div>

          <button type="button" className={c.reset}
            onClick={() => setFilters(getDefaultFilters())}>초기화</button>
        </div>

        <div className={c.fRow}>
          <div className={c.fGroup}>
            <span className={c.fLabel}>파이 (단일 선택)</span>
            <div className={c.chips}>
              {phiOptions.length === 0 && <span className={c.muted}>데이터 없음</span>}
              {phiOptions.map(({ phi, n }) => (
                <button key={phi} type="button"
                  className={`${c.chip} ${phi === activePhi ? c.chipOn : ''}`}
                  style={phi === activePhi && PHI_SPECS[phi]
                    ? {
                      background: PHI_SPECS[phi].color,
                      borderColor: PHI_SPECS[phi].color,
                      color: 'var(--color-dark)',
                    }
                    : undefined}
                  onClick={() => set({ phi, vendor: '' })}>
                  Φ{phi} ({n})
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <div className={c.error}>{error}</div>}

      {loading ? <TableSkeleton rows={6} /> : !stats ? (
        <div className={c.empty}>
          {target.length === 0
            ? '선택한 조건에 측정 데이터가 없습니다.'
            : allSingleton
              ? `하루 1건씩만 측정된 날들이라 범위(R)를 계산할 수 없습니다 (측정 ${built.measured}건). 부분군을 '고정 크기'로 바꿔보세요.`
              : `관리도를 그리기에 부분군이 부족합니다 (측정 ${built.measured}건 → 부분군 ${built.groups.length}개). 기간을 넓히거나 부분군 크기를 줄여보세요.`}
        </div>
      ) : (
        <>
          {/* ── 컨텍스트 — 지금 무엇을 보고 있나 ── */}
          <div className={c.context}>
            <span className={c.ctxTitle}>
              <i className={c.phiDot} style={{ background: phiColor }} />
              Φ{activePhi} {metric.label}
            </span>
            <span className={c.ctxSub}>
              {activeVendor ? `${activeVendor}호기` : '전체 호기'}
              {' · '}{filters.date_from} ~ {filters.date_to}
              {' · '}측정 {built.measured}건
            </span>
          </div>

          {/* ── 한계의 출처 (해석용 Phase I / 관리용 Phase II) ──
              관리도 정석: 이상원인을 걷어내며 한계를 '정제'(해석용) → 확정되면 '동결'(관리용). */}
          <div className={`${c.phaseBar} ${baselineOn ? c.phaseFixed : ''}`}>
            <div className={c.phaseHead}>
              <span className={c.phaseTag}>
                {baselineOn ? '관리용 · 고정 기준' : '해석용 · 현재 데이터로 계산'}
                <InfoTip label="한계 기준">
                  <b>해석용</b>: 지금 조회한 데이터로 한계를 계산 — 안정 구간을 찾는 단계.
                  <b> 관리용</b>: 안정 구간의 X̄̄·σ̂를 고정해 이후 데이터를 같은 기준으로 판정 —
                  서서히 나빠지는 변화(드리프트)도 잡힙니다.
                </InfoTip>
              </span>
              {baselineOn ? (
                <span className={c.phaseDesc}>
                  X̄̄ {fmt(baseline.grandMean)} · σ̂ {fmt(baseline.sigmaHat, 4)}
                  {' — '}{baseline.savedAt} 고정 (기준기간 {baseline.from}~{baseline.to}, {baseline.groups}군
                  {baseline.purged && baseline.excludedCount > 0 ? `, 이탈 ${baseline.excludedCount}군 제외` : ''})
                </span>
              ) : (
                <span className={c.phaseDesc}>
                  한계가 조회 조건에 따라 매번 다시 계산됩니다. 안정 구간을 찾으면 기준으로 고정하세요.
                </span>
              )}
            </div>
            <div className={c.phaseActions}>
              {!baselineOn && (
                <span className={c.phaseCheck}>
                  {/* (i) 는 label 밖에 — label 안의 버튼 클릭이 체크박스 토글로 새는 브라우저 방지 */}
                  <label className={c.phaseCheck}>
                    <input type="checkbox" checked={!!filters.purge}
                      onChange={(e) => set({ purge: e.target.checked })} />
                    이탈군 제외
                  </label>
                  <InfoTip label="이탈군 제외">
                    관리한계 밖 부분군을 빼고 한계를 다시 계산합니다(수렴까지 반복).
                    이상값이 한계를 부풀려 자기 자신을 숨기는 것을 막습니다.
                    <b> 원인이 밝혀진 이탈만 제외</b>하는 것이 원칙입니다.
                  </InfoTip>
                </span>
              )}
              {baseline ? (
                <>
                  <label className={c.phaseCheck}>
                    <input type="checkbox" checked={filters.useBaseline !== false}
                      onChange={(e) => set({ useBaseline: e.target.checked })} />
                    기준 적용
                  </label>
                  <button type="button" className="btn-secondary btn-sm" onClick={freezeBaseline}>
                    현재 값으로 갱신
                  </button>
                  <button type="button" className="btn-text" onClick={clearBaseline}>기준 해제</button>
                </>
              ) : (
                <button type="button" className="btn-secondary btn-sm" onClick={freezeBaseline}>
                  이 기간을 기준으로 고정
                </button>
              )}
            </div>
          </div>

          {/* ── 요약 지표 ── */}
          <div className={c.summary}>
            <div className={c.stat}>
              <span className={c.statLabel}>
                부분군
                <InfoTip label="부분군">
                  연속 측정을 묶은 단위. 묶음 안의 산포(R)로 공정의 순수 산포를 추정합니다.
                  관리한계가 안정되려면 20~25군이 필요합니다.
                </InfoTip>
              </span>
              <span className={c.statValue}>{stats.points.length}<small>군</small></span>
            </div>
            <div className={c.stat}>
              <span className={c.statLabel}>측정 수</span>
              <span className={c.statValue}>{built.measured}<small>건</small></span>
            </div>
            <div className={c.stat}>
              <span className={c.statLabel}>
                중심선 X̄̄
                <InfoTip label="중심선">X̄ 관리도의 초록 중심선(CL). 해석용에선 한계 계산에 포함된 측정값의 평균(이탈군 제외 시 제외군은 뺌), 관리용에선 고정한 기준값입니다.</InfoTip>
              </span>
              <span className={c.statValue}>{fmt(stats.grandMean)}</span>
            </div>
            <div className={c.stat}>
              <span className={c.statLabel}>
                R̄
                <InfoTip label="R바">부분군 범위(최대−최소)의 평균 — 공정 산포의 크기. 한계 계산에서 제외한 군은 빠집니다.</InfoTip>
              </span>
              <span className={c.statValue}>{fmt(stats.rBar)}</span>
            </div>
            <div className={c.stat}>
              <span className={c.statLabel}>
                추정 σ̂
                <InfoTip label="시그마 추정">
                  공정 표준편차 추정값 — σ̂ = 평균(Rᵢ/d₂(nᵢ)).
                  d₂(n)은 <b>정규분포를 가정</b>했을 때 부분군 크기 n의 범위 기댓값으로,
                  n에 따라 표준 상수표(KS A ISO 7870)에서 정해집니다.
                  관리한계 폭(±3σ̂/√n)이 여기서 나오며, 관리용에선 고정한 기준값입니다.
                </InfoTip>
              </span>
              <span className={c.statValue}>{fmt(stats.sigmaHat, 4)}</span>
            </div>
            <div className={c.stat}>
              <span className={c.statLabel}>
                이탈 (X̄ / R)
                <InfoTip label="이탈">관리한계 밖 부분군 수 (X̄ 차트 / R 차트).</InfoTip>
              </span>
              <span className={`${c.statValue} ${totalOut > 0 ? c.bad : c.ok}`}>
                {stats.outX} / {stats.outR}
              </span>
            </div>
          </div>

          {/* ── 데이터 품질 경고 — 지금 조건에서 실제로 걸린 것만 ── */}
          {(built.dropped > 0 || stats.clampedCount > 0 || stats.singletonCount > 0
            || stats.excludedCount > 0 || stats.purgeStopped
            || stats.sigmaInflation > SPC_SIGMA_INFLATION_WARN
            || (!baselineOn && stats.points.length < BASELINE_MIN_GROUPS)) && (
            <div className={c.warnBox}>
              {stats.excludedCount > 0 && (
                <span className={c.warnItem}>
                  <span>
                    이탈 {stats.excludedCount}군을 한계 계산에서 제외 (정제 {stats.purgeIters}회, 계산에 쓴 {stats.usedGroups}군).
                    차트에는 회색 링으로 표시 — <b>원인이 밝혀진 이탈만 제외하는 것이 원칙</b>입니다.
                  </span>
                </span>
              )}
              {stats.sigmaInflation > SPC_SIGMA_INFLATION_WARN && (
                <span className={c.warnItem}>
                  <span>
                    소수 부분군이 σ̂를 끌어올리고 있습니다 (평균 {fmt(stats.sigmaHat, 4)} vs 중앙값 {fmt(stats.sigmaRobust, 4)}
                    {' = '}{stats.sigmaInflation.toFixed(2)}배). <b>관리한계가 실제 산포보다 넓게 그려집니다</b>
                    {stats.purged ? ' — 정제 후에도 그렇다면 공정 자체를 확인하세요.' : " — '이탈군 제외'를 켜고 다시 보세요."}
                  </span>
                </span>
              )}
              {stats.purgeStopped && (
                <span className={c.warnItem}>
                  <span>남는 부분군이 {SPC_PURGE_MIN_KEEP}개 미만이 되어 정제를 중단했습니다 — 이탈이 너무 잦으면 공정 자체를 먼저 봐야 합니다.</span>
                </span>
              )}
              {!baselineOn && stats.points.length < BASELINE_MIN_GROUPS && (
                <span className={c.warnItem}>
                  <span>부분군 {stats.points.length}개 — 관리한계가 안정되려면 {BASELINE_MIN_GROUPS}~25군이 필요합니다 (기간 확대 또는 부분군 크기 축소).</span>
                </span>
              )}
              {built.dropped > 0 && (
                <span className={c.warnItem}>
                  <span>나머지 {built.dropped}건은 부분군을 못 채워 제외했습니다.</span>
                </span>
              )}
              {stats.singletonCount > 0 && (
                <span className={c.warnItem}>
                  <span>n=1 부분군 {stats.singletonCount}개는 범위(R)를 정의할 수 없어 R 관리도에서 빠집니다.</span>
                </span>
              )}
              {stats.clampedCount > 0 && (
                <span className={c.warnItem}>
                  <span>n&gt;{SPC_N_MAX} 부분군 {stats.clampedCount}개는 표준 상수표 상한(n={SPC_N_MAX})으로 근사했습니다.</span>
                </span>
              )}
            </div>
          )}

          {/* ── X̄ 관리도 ── */}
          <div className={c.chartCard}>
            <div className={c.chartHead}>
              <span className={c.chartName}>
                X̄ 관리도
                <InfoTip label="X바 관리도">
                  점 = 부분군 평균. <b>공정 중심의 이동</b>을 감시합니다.
                  규격(공차)선은 표시하지 않습니다 — X̄는 평균이라 개별 제품 규격과 직접 비교하면 오독.
                  크게 벗어난 점이 있으면 Y축을 물결(⌇)로 접어 관리한계 구간을 확대합니다 — 음영 구간은 축척이 다릅니다.
                </InfoTip>
              </span>
              <span className={c.chartDesc}>부분군 평균 — 공정 중심의 이동</span>
              <div className={c.legend}>
                <span className={`${c.legendItem} ${c.legendBlue}`}>
                  <i className={c.swatch} /> 부분군 평균
                </span>
                <span className={`${c.legendItem} ${c.legendGreen}`}>
                  <i className={c.swatch} /> 중심선
                </span>
                <span className={`${c.legendItem} ${c.legendRed}`}>
                  <i className={`${c.swatch} ${c.swatchDash}`} /> 관리한계
                </span>
                <span className={`${c.legendItem} ${c.legendRed}`}>
                  <i className={c.swatchDot} /> 이탈
                </span>
                {stats.excludedCount > 0 && (
                  <span className={`${c.legendItem} ${c.legendMuted}`}>
                    <i className={c.swatchRing} /> 계산 제외
                  </span>
                )}
              </div>
            </div>
            <ControlChart points={stats.points} label={`${metric.label} X̄`} unit={metric.unit}
              valueOf={(p) => p.xbar} uclOf={(p) => p.xUcl} lclOf={(p) => p.xLcl}
              clOf={() => stats.grandMean} outOf={(p) => p.xOut} />
          </div>

          {/* ── R 관리도 ── */}
          <div className={c.chartCard}>
            <div className={c.chartHead}>
              <span className={c.chartName}>
                R 관리도
                <InfoTip label="R 관리도">
                  점 = 부분군 범위(최대−최소). <b>산포가 커지는지</b> 감시합니다.
                  R이 불안정하면 X̄ 관리한계도 신뢰할 수 없어 R부터 안정시켜야 합니다.
                  범위는 음수가 될 수 없어 축은 0에서 시작하며, n&lt;7 이면 하한(LCL)이 0 — 즉
                  <b> 하한 이탈은 정의되지 않아</b> 선을 그리지 않습니다.
                </InfoTip>
              </span>
              <span className={c.chartDesc}>부분군 범위 — 산포의 변화</span>
            </div>
            <ControlChart points={stats.points} label={`${metric.label} R`} unit={metric.unit}
              valueOf={(p) => p.r} uclOf={(p) => p.rUcl} lclOf={(p) => p.rLcl}
              clOf={(p) => p.rCl} outOf={(p) => p.rOut} nonNegative />
          </div>

          {/* ── 이탈 목록 ── */}
          {outliers.length > 0 && (
            <div>
              <p className={c.secTitle}>
                관리한계 이탈 {outliers.length}군
                <InfoTip label="이탈 목록">관리한계를 벗어난 부분군 — 해당 구간의 작업 조건(설비·자재·작업자)을 확인하세요.</InfoTip>
              </p>
              <div className={c.tableWrap}>
                <table className={c.outTable}>
                  <thead>
                    <tr>
                      <th>부분군</th><th>구간</th><th>n</th>
                      <th>X̄</th><th>R</th><th>사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outliers.map((p, i) => (
                      <tr key={i}>
                        <td>{p.label}</td>
                        <td className={c.outDate}>
                          {filters.mode === 'daily'
                            ? rowDate(p.rows[0])
                            : `${rowDate(p.rows[0])} ~ ${rowDate(p.rows[p.rows.length - 1])}`}
                        </td>
                        <td>{p.n}</td>
                        <td>{fmt(p.xbar)}</td>
                        <td>{p.r === null ? '-' : fmt(p.r)}</td>
                        <td>
                          {p.xOut && <span className={c.outWhy}>X̄ 이탈</span>}
                          {p.xOut && p.rOut && ' '}
                          {p.rOut && <span className={c.outWhy}>R 이탈</span>}
                          {p.excluded && <> <span className={c.outExc}>계산 제외</span></>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
