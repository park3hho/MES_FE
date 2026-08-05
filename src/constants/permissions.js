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
  TEAM_WIRE: 'team_wire',
  TEAM_WINDING: 'team_winding',
  TEAM_QC: 'team_qc',
  TEAM_RND: 'team_rnd',
  GENERAL_ADMIN: 'general_admin',
  PACKAGING: 'packaging',   // 패키징 전용 — UB/MB 박스 출력만. OB 카드는 ADMPage 에서 숨김 (2026-06-19)
})

// ─────────────────────────────────────────
// Feature — BE Feature enum 값과 1:1 매칭
// ─────────────────────────────────────────
export const Feature = Object.freeze({
  // 공정 라벨
  // 공정 라벨 — 공정 1개 = 권한 1개 (2026-07-31 세분화, BE core/permissions.py 와 동기)
  PROCESS_RM: 'process.rm',               // 원자재 (고정자·회전자 공용)
  PROCESS_MP: 'process.mp',
  PROCESS_EA: 'process.ea',
  PROCESS_HT: 'process.ht',
  PROCESS_BO: 'process.bo',
  PROCESS_EC: 'process.ec',
  PROCESS_WI: 'process.wi',
  PROCESS_SO: 'process.so',
  PROCESS_ROTOR_EA: 'process.rotor_ea',   // REA 요크가공
  PROCESS_ROTOR_BO: 'process.rotor_bo',   // RBO 로터본딩 (2차 본딩 포함)
  PROCESS_ROTOR_RT: 'process.rotor_rt',   // RT 로터완성
  // ⚠️ DEPRECATED — 공정별로 분해됨. BE 가 판정 시 새 키로 펼쳐주므로 여기선 폴백 계산에만 쓰지 말 것.
  PROCESS_RM_MP_EA: 'process.rm_mp_ea',
  PROCESS_HT_SO: 'process.ht_so',
  PROCESS_IQ_OQ: 'process.iq_oq',
  PROCESS_BOX_SHIP: 'process.box_ship',

  // 관리
  ADMIN_PRINT: 'admin.print',
  ADMIN_TRACE: 'admin.trace',
  ADMIN_MANAGE: 'admin.manage',
  ADMIN_SEED_CHAIN: 'admin.seed_chain',
  ADMIN_BOX_CHECK: 'admin.box_check',
  ADMIN_INSPECT_LIST: 'admin.inspect_list',
  ADMIN_EXPORT: 'admin.export',
  ADMIN_INVOICE: 'admin.invoice',
  ADMIN_SALES_ORDER: 'admin.sales_order', // 2026-07-22 — 수주(SO) 관리 (team_rnd 전용)
  ADMIN_NOTIFY: 'admin.notify', // 2026-07-27 — 알림 발송 설정 (team_rnd 전용)
  ADMIN_PRINTER: 'admin.printer',
  ADMIN_USERS: 'admin.users',
  ADMIN_MODEL_REGISTRY: 'admin.model_registry', // 2026-04-24 — 제품 모델 레지스트리 (team_rnd 전용)
  ADMIN_PRINT_HISTORY: 'admin.print_history', // 2026-04-24 — 프린트 이력 감사 (general_admin+)
  ADMIN_STOCK_ADMIN: 'admin.stock_admin', // 2026-05-01 — 재고 직접 관리 CRUD (team_rnd 전용)
  ADMIN_COMPANY: 'admin.company', // 2026-05-02 — 업체 마스터 관리 (team_rnd 전용)
  ADMIN_FEEDBACK: 'admin.feedback', // 2026-05-07 — 사용자 피드백 처리 (rnd + general_admin)
  ADMIN_BOM: 'admin.bom', // 2026-05-19 — 제품 BOM 관리 (team_rnd 전용)
  ADMIN_BOM_VIEW: 'admin.bom_view', // 2026-05-26 — BOM 조회 전용 (전체 로그인 사용자)
  ADMIN_INVENTORY_SURVEY: 'admin.inventory_survey', // 2026-05-23 — 재고 실사 (현장 vs 전산, team_rnd + general_admin)
  ADMIN_PERMISSIONS: 'admin.permissions', // 2026-06-17 — 권한 매트릭스 편집 (team_rnd 전용)
  // 창고(WMS) 신규 화면 (2026-08-05) — 이전엔 카드 매핑이 없어 rnd 외 전원 숨김. BE와 동기.
  ADMIN_STOCK_LOCATION: 'admin.stock_location', // 전체 재고 통합 조회
  ADMIN_WAREHOUSE: 'admin.warehouse',           // 창고(랙·입고·박스) 관리
  ADMIN_WH_SCAN: 'admin.wh_scan',               // 사용/미사용 QR 스캔
  ADMIN_SAFETY_STOCK: 'admin.safety_stock',     // 안전재고 설정
  ADMIN_RBO_ROLLBACK: 'admin.rbo_rollback',     // 본딩 롤백 — 정정 도메인 전용 (생산 게이트와 분리)

  // QC (품질검사) 통합 — IQ/IPQ/OQ 단일 메뉴 (2026-05-30)
  QC_INSPECT: 'qc.inspect', // 검사 입력/수정
  QC_VIEW: 'qc.view',

  // 대시보드 (2026-07-31) — 이전엔 게이트가 없어 로그인만 하면 전부 열람 가능했음
  DASH_INVENTORY: 'dashboard.inventory',   // /inventory/process · /inventory/finished
  DASH_PROGRESS: 'dashboard.progress',     // /inventory/progress
  DASH_QUALITY: 'dashboard.quality',       // /admin/dashboard/quality
  DASH_PRODUCTION: 'dashboard.production', // /admin/dashboard/production
})

// ─────────────────────────────────────────
// Role → Feature 매핑 (BE ROLE_FEATURES 와 동기화)
// team_rnd 는 전권이므로 매핑 불필요 (canAccess 단락)
// ─────────────────────────────────────────
// 공정 세분화(2026-07-31) 이전 묶음과 동일 범위를 유지하는 상수 (BE _FRONT/_BACK_PROCESSES 와 동기)
const FRONT_PROCESSES = [
  Feature.PROCESS_RM, Feature.PROCESS_MP, Feature.PROCESS_EA, Feature.PROCESS_ROTOR_EA,
]
const BACK_PROCESSES = [
  Feature.PROCESS_HT, Feature.PROCESS_BO, Feature.PROCESS_EC,
  Feature.PROCESS_WI, Feature.PROCESS_SO,
  Feature.PROCESS_ROTOR_BO, Feature.PROCESS_ROTOR_RT,
]

// 대시보드 — 세분화 전엔 전원 열람이었으므로 기본값은 전 role 부여(기존 동작 유지).
//   좁히는 건 매트릭스 화면(DB)에서. BE _DASHBOARDS 와 동기.
const DASHBOARDS = [
  Feature.DASH_INVENTORY, Feature.DASH_PROGRESS,
  Feature.DASH_QUALITY, Feature.DASH_PRODUCTION,
]

const TEAM_WIRE_FEATURES = new Set([
  ...FRONT_PROCESSES,
  ...DASHBOARDS,
  Feature.ADMIN_PRINT,
  Feature.ADMIN_TRACE,
  Feature.ADMIN_BOM_VIEW, // 2026-05-26 — BOM 조회 (전체 오픈)
])

const TEAM_WINDING_FEATURES = new Set([
  ...FRONT_PROCESSES, // 2026-04-24 — winding 도 RM/MP/EA 라벨 출력 가능
  ...BACK_PROCESSES,
  ...DASHBOARDS,
  Feature.PROCESS_IQ_OQ,
  Feature.ADMIN_PRINT,
  Feature.ADMIN_TRACE,
  Feature.ADMIN_MANAGE,
  // ADMIN_SEED_CHAIN 제거 (2026-06-05) — rnd 전용
  Feature.ADMIN_BOM_VIEW, // 2026-05-26 — BOM 조회
  Feature.QC_INSPECT, // 2026-06-05 — IQ/IPQ 검사를 winding 팀에서 진행 중
  Feature.QC_VIEW, // 2026-06-05 — 검사 이력 조회
])

// team_qc — winding 전부 + 검사 고유 (2026-06-05). winding 이 하는 건 QC 도 다 할 수 있음.
const TEAM_QC_FEATURES = new Set([
  ...TEAM_WINDING_FEATURES,
  Feature.ADMIN_INSPECT_LIST,
  Feature.ADMIN_PRINT_HISTORY, // 2026-05-18 — QC 가 공정 페이지에서 프린트 이력 조회
  Feature.ADMIN_EXPORT, // 2026-06-09 — OQ 검사 데이터 시트(엑셀) 출력은 QC 고유 업무
])

const GENERAL_ADMIN_FEATURES = new Set([
  ...FRONT_PROCESSES,
  ...BACK_PROCESSES,
  ...DASHBOARDS,
  Feature.PROCESS_IQ_OQ,
  // PROCESS_BOX_SHIP: 나중에 인수인계 시 활성화
  Feature.ADMIN_PRINT,
  Feature.ADMIN_TRACE,
  Feature.ADMIN_MANAGE,
  // ADMIN_SEED_CHAIN 제거 (2026-06-05) — rnd 전용
  Feature.ADMIN_INSPECT_LIST,
  Feature.ADMIN_PRINT_HISTORY, // 2026-04-24 — 프린트 이력 감사
  Feature.ADMIN_FEEDBACK, // 2026-05-07 — 사용자 피드백 처리
  Feature.ADMIN_BOM_VIEW, // 2026-05-26 — BOM 조회 (전체 오픈)
  Feature.QC_INSPECT, // 2026-05-30 — QC 입력 전권
  Feature.QC_VIEW,
  // BOX_CHECK / EXPORT / INVOICE / PRINTER: rnd 전용
])

const ROLE_FEATURES = {
  [Role.TEAM_WIRE]: TEAM_WIRE_FEATURES,
  [Role.TEAM_WINDING]: TEAM_WINDING_FEATURES,
  [Role.TEAM_QC]: TEAM_QC_FEATURES,
  [Role.TEAM_RND]: null, // 전권 (null sentinel)
  [Role.GENERAL_ADMIN]: GENERAL_ADMIN_FEATURES,
}

// ─────────────────────────────────────────
// 판정 API
// ─────────────────────────────────────────
export function canAccess(user, feature) {
  if (!user || !user.role) return false
  // ★ rnd 단락은 반드시 features 분기보다 위. (BE effective_features 가 rnd 에 admin.permissions 까지
  //   내려주므로, 순서 바뀌어도 BE 가 non-rnd 엔 admin.permissions 를 안 줘서 escalation 은 막히나, 순서 유지가 정석)
  if (user.role === Role.TEAM_RND) return true // 단락 — rnd 전권
  // BE 가 내려준 유효 권한(role 기본 + 개인 override) 우선 — Phase 3 (2026-06-17).
  // login/check 응답의 features. 없으면 코드 ROLE_FEATURES 로 폴백(하위호환·안전망).
  if (Array.isArray(user.features)) return user.features.includes(feature)
  const set = ROLE_FEATURES[user.role]
  return set instanceof Set ? set.has(feature) : false
}

export function hasRole(user, ...roles) {
  if (!user || !user.role) return false
  if (user.role === Role.TEAM_RND) return true // rnd 는 모든 role 취급 통과
  return roles.includes(user.role)
}

// 관리자 등급 여부 — 레이아웃/네비 분기용. 동적 역할의 is_admin 플래그 반영 (2026-06-18).
export function isAdmin(user) {
  if (!user) return false
  if (user.role === Role.TEAM_RND) return true        // 전권은 항상 관리자
  if (user.is_admin === true) return true             // BE 제공 동적 is_admin (커스텀 관리자 역할)
  return user.role === Role.GENERAL_ADMIN             // 폴백 — is_admin 미제공 구세션 하위호환
}

// ─────────────────────────────────────────
// UI 카드/메뉴 → Feature 매핑 (ADMPage 등에서 필터링)
// ─────────────────────────────────────────

// 공정 카드 (PRODUCE_LIST / INSPECT_LIST / SHIPPING_LIST) key → Feature
export const PROCESS_TO_FEATURE = {
  // 고정자 — 공정별 개별 권한 (2026-07-31). RM 은 회전자와 공용.
  RM: Feature.PROCESS_RM,
  MP: Feature.PROCESS_MP,
  EA: Feature.PROCESS_EA,
  HT: Feature.PROCESS_HT,
  BO: Feature.PROCESS_BO,
  EC: Feature.PROCESS_EC,
  WI: Feature.PROCESS_WI,
  SO: Feature.PROCESS_SO,
  IQ: Feature.PROCESS_IQ_OQ,
  IPQ: Feature.PROCESS_IQ_OQ, // 2026-05-31 — IQ 와 같은 게이트 (TEAM_WINDING+)
  OQ: Feature.PROCESS_IQ_OQ,
  UB: Feature.PROCESS_BOX_SHIP,
  MB: Feature.PROCESS_BOX_SHIP,
  OB: Feature.PROCESS_BOX_SHIP,
  // 회전자 — 고정자 게이트 재사용을 끝내고 자체 권한으로 분리 (2026-07-31).
  //   이전에는 REA=RM_MP_EA / RBO·RT=HT_SO 라 매트릭스에 회전자 항목이 아예 없었음.
  REA: Feature.PROCESS_ROTOR_EA,
  RBO: Feature.PROCESS_ROTOR_BO,   // 2차 본딩은 RBO 페이지 내부 분기 — 같은 권한
  RT: Feature.PROCESS_ROTOR_RT,
}

// ADMIN_LIST key → Feature
export const ADMIN_TO_FEATURE = {
  PRINT: Feature.ADMIN_PRINT,
  TRACE: Feature.ADMIN_TRACE,
  MANAGE: Feature.ADMIN_MANAGE,
  EXPORT: Feature.ADMIN_EXPORT,
  'INSPECT LIST': Feature.ADMIN_INSPECT_LIST,
  'SEED CHAIN': Feature.ADMIN_SEED_CHAIN,
  'BOX CHECK': Feature.ADMIN_BOX_CHECK,
  INVOICE: Feature.ADMIN_INVOICE,
  'SALES ORDER': Feature.ADMIN_SALES_ORDER, // 2026-07-22 — 수주 관리
  NOTIFICATION: Feature.ADMIN_NOTIFY, // 2026-07-27 — 알림 발송 설정
  PRINTER: Feature.ADMIN_PRINTER,
  FACTORY: Feature.ADMIN_PRINTER, // 2026-07-16 — 공장 관리 (프린터 관리와 동일 게이트)
  USERS: Feature.ADMIN_USERS,
  PERMISSIONS: Feature.ADMIN_PERMISSIONS, // 2026-07-16 — 접근 권한 관리 통합 (team_rnd 전용)
  MODELS: Feature.ADMIN_MODEL_REGISTRY,
  'PRINT HISTORY': Feature.ADMIN_PRINT_HISTORY,
  'CERT PREVIEW': Feature.ADMIN_TRACE, // cert 미리보기 — 일반 관리자 (TRACE 권한 재사용, 2026-04-29)
  'STOCK ADMIN': Feature.ADMIN_STOCK_ADMIN, // 재고 직접 관리 CRUD (team_rnd 전용, 2026-05-01)
  COMPANIES: Feature.ADMIN_COMPANY, // 업체 마스터 관리 (team_rnd 전용, 2026-05-02)
  FEEDBACK: Feature.ADMIN_FEEDBACK, // 사용자 피드백 처리 (rnd + general_admin, 2026-05-07)
  BOM: Feature.ADMIN_BOM, // 제품 BOM 관리 (team_rnd 전용, 2026-05-19)
  ITEM: Feature.ADMIN_BOM, // 품목 마스터 — BOM 과 동일 도메인 (team_rnd 전용, 2026-05-19)
  // 녹 제거 대기 — 요크(REA) 산출물 재고 조작이라 요크가공과 같은 게이트 (2026-08-01)
  'RUST WAIT': Feature.PROCESS_ROTOR_EA,
  'SUBSTITUTE GROUP': Feature.ADMIN_BOM, // 대체품 그룹 — BOM 과 동일 도메인 (team_rnd 전용, 2026-05-22)
  'ISSUE ERROR': Feature.ADMIN_MANAGE, // LOT 채번 오류 처리 — 되돌리기 도메인과 동일 (2026-05-20). undo는 team_rnd (BE 별도 게이트)
  'INVENTORY SURVEY': Feature.ADMIN_INVENTORY_SURVEY, // 2026-05-23 — 재고 실사 (현장 카운트 vs 전산 차이)
  'BOM VIEW': Feature.ADMIN_BOM_VIEW, // 2026-05-26 — BOM 조회 전용 (전체 로그인 사용자, HomePage→AdminPage 이전)
  'QC INSPECT': Feature.QC_INSPECT, // 2026-05-30 — QC 통합 검사 입력 (IQ/IPQ)
  'QUALITY DASH': Feature.DASH_QUALITY, // 2026-08-03 — 품질 현황(주간 리포트) 진입
  'QC LIST': Feature.QC_VIEW, // 2026-05-30 — QC 검사 이력 조회 (deprecated 메뉴)
  'QC NONCONFORMING': Feature.QC_INSPECT, // 2026-05-31 — 부적합품 관리 (폐기/되살리기)
  'INSPECTION SPEC': Feature.ADMIN_MODEL_REGISTRY, // 2026-07-17 — QC 검사규격 편집 (ModelRegistry QC 병존 이관, 동일 편집 권한)
  'PRODUCTION ORDER': Feature.ADMIN_BOM, // 2026-07-17 — 생산오더 (BOM 동결) — BOM/PLM 도메인 동일 게이트
  // 창고(WMS) 카드 매핑 (2026-08-05) — 매핑 부재 = rnd 외 전원 숨김이던 것을 매트릭스 부여 가능하게
  'STOCK LOCATION': Feature.ADMIN_STOCK_LOCATION, // 전체 재고 통합 조회
  WAREHOUSE: Feature.ADMIN_WAREHOUSE, // 창고 관리
  'WH USAGE SCAN': Feature.ADMIN_WH_SCAN, // 사용/미사용 QR 스캔
  'SAFETY STOCK': Feature.ADMIN_SAFETY_STOCK, // 안전재고 설정
  // 본딩 롤백 — 발급 취소·재고 원복 = '정정' 개념이라 생산 게이트(PROCESS_ROTOR_BO) 재사용 금지.
  //   전용 권한 (BE /inventory/rotor/rollback-bo 도 동일 feature 게이트, 2026-08-05)
  'RBO ROLLBACK': Feature.ADMIN_RBO_ROLLBACK,
}
