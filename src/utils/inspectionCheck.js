// OQ 검사 측정값 vs 기준치 편차 계산 — InspectionForm / Test1Section / KtSection 공유 (2026-05-06)
// 단일 위치에서 정의하여 sigerture drift / silent FAIL detection 차이 방지.

/**
 * 하한 N% 미달 체크 — failPct 초과 미달 시 미달 % (양수) 반환, 통과면 null.
 * failPct 0 이거나 refValue 없으면 검사 비활성 (null 반환).
 *
 * @example
 *   checkDeviation(95, 100, 5)   // null  (-5% 정확히 = 통과)
 *   checkDeviation(94, 100, 5)   // 6     (-6% 미달 = FAIL 후보)
 *   checkDeviation(94, 100, 0)   // null  (검사 비활성)
 */
export function checkDeviation(value, refValue, failPct) {
  if (value === null || !refValue || !failPct) return null
  const pct = ((value - refValue) / refValue) * 100
  return pct < -failPct ? Math.round(Math.abs(pct) * 10) / 10 : null
}

/**
 * 상한 +15% 초과 체크 (의심값 — 측정 실수 가능성) — 고정 임계값.
 * 측정 mistake 감지용이라 모델별 조절 X.
 */
export function checkOverLimit(value, refValue) {
  if (value === null || !refValue) return null
  const pct = ((value - refValue) / refValue) * 100
  return pct > 15 ? Math.round(pct * 10) / 10 : null
}
