// ─────────────────────────────────────────
// RM: 원자재
// ─────────────────────────────────────────
export const RM_STEPS = [
  {
    key: 'vendor',
    label: '어떤 업체의 원자재인가요?',
    options: [
      { label: '독일 VAC', value: 'VA' },
      { label: '중국 시안강', value: 'XY' },
      { label: '포스코', value: 'PO' },
    ],
  },
  {
    key: 'material',
    label: '재료를 선택해 주세요',
    options: [
      { label: 'Co 49% V2%', value: 'CO' },
      { label: '무방향성 강판 (PN계열)', value: 'SI' },
    ],
  },
  { key: 'thickness', label: '재료 두께를 입력해 주세요', options: null, hint: '예: 35 → 0.35T' },
]

// ─────────────────────────────────────────
// RM 입고 종류 — Item 원자재 카테고리 기반 동적 (2026-06-11).
//   하드코딩 RM_KINDS 제거 → BE `getRmKinds` 가 lot_material_code 있는 Item 을 카테고리로 묶어 반환.
//   카테고리(Coil/EW/Plate…) + Item 추가 시 입고 종류에 자동 반영. materials = lot_material_code 목록.
//   자석만 입고 플로우가 달라(상자별 수량) RMPage 내 RM_MAGNET 고정.
//   LOT = {Item.lot_material_code}-{vendor.code}-{attribute}-{date}-{seq} (BE 채번).

// 동선/은선 입력 옵션 — 버튼 선택 + 직접입력 병행
export const WIRE_MATERIALS = [
  { label: '동선 (CU)', value: 'CU' },
  { label: '은선 (AG)', value: 'AG' },
]
export const WIRE_DIAMETERS = ['0.20', '0.50', '0.55', '0.60']   // mm — 자주 쓰는 직경 (직접입력 가능)
export const WIRE_INSULATIONS = ['EIAIW', 'PEW', 'PEW-N', 'EIW', 'AIW', 'PI']  // EIAIW = 동선 기본

// 동선(CU) 기본값 / 은선(AG) 고정값 (2026-06-01)
//   동선: 직경 자유, 절연 default EIAIW
//   은선: 자체제작(DIY) — 직경 0.20 고정, 절연 'DIY' 고정
export const WIRE_DEFAULTS = {
  CU: { diameter: '0.50', insulation: 'EIAIW', lockDiameter: false, lockInsulation: false },
  AG: { diameter: '0.20', insulation: 'DIY',   lockDiameter: true,  lockInsulation: true },
}

// 직경(mm) → LOT 코드 (mm×100, 3자리 zero-pad). '0.50'→'050', '0.2'→'020'. BE 와 동일 규약.
export function wireDiameterToCode(mm) {
  const n = parseFloat(mm)
  if (!isFinite(n) || n <= 0) return ''
  return String(Math.round(n * 100)).padStart(3, '0')
}

// ─────────────────────────────────────────
// MP: 자재준비
// ─────────────────────────────────────────
export const MP_STEPS = [
  {
    key: 'shape',
    label: '어떤 형태로 가공하나요?',
    options: [
      { label: 'ST : 스택', value: 'ST' },
      { label: 'SR : 스트립', value: 'SR' },
    ],
  },
  {
    key: 'vendor',
    label: '가공 설비를 선택해 주세요',
    size: 'sm',
    options: [
      { label: '01 샤링기', value: '01' },
      { label: '02 정철스리팅', value: '02' },
      { label: '03 동양스리팅', value: '03' },
    ],
  },
  { key: 'width', label: '재료 폭을 입력해 주세요', options: null, hint: '예: 020 → 20mm' },
  { key: 'seq', label: '순서', auto: true },
]

// ─────────────────────────────────────────
// EA: 낱장가공
// ─────────────────────────────────────────
export const EA_STEPS = [
  {
    key: 'shape',
    label: '가공 방식을 선택해 주세요',
    options: [
      { label: 'ED 와이어방전', value: 'ED' },
      { label: 'PR 프레스', value: 'PR' },
    ],
  },
  {
    key: 'vendor',
    label: '어떤 설비를 사용하나요?',
    size: 'sm',
    hint: '01~10: 와이어머신 / 61~64: 외주',
    options: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '61', '62', '63', '64'],
  },
  {
    key: 'date',
    label: '작업일',
    auto: true,
    editable: true,
    hint: '탭하여 날짜 변경 (기본 오늘)',
  },
  { key: 'seq', label: '순서', auto: true },
]

// ─────────────────────────────────────────
// HT: 열처리
// ─────────────────────────────────────────
export const HT_STEPS = [
  {
    key: 'vendor',
    label: '열처리 업체 코드를 입력해 주세요',
    options: null,
    hint: '01~30: 협력사 / 31: 자체',
  },
  {
    key: 'position',
    label: '화덕 위치를 선택해 주세요',
    options: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'],
    size: 'sm',
    hint: '화덕 내 자리 번호',
  },
  {
    key: 'date',
    label: '작업일',
    auto: true,
    editable: true,
    hint: '탭하여 날짜 변경 (기본 오늘)',
  },
  { key: 'seq', label: '순서', auto: true },
]

// ─────────────────────────────────────────
// BO: 본딩
// ─────────────────────────────────────────
export const BO_STEPS = [
  {
    key: 'shape',
    label: '본딩 방식을 선택해 주세요',
    options: [
      { label: 'BM EXIA', value: 'BM' },
      { label: 'BA 본딩 자동화', value: 'BA' },
    ],
  },
  {
    key: 'worker',
    label: '작업자 코드를 입력해 주세요',
    options: null,
    hint: '작업자 번호표 참조',
  },
  {
    key: 'date',
    label: '작업일',
    auto: true,
    editable: true,
    hint: '탭하여 날짜 변경 (기본 오늘)',
  },
  { key: 'seq', label: '순서', auto: true },
]

// ─────────────────────────────────────────
// EC: 전착도장
// ─────────────────────────────────────────
export const EC_STEPS = [
  {
    key: 'vendor',
    label: '도장 업체를 선택해 주세요',
    options: [
      { label: '01 주연전착도장', value: '01' },
      { label: '02 선명하이테크', value: '02' },
    ],
  },
  {
    key: 'date',
    label: '입고일',
    auto: true,
    editable: true,
    hint: '탭하여 날짜 변경 (기본 오늘)',
  },
  { key: 'seq', label: '순서', auto: true },
]

// EC 측정 항목 (전착도장 후 코어 높이) — BE core/qc_config.py QC_MEASUREMENT_SPECS 와 동기 (2026-06-22)
// 발급 시 코어(BO LOT)별 입력 → measurements={BO LOT: [{metric,value}]} → QcMeasurement(EAV) 저장.
export const EC_MEASUREMENTS = [
  { metric: 'max_height', label: '최고 높이', unit: 'mm' },
  { metric: 'min_height', label: '최저 높이', unit: 'mm' },
]

// ─────────────────────────────────────────
// WI: 권선
// ─────────────────────────────────────────
export const WI_STEPS = [
  {
    key: 'shape',
    label: '권선 방식을 선택해 주세요',
    options: [
      { label: 'WI 수작업 권선', value: 'WI' },
      { label: 'WM 권선기', value: 'WM' },
    ],
  },
  {
    key: 'worker',
    label: '작업자 코드를 입력해 주세요',
    options: null,
    hint: '작업자 번호표 참조',
  },
  { key: 'date', label: '날짜', auto: true, editable: true, hint: '탭하여 날짜 변경 (기본 오늘)' },
  { key: 'seq', label: '순서', auto: true },
]

// ─────────────────────────────────────────
// SO: 중성점
// ─────────────────────────────────────────
export const SO_STEPS = [
  {
    key: 'shape',
    label: '납땜 방식을 선택해 주세요',
    options: [
      { label: 'SM 납땜(수동)', value: 'SM' },
      { label: 'SA 납땜(자동)', value: 'SA' },
    ],
  },
  {
    key: 'worker',
    label: '작업자 코드를 입력해 주세요',
    options: null,
    hint: '작업자 번호표 참조',
  },
  { key: 'date', label: '날짜', auto: true, editable: true, hint: '탭하여 날짜 변경 (기본 오늘)' },
  { key: 'seq', label: '순서', auto: true },
]

// ─────────────────────────────────────────
// 로터 생산체인 (2026-06-12, Phase 2 — docs/stator-rotor-split-design.md)
//   RM(Plate/PI) → REA(요크가공) → RBO(본딩+자석) → RRT(완성→RT 재고)
//   BE 프로토콜 = selected_process EA/BO/RT + line='rotor' (파라미터 라인 분기 — 라인 추가 시 확장).
//   REA/RBO 는 FE 페이지 라우팅 키일 뿐 (LOT·DB·라벨 어디에도 안 남음). STEPS 는 EA/BO 재사용.
// ─────────────────────────────────────────
// 요크는 프레스 가공 없이 와이어방전(ED) 하나뿐 → 방식(shape) 선택 step 제거,
//   REAPage 가 shape='ED' 고정 주입 (2026-06-15). 나머지(설비/작업일)는 EA 동일.
export const REA_STEPS = EA_STEPS.filter((s) => s.key !== 'shape')
// 요크 본딩 방식은 BM(EXIA) 하나뿐 → 방식 선택 step 제거, RBOPage 가 shape='BM' 고정 주입 (2026-06-15)
export const RBO_STEPS = BO_STEPS.filter((s) => s.key !== 'shape')
// RT(로터완성) 카드 제거 (2026-06-12) — 추후 OQ 가 로터 파라미터를 인식해
//   로터 전용 검사 페이지로 유도 예정이라 별도 진입 카드 불필요 (RRTPage·라우팅 키는 보존).
// display = 카드 이니셜 표기 (회전자 섹션 안이라 R 접두 불필요, 2026-06-13) — key 는 라우팅용 유지
export const ROTOR_PRODUCE_LIST = [
  { key: 'REA', display: 'EA', label: '요크가공', desc: 'Rotor Yoke' },
  { key: 'RBO', display: 'BO', label: '로터본딩', desc: 'Rotor Bonding' },
]

// ─────────────────────────────────────────
// IQ: 수입검사
// ─────────────────────────────────────────
export const IQ_STEPS = [
  {
    key: 'worker',
    label: '검사자 코드를 입력해 주세요',
    options: null,
    hint: '작업자 번호표 참조',
  },
  { key: 'date', label: '검사일', auto: true },
  { key: 'seq', label: '순서', auto: true },
]

// ─────────────────────────────────────────
// OQ: 출하검사
// ─────────────────────────────────────────
export const OQ_STEPS = [
  {
    key: 'worker',
    label: '작업자 코드를 입력해 주세요',
    options: null,
    hint: '작업자 번호표 참조',
  },
  { key: 'date', label: '날짜', auto: true },
  { key: 'seq', label: '순서', auto: true },
]

// ─────────────────────────────────────────
// OB, BX: None
// ─────────────────────────────────────────

// src/constants/processConst.js 하단에 추가

// ─────────────────────────────────────────
// ADMPage 공정 목록
// ─────────────────────────────────────────
// 제작 공정 (RM~SO)
export const PRODUCE_LIST = [
  { key: 'RM', label: '원자재', desc: 'Raw Material' },
  { key: 'MP', label: '자재준비', desc: 'Material Prep' },
  { key: 'EA', label: '낱장가공', desc: 'Each Processing' },
  { key: 'HT', label: '열처리', desc: 'Heat Treatment' },
  { key: 'BO', label: '본딩', desc: 'Bonding' },
  { key: 'EC', label: '전착도장', desc: 'E-Coating' },
  { key: 'WI', label: '권선', desc: 'Winding' },
  { key: 'SO', label: '중성점', desc: 'Star Point' },
]

// ADMPage 섹션 분리 (2026-06-12) — RM 은 고정자/로터 공용 원자재라 '생산' 섹션 단독,
//   MP~SO 는 '고정자', REA/RBO 는 '회전자'(ROTOR_PRODUCE_LIST).
//   재고 대시보드·PROCESS_LIST 는 기존 PRODUCE_LIST(RM~SO 전체)를 그대로 사용.
export const RM_PRODUCE_LIST = PRODUCE_LIST.filter((p) => p.key === 'RM')
export const STATOR_PRODUCE_LIST = PRODUCE_LIST.filter((p) => p.key !== 'RM')

// 검사 공정 (IQ + IPQ + OQ) — 2026-05-31 IPQ 추가
export const INSPECT_LIST = [
  { key: 'IQ',  label: '수입검사', desc: 'Incoming QC' },
  { key: 'IPQ', label: '공정검사', desc: 'In-Process QC' },
  { key: 'OQ',  label: '출하검사', desc: 'Outgoing QC' },
]

// 검사 탭의 보조 도구 — 검사 공정과 함께 표시 (2026-06-04)
//   PROCESS_ETC_LIST 와 동일 패턴 (ADMIN_TO_FEATURE 권한 체크).
export const INSPECT_ETC_LIST = [
  { key: 'QC LIST', label: '품질검사 이력', desc: 'QC History' },
  { key: 'INSPECT LIST', label: 'OQ 검사 목록', desc: 'OQ Inspection List' }, // 2026-06-16 기타 → 검사 섹션 이동
]

// 출하 공정 (UB~OB)
export const SHIPPING_LIST = [
  { key: 'UB', label: '유닛 박스', desc: 'Unit Box' },
  { key: 'MB', label: '마스터\n박스', desc: 'Master Box' },
  { key: 'OB', label: '출하', desc: 'Shipping' },
]

// 전체 공정 목록 (재고 대시보드 — FP는 자동 생성이므로 ADM 선택 대상 아님, 대시보드에만 표시)
export const FP_ITEM = { key: 'FP', label: '완제품', desc: 'Finished Product' }
// IQ/IPQ 는 재고 속성 아님 — 재고 대시보드에서 제외 (검사 기록만 남기는 도메인)
export const PROCESS_LIST = [
  ...PRODUCE_LIST,
  ...INSPECT_LIST.filter((p) => !['IQ', 'IPQ'].includes(p.key)),
  FP_ITEM,
  ...SHIPPING_LIST,
]

// 재공정(수리 되돌리기) 가능한 "문제 공정" — BO/EC/WI/SO (2026-04-23 BO 추가)
// dest(되돌아갈 공정)은 문제 공정의 직전: BO→HT, EC→BO, WI→EC, SO→WI
// RM MP EA 는 소재 단위라 보류, OQ 이후는 출하 공정이라 불가
export const REPAIR_PROCESSES = ['BO', 'EC', 'WI', 'SO']

// 재공정 문제공정 세부 방식 (2026-06-16) — BO/WI/SO 는 LOT prefix(BM/BA · WI/WM · SM/SA)로
//   실제 작업 방식을 구분. 재작업 wizard 에서 원래 LOT prefix 그대로 자동 세분 표시.
//   EC 는 shape(업체 선택)뿐이라 세분 없음 → 그대로 'EC'.
//   value(BM/WM/SM..) → 환원 공정(BO/WI/SO) → dest 계산은 환원 공정 기준.
export const SHAPE_TO_PROCESS = {
  BM: 'BO', BA: 'BO',
  WI: 'WI', WM: 'WI',
  SM: 'SO', SA: 'SO',
}
export const SHAPE_LABEL = {
  BM: 'BM EXIA', BA: 'BA 자동화',
  WI: 'WI 수작업', WM: 'WM 권선기',
  SM: 'SM 수동납땜', SA: 'SA 자동납땜',
}

// ─────────────────────────────────────────
// 모터 타입 → 한글 라벨 (2026-05-02 중앙화)
// ─────────────────────────────────────────
// DB ModelRegistry.motor_type 값과 1:1 매칭. 새 motor_type 추가 시 여기에만 추가.
// ModelRegistry.label 은 "Φ70 내전" 처럼 phi+motor 합본이라, motor 단독 라벨이 필요한 화면(토글 버튼 등)에서 이 맵 사용.
export const MOTOR_LABEL = Object.freeze({
  inner: '내전',
  outer: '외전',
  axial: '축형',
})

// 모터 코드 단축형 — UI 토글에 표기 ("O · 외전", "I · 내전" 같은 prefix)
export const MOTOR_SHORT = Object.freeze({
  inner: 'I',
  outer: 'O',
  axial: 'A',
})

// ─────────────────────────────────────────
// 팀별 허용 카드 (login_id 기반)
// ─────────────────────────────────────────
export const TEAM_ACCESS = {
  team_wire: {
    processes: ['RM', 'MP', 'EA'],
    admin: ['PRINT', 'TRACE'],
  },
  team_winding: {
    // ⚠ 임시 (2026-04-23~): RM/MP/EA 추가 오픈 — 사용자 요청으로 잠깐만 허용
    //   기본 권한은 ['HT', 'BO', 'EC', 'WI', 'SO', 'IQ', 'OQ']
    //   되돌릴 때: 앞 3개 (RM, MP, EA) 제거
    processes: ['RM', 'MP', 'EA', 'HT', 'BO', 'EC', 'WI', 'SO', 'IQ', 'OQ'],
    admin: ['PRINT', 'TRACE', 'MANAGE', 'INSPECT LIST', 'SEED CHAIN'],
  },
}

// 공정 탭의 '기타' 섹션 — 일반 작업자도 자주 쓰는 LOT 도구 (2026-05-02)
//   ADMPage 하단에 1열 리스트로 표시. ADMIN_LIST 와 분리.
export const PROCESS_ETC_LIST = [
  { key: 'PRINT', label: '라벨 출력', desc: 'Print' }, // 2026-06-12 — LOT 입력 / 직접 입력(QR) 통합
  { key: 'TRACE', label: 'LOT 이력조회', desc: 'Lot Trace' },
  // INSPECT LIST: 2026-06-16 기타 → 검사 섹션(INSPECT_ETC_LIST)으로 이동
  // PRINT HISTORY: 2026-06-15 다시 ADMIN_LIST(미배포 기능)로 이동
]

// 부서 분류 (2026-05-20) — AdminPage 를 부서별 섹션으로 그룹핑. 표시 순서도 이 배열 순.
export const ADMIN_DEPTS = ['MES', 'QMS', 'WMS', 'CRM', 'PLM', 'IAM']

// 각 항목 dept: 전산 시스템별 분류 (2026-06-22)
//   MES = 생산 실행 도구, QMS = 품질 검사, WMS = 재고/창고,
//   CRM = 고객/출하, PLM = 제품 마스터, IAM = 인증/권한
export const ADMIN_LIST = [
  { key: 'SEED CHAIN', label: '체인 시딩', desc: 'Seed LOT Chain', dept: 'MES' },
  { key: 'PRINTER', label: '프린터 관리', desc: 'Printer Mgmt', dept: 'MES' },
  { key: 'FACTORY', label: '공장 관리', desc: 'Factory Locations', dept: 'MES' },
  { key: 'PRINT HISTORY', label: '프린트 이력', desc: 'Print History', dept: 'MES' },
  { key: 'ISSUE ERROR', label: 'LOT 채번 오류', desc: 'Issue Error', dept: 'MES' },
  { key: 'EXPORT', label: '출하용 검사 데이터 시트', desc: 'Inspection Sheet', dept: 'QMS' },
  { key: 'QC INSPECT', label: '품질검사 입력', desc: 'QC (IQ/IPQ)', dept: 'QMS' },

  { key: 'QC NONCONFORMING', label: '부적합품 관리', desc: 'Nonconforming', dept: 'QMS' },
  { key: 'INSPECTION SPEC', label: '검사규격 (QC 기준)', desc: 'Inspection Spec', dept: 'QMS' },
  { key: 'BOX CHECK', label: '박스 확인', desc: 'Box Check', dept: 'WMS' },
  { key: 'WAREHOUSE', label: '창고', desc: 'Warehouse', dept: 'WMS' },
  { key: 'STOCK LOCATION', label: '재고 현황', desc: 'Stock Location (통합)', dept: 'WMS' },
  { key: 'STOCK ADMIN', label: '재고 직접 관리', desc: 'Stock Admin (CRUD)', dept: 'WMS' },
  { key: 'INVENTORY SURVEY', label: '재고 실사', desc: 'Physical vs System Diff', dept: 'WMS' },
  { key: 'INVOICE', label: '송장 관리', desc: 'Invoice', dept: 'CRM' },
  { key: 'CERT PREVIEW', label: '인증서 미리보기', desc: 'Cert Preview', dept: 'CRM' },
  { key: 'COMPANIES', label: '업체 관리', desc: 'Company Master', dept: 'CRM' },
  { key: 'BOM', label: '제품 BOM', desc: 'Bill of Materials', dept: 'PLM' },
  { key: 'ITEM', label: '품목 마스터', desc: 'Item Master', dept: 'PLM' },
  { key: 'SUBSTITUTE GROUP', label: '대체품 그룹', desc: 'Substitute Group', dept: 'PLM' },
  { key: 'BOM VIEW', label: 'BOM 조회', desc: 'BOM View (Read-only)', dept: 'PLM' },
  { key: 'MODELS', label: '제품 모델 관리', desc: 'Model Registry', dept: 'PLM' },
  { key: 'PRODUCTION ORDER', label: '생산오더 (PO)', desc: 'Production Order', dept: 'PLM' },
  { key: 'USERS', label: '계정 관리', desc: 'User Mgmt', dept: 'IAM' },
  { key: 'PERMISSIONS', label: '접근 권한 관리', desc: 'Access Control (역할·개인)', dept: 'IAM' },
  { key: 'FEEDBACK', label: '피드백 관리', desc: 'User Feedback', dept: 'IAM' },
  // FINISHED(완제품 재고): Inventory 탭으로 승격 — BottomNav long-press로 접근
  // QC LIST: 2026-06-04 INSPECT_ETC_LIST(검사 탭) 로 이동
  // LINES CHART — MyPage 정보 섹션에서만 접근 (ADM 카드에서 제외)
  // QUALITY DASHBOARD — BottomNav '대시보드' 탭 long-press 팝오버에서 접근 (2026-05-01 이동)
]

// ADM key → URL 경로 매핑 (react-router-dom)
// ADMIN_LIST key는 공백 포함(e.g. 'INSPECT LIST') → URL은 kebab-case
export const ADMIN_ROUTE_MAP = {
  PRINT: '/admin/print',
  TRACE: '/admin/trace',
  MANAGE: '/admin/manage',
  EXPORT: '/admin/export',
  'INSPECT LIST': '/admin/inspect-list',
  'SEED CHAIN': '/admin/seed-chain',
  'BOX CHECK': '/admin/box-check',
  INVOICE: '/admin/invoice',
  PRINTER: '/admin/printer',
  FACTORY: '/admin/factory', // 2026-07-16 — 공장(FactoryLocation) 관리 (ADMIN_PRINTER)
  USERS: '/admin/users',
  PERMISSIONS: '/admin/permissions', // 2026-07-16 — 접근 권한 관리 통합(역할 CRUD+매트릭스+개인) (team_rnd 전용)
  MODELS: '/admin/manage/models', // 2026-04-24 — 제품 모델 레지스트리 (team_rnd 전용)
  'PRINT HISTORY': '/admin/print-history', // 2026-04-24 — 프린트 이력 감사 (general_admin+)
  'QUALITY DASHBOARD': '/admin/dashboard/quality',
  'LINES CHART': '/admin/lines-chart',
  'CERT PREVIEW': '/admin/cert-preview', // 2026-04-29 — 외부 cert 페이지 빠른 진입 (관리자)
  'STOCK ADMIN': '/admin/stock-admin', // 2026-05-01 — 재고 직접 관리 CRUD (team_rnd 전용)
  'WAREHOUSE': '/admin/warehouse', // 2026-06-08 — 자유 입력 단순 재고
  'STOCK LOCATION': '/admin/stock-location', // 2026-06-09 — 통합 재고 현황 (위치/NC 읽기 뷰)
  COMPANIES: '/admin/companies', // 2026-05-02 — 업체 마스터 관리 (team_rnd 전용)
  FEEDBACK: '/admin/feedback', // 2026-05-07 — 사용자 피드백 처리
  BOM: '/admin/bom', // 2026-05-19 — 제품 BOM 다단계 관리 (team_rnd 전용)
  ITEM: '/admin/item', // 2026-05-19 — 품목 마스터 사물 사전 (team_rnd 전용)
  'SUBSTITUTE GROUP': '/admin/substitute-groups', // 2026-05-22 — 대체품 그룹 마스터 (team_rnd 전용)
  'ISSUE ERROR': '/admin/issue-error', // 2026-05-20 — LOT 채번 오류 처리 (admin.manage)
  'INVENTORY SURVEY': '/admin/inventory-survey', // 2026-05-23 — 재고 실사 (현장 vs 전산)
  'BOM VIEW': '/admin/bom-view', // 2026-05-26 — BOM 조회 전용 (전체 로그인 사용자 접근)
  'QC INSPECT':       '/admin/qc-inspect',        // 2026-05-30 — QC 통합 검사 입력 (IQ/IPQ)
  'QC LIST':          '/admin/qc-list',           // 2026-05-30 — QC 검사 이력 조회
  'QC NONCONFORMING': '/admin/qc-nonconforming',  // 2026-05-31 — 부적합품 관리 (폐기/되살리기)
  'INSPECTION SPEC':  '/admin/inspection-spec',   // 2026-07-17 — QC 검사규격 편집 (ModelRegistry QC 병존 이관, Layer E)
  'PRODUCTION ORDER': '/admin/production-order',   // 2026-07-17 — 생산오더 관리 (제품 선택 + BOM 동결, Layer A)
}

// ─────────────────────────────────────────
// 제품 모델 (2026-04-21) — 인보이스 요구 항목 / 진척률 매칭용
// Φ20만 outer/inner 구분, 나머지는 phi에 따라 motor 고정
// BE InvoiceItem (phi + motor_type) 에 직접 매핑
// ─────────────────────────────────────────
export const MODEL_KEYS = [
  { key: '20-outer', label: 'Φ20 외전', phi: '20', motor_type: 'outer' },
  { key: '20-inner', label: 'Φ20 내전', phi: '20', motor_type: 'inner' },
  { key: '45', label: 'Φ45', phi: '45', motor_type: 'inner' },
  { key: '70', label: 'Φ70', phi: '70', motor_type: 'inner' },
  { key: '87', label: 'Φ87', phi: '87', motor_type: 'outer' },
]

// phi+motor → MODEL_KEYS 항목 역조회 (BE 응답 매칭)
export const findModel = (phi, motor_type) =>
  MODEL_KEYS.find((m) => m.phi === phi && m.motor_type === motor_type)

// 송장 접근 권한 — 과거 login_id 기반 INVOICE_ACCESS_LOGIN_IDS/canAccessInvoice 제거 (2026-05-21).
// 현재 /admin/invoice 라우트·메뉴 가드는 RBAC 일원화 — Feature.ADMIN_INVOICE (team_rnd 전권).

// ─────────────────────────────────────────
// 파이 스펙 — 진실의 원천 (BoxManager, BoxSection, SpecListStep, BOPage 등에서 import)
// max: 박스당 최대 투입 수량
// ─────────────────────────────────────────
export const PHI_SPECS = {
  87: { max: 1, label: 'Φ87', color: '#FF69B4' },
  70: { max: 1, label: 'Φ70', color: '#FFB07C' },
  45: { max: 3, label: 'Φ45', color: '#F0D000' },
  20: { max: 5, label: 'Φ20', color: '#77DD77' },
}

// 메타(Meta) 제품 파이 집합 — 실시간 재고현황 "메타만 / 전체" 토글 필터용 (2026-06-17).
//   95 는 87 을 대체 예정 — 전환기라 둘 다 메타로 포함. 신규 메타 파이 추가 시 여기만 갱신.
//   값은 BE phi_dist 키와 동일한 문자열.
export const META_PHIS = ['95', '87', '70', '45', '20']

// OTHER
export const PROCESS_INPUT = {
  RM: { unit_type: '중량', unit: 'kg', preProcess: 'none' },
  MP: { unit_type: '중량', unit: 'kg', preProcess: 'RM' },
  EA: { unit_type: '매수', unit: '매', preProcess: 'MP' },
  HT: { unit_type: '매수', unit: '매', preProcess: 'EA' },
  BO: { unit_type: '개수', unit: '개', preProcess: 'HT' },
  EC: { unit_type: '개수', unit: '개', preProcess: 'BO' },
  WI: { unit_type: '개수', unit: '개', preProcess: 'EC' },
  SO: { unit_type: '개수', unit: '개', preProcess: 'WI' },
  IQ: { unit_type: '개수', unit: '개', preProcess: 'none' },
  OQ: { unit_type: '개수', unit: '개', preProcess: 'SO' },
  FP: { unit_type: '개수', unit: '개', preProcess: 'OQ' },
  UB: { unit_type: '개수', unit: '개', preProcess: 'FP' },
  MB: { unit_type: '개수', unit: '개', preProcess: 'UB' }, // ★ Phase2
  OB: { unit_type: '개수', unit: '개', preProcess: 'MB' }, // ★ UB→MB
}
