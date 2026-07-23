// constants/soConst.js
// 수주(Sales Order) 상수 — BE core/so_config.py 와 동기 필수 (check_enum_sync 대상).
export const SO_TYPES = ['STANDARD', 'BLANKET']
export const SO_TYPE_LABELS = {
  STANDARD: '일반 수주',
  BLANKET: '연간 계약',
}

export const SO_STATUSES = ['DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED']
export const SO_STATUS_LABELS = {
  DRAFT: '작성 중',
  ACTIVE: '발효',
  CLOSED: '종료',
  CANCELLED: '취소',
}
// 전이: DRAFT→ACTIVE / ACTIVE→CLOSED / *→CANCELLED / CLOSED→ACTIVE(재개)
export const SO_STATUS_NEXT = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['CLOSED', 'CANCELLED'],
  CLOSED: ['ACTIVE'],
  CANCELLED: [],
}
