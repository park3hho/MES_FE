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
  { key: 'vendor', label: '열처리 업체 코드를 입력해 주세요', options: null, hint: '01~30: 협력사 / 31: 자체' },
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
  { key: 'worker', label: '작업자 코드를 입력해 주세요', options: null, hint: '작업자 번호표 참조' },
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

// ─────────────────────────────────────────
// WI: 권선
// ─────────────────────────────────────────
export const WI_STEPS = [
  { key: 'worker', label: '작업자 코드를 입력해 주세요', options: null, hint: '작업자 번호표 참조' },
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
  { key: 'worker', label: '작업자 코드를 입력해 주세요', options: null, hint: '작업자 번호표 참조' },
  { key: 'date', label: '날짜', auto: true, editable: true, hint: '탭하여 날짜 변경 (기본 오늘)' },
  { key: 'seq', label: '순서', auto: true },
]

// ─────────────────────────────────────────
// IQ: 수입검사
// ─────────────────────────────────────────
export const IQ_STEPS = [
  { key: 'worker', label: '검사자 코드를 입력해 주세요', options: null, hint: '작업자 번호표 참조' },
  { key: 'date', label: '검사일', auto: true },
  { key: 'seq', label: '순서', auto: true },
]

// ─────────────────────────────────────────
// OQ: 출하검사
// ─────────────────────────────────────────
export const OQ_STEPS = [
  { key: 'worker', label: '작업자 코드를 입력해 주세요', options: null, hint: '작업자 번호표 참조' },
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

// 검사 공정 (IQ + OQ)
export const INSPECT_LIST = [
  { key: 'IQ', label: '수입검사', desc: 'Incoming QC' },
  { key: 'OQ', label: '출하검사', desc: 'Outgoing QC' },
]

// 출하 공정 (UB~OB)
export const SHIPPING_LIST = [
  { key: 'UB', label: '유닛 박스', desc: 'Unit Box' },
  { key: 'MB', label: '마스터\n박스', desc: 'Master Box' },
  { key: 'OB', label: '출하', desc: 'Shipping' },
]

// 전체 공정 목록 (재고 대시보드 — FP는 자동 생성이므로 ADM 선택 대상 아님, 대시보드에만 표시)
const FP_ITEM = { key: 'FP', label: '완제품', desc: 'Finished Product' }
// IQ는 재고 속성 아님 — 재고 대시보드에서 제외
export const PROCESS_LIST = [
  ...PRODUCE_LIST,
  ...INSPECT_LIST.filter((p) => p.key !== 'IQ'),
  FP_ITEM,
  ...SHIPPING_LIST,
]

// 재공정(수리 되돌리기) 가능한 dest 공정 — EC/WI/SO만 허용
// RM MP EA HT BO는 낱장/매수 단위라 보류, OQ 이후는 출하 공정이라 불가
export const REPAIR_PROCESSES = ['EC', 'WI', 'SO']

// ─────────────────────────────────────────
// 팀별 허용 카드 (login_id 기반)
// ─────────────────────────────────────────
export const TEAM_ACCESS = {
  team_wire: {
    processes: ['RM', 'MP', 'EA'],
    admin: ['PRINT', 'TRACE'],
  },
  team_winding: {
    processes: ['HT', 'BO', 'EC', 'WI', 'SO', 'IQ', 'OQ'],
    admin: ['PRINT', 'TRACE', 'MANAGE', 'INSPECT LIST', 'SEED CHAIN'],
  },
}

export const ADMIN_LIST = [
  { key: 'PRINT', label: 'LOT 입력', desc: 'Admin Print' },
  { key: 'TRACE', label: 'LOT 이력조회', desc: 'Lot Trace' },
  { key: 'MANAGE', label: '공정 되돌리기', desc: 'Back' },
  { key: 'EXPORT', label: '출하용 검사 데이터 시트', desc: 'Inspection Sheet' },
  { key: 'INSPECT LIST', label: '검사 목록', desc: 'Inspection List' },
  // FINISHED(완제품 재고): Inventory 탭으로 승격 — BottomNav long-press로 접근
  { key: 'SEED CHAIN', label: '체인 시딩', desc: 'Seed LOT Chain' },
  { key: 'BOX CHECK', label: '박스 확인', desc: 'Box Check' },
  // LINES CHART — MyPage 정보 섹션에서만 접근 (ADM 카드에서 제외)
]

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
