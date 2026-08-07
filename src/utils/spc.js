// utils/spc.js
// X̄-R 관리도(SPC) 계산 — 순수 함수 (2026-08-06). DOM·React 의존 없음.
//
// 왜 A2/D3/D4 표를 그대로 안 쓰고 d2·d3 에서 유도하는가:
//   부분군 크기 n 이 고정이면 교과서 상수표(A2·D3·D4)로 충분하지만, '일자별' 모드는
//   하루 측정 수가 그대로 n 이라 1~75 로 들쭉날쭉하다. n 이 섞이면 R̄ 를 그냥 평균내면 안 된다
//   (E[R] 이 n 에 따라 달라져 서로 다른 척도의 값을 섞는 셈).
//   → 공통 척도인 σ̂ = mean(Rᵢ/d2(nᵢ)) 로 환산해 두고, 관리한계를 부분군마다 그 n 으로 계산한다.
//     n 이 일정하면 이 식은 고전 공식과 **정확히 일치**한다:
//       R̄ = d2·σ̂,  UCL_R = D4·R̄,  UCL_X̄ = X̄̄ + 3σ̂/√n = X̄̄ + A2·R̄
//
// 표준 상수 (KS A ISO 7870 / ASTM STP-15D). n=2~25 까지가 표준 표의 범위.
// ★ 3자리 반올림값(1.128 등)을 쓰면 유도한 D4 가 공표 상수와 어긋난다(n=2 에서 3.269 vs 3.267).
//   5자리 원값으로 둬야 교과서 A2·D3·D4 와 소수 3자리까지 일치한다.
const D2_TABLE = {
  2: 1.12838, 3: 1.69257, 4: 2.05875, 5: 2.32593, 6: 2.53441, 7: 2.70436,
  8: 2.84720, 9: 2.97003, 10: 3.07751, 11: 3.17287, 12: 3.25846, 13: 3.33598,
  14: 3.40676, 15: 3.47193, 16: 3.53198, 17: 3.58788, 18: 3.64006, 19: 3.68896,
  20: 3.73495, 21: 3.77826, 22: 3.81918, 23: 3.85803, 24: 3.89482, 25: 3.93007,
}
const D3_TABLE = {
  2: 0.8525, 3: 0.8884, 4: 0.8798, 5: 0.8641, 6: 0.8480, 7: 0.8332,
  8: 0.8198, 9: 0.8078, 10: 0.7971, 11: 0.7873, 12: 0.7785, 13: 0.7704,
  14: 0.7630, 15: 0.7562, 16: 0.7499, 17: 0.7441, 18: 0.7386, 19: 0.7335,
  20: 0.7287, 21: 0.7242, 22: 0.7199, 23: 0.7159, 24: 0.7121, 25: 0.7084,
}

export const SPC_N_MAX = 25   // 표준 상수표 상한. 초과 부분군은 이 값으로 근사(화면에 표시)

// 측정 항목 — DB 컬럼 ↔ 화면 라벨. 요크 IPQ 실측 5종.
export const SPC_METRICS = [
  { key: 'outer_dia', label: '외경', unit: 'mm' },
  { key: 'outer_roundness', label: '외경 진원도', unit: 'mm' },
  { key: 'inner_dia', label: '내경', unit: 'mm' },
  { key: 'inner_roundness', label: '내경 진원도', unit: 'mm' },
  { key: 'concentricity', label: '동심도', unit: 'mm' },
]

/** n → {d2, d3, clamped}. 표준표 범위를 벗어나면 경계값으로 근사하고 clamped 로 알린다. */
function factorsFor(n) {
  const key = Math.min(Math.max(n, 2), SPC_N_MAX)
  return { d2: D2_TABLE[key], d3: D3_TABLE[key], clamped: n > SPC_N_MAX }
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** 검사행의 날짜 — work_date(YYMMDD 규약) 우선, 없으면 created_at(KST ISO). */
export function rowDate(r) {
  const w = String(r?.work_date || '').trim()
  if (/^\d{6}$/.test(w)) return `20${w.slice(0, 2)}-${w.slice(2, 4)}-${w.slice(4, 6)}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w
  return String(r?.created_at || '').slice(0, 10)
}

/** 측정 시간순 정렬 — 날짜 → 개체 순번 → id. 관리도는 '생산 순서'가 x축이라 정렬이 전제다. */
function inOrder(rows) {
  return [...rows].sort((a, b) => {
    const d = rowDate(a).localeCompare(rowDate(b))
    if (d) return d
    const s = (a.sample_no || 0) - (b.sample_no || 0)
    if (s) return s
    return (a.id || 0) - (b.id || 0)
  })
}

/**
 * 고정 크기 부분군 — 시간순으로 size 개씩 끊는다 (SPC 정석).
 * 자투리(<size)는 버린다: 크기가 다른 군을 섞으면 관리한계가 그 점만 넓어져 오독을 부른다.
 * 반환 [{label, sub, values, rows}] · dropped = 버린 측정 수
 */
export function buildFixedSubgroups(rows, field, size) {
  const vals = inOrder(rows).filter((r) => isNum(r[field]))
  const groups = []
  for (let i = 0; i + size <= vals.length; i += size) {
    const chunk = vals.slice(i, i + size)
    groups.push({
      label: `${groups.length + 1}`,
      sub: `${rowDate(chunk[0]).slice(5)}~${rowDate(chunk[chunk.length - 1]).slice(5)}`,
      values: chunk.map((r) => r[field]),
      rows: chunk,
    })
  }
  return { groups, dropped: vals.length % size, measured: vals.length }
}

/** 일자별 부분군 — 그 날 측정값 전부가 한 군. n 이 날마다 달라진다. */
export function buildDailySubgroups(rows, field) {
  const vals = inOrder(rows).filter((r) => isNum(r[field]))
  const byDate = new Map()
  for (const r of vals) {
    const d = rowDate(r)
    if (!d) continue
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d).push(r)
  }
  const groups = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, rs]) => ({
      label: d.slice(5),
      sub: `n=${rs.length}`,
      values: rs.map((r) => r[field]),
      rows: rs,
    }))
  return { groups, dropped: 0, measured: vals.length }
}

// ── Phase I 정제 상수 ───────────────────────────────────────────
// 이상원인 부분군을 빼고 다시 계산하는 반복 횟수 상한 (보통 2~3회면 수렴).
const PURGE_MAX_ITER = 12
// 정제 후 남는 부분군이 이보다 적어지면 중단 — 한계 자체를 못 믿는다.
//   (교과서 권장은 20~25군. 그 아래로 깎이면 '정제'가 아니라 데이터 파괴)
export const SPC_PURGE_MIN_KEEP = 8

// σ̂(평균) / σ̂(중앙값) 이 이 값을 넘으면 "소수 부분군이 추정을 지배" 로 보고 경고.
//   ★ 실측 기준으로 잡은 값: 정상 공정도 R 분포가 우편향이라 1.05~1.15 는 정상 범위,
//     60군 중 이상값 1군이면 ≈1.34 로 뜬다 → 1.3 이 둘을 가르는 선.
//   ⚠️ 한계: 이상 부분군이 절반쯤 되면 중앙값도 함께 오염돼 비율이 1 에 가까워져 안 걸린다
//     (그 정도면 애초에 관리상태가 아니라 공정 조사 대상).
export const SPC_SIGMA_INFLATION_WARN = 1.3

/** 제외 집합을 뺀 부분군으로 σ̂·X̄̄ 추정. 추정 불가면 null. */
function estimateFrom(base, excluded) {
  const inc = base.filter((_, i) => !excluded.has(i))
  const est = inc.filter((p) => p.r !== null).map((p) => p.r / p.d2)
  if (!est.length) return null
  return {
    sigmaHat: mean(est),
    // 전체 개별값의 평균 = n 가중 X̄̄. n 이 일정하면 부분군 평균의 단순평균과 같다.
    grandMean: mean(inc.flatMap((p) => p.values)),
    usedGroups: inc.length,
  }
}

/** (grandMean, sigmaHat) 로 각 부분군의 관리한계·이탈여부 산출. */
function limitsFor(base, { grandMean, sigmaHat }) {
  return base.map((p) => {
    const half = (3 * sigmaHat) / Math.sqrt(p.n)
    const xUcl = grandMean + half
    const xLcl = grandMean - half
    // R 차트 중심선·한계는 그 부분군의 n 으로 (고정 n 이면 전 구간 상수 = 고전 R̄ 와 동일)
    const rCl = p.d2 * sigmaHat
    const rUcl = (1 + (3 * p.d3) / p.d2) * rCl
    const rLcl = Math.max(0, 1 - (3 * p.d3) / p.d2) * rCl
    return {
      xUcl, xLcl, rCl, rUcl, rLcl,
      xOut: p.xbar > xUcl || p.xbar < xLcl,
      rOut: p.r !== null && (p.r > rUcl || p.r < rLcl),
    }
  })
}

/**
 * X̄-R 관리도 계산.
 * @param groups buildFixedSubgroups/buildDailySubgroups 의 groups
 * @param opts.purge    true = 이탈 부분군을 σ̂·X̄̄ 추정에서 제외하고 재계산 (해석용 Phase I 개정한계)
 * @param opts.baseline {grandMean, sigmaHat} = 고정 기준 (관리용 Phase II). 주면 추정을 안 하고 이 값을 쓴다.
 * @returns {points, grandMean, sigmaHat, rBar, nSet, ...} · 데이터 부족 시 null
 *
 * points[i] = {label, sub, n, xbar, r, xUcl, xLcl, rCl, rUcl, rLcl, xOut, rOut, clamped, excluded}
 *   r 은 n=1 이면 null (범위 정의 불가) — R 차트에서 빠지고 σ̂ 추정에도 안 들어간다.
 *
 * ★ 관리도 정석 (KS A ISO 7870):
 *   해석용(Phase I) = 이상원인 부분군을 걷어내며 한계를 '정제' → 개정한계 확정
 *   관리용(Phase II) = 그 한계를 '동결'하고 새 데이터를 거기에 대고 판정
 *   baseline 을 주면 Phase II 로 동작한다 (purge 는 무시 — 기준은 이미 확정된 값이므로).
 */
export function computeXbarR(groups, opts = {}) {
  if (!groups || groups.length < 2) return null
  const { purge = false, baseline = null } = opts

  const base = groups.map((g) => {
    const n = g.values.length
    const r = n >= 2 ? Math.max(...g.values) - Math.min(...g.values) : null
    return { ...g, n, xbar: mean(g.values), r, ...factorsFor(n) }
  })

  const fixed = baseline
    && Number.isFinite(baseline.grandMean) && Number.isFinite(baseline.sigmaHat)
    && baseline.sigmaHat > 0

  let excluded = new Set()
  let est = fixed
    ? { grandMean: baseline.grandMean, sigmaHat: baseline.sigmaHat, usedGroups: 0 }
    : estimateFrom(base, excluded)
  if (!est) return null

  // 해석용 정제 — 이탈군 제외 → 재추정 반복. 새로 빠지는 군이 없으면 수렴.
  let purgeIters = 0
  let purgeStopped = false          // 남는 군이 너무 적어 중단됐나 (화면에 알림)
  if (!fixed && purge) {
    for (let it = 0; it < PURGE_MAX_ITER; it += 1) {
      const lim = limitsFor(base, est)
      const next = new Set(excluded)
      base.forEach((_, i) => { if (lim[i].xOut || lim[i].rOut) next.add(i) })
      if (next.size === excluded.size) break                 // 수렴
      if (base.length - next.size < SPC_PURGE_MIN_KEEP) { purgeStopped = true; break }
      const e2 = estimateFrom(base, next)
      if (!e2) { purgeStopped = true; break }
      excluded = next
      est = e2
      purgeIters = it + 1
    }
  }

  const lim = limitsFor(base, est)
  const points = base.map((p, i) => ({
    label: p.label, sub: p.sub, n: p.n, values: p.values, rows: p.rows,
    xbar: p.xbar, r: p.r,
    ...lim[i],
    clamped: p.clamped,
    excluded: excluded.has(i),      // 한계 계산에서 뺀 군 (차트엔 그대로 찍되 표시를 다르게)
  }))

  // 강건 추정치 — 중앙값 기반 σ̂. 평균 기반 σ̂ 와 크게 벌어지면 소수 부분군이 추정을 지배한다는 뜻.
  //   ★ 오염이 심하면(이상 부분군이 여럿) σ̂ 가 부풀어 관리한계가 너무 넓어지고, 그 결과
  //     '이탈 0' 으로 보여 정제조차 시작되지 않는다. 이 비율로 그 상태를 감지해 화면에 경고한다.
  const rScaled = base.filter((p) => p.r !== null).map((p) => p.r / p.d2).sort((a, b) => a - b)
  const sigmaRobust = rScaled.length
    ? (rScaled.length % 2
      ? rScaled[(rScaled.length - 1) / 2]
      : (rScaled[rScaled.length / 2 - 1] + rScaled[rScaled.length / 2]) / 2)
    : 0

  // rBar 는 추정에 쓴 군만 (제외군을 넣으면 σ̂ 와 앞뒤가 안 맞는 숫자가 된다)
  const withR = points.filter((p) => p.r !== null && !p.excluded)
  return {
    points,
    grandMean: est.grandMean,
    sigmaHat: est.sigmaHat,
    rBar: withR.length ? mean(withR.map((p) => p.r)) : 0,
    nSet: [...new Set(points.map((p) => p.n))].sort((a, b) => a - b),
    clampedCount: points.filter((p) => p.clamped).length,
    singletonCount: points.filter((p) => p.n === 1).length,
    outX: points.filter((p) => p.xOut).length,
    outR: points.filter((p) => p.rOut).length,
    // 한계의 출처 — 화면이 '해석용/관리용'을 표시하고 경고를 띄우는 근거
    phase: fixed ? 'II' : 'I',
    sigmaRobust,
    // 1 에 가까울수록 건전. 크면 소수 군이 σ̂ 를 끌어올려 한계가 과대 → 신호를 못 잡는 상태.
    sigmaInflation: sigmaRobust > 0 ? est.sigmaHat / sigmaRobust : 1,
    purged: !fixed && purge,
    excludedCount: excluded.size,
    usedGroups: fixed ? 0 : est.usedGroups,
    purgeIters,
    purgeStopped,
  }
}
