// ─────────────────────────────────────────
// 공통 타이밍 상수
// ─────────────────────────────────────────
export const RESET_ERROR_DELAY = 1500
export const RESET_SUCCESS_DELAY = 1200

// ─────────────────────────────────────────
// OQ 테스트 단계
// ─────────────────────────────────────────
export const TEST_PHASE = {
  NONE: 0,
  TEST1_DONE: 1,
  TEST2_DONE: 2,
  BOTH_DONE: 3,
}

// ─────────────────────────────────────────
// 검사 판정 (judgment) — 중앙화
// ─────────────────────────────────────────
export const JUDGMENT = {
  OK: 'OK',
  FAIL: 'FAIL',
  PENDING: 'PENDING',
  RECHECK: 'RECHECK',
  PROBE: 'PROBE',
}

export const JUDGMENT_LABELS = {
  OK: '합격',
  FAIL: '불합격',
  PENDING: '검사중',
  RECHECK: '재검사',
  PROBE: '조사',
}

// ⚠ variables.css의 --color-judgment-* 토큰과 반드시 동일하게 유지할 것
// JS 런타임에서는 아래 hex를 사용, CSS에서는 var(--color-judgment-*) 참조
// (SSR·early-render 이슈 방지를 위해 getComputedStyle 대신 hex 직접 보관)
export const JUDGMENT_COLORS = {
  OK:      '#1a9e75',  // var(--color-judgment-ok)
  FAIL:    '#c0392b',  // var(--color-judgment-fail)
  PENDING: '#e67e22',  // var(--color-judgment-pending) — 주황: 검사 대기
  RECHECK: '#2e86c1',  // var(--color-judgment-recheck) — 하늘색: 재검사 대기
  PROBE:   '#8e44ad',  // var(--color-judgment-probe) — 보라색: 문제 조사 중
}

export const JUDGMENT_OPTIONS = ['', 'OK', 'FAIL', 'RECHECK', 'PROBE', 'PENDING']

// 검사중 상태 (PENDING + RECHECK) — 재고 대시보드 OQ 셀에 카운트되는 상태
// PROBE는 문제 확실 상태라 제외 (별도 '조사' 카운트로 관리)
export const JUDGMENTS_IN_PROGRESS = ['PENDING', 'RECHECK']

// 판정 순환 클릭 가능 여부 (PENDING → RECHECK → PROBE → FAIL → PENDING)
// OK는 검사 완료 + ST 발급 상태라 수동 편집으로만 변경
export const isToggleable = (j) =>
  j === 'PENDING' || j === 'RECHECK' || j === 'PROBE' || j === 'FAIL'

// ─────────────────────────────────────────
// LOT 되돌리기 / 폐기 사유 분류 (2026-04-27)
// ─────────────────────────────────────────
// DB Inventory.repair_category 컬럼에 저장 — 분기 통계/품질 대시보드용
// code 는 BE 와 동일하게 유지 (변경 시 마이그레이션 필요)
export const REPAIR_CATEGORIES = [
  { code: 'lamination',      label: '적층' },
  { code: 'height_bend',     label: '높이(매수) 휨' },
  { code: 'single_sheet',    label: '낱장' },
  { code: 'deform',          label: '변형' },
  { code: 'drop',            label: '낙하' },
  { code: 'winding_error',   label: '권선 오류' },
  { code: 'electrify',       label: '통전' },
  { code: 'disconnect',      label: '단선' },
  { code: 'line_resistance', label: '선간저항' },
  { code: 'inductance',      label: '인덕턴스 값' },
  { code: 'etc',             label: '기타' },
]

export const REPAIR_CATEGORY_LABEL = Object.fromEntries(
  REPAIR_CATEGORIES.map(({ code, label }) => [code, label])
)

// ─────────────────────────────────────────
// OQ: InspectionForm 상수
// ─────────────────────────────────────────
export const DIM_KEYS = ['dim_a', 'dim_b', 'dim_c', 'dim_d']
export const DIM_LABELS = ['Ring', 'Go/No-go', 'Height', 'Pin']
export const DIM_DISABLED = [false, false, false, false] // 전부 선택 가능 (기본값 "-")
export const DIM_OPTIONS = ['OK', 'NG', '-']
export const IT_OPTIONS = [125, 250, 500, 1000, 'FAIL']

// ─────────────────────────────────────────
// OQ: 파이 × 모터타입별 R/L 기준값
// null = 자유값 (기준 없음, 항상 통과)
// 판정: 기준값 대비 -5% 미만이면 FAIL (상한 초과는 허용)
// ─────────────────────────────────────────
export const OQ_SPEC = {
  '87_outer': { r: 0.457704, l: 889.4316, lUnit: 'µH', polePairs: 17, ktRef: 0.261 },
  '87_inner': null,
  '70_outer': null,
  '70_inner': { r: 0.281282, l: 396.4228, lUnit: 'µH', polePairs: 11, ktRef: 0.146 },
  '45_outer': null,
  '45_inner': { r: 0.531183, l: 491.0928, lUnit: 'µH', polePairs: 10, ktRef: 0.081 },
  '20_outer': { r: 1.78, l: 550, lUnit: 'mH', polePairs: 7, ktRef: 0.0197 },
  '20_inner': { r: 3.985748, l: 1.738415, lUnit: 'mH', polePairs: 7, ktRef: 0.031 },
}

// ─────────────────────────────────────────
// K_T 계산 유틸 (선형회귀 기울기)
// ─────────────────────────────────────────
export function linearSlope(xs, ys) {
  const n = xs.length
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0)
  const sumX2 = xs.reduce((a, x) => a + x * x, 0)
  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
}

export function calcKT(freqs, rmsVals, peak1Vals, peak2Vals, polePairs) {
  if (!polePairs) return { keRms: null, kePeak: null, ktRms: null, ktPeak: null }

  // null/undefined 포인트는 스킵 — P5 1점만 있어도 원점(0,0)+1점으로 기울기 산출 가능
  const validIdx = freqs
    .map((f, i) =>
      f != null && rmsVals[i] != null && peak1Vals[i] != null && peak2Vals[i] != null
        ? i
        : -1,
    )
    .filter((i) => i !== -1)

  if (validIdx.length === 0) {
    return { keRms: null, kePeak: null, ktRms: null, ktPeak: null }
  }

  // 원점 (0,0) 포함 — 스프레드시트 회귀와 동일
  const omegas = [0, ...validIdx.map((i) => 2 * Math.PI * freqs[i])]
  const amplitudes = [0, ...validIdx.map((i) => rmsVals[i] * Math.SQRT2)] // Amplitude(Peak) = RMS × √2
  const p2p = [0, ...validIdx.map((i) => (peak1Vals[i] + peak2Vals[i]) / 2)] // P2P = avg(Peak1, Peak2)

  const keRms = linearSlope(omegas, amplitudes)
  const kePeak = linearSlope(omegas, p2p)
  const ktRms = (Math.sqrt(3) / 2) * polePairs * keRms
  const ktPeak = (Math.sqrt(3) / 2) * polePairs * kePeak

  return {
    keRms: Math.round(keRms * 1e6) / 1e6,
    kePeak: Math.round(kePeak * 1e6) / 1e6,
    ktRms: Math.round(ktRms * 1e6) / 1e6,
    ktPeak: Math.round(ktPeak * 1e6) / 1e6,
  }
}
