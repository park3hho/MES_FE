// pages/cert/lib/format.js
// 외부 cert 페이지 표시 포맷터 — 영문 (2026-05-08 분리)
//
// 호출처: CertSheetStep, STDataSheet

const _MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

// opts.decimals: 소수점 자리 (default 3)
// opts.intIfLarge: |값| ≥ 100 이면 정수로 표시 (R/L/Insulation 가독성)
export function fmtNum(v, unit = '', opts = {}) {
  if (v == null) return '—'
  const num = typeof v === 'number' ? v : parseFloat(v)
  if (Number.isNaN(num)) return '—'
  const decimals = opts.decimals ?? 3
  const useInt = opts.intIfLarge && Math.abs(num) >= 100
  const formatted = useInt ? Math.round(num).toString() : num.toFixed(decimals)
  return `${formatted}${unit ? ' ' + unit : ''}`
}

// 판정 컬러 (STDataSheet 등에서 사용)
export const JUDG_COLOR = {
  OK: '#27ae60',
  FAIL: '#e74c3c',
  PENDING: '#f39c12',
  RECHECK: '#3498db',
  PROBE: '#9b59b6',
}
