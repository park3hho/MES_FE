// ─────────────────────────────────────────
// OQ: InspectionForm 상수
// ─────────────────────────────────────────
export const DIM_KEYS = ['dim_a', 'dim_b', 'dim_c', 'dim_d']
export const DIM_LABELS = ['A', 'B', 'C', 'D']
export const DIM_OPTIONS = ['OK', 'NG', '-']
export const IT_OPTIONS = [125, 250, 500, 1000, 'FAIL']

// ─────────────────────────────────────────
// OQ: 파이별 R/L 기준값 (±5% 벗어나면 경고)
// ─────────────────────────────────────────
export const OQ_SPEC = {
  '87': { r: 0.457704, l: 889.4316, lUnit: 'µH' },
  '70': { r: 0.281282, l: 396.4228, lUnit: 'µH' },
  '45': { r: 0.531183, l: 491.0928, lUnit: 'µH' },
  '20': { r: 3.985748, l: 1.738415, lUnit: 'mH' },
}