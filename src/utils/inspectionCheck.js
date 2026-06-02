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
 * 상한 초과 체크 — refValue 대비 overPct % 초과 시 초과 % (양수) 반환, 통과면 null.
 * overPct 0 이거나 refValue 없으면 검사 비활성 (null 반환).
 * overPct 는 모델별 high_fail_pct (기본 15). 초과는 FAIL 판정 (2026-06-02 재구조화 기준).
 */
export function checkOverLimit(value, refValue, overPct = 15) {
  if (value === null || !refValue || !overPct) return null
  const pct = ((value - refValue) / refValue) * 100
  return pct > overPct ? Math.round(pct * 10) / 10 : null
}

/**
 * 측정값이 모델 기준 범위를 벗어났는지 — OQ 판정 미리보기용 (2026-06-02 재구조화: 상하한 대칭 4단계).
 * BE oq_inspection_service._compute_judgment 의 _below/_above 규칙과 동기 필수.
 *   - 하한: refValue*(1 - lowFailPct/100) 미만 → 이탈
 *   - 상한: refValue*(1 + highFailPct/100) 초과 → 이탈
 * pct 0 또는 refValue 없으면 해당 방향 검사 비활성.
 * R 대칭 재사용 패턴 제거 — R 도 이제 lowFailPct/highFailPct 별도 지정.
 *
 * @returns {boolean} true = 범위 이탈 (FAIL 후보)
 */
export function isOutOfSpec(value, refValue, { lowFailPct = 0, highFailPct = 0 } = {}) {
  if (value == null || !refValue) return false
  const pct = ((value - refValue) / refValue) * 100
  if (lowFailPct && pct < -lowFailPct) return true
  if (highFailPct && pct > highFailPct) return true
  return false
}
