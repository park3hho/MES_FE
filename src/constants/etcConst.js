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

  // 원점 (0,0) 포함 — 스프레드시트 회귀와 동일
  const omegas = [0, ...freqs.map((f) => 2 * Math.PI * f)]
  const amplitudes = [0, ...rmsVals] // RMS Voltage = 그대로 amplitude로 사용 (엑셀 기준)
  const p2p = [0, ...peak1Vals.map((p1, i) => (p1 + peak2Vals[i]) / 2)] // P2P = avg(Peak1, Peak2)

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
