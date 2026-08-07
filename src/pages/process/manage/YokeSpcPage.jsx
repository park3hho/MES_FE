// pages/process/manage/YokeSpcPage.jsx
// 요크 X̄-R 관리도 (SPC) — 2026-08-06
//   IPQ 검사 이력(yoke_ipq_inspection)의 실측값으로 공정 산포를 본다.
//   계산은 utils/spc.js (순수 함수), 이 파일은 필터 + SVG 렌더만.
//
// ⚠️ 파이는 반드시 하나만 — 20파이 외경과 70파이 외경을 같은 관리도에 섞으면 산포가 아니라
//    치수 차이를 보게 된다. 측정 항목도 마찬가지로 단일 선택.
// ⚠️ 규격선(공차)은 일부러 안 그린다 — 규격은 '개별 제품'에 적용되는 값이고,
//    X̄ 차트의 점은 부분군 평균이라 둘을 겹치면 공정능력을 과대평가하게 된다(SPC 기본 원칙).
// ⚠️ 차트는 CDN·외부 라이브러리 없이 인라인 SVG — 공장 내부망에서도 뜨게.
import { useState, useEffect, useCallback, useMemo } from 'react'

import { listYokeIpq } from '@/api'
import { TableSkeleton } from '@/components/Skeleton'
import Section from '@/components/common/Section'
import { PHI_SPECS } from '@/constants/processConst'
import { todayKst, kstDaysAgo } from '@/utils/dateConvert'
import {
  SPC_METRICS, SPC_N_MAX, SPC_PURGE_MIN_KEEP, SPC_SIGMA_INFLATION_WARN, rowDate,
  buildFixedSubgroups, buildDailySubgroups, computeXbarR,
} from '@/utils/spc'
import s from './InspectionListPage.module.css'
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
function ControlChart({ points, valueOf, uclOf, lclOf, clOf, outOf, label, unit }) {
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

  const dataLo = Math.min(minOf(vals), lcl, minOf(clAll))
  const dataHi = Math.max(maxOf(vals), ucl, maxOf(clAll))

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
    coreLo = rawLo - pad
    coreHi = rawHi + pad
    hasLow = dataLo < coreLo - 1e-9
    hasHigh = dataHi > coreHi + 1e-9
  } else {
    // 관리한계 폭이 0(전부 동일값 등) — 접을 근거가 없으니 기존 선형 스케일
    const span = dataHi - dataLo || Math.abs(dataHi) * 0.02 || 1
    coreLo = dataLo - span * 0.12
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
        <polyline points={path(lclOf)} fill="none" stroke="var(--chart-red)"
          strokeWidth="1.5" strokeDasharray="5 4" />
        <polyline points={path(clOf)} fill="none" stroke="var(--chart-emerald)" strokeWidth="1.5" />
        {/* 데이터 */}
        <polyline points={path(valueOf)} fill="none" stroke="var(--chart-blue)" strokeWidth="1.5" />
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
              <circle cx={x(i)} cy={y(v)} r={bad ? 4.5 : 2.8}
                fill={bad ? 'var(--chart-red)' : 'var(--chart-blue)'}
                stroke="var(--color-surface)" strokeWidth={bad ? 1.5 : 0}>
                <title>{`${p.label} (n=${p.n})\n${label} ${fmt(v)}${unit}\nUCL ${fmt(uclOf(p))} / CL ${fmt(clOf(p))} / LCL ${fmt(lclOf(p))}${exc ? '\n※ 한계 계산에서 제외된 군' : ''}`}</title>
              </circle>
            </g>
          )
        })}
        {/* Y축 단절(물결) — 데이터 위에 얹어 선을 끊는다. 압축 구간 끝값은 실제 수치로 표기 */}
        {hasHigh && renderBreak(breakHiY, '↑ 이 위 구간 축소', false)}
        {hasLow && renderBreak(breakLoY, '↓ 이 아래 구간 축소', true)}
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

  const target = useMemo(() => rows.filter((r) => {
    if (String(r.phi || '').trim() !== activePhi) return false
    if (filters.vendor && String(r.vendor || '').trim() !== filters.vendor) return false
    return true
  }), [rows, activePhi, filters.vendor])

  const built = useMemo(() => (
    filters.mode === 'daily'
      ? buildDailySubgroups(target, filters.metric)
      : buildFixedSubgroups(target, filters.metric, filters.size)
  ), [target, filters.mode, filters.metric, filters.size])

  // 고정 기준 — (파이 · 측정항목 · 호기) 조합별로 따로 보관. 조건이 다르면 다른 공정이므로.
  const [baselines, setBaselines] = useState(loadBaselines)
  const blKey = baselineKeyOf(activePhi, filters.metric, filters.vendor)
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
  const freezeBaseline = () => {
    if (!stats) return
    const next = {
      ...baselines,
      [blKey]: {
        grandMean: stats.grandMean,
        sigmaHat: stats.sigmaHat,
        from: filters.date_from,
        to: filters.date_to,
        groups: stats.points.length - stats.excludedCount,
        excludedCount: stats.excludedCount,
        purged: stats.purged,
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

  return (
    <div className="page-flat">
      <div className={s.headerRow}>
        <div className="page-header" style={{ flex: 1 }}>
          <h1 className="page-title">요크 관리도 (X̄-R)</h1>
          <p className="page-subtitle">IPQ 실측 기반 공정 산포 · 관리한계 이탈 감시</p>
        </div>
        {onBack && <button type="button" className={s.backLink} onClick={onBack}>← 이전</button>}
      </div>

      <Section label="조건">
        <div className={s.filterWrap}>
          <div className={s.filterGroup}>
            <span className={s.fLabel}>기간</span>
            <div className={s.dateRange}>
              <input className={s.dateInput} type="date" value={filters.date_from}
                onChange={(e) => set({ date_from: e.target.value })} />
              <span className={s.dateSep}>~</span>
              <input className={s.dateInput} type="date" value={filters.date_to}
                onChange={(e) => set({ date_to: e.target.value })} />
            </div>
          </div>

          <div className={s.filterGroup}>
            <span className={s.fLabel}>파이</span>
            <div className={s.chips}>
              {phiOptions.length === 0 && <span className={s.muted}>데이터 없음</span>}
              {phiOptions.map(({ phi, n }) => (
                <button key={phi} type="button"
                  className={`${s.chip} ${phi === activePhi ? s.chipOn : ''}`}
                  style={phi === activePhi && PHI_SPECS[phi]
                    ? { background: PHI_SPECS[phi].color, borderColor: PHI_SPECS[phi].color }
                    : undefined}
                  onClick={() => set({ phi, vendor: '' })}>
                  Φ{phi} ({n})
                </button>
              ))}
            </div>
          </div>

          <div className={s.filterGroup}>
            <span className={s.fLabel}>측정 항목</span>
            <select className={c.select} value={filters.metric}
              onChange={(e) => set({ metric: e.target.value })}>
              {SPC_METRICS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className={s.filterGroup}>
            <span className={s.fLabel}>호기</span>
            <select className={c.select} value={filters.vendor}
              onChange={(e) => set({ vendor: e.target.value })}>
              <option value="">전체</option>
              {vendorOptions.map((v) => <option key={v} value={v}>{v}호기</option>)}
            </select>
          </div>

          <div className={s.filterGroup}>
            <span className={s.fLabel}>부분군</span>
            <div className={c.sizeRow}>
              <select className={c.select} value={filters.mode}
                onChange={(e) => set({ mode: e.target.value })}>
                <option value="fixed">고정 크기</option>
                <option value="daily">일자별</option>
              </select>
              {filters.mode === 'fixed' ? (
                <>
                  <select className={c.select} value={filters.size}
                    onChange={(e) => set({ size: Number(e.target.value) })}>
                    {FIXED_SIZES.map((n) => <option key={n} value={n}>n = {n}</option>)}
                  </select>
                  <span className={c.sizeHint}>측정 순서대로 묶음</span>
                </>
              ) : (
                <span className={c.sizeHint}>하루 측정 전체가 한 군 (n 가변)</span>
              )}
            </div>
          </div>

          <div className={s.filterActions}>
            <button type="button" className={s.resetBtn}
              onClick={() => setFilters(getDefaultFilters())}>초기화</button>
          </div>
        </div>
      </Section>

      {error && <div className={s.error}>{error}</div>}

      {loading ? <TableSkeleton rows={6} /> : !stats ? (
        <div className={s.empty}>
          {target.length === 0
            ? '선택한 조건에 측정 데이터가 없습니다.'
            : `관리도를 그리기에 부분군이 부족합니다 (측정 ${built.measured}건 → 부분군 ${built.groups.length}개). 기간을 넓히거나 부분군 크기를 줄여보세요.`}
        </div>
      ) : (
        <>
          <Section label={`요약 — Φ${activePhi} ${metric.label}${filters.vendor ? ` · ${filters.vendor}호기` : ''}`}>
            <div className={c.summary}>
              <div className={c.stat}>
                <span className={c.statLabel}>부분군</span>
                <span className={c.statValue}>{stats.points.length}군</span>
              </div>
              <div className={c.stat}>
                <span className={c.statLabel}>측정 수</span>
                <span className={c.statValue}>{built.measured}건</span>
              </div>
              <div className={c.stat}>
                <span className={c.statLabel}>중심선 X̄̄</span>
                <span className={c.statValue}>{fmt(stats.grandMean)}</span>
              </div>
              <div className={c.stat}>
                <span className={c.statLabel}>R̄</span>
                <span className={c.statValue}>{fmt(stats.rBar)}</span>
              </div>
              <div className={c.stat}>
                <span className={c.statLabel}>추정 σ̂</span>
                <span className={c.statValue}>{fmt(stats.sigmaHat, 4)}</span>
              </div>
              <div className={c.stat}>
                <span className={c.statLabel}>이탈 (X̄ / R)</span>
                <span className={`${c.statValue} ${stats.outX + stats.outR > 0 ? c.bad : ''}`}>
                  {stats.outX} / {stats.outR}
                </span>
              </div>
            </div>

            {/* ── 한계의 출처 (해석용 Phase I / 관리용 Phase II) ──────────────
                관리도 정석: 이상원인을 걷어내며 한계를 '정제'(해석용) → 확정되면 '동결'(관리용).
                한계가 데이터 따라 계속 움직이면 서서히 나빠지는 드리프트를 영영 못 잡는다. */}
            <div className={`${c.phaseBar} ${baselineOn ? c.phaseFixed : ''}`}>
              <div className={c.phaseHead}>
                <span className={c.phaseTag}>{baselineOn ? '관리용 (고정 기준)' : '해석용 (현재 데이터로 계산)'}</span>
                {baselineOn ? (
                  <span className={c.phaseDesc}>
                    X̄̄ {fmt(baseline.grandMean)} · σ̂ {fmt(baseline.sigmaHat, 4)}
                    {' — '}{baseline.savedAt} 고정 (기준기간 {baseline.from}~{baseline.to}, {baseline.groups}군
                    {baseline.purged && baseline.excludedCount > 0 ? `, 이탈 ${baseline.excludedCount}군 제외` : ''})
                  </span>
                ) : (
                  <span className={c.phaseDesc}>
                    한계가 조회 조건·데이터에 따라 매번 다시 계산됩니다. 안정 구간을 찾으면 기준으로 고정하세요.
                  </span>
                )}
              </div>
              <div className={c.phaseActions}>
                {!baselineOn && (
                  <label className={c.phaseCheck}>
                    <input type="checkbox" checked={!!filters.purge}
                      onChange={(e) => set({ purge: e.target.checked })} />
                    이탈군 제외 (개정한계)
                  </label>
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

            <div className={c.notice}>
              <span>σ̂ = 평균(Rᵢ / d2(nᵢ)) 로 추정 · 관리한계 = X̄̄ ± 3σ̂/√n (부분군 n 별 산출)</span>
              <span>규격선(공차)은 표시하지 않습니다 — 규격은 개별 제품 기준, X̄ 는 부분군 평균이라 함께 보면 오독합니다.</span>
              <span>크게 벗어난 점이 있으면 Y축 일부를 물결(⌇)로 생략해 관리한계 구간을 확대합니다 — 음영 구간은 축척이 다릅니다.</span>
            </div>

            {(built.dropped > 0 || stats.clampedCount > 0 || stats.singletonCount > 0
              || stats.excludedCount > 0 || stats.purgeStopped
              || (!baselineOn && stats.points.length < BASELINE_MIN_GROUPS)) && (
              <div className={`${c.notice} ${c.warn}`}>
                {stats.excludedCount > 0 && (
                  <span>
                    이탈 {stats.excludedCount}군을 한계 계산에서 제외했습니다 (정제 {stats.purgeIters}회, 계산에 쓴 {stats.usedGroups}군).
                    차트에는 회색 테두리로 그대로 표시됩니다 — <b>원인이 밝혀진 이탈만 제외하는 것이 원칙</b>입니다.
                  </span>
                )}
                {stats.sigmaInflation > SPC_SIGMA_INFLATION_WARN && (
                  <span>
                    소수 부분군이 σ̂ 를 끌어올리고 있습니다 (평균 {fmt(stats.sigmaHat, 4)} vs 중앙값 {fmt(stats.sigmaRobust, 4)}
                    {' = '}{stats.sigmaInflation.toFixed(2)}배). <b>관리한계가 실제 산포보다 넓게 그려집니다</b>
                    {stats.purged ? ' — 정제 후에도 그렇다면 공정 자체를 확인하세요.' : " — '이탈군 제외'를 켜고 다시 보세요."}
                  </span>
                )}
                {stats.purgeStopped && (
                  <span>남는 부분군이 {SPC_PURGE_MIN_KEEP}개 미만이 되어 정제를 중단했습니다 — 이탈이 너무 잦으면 공정 자체를 먼저 봐야 합니다.</span>
                )}
                {!baselineOn && stats.points.length < BASELINE_MIN_GROUPS && (
                  <span>부분군이 {stats.points.length}개입니다 — 관리한계가 안정되려면 {BASELINE_MIN_GROUPS}~25군이 필요합니다 (기간을 넓히거나 부분군 크기를 줄이세요).</span>
                )}
                {built.dropped > 0 && (
                  <span>자투리 {built.dropped}건은 부분군을 못 채워 제외했습니다 (크기가 다른 군은 관리한계가 어긋납니다).</span>
                )}
                {stats.singletonCount > 0 && (
                  <span>n=1 인 부분군 {stats.singletonCount}개는 범위(R)를 정의할 수 없어 R 관리도에서 빠집니다.</span>
                )}
                {stats.clampedCount > 0 && (
                  <span>n&gt;{SPC_N_MAX} 인 부분군 {stats.clampedCount}개는 표준 상수표 범위를 넘어 n={SPC_N_MAX} 값으로 근사했습니다.</span>
                )}
              </div>
            )}
          </Section>

          <div className={c.chartWrap}>
            <div className={c.chartTitle}>
              X̄ 관리도 <small>부분군 평균 — 공정 중심의 이동</small>
            </div>
            <ControlChart points={stats.points} label={`${metric.label} X̄`} unit={metric.unit}
              valueOf={(p) => p.xbar} uclOf={(p) => p.xUcl} lclOf={(p) => p.xLcl}
              clOf={() => stats.grandMean} outOf={(p) => p.xOut} />
            <div className={c.legend}>
              <span className={c.legendItem} style={{ color: 'var(--chart-blue)' }}>
                <i className={c.swatch} /> 부분군 평균
              </span>
              <span className={c.legendItem} style={{ color: 'var(--chart-emerald)' }}>
                <i className={c.swatch} /> 중심선 (CL)
              </span>
              <span className={c.legendItem} style={{ color: 'var(--chart-red)' }}>
                <i className={`${c.swatch} ${c.swatchDash}`} /> 관리한계 (UCL/LCL)
              </span>
              <span className={c.legendItem} style={{ color: 'var(--chart-red)' }}>
                <i className={c.swatchDot} /> 관리한계 이탈
              </span>
              {stats.excludedCount > 0 && (
                <span className={c.legendItem} style={{ color: 'var(--color-text-muted)' }}>
                  <i className={c.swatchRing} /> 한계 계산 제외
                </span>
              )}
            </div>
          </div>

          <div className={c.chartWrap}>
            <div className={c.chartTitle}>
              R 관리도 <small>부분군 범위 — 산포의 변화</small>
            </div>
            <ControlChart points={stats.points} label={`${metric.label} R`} unit={metric.unit}
              valueOf={(p) => p.r} uclOf={(p) => p.rUcl} lclOf={(p) => p.rLcl}
              clOf={(p) => p.rCl} outOf={(p) => p.rOut} />
          </div>

          {outliers.length > 0 && (
            <Section label={`관리한계 이탈 ${outliers.length}군`}>
              <div className={s.tableWrap}>
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
                        <td className={s.muted}>
                          {filters.mode === 'daily'
                            ? p.sub
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
            </Section>
          )}
        </>
      )}
    </div>
  )
}
