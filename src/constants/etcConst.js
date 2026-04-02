// ─────────────────────────────────────────
// 공통 타이밍 상수
// ─────────────────────────────────────────
export const RESET_ERROR_DELAY = 1500
export const RESET_SUCCESS_DELAY = 1200

// ─────────────────────────────────────────
// OQ: InspectionForm 상수
// ─────────────────────────────────────────
export const DIM_KEYS = ['dim_a', 'dim_b', 'dim_c', 'dim_d']
export const DIM_LABELS = ['Ring', 'Go/No-go', 'Height', 'Pin']
export const DIM_DISABLED = [true, false, true, false]  // A(Ring), C(Height) 측정 불가
export const DIM_OPTIONS = ['OK', 'NG', '-']
export const IT_OPTIONS = [125, 250, 500, 1000, 'FAIL']

// ─────────────────────────────────────────
// OQ: 파이 × 모터타입별 R/L 기준값
// null = 자유값 (기준 없음, 항상 통과)
// 판정: 기준값 대비 -5% 미만이면 FAIL (상한 초과는 허용)
// ─────────────────────────────────────────
export const OQ_SPEC = {
  '87_outer': { r: 0.457704, l: 889.4316, lUnit: 'µH' },
  '87_inner': null,
  '70_outer': null,
  '70_inner': { r: 0.281282, l: 396.4228, lUnit: 'µH' },
  '45_outer': null,
  '45_inner': { r: 0.531183, l: 491.0928, lUnit: 'µH' },
  '20_outer': { r: 1.78,     l: 550,      lUnit: 'mH' },
  '20_inner': { r: 3.985748, l: 1.738415, lUnit: 'mH' },
}