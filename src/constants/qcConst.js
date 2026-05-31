// constants/qcConst.js
// QC (품질검사) 통합 상수 — BE core/qc_config.py 와 동기 필수 (2026-05-30)
//
// 사용:
//   import { QC_TYPE, PROCESS_CATEGORY, INCOMING_DATE_CATEGORIES } from '@/constants/qcConst'
//
// 동기 검증: scripts/check_enum_sync.py (CI 단계)

// ─────────────────────────────────────────
// 검사 구분 (IQ/IPQ/OQ)
// ─────────────────────────────────────────
export const QC_TYPE = Object.freeze({
  IQ:  'IQ',
  IPQ: 'IPQ',
  OQ:  'OQ',
})

export const QC_TYPE_LABELS = Object.freeze({
  IQ:  '입고',
  IPQ: '공정',
  OQ:  '출하',
})

// ─────────────────────────────────────────
// 공정구분 — 입고일/입고업체 노출 여부 분기
// ─────────────────────────────────────────
export const PROCESS_CATEGORY = Object.freeze({
  OUTSOURCE: '외주',
  RAW:       '원자재',
  PROCESS:   '공정',
})

// 입고일 + 입고업체 노출/필수 카테고리
export const INCOMING_DATE_CATEGORIES = new Set([
  PROCESS_CATEGORY.OUTSOURCE,
  PROCESS_CATEGORY.RAW,
])

// 공정 코드 → 공정구분 자동 매핑 (2026-05-31)
// 정책: RM = 원자재 / EC = 외주 (항상). MP/EA = 가변(사용자 선택).
// 그 외 (HT/BO/WI/SO/OQ/UB/MB/OB) = 공정 (자체).
export const PROCESS_TO_CATEGORY = Object.freeze({
  RM: PROCESS_CATEGORY.RAW,
  EC: PROCESS_CATEGORY.OUTSOURCE,
})
export const PROCESS_VARIABLE_CATEGORY = new Set(['MP', 'EA'])

// 공정 코드 → 카테고리 자동 산출. null = 가변(사용자 선택 필요).
export function defaultProcessCategory(processCode) {
  const code = (processCode || '').trim().toUpperCase()
  if (!code) return null
  if (PROCESS_TO_CATEGORY[code]) return PROCESS_TO_CATEGORY[code]
  if (PROCESS_VARIABLE_CATEGORY.has(code)) return null
  return PROCESS_CATEGORY.PROCESS
}

// ─────────────────────────────────────────
// 제품구분
// ─────────────────────────────────────────
export const PRODUCT_TYPE = Object.freeze({
  RAW:           '원자재',
  SEMI_FINISHED: '반제품',
  FINISHED:      '완제품',
})

// ─────────────────────────────────────────
// 합/부 판정 (QC 2단계 — OQ 5단계와 별개)
// ─────────────────────────────────────────
export const QC_JUDGMENT = Object.freeze({
  OK: 'OK',
  NG: 'NG',
})

export const QC_JUDGMENT_LABELS = Object.freeze({
  OK: '합격',
  NG: '불합격',
})

// JUDGMENT_COLORS(OQ) 와 동일 hex 재사용 — 색 일관성
export const QC_JUDGMENT_COLORS = Object.freeze({
  OK: '#1a9e75',
  NG: '#c0392b',
})

// ─────────────────────────────────────────
// 귀책대상
// ─────────────────────────────────────────
export const RESPONSIBLE = Object.freeze({
  SELF:      '자체',
  SUPPLIER:  '공급업체',
  OUTSOURCE: '외주업체',
})

// ─────────────────────────────────────────
// 처리방법
// ─────────────────────────────────────────
export const HANDLE_METHOD = Object.freeze({
  REWORK:  '재작업',
  ACCEPT:  '특채',
  RETURN:  '반품',
  DISCARD: '폐기',
})

// 재공정 트리거 (공정 되돌리기 화면 이동)
export const HANDLE_METHODS_REPAIR = new Set([HANDLE_METHOD.REWORK])

// 부적합품 처리 트리거 (Inventory.status → 'nonconforming')
export const HANDLE_METHODS_NONCONFORMING = new Set([
  HANDLE_METHOD.DISCARD,
  HANDLE_METHOD.RETURN,
])

// ─────────────────────────────────────────
// 단위
// ─────────────────────────────────────────
export const QC_UNITS_DEFAULT = Object.freeze(['ea', 'kg', 'm'])
