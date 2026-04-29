// src/constants/permissions.js
// 권한 체계 (Phase A, 2026-04-22) — BE core/permissions.py 와 동기화 필수
//
// 사용:
//   import { Feature, canAccess } from '@/constants/permissions'
//   if (canAccess(user, Feature.ADMIN_INVOICE)) { ... }
//
// 원칙:
//   - team_rnd 는 단락 평가로 전권
//   - 모르는 role 은 거부 (deny by default)
//   - FE 필터링은 UX 편의 — BE 가드가 진짜 보안

// ─────────────────────────────────────────
// Role
// ─────────────────────────────────────────
export const Role = Object.freeze({
  TEAM_WIRE:     'team_wire',
  TEAM_WINDING:  'team_winding',
  TEAM_QC:       'team_qc',
  TEAM_RND:      'team_rnd',
  GENERAL_ADMIN: 'general_admin',
})

// ─────────────────────────────────────────
// Feature — BE Feature enum 값과 1:1 매칭
// ─────────────────────────────────────────
export const Feature = Object.freeze({
  // 공정 라벨
  PROCESS_RM_MP_EA:  'process.rm_mp_ea',
  PROCESS_HT_SO:     'process.ht_so',
  PROCESS_IQ_OQ:     'process.iq_oq',
  PROCESS_BOX_SHIP:  'process.box_ship',

  // 관리
  ADMIN_PRINT:        'admin.print',
  ADMIN_TRACE:        'admin.trace',
  ADMIN_MANAGE:       'admin.manage',
  ADMIN_SEED_CHAIN:   'admin.seed_chain',
  ADMIN_BOX_CHECK:    'admin.box_check',
  ADMIN_INSPECT_LIST: 'admin.inspect_list',
  ADMIN_EXPORT:       'admin.export',
  ADMIN_INVOICE:      'admin.invoice',
  ADMIN_PRINTER:      'admin.printer',
  ADMIN_USERS:        'admin.users',
  ADMIN_MODEL_REGISTRY: 'admin.model_registry',  // 2026-04-24 — 제품 모델 레지스트리 (team_rnd 전용)
  ADMIN_PRINT_HISTORY:  'admin.print_history',   // 2026-04-24 — 프린트 이력 감사 (general_admin+)
})

// ─────────────────────────────────────────
// Role → Feature 매핑 (BE ROLE_FEATURES 와 동기화)
// team_rnd 는 전권이므로 매핑 불필요 (canAccess 단락)
// ─────────────────────────────────────────
const TEAM_WIRE_FEATURES = new Set([
  Feature.PROCESS_RM_MP_EA,
  Feature.ADMIN_PRINT,
  Feature.ADMIN_TRACE,
])

const TEAM_WINDING_FEATURES = new Set([
  Feature.PROCESS_RM_MP_EA,  // 2026-04-24 — winding 도 RM/MP/EA 라벨 출력 가능
  Feature.PROCESS_HT_SO,
  Feature.PROCESS_IQ_OQ,
  Feature.ADMIN_PRINT,
  Feature.ADMIN_TRACE,
  Feature.ADMIN_MANAGE,
  Feature.ADMIN_SEED_CHAIN,
])

const TEAM_QC_FEATURES = new Set([
  ...TEAM_WINDING_FEATURES,
  Feature.ADMIN_INSPECT_LIST,
])

const GENERAL_ADMIN_FEATURES = new Set([
  Feature.PROCESS_RM_MP_EA,
  Feature.PROCESS_HT_SO,
  Feature.PROCESS_IQ_OQ,
  // PROCESS_BOX_SHIP: 나중에 인수인계 시 활성화
  Feature.ADMIN_PRINT,
  Feature.ADMIN_TRACE,
  Feature.ADMIN_MANAGE,
  Feature.ADMIN_SEED_CHAIN,
  Feature.ADMIN_INSPECT_LIST,
  Feature.ADMIN_PRINT_HISTORY,  // 2026-04-24 — 프린트 이력 감사
  // BOX_CHECK / EXPORT / INVOICE / PRINTER: rnd 전용
])

const ROLE_FEATURES = {
  [Role.TEAM_WIRE]:     TEAM_WIRE_FEATURES,
  [Role.TEAM_WINDING]:  TEAM_WINDING_FEATURES,
  [Role.TEAM_QC]:       TEAM_QC_FEATURES,
  [Role.TEAM_RND]:      null,  // 전권 (null sentinel)
  [Role.GENERAL_ADMIN]: GENERAL_ADMIN_FEATURES,
}

// ─────────────────────────────────────────
// 판정 API
// ─────────────────────────────────────────
export function canAccess(user, feature) {
  if (!user || !user.role) return false
  if (user.role === Role.TEAM_RND) return true  // 단락 — rnd 전권
  const set = ROLE_FEATURES[user.role]
  return set instanceof Set ? set.has(feature) : false
}

export function hasRole(user, ...roles) {
  if (!user || !user.role) return false
  if (user.role === Role.TEAM_RND) return true  // rnd 는 모든 role 취급 통과
  return roles.includes(user.role)
}

// 관리자(rnd/general_admin) 여부 — 레이아웃/네비 분기용
export function isAdmin(user) {
  return user?.role === Role.TEAM_RND || user?.role === Role.GENERAL_ADMIN
}

// ─────────────────────────────────────────
// UI 카드/메뉴 → Feature 매핑 (ADMPage 등에서 필터링)
// ─────────────────────────────────────────

// 공정 카드 (PRODUCE_LIST / INSPECT_LIST / SHIPPING_LIST) key → Feature
export const PROCESS_TO_FEATURE = {
  RM: Feature.PROCESS_RM_MP_EA,
  MP: Feature.PROCESS_RM_MP_EA,
  EA: Feature.PROCESS_RM_MP_EA,
  HT: Feature.PROCESS_HT_SO,
  BO: Feature.PROCESS_HT_SO,
  EC: Feature.PROCESS_HT_SO,
  WI: Feature.PROCESS_HT_SO,
  SO: Feature.PROCESS_HT_SO,
  IQ: Feature.PROCESS_IQ_OQ,
  OQ: Feature.PROCESS_IQ_OQ,
  UB: Feature.PROCESS_BOX_SHIP,
  MB: Feature.PROCESS_BOX_SHIP,
  OB: Feature.PROCESS_BOX_SHIP,
}

// ADMIN_LIST key → Feature
export const ADMIN_TO_FEATURE = {
  PRINT:           Feature.ADMIN_PRINT,
  TRACE:           Feature.ADMIN_TRACE,
  MANAGE:          Feature.ADMIN_MANAGE,
  EXPORT:          Feature.ADMIN_EXPORT,
  'INSPECT LIST':  Feature.ADMIN_INSPECT_LIST,
  'SEED CHAIN':    Feature.ADMIN_SEED_CHAIN,
  'BOX CHECK':     Feature.ADMIN_BOX_CHECK,
  INVOICE:         Feature.ADMIN_INVOICE,
  PRINTER:         Feature.ADMIN_PRINTER,
  USERS:           Feature.ADMIN_USERS,
  MODELS:          Feature.ADMIN_MODEL_REGISTRY,
  'PRINT HISTORY': Feature.ADMIN_PRINT_HISTORY,
  'CERT PREVIEW':  Feature.ADMIN_TRACE,   // cert 미리보기 — 일반 관리자 (TRACE 권한 재사용, 2026-04-29)
}
