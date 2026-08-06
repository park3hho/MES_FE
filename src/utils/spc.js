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

/**
 * X̄-R 관리도 계산.
 * @param groups buildFixedSubgroups/buildDailySubgroups 의 groups
 * @returns {points, grandMean, sigmaHat, rBar, nSet, clampedCount, outX, outR} · 데이터 부족 시 null
 *
 * points[i] = {label, sub, n, xbar, r, xUcl, xLcl, rCl, rUcl, rLcl, xOut, rOut, clamped}
 *   r 은 n=1 이면 null (범위 정의 불가) — R 차트에서 빠지고 σ̂ 추정에도 안 들어간다.
 */
export function computeXbarR(groups) {
  if (!groups || groups.length < 2) return null

  const base = groups.map((g) => {
    const n = g.values.length
    const r = n >= 2 ? Math.max(...g.values) - Math.min(...g.values) : null
    return { ...g, n, xbar: mean(g.values), r, ...factorsFor(n) }
  })

  // σ̂ — n 이 달라도 비교 가능한 공통 척도로 환산해 평균. n=1 군은 R 이 없어 제외.
  const est = base.filter((p) => p.r !== null).map((p) => p.r / p.d2)
  if (!est.length) return null
  const sigmaHat = mean(est)
  // 전체 개별값의 평균 = n 가중 X̄̄. n 이 일정하면 부분군 평균의 단순평균과 같다.
  const grandMean = mean(base.flatMap((p) => p.values))

  const points = base.map((p) => {
    const half = (3 * sigmaHat) / Math.sqrt(p.n)
    const xUcl = grandMean + half
    const xLcl = grandMean - half
    // R 차트 중심선·한계는 그 부분군의 n 으로 (고정 n 이면 전 구간 상수 = 고전 R̄ 와 동일)
    const rCl = p.d2 * sigmaHat
    const rUcl = (1 + (3 * p.d3) / p.d2) * rCl
    const rLcl = Math.max(0, 1 - (3 * p.d3) / p.d2) * rCl
    return {
      label: p.label, sub: p.sub, n: p.n, values: p.values, rows: p.rows,
      xbar: p.xbar, r: p.r,
      xUcl, xLcl, rCl, rUcl, rLcl,
      xOut: p.xbar > xUcl || p.xbar < xLcl,
      rOut: p.r !== null && (p.r > rUcl || p.r < rLcl),
      clamped: p.clamped,
    }
  })

  const withR = points.filter((p) => p.r !== null)
  return {
    points,
    grandMean,
    sigmaHat,
    rBar: withR.length ? mean(withR.map((p) => p.r)) : 0,
    nSet: [...new Set(points.map((p) => p.n))].sort((a, b) => a - b),
    clampedCount: points.filter((p) => p.clamped).length,
    singletonCount: points.filter((p) => p.n === 1).length,
    outX: points.filter((p) => p.xOut).length,
    outR: points.filter((p) => p.rOut).length,
  }
}
