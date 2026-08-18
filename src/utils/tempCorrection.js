// utils/tempCorrection.js
// 선간저항 온도 보정 (2026-08-18)
//
// ★ BE core/temp_correction.py 와 **식·상수가 반드시 같아야 한다.**
//   미리보기(FE)와 저장 판정(BE)이 갈리면, 작업자는 화면에서 OK 를 보고 저장했는데
//   기록에는 NG 로 남는 사고가 난다. 한쪽만 고치지 말 것.
//
// 식 (KS C IEC 60034-1): R_ref = R_t × (K + TEMP_REF_C) / (K + t),  구리 K = 234.5

export const COPPER_K = 234.5
export const TEMP_REF_C = 20.0
// 이 범위를 벗어난 값은 센서 이상으로 보고 보정하지 않는다 (전수 오판정 방지).
export const TEMP_MIN_C = 0.0
export const TEMP_MAX_C = 50.0

/** 측정 온도(℃) → 기준온도 환산 계수. 없거나 범위 밖이면 1 (= 보정 없음). */
export function tempFactor(t) {
  if (t === null || t === undefined) return 1
  const n = Number(t)
  if (!Number.isFinite(n)) return 1
  if (n < TEMP_MIN_C || n > TEMP_MAX_C) return 1
  return (COPPER_K + TEMP_REF_C) / (COPPER_K + n)
}

/**
 * 측정 R → 판정·표시용 R.
 *   ① 리드선 저항(rOffset) 차감 — 리드선은 코일이 아니라 온도보정 대상이 아니므로 먼저 뺀다
 *   ② 기준온도 환산
 * 순서를 바꾸면 리드선 저항까지 환산돼 값이 틀어진다.
 */
export function correctR(v, rOffset = 0, factor = 1) {
  if (v === null || v === undefined) return v
  return (Number(v) - (Number(rOffset) || 0)) * factor
}
