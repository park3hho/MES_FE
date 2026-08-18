import { emitToast } from '@/contexts/ToastContext'

const BASE_URL = import.meta.env.VITE_API_URL || ''

// ── 401 감지 → 자동 로그아웃 (2026-05-01 v2 강화) ──
//
// 이전 버그 (2026-04-24~04-30):
//   alert 확인 후 window.location.href = '/login' 만 호출 → 일부 환경
//   (PWA Service Worker / BrowserRouter SPA 라우팅 / Vite dev) 에서
//   hard reload 가 안 일어나 useAuth 의 user state 가 stale 하게 남음 → 인증 영역 접근 가능.
//
// 해결: 1) localStorage 정리 후 2) replace + 3) setTimeout reload 안전장치.
//   - replace 가 정상 hard nav 면 페이지 unload → setTimeout 콜백 무시됨
//   - replace 가 SPA history 로 가로채지면 setTimeout 이 강제 reload → React 앱 재마운트 보장
function handle401() {
  // 이미 처리 중이면 즉시 종료 (동시 요청 N개가 각각 401 받아도 alert 1회만)
  if (window.__handling401) return
  // 이미 로그인/공개 페이지에 있으면 alert 띄우지 않음 (재로그인 시도 차단 방지)
  const path = window.location.pathname
  if (path === '/login' || path.startsWith('/cert')) {
    try { localStorage.removeItem('user') } catch { /* */ }
    return
  }
  window.__handling401 = true
  try { localStorage.removeItem('user') } catch { /* */ }
  emitToast('세션이 만료되었습니다. 다시 로그인해주세요.', 'error')
  // 1차: history replace 로 /login 이동 (hard nav 우선 시도)
  try {
    window.location.replace('/login')
  } catch {
    window.location.href = '/login'
  }
  // 2차 안전장치: replace 가 SPA history 로만 처리되어 React 트리가
  // unmount 안 되는 환경 대비 — 50ms 후 강제 hard reload 로 useAuth 초기화 보장.
  // (정상 hard nav 인 경우 페이지가 이미 unload 되어 콜백 무시됨)
  setTimeout(() => {
    try { window.location.reload() } catch { /* */ }
  }, 50)
}

// ── 공통 fetch 래퍼 ──

// FastAPI 422 응답의 detail 은 array of {loc, msg, type} — string 변환 안 하면 [object Object] 표시 (2026-05-01 fix)
function _normalizeDetail(d) {
  if (!d) return null
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    return d
      .map((e) => (typeof e === 'string' ? e : (e?.msg || JSON.stringify(e))))
      .join(', ')
  }
  if (typeof d === 'object') return d.msg || JSON.stringify(d)
  return String(d)
}

// 401/4xx 응답 공통 처리 — 모든 wrapper 가 이걸 통과 (2026-05-09 통합)
async function _handleResponse(res, errorMsg) {
  if (res.status === 401) {
    handle401()
    throw new Error('세션 만료')
  }
  if (!res.ok) {
    let detail = errorMsg || `요청 실패 (${res.status})`
    try {
      const d = await res.json()
      const norm = _normalizeDetail(d.detail)
      if (norm) detail = norm
    } catch {
      /* 응답이 JSON 아님 — errorMsg fallback */
    }
    throw new Error(detail)
  }
}

// fetchJson — JSON 요청 + 응답. options.errorMsg 로 4xx 폴백 메시지 커스터마이즈 가능 (2026-05-09).
async function fetchJson(url, options = {}) {
  const { errorMsg, ...init } = options
  const res = await fetch(url, { credentials: 'include', ...init })
  await _handleResponse(res, errorMsg)
  return res.json()
}

async function postJson(url, body) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function fetchBlob(url, errorMsg = '다운로드 실패') {
  const res = await fetch(url, { credentials: 'include' })
  await _handleResponse(res, errorMsg)
  return res.blob()
}

// fetchMultipart — FormData (파일 업로드) 전용. Content-Type 은 brower 가 boundary 와 함께 자동 설정 (2026-05-09).
async function fetchMultipart(url, formData, errorMsg = '업로드 실패') {
  const res = await fetch(url, { method: 'POST', credentials: 'include', body: formData })
  await _handleResponse(res, errorMsg)
  return res.json()
}

// qs / withQs — URLSearchParams 빌드 일관화. null / undefined / "" 모두 제외 (0, false 는 보존) (2026-05-09).
// 9곳에 흩어져있던 패턴을 한 곳으로 통합.
function qs(obj) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null || v === '') continue
    params.append(k, v)
  }
  return params.toString()
}

function withQs(url, obj) {
  const q = qs(obj)
  return q ? `${url}?${q}` : url
}

// ── 인증 ──

export const login = (id, password) =>
  postJson(`${BASE_URL}/auth/login`, { login_id: id, password })

export const logout = () =>
  fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' })

export async function checkSession() {
  const res = await fetch(`${BASE_URL}/auth/check`, { credentials: 'include' })
  if (!res.ok) return null
  return res.json()
}

// ── QR 스캔 / LOT 이력 ──

export const scanLot = (process, lotNo) =>
  postJson(`${BASE_URL}/lot/${process}/scan`, { lot_no: lotNo })

export const traceLot = (lotNo) => postJson(`${BASE_URL}/lot/trace`, { lot_no: lotNo })

// 공정 일별 작업 묶음 (2026-05-22) — 한 공정 + 작업일(YYMMDD)의 처리 LOT 목록.
// TracePage 의 "같은 날·공정 전체 보기" 유도용. 응답: {process, work_date, items[], count}
export const getDayBatch = (process, workDate) =>
  fetchJson(`${BASE_URL}/printer/day-batch?process=${encodeURIComponent(process)}&work_date=${encodeURIComponent(workDate)}`)

// options:
//   reason       — 자유 입력 사유 (필수, BE 도 검증)
//   category     — REPAIR_CATEGORIES code (통계 분류용)
//   skipEc       — BO 만 재공정 (EC 페이지 거치지 않고 옛 EC 매핑) — dest='HT' 일 때만 의미
//   markOqFail   — chain 의 OQ 검사 결과 자동 FAIL 처리 (FE confirm 후 true 로 보냄)
// discardLot 와 동일한 options 객체 패턴 (2026-05-06 정리).
export const repairLot = (
  lotNo, destProcess,
  {
    reason = '', category = '', skipEc = false, markOqFail = false, problemCode = null,
    defectCategory = '', defectItem = '',   // 불량 2단 분류 (2026-07-13, category 대체)
  } = {},
) =>
  postJson(`${BASE_URL}/lot/repair`, {
    lot_no: lotNo,
    dest_process: destProcess,
    reason,
    category,
    defect_category: defectCategory,
    defect_item: defectItem,
    skip_ec: !!skipEc,
    mark_oq_fail: !!markOqFail,
    problem_code: problemCode,   // 재공정 suffix 세부 코드 (WM/BM/SM..) — 없으면 BE 가 PROCESS_ORDER 기준
  })

// LOT 폐기 — quantity 생략 시 전량 폐기. category: REPAIR_CATEGORIES code (선택)
export const discardLot = (lotNo, { quantity = null, reason = '', category = '' } = {}) =>
  postJson(`${BASE_URL}/lot/discard`, { lot_no: lotNo, quantity, reason, category })


// repairLot + 라벨 2장 자동 출력 — 공정되돌리기의 표준 시퀀스 (2026-06-01).
// LotManagePage(executeRepair) / IPQInspectPage(NG → 재작업) 등 모든 진입점이 이 함수로 통일.
//
//  ① 되돌리기 전 LOT 라벨 (책임추적용 — 직전 작업자/공정 이력 담김)
//  ② 되돌린 후 새 LOT 라벨 (재공정 진행용)
// 둘 다 REPRINT 경로 → DB 비접촉 (snbt/inventory 는 repairLot 가 이미 처리).
//
// 라벨 출력 실패는 throw 하지 않음 — 인쇄 실패해도 repair 자체는 성공 상태로 둠 (호출자가 재출력 가능).
//   대신 onLabelError(msg) 콜백으로 알림 (toast 등). 기본 console.warn.
export async function repairLotWithLabels(
  lotNo,
  destProcess,
  {
    reason = '', category = '', skipEc = false, markOqFail = false, problemCode = null,
    defectCategory = '', defectItem = '',
  } = {},
  { onLabelError = (msg) => console.warn('라벨 출력 실패:', msg) } = {},
) {
  const result = await repairLot(lotNo, destProcess, {
    reason, category, skipEc, markOqFail, problemCode, defectCategory, defectItem,
  })
  if (result?.new_lot_no) {
    try {
      await printLot(lotNo, 1, { selected_process: 'REPRINT' })
    } catch (e) {
      onLabelError(`옛 LOT ${lotNo}: ${e?.message || e}`)
    }
    try {
      await printLot(result.new_lot_no, 1, { selected_process: 'REPRINT' })
    } catch (e) {
      onLabelError(`새 LOT ${result.new_lot_no}: ${e?.message || e}`)
    }
  }
  return result
}

// OQ 검사 시 발견된 phi/motor_type 잘못 입력 정정 — chain 전체 일괄 갱신 (2026-05-08)
// 권한: PROCESS_IQ_OQ. 영향 범위: Inventory + LotEA/HT + snbt PHI + OqInspection.
export const correctLotModel = (lotNo, phi, motorType) =>
  postJson(`${BASE_URL}/lot/correct-model`, {
    lot_no: lotNo, phi: String(phi), motor_type: motorType,
  })

// ─────────────────────────────────────────
// QC 통합 검사 — IQ / IPQ (2026-05-30)
// OQ 단품-측정값은 기존 OQInspection API 사용. 여기는 배치 양품/불량 카운트.
// ─────────────────────────────────────────

// ───────────────────────────────────────
// Warehouse — 자유 입력 단순 재고 (2026-06-08)
// ───────────────────────────────────────
export const listWarehouse = (filters = {}) =>
  fetchJson(withQs(`${BASE_URL}/warehouse/list`, filters))

// 창고 수불대장(입출고/소비 이력) 조회 (2026-07-21) — {item_id,warehouse_id,lot_no,reason,direction,date_from,date_to,limit}
export const listWarehouseLedger = (filters = {}) =>
  fetchJson(withQs(`${BASE_URL}/warehouse/ledger`, filters))

export const getWarehouse = (id) =>
  fetchJson(`${BASE_URL}/warehouse/${id}`)

export const createWarehouse = (body) =>
  postJson(`${BASE_URL}/warehouse/create`, body)

export const updateWarehouse = (id, patch) =>
  fetchJson(`${BASE_URL}/warehouse/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })

// QR 스캔 사용/미사용 전환 (2026-07-29) — 스캔 LOT 조회 + 일괄 설정
export const scanUsageLookup = (lotNo) =>
  fetchJson(`${BASE_URL}/warehouse/scan-usage/${encodeURIComponent(lotNo)}`, { credentials: 'include' })
// 스캔값 → 창고 행 후보 (WH-{id} / lot_no / 품명). 품명 QR 은 중복 가능 → candidates 여러 개일 수 있음
export const scanResolve = (scan) =>
  fetchJson(`${BASE_URL}/warehouse/scan-resolve/${encodeURIComponent(scan)}`, { credentials: 'include' })
// QR 차감 — 소모품 '가져감'(수불대장 manual_out). row_id 는 scan-resolve 로 확정한 행
export const scanConsume = (rowId, qty, worker = '', note = '') =>
  fetchJson(`${BASE_URL}/warehouse/scan-consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ row_id: rowId, qty, worker, note }),
  })

// worker — 공용 단말(MACHINE/SHARED) 계정에서 입력받는 실제 작업자 번호. 사람 계정은 '' (BE 가 계정으로 판별)
export const scanUsageSet = (lotNo, inUse, worker = '') =>
  fetchJson(`${BASE_URL}/warehouse/scan-usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ lot_no: lotNo, in_use: inUse, worker }),
  })

export const deleteWarehouse = (id) =>
  fetchJson(`${BASE_URL}/warehouse/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })

// WarehouseRack — 랙 마스터 (Zone-Aisle-Rack 좌표 + Shelf×Bin 그리드, 2026-06-09)
export const listWarehouseRack = (filters = {}) =>
  fetchJson(withQs(`${BASE_URL}/warehouse/rack/list`, filters))

export const createWarehouseRack = (body) =>
  postJson(`${BASE_URL}/warehouse/rack/create`, body)

export const updateWarehouseRack = (id, patch) =>
  fetchJson(`${BASE_URL}/warehouse/rack/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })

export const deleteWarehouseRack = (id) =>
  fetchJson(`${BASE_URL}/warehouse/rack/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })

// 랙 위치 QR 라벨 출력 (QR = 좌표, 나중에 스캔해 위치 식별/이동)
// shelf: 단 번호 (1..N). 미지정 시 모든 단 일괄 출력 / 지정 시 해당 단 1장만 (2026-06-11).
export const printWarehouseRack = (id, { shelf = null, overridePrinterId = null } = {}) =>
  postJson(`${BASE_URL}/warehouse/rack/${id}/print`, {
    override_printer_id: overridePrinterId,
    shelf,
  })

// 통합 재고 현황 — Warehouse+Inventory+RotorStock union, 위치/NC 읽기 뷰 (2026-06-09)
export const getStockLocation = (filters = {}) =>
  fetchJson(withQs(`${BASE_URL}/inventory/stock-location`, filters))

// 창고 제품 QR 라벨 출력 (QR=lot_no 또는 name, 2026-06-10)
export const printWarehouseItem = (id, overridePrinterId = null) =>
  postJson(`${BASE_URL}/warehouse/${id}/print`, { override_printer_id: overridePrinterId })

// 자석/RM 입고 — Item 검색(로그인만). materials 주면 키워드 없이 해당 RM 품목 미리조회 (2026-06-10)
// limit: 기본 20 은 콤보박스용. 목록형 화면(안전재고 설정 등)은 크게 줘야 뒤가 안 잘림 (2026-07-28)
export const searchWarehouseItems = (q, materials = [], limit = 20) =>
  fetchJson(withQs(`${BASE_URL}/warehouse/item-search`, { q, material: (materials || []).join(','), limit }))
    .then((r) => r.items || [])

export const magnetIncoming = (body) =>
  postJson(`${BASE_URL}/warehouse/magnet/incoming`, body)

// ── 안전재고 (2026-07-28) — 전용 설정 화면. 품목 마스터(ADMIN_BOM) 아닌 창고 권한으로 임계값만 조정 ──
// 감시 대상 전체 + 현재고 ('부족한 것만' 주는 /safety-stock-report 와 다름)
export const getSafetyStockList = () =>
  fetchJson(`${BASE_URL}/warehouse/safety-stock/list`)

// value=null 이면 감시 해제. ⚠️ safety_stock 키는 항상 보낼 것 (BE 가 필수 — 생략과 해제를 구분)
export const setSafetyStock = (itemId, value) =>
  fetchJson(`${BASE_URL}/warehouse/safety-stock/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ safety_stock: value }),
  })

// 묶음(그룹) — 구성 품목 재고 '합계'로 감시. 자석 극성 계열처럼 세트로 쓰는 자재용
export const createSafetyStockGroup = (body) =>
  postJson(`${BASE_URL}/warehouse/safety-stock/group`, body)

export const updateSafetyStockGroup = (groupId, patch) =>
  fetchJson(`${BASE_URL}/warehouse/safety-stock/group/${groupId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })

export const deleteSafetyStockGroup = (groupId) =>
  fetchJson(`${BASE_URL}/warehouse/safety-stock/group/${groupId}`, {
    method: 'DELETE', credentials: 'include',
  })

export const addSafetyStockGroupItems = (groupId, itemIds) =>
  postJson(`${BASE_URL}/warehouse/safety-stock/group/${groupId}/items`, { item_ids: itemIds })

export const removeSafetyStockGroupItem = (groupId, itemId) =>
  fetchJson(`${BASE_URL}/warehouse/safety-stock/group/${groupId}/item/${itemId}`, {
    method: 'DELETE', credentials: 'include',
  })

// WarehouseBox — 재고 박스 (2026-06-08)
export const listWarehouseBox = (filters = {}) =>
  fetchJson(withQs(`${BASE_URL}/warehouse/box/list`, filters))

export const createWarehouseBox = (body) =>
  postJson(`${BASE_URL}/warehouse/box/create`, body)

export const updateWarehouseBox = (id, patch) =>
  fetchJson(`${BASE_URL}/warehouse/box/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })

// 창고 박스 스탁 라벨 출력 (QR = BOX-{id}, NCR 참조 스타일)
export const printWarehouseBox = (id, overridePrinterId = null) =>
  postJson(`${BASE_URL}/warehouse/box/${id}/print`, { override_printer_id: overridePrinterId })

export const deleteWarehouseBox = (id) =>
  fetchJson(`${BASE_URL}/warehouse/box/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })

// BoxContent — 박스 안 내용물 (Warehouse + Inventory + NC polymorphic, 2026-06-09)
export const getBoxContents = (boxId) =>
  fetchJson(`${BASE_URL}/warehouse/box/contents/${boxId}`)

export const placeInBox = (boxId, body) =>
  postJson(`${BASE_URL}/warehouse/box/${boxId}/place`, body)

// QR 스캔 이동 (2026-06-10) — { dest_kind:'box'|'rack', dest_id, target_scan }
export const scanMove = (body) =>
  postJson(`${BASE_URL}/warehouse/scan-move`, body)

export const removeFromBox = (contentId) =>
  fetchJson(`${BASE_URL}/warehouse/box/content/${contentId}`, {
    method: 'DELETE',
    credentials: 'include',
  })


export const createQcInspection = (body) =>
  postJson(`${BASE_URL}/qc/inspection`, body)

export const listQcInspections = (filters = {}) =>
  fetchJson(withQs(`${BASE_URL}/qc/inspection`, filters))

export const getQcInspection = (id) =>
  fetchJson(`${BASE_URL}/qc/inspection/${id}`)

export const patchQcInspection = (id, patch) =>
  fetchJson(`${BASE_URL}/qc/inspection/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

export const deleteQcInspection = (id) =>
  fetchJson(`${BASE_URL}/qc/inspection/${id}`, { method: 'DELETE' })

// FAIL 후속 — 우리 시스템 LOT 만 가능
export const sendQcRepair = (id, reason, category = '') =>
  postJson(`${BASE_URL}/qc/inspection/${id}/send-repair`, { reason, category })

// FAIL 후속 — 우리 시스템 LOT(있으면 Inventory.status=nonconforming 마킹) + 외부 LOT 도 가능
export const markQcNonconforming = (id, reason, category = '') =>
  postJson(`${BASE_URL}/qc/inspection/${id}/mark-nonconforming`, { reason, category })

// ─────────────────────────────────────────
// 부적합품 관리 (2026-05-31) — QC 검사 결과와 분리된 별도 기능
// 격리(nonconforming) 상태 LOT 의 폐기/되살리기.
// ─────────────────────────────────────────
export const listQcNonconforming = () =>
  fetchJson(`${BASE_URL}/qc/nonconforming`)

export const discardQcNonconforming = (lotNo, reason = '') =>
  postJson(`${BASE_URL}/qc/nonconforming/discard`, { lot_no: lotNo, reason })

export const restoreQcNonconforming = (lotNo, reason = '') =>
  postJson(`${BASE_URL}/qc/nonconforming/restore`, { lot_no: lotNo, reason })

// ─────────────────────────────────────────
// NCR (부적합 사건 SSOT, 2026-06-01) — NonConformance 기준
//   createNc  : 직접 등록 (검사 없이 — 작업자발견/반품/손상)
//   listNc    : 부적합품 관리 목록 (LOT 없는 것도 노출)
//   disposeNc : 처분 (조건부출하/용도변경/폐기/반품). 재공정(REWORK)은 검사화면에서.
//   closeNc   : 종결 (DISPOSED → CLOSED)
// ─────────────────────────────────────────
export const createNc = (body) =>
  postJson(`${BASE_URL}/qc/nc`, body)

export const listNc = (filters = {}) =>
  fetchJson(withQs(`${BASE_URL}/qc/nc`, filters))

export const disposeNc = (ncNo, disposition, qty = null, reason = '') =>
  postJson(`${BASE_URL}/qc/nc/${encodeURIComponent(ncNo)}/dispose`, { disposition, qty, reason })

// NCR 정보 보정 (2026-06-02) — 품명/공급업체/수량/불량내용/귀책/비고. 처분·상태·source 불변.
export const updateNc = (ncNo, patch) =>
  fetchJson(`${BASE_URL}/qc/nc/${encodeURIComponent(ncNo)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

export const closeNc = (ncNo) =>
  postJson(`${BASE_URL}/qc/nc/${encodeURIComponent(ncNo)}/close`, {})

// NCR 삭제 (2026-07-15) — 잘못 생성한 부적합 제거. 직접 등록 + 미처분(OPEN)만 허용(BE 검증).
export const deleteNc = (ncNo) =>
  fetchJson(`${BASE_URL}/qc/nc/${encodeURIComponent(ncNo)}`, { method: 'DELETE' })

// 부적합 라벨 출력 (영어 전용 ZPL, QR=nc_no) — 프린터 WebSocket 전송
export const printNcLabel = (ncNo) =>
  postJson(`${BASE_URL}/qc/nc/${encodeURIComponent(ncNo)}/print-label`, {})

// NC 직접 위치 지정 (박스 없이 랙/단/칸, 2026-06-10) — rack_id=null 이면 해제
export const setNcLocation = (ncNo, body) =>
  postJson(`${BASE_URL}/qc/nc/${encodeURIComponent(ncNo)}/location`, body)

// LOT 가 우리 시스템에 있는지 — FAIL 결과 화면의 "재공정" 버튼 노출 분기
export const isQcInternalLot = (lotNo) =>
  fetchJson(`${BASE_URL}/qc/lot/${encodeURIComponent(lotNo)}/is-internal`)

// LOT 메타 조회 — QR 스캔 후 폼 자동채움 (process/phi/motor_type/quantity/received_date + suggested {process_category, product_type, inspection_target})
// 2026-05-31. Inventory 미존재 LOT 는 prefix 로 공정만 추론.
export const getQcLotMeta = (lotNo) =>
  fetchJson(`${BASE_URL}/qc/lot/${encodeURIComponent(lotNo)}/meta`)

// 엑셀 export — QC_Record_Template 양식에 검사 행 채워서 blob 반환 (2026-05-30)
export const downloadQcXlsx = (filters = {}) => {
  const q = qs(filters)
  return fetchBlob(`${BASE_URL}/qc/export${q ? '?' + q : ''}`, 'QC 엑셀 다운로드 실패')
}

// 백그라운드 export + 진척률 polling (2026-06-04) — 큰 데이터 대응
export const startQcXlsxJob = (filters = {}) => {
  const q = qs(filters)
  return fetchJson(`${BASE_URL}/qc/export-async${q ? '?' + q : ''}`, { method: 'POST' })
}
export const getQcXlsxProgress = (jobId) =>
  fetchJson(`${BASE_URL}/qc/export-progress/${jobId}`)
export const downloadQcXlsxResult = (jobId) =>
  fetchBlob(`${BASE_URL}/qc/export-download/${jobId}`, 'QC 엑셀 다운로드 실패')

// 출하 시트 export 헤더 설정 (2026-05-08) — 단일 행 (id=1)
// "전체 다운로드" / OB 메타 미설정 fallback 용
export const getExportConfig = () =>
  fetchJson(`${BASE_URL}/export/config`).then((r) => r.config || null)

// patch: { ship_date?: 'YYYY-MM-DD' | null, invoice_no?: string }
export const updateExportConfig = (patch) =>
  fetchJson(`${BASE_URL}/export/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => r.config)

// OB 별 출하 시트 헤더 메타 (2026-05-08) — 각 OB 마다 다른 ship_date / invoice_no fix
export const listObExportMeta = () =>
  fetchJson(`${BASE_URL}/export/ob-meta`).then((r) => r.items || [])

export const getObExportMeta = (obLotNo) =>
  fetchJson(`${BASE_URL}/export/ob-meta/${encodeURIComponent(obLotNo)}`)
    .then((r) => r.meta || null)

// patch: { ship_date?: 'YYYY-MM-DD' | null, invoice_no?: string }
export const putObExportMeta = (obLotNo, patch) =>
  fetchJson(`${BASE_URL}/export/ob-meta/${encodeURIComponent(obLotNo)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => r.meta)

// 본인 프린트 이력 조회 — 최근 3일, 최대 500건 (2026-04-22)
// BE 세션 machine_id 자동 매핑 — 요청 파람 불필요
export const getMyPrintHistory = () => fetchJson(`${BASE_URL}/printer/history/me`)

// 전체 프린트 이력 감사 (general_admin+, 최근 30일, 2026-04-24)
// filters: { days?, process?, login_id?, search?, page?, page_size? }
export const getAllPrintHistory = (filters = {}) =>
  fetchJson(withQs(`${BASE_URL}/printer/history`, filters))

// 프린트 이력 상세 — LOT 메타 / 재료 체인 / 현재 상태 / 공정별 특화
export const getPrintHistoryDetail = (printLogId) =>
  fetchJson(`${BASE_URL}/printer/history/detail/${printLogId}`)

// 프린트 이력 엑셀 다운로드 — page / page_size 는 export 와 무관, 제외
export const downloadPrintHistoryExcel = (filters = {}) => {
  const { page: _p, page_size: _ps, ...rest } = filters
  return fetchBlob(withQs(`${BASE_URL}/printer/history/export`, rest), '엑셀 생성 실패')
}

// 재출력 — 기존 LOT의 라벨만 ZPL 재전송 (PrintLog X, 새 LOT X, DB 비접촉)
export const reprintLabel = (lotNum) => postJson(`${BASE_URL}/printer/reprint`, { lot_num: lotNum })

// OQ 검사 이력 라벨 출력 — 텍스트=OQ, QR=SO (2026-04-24)
export const printOqFromInspection = (lotOqNo, lotSoNo, line = 'stator') =>
  postJson(`${BASE_URL}/printer/print-oq-from-inspection`, {
    lot_oq_no: lotOqNo,
    lot_so_no: lotSoNo,
    line,
  })

// 최종 출하 시리얼 스티커 개별 재출력 (ST/RT serial) — 2026-06-16
export const printFinalLabel = (lotNo) =>
  postJson(`${BASE_URL}/printer/print-final-label`, { lot_no: lotNo })

// UB 박스 cert 라벨 출력 — QR = cert 페이지 URL (2026-04-29)
// 출하 후에만 가능 (FinLot.access_pw 발급 필요). 출하 전이면 BE 400 반환.
// 응답: { status, ub_lot_no, mb_lot_no, cert_url }
export const printCertUbLabel = (ubLotNo) =>
  postJson(`${BASE_URL}/printer/print-cert-ub`, { ub_lot_no: ubLotNo })

// ── 업체 마스터 (Company) — team_rnd 전용 (2026-05-02) ─────────────
// roles 다중: ['supplier','customer','outsourcer','partner','internal','logistics']
// category 단일: raw_material/machining/heat_treatment/coating/wiring/logistics/other
export const getCompanyMeta = () =>
  fetchJson(`${BASE_URL}/companies/meta`)

export const getCompanies = (activeOnly = true) =>
  fetchJson(`${BASE_URL}/companies?active_only=${activeOnly}`)

export const getCompany = (id) =>
  fetchJson(`${BASE_URL}/companies/${id}`)

export const suggestCompanyCode = (name) =>
  postJson(`${BASE_URL}/companies/suggest-code`, { name })

export const createCompany = (data) =>
  postJson(`${BASE_URL}/companies`, data)

// 2026-05-09 — fetchJson({errorMsg}) 위임. 401 자동 처리, 보일러 -8줄 × 6 = -48줄
export const updateCompany = (id, data) =>
  fetchJson(`${BASE_URL}/companies/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    errorMsg: '업체 수정 실패',
  })

export const deleteCompany = (id) =>
  fetchJson(`${BASE_URL}/companies/${id}`, { method: 'DELETE', errorMsg: '업체 비활성화 실패' })

export const hardDeleteCompany = (id) =>
  fetchJson(`${BASE_URL}/companies/${id}/hard`, { method: 'DELETE', errorMsg: '업체 완전 삭제 실패' })

// 사업자등록증 업로드 (multipart/form-data) — pdf/png/jpg, 최대 10MB
export const uploadCompanyCert = (id, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return fetchMultipart(`${BASE_URL}/companies/${id}/cert`, fd, '사업자등록증 업로드 실패')
}

// 사업자등록증 presigned URL — inline=true 면 미리보기, false 면 다운로드 attachment
export const getCompanyCertUrl = (id, inline = true) =>
  fetchJson(`${BASE_URL}/companies/${id}/cert?inline=${inline}`)

export const deleteCompanyCert = (id) =>
  fetchJson(`${BASE_URL}/companies/${id}/cert`, { method: 'DELETE', errorMsg: '사업자등록증 제거 실패' })

// ── 제품 BOM (Bill of Materials) — team_rnd 전용, 다단계 트리 (2026-05-19) ─────
// 헤더 + 구성 라인(items, child_bom 재귀) + 개정 이력(revisions). 순환참조는 BE 가 409 차단.
// 2026-05-20: bom_type 필터 추가 (EBOM/MBOM/SBOM)
export const getBoms = (activeOnly = true, q = '', bomType = '') => {
  const qs = new URLSearchParams({ active_only: String(activeOnly) })
  if (q) qs.set('q', q)
  if (bomType) qs.set('bom_type', bomType)
  return fetchJson(`${BASE_URL}/bom?${qs.toString()}`).then((r) => r.boms || [])
}

export const getBom = (id) =>
  fetchJson(`${BASE_URL}/bom/${id}`).then((r) => r.bom)

// 재귀 전개 — LVL 트리 + 금액 합산 (visited 가드 + 깊이 상한 by BE)
export const getBomTree = (id) =>
  fetchJson(`${BASE_URL}/bom/${id}/tree`).then((r) => r.bom)

export const createBom = (data) =>
  postJson(`${BASE_URL}/bom`, data).then((r) => r.bom)

// PLM Phase 2 (2026-05-20) — EBOM 파생 + 확정/회수
export const deriveBom = (ebomId, targetType) =>
  postJson(`${BASE_URL}/bom/${ebomId}/derive?target_type=${targetType}`, {}).then((r) => r.bom)
export const releaseBom = (id) =>
  postJson(`${BASE_URL}/bom/${id}/release`, {}).then((r) => r.bom)
export const unreleaseBom = (id) =>
  postJson(`${BASE_URL}/bom/${id}/unrelease`, {}).then((r) => r.bom)
// Phase 4 (2026-05-20) — STALE 파생 BOM 을 출처 EBOM 과 3-way merge resync
export const resyncBom = (id) =>
  postJson(`${BASE_URL}/bom/${id}/resync`, {}).then((r) => r.bom)

// Resync 미리보기 (2026-05-21) — DB 변경 없이 diff 만 조회.
// 동기화 누르기 전에 "뭐가 어떻게 바뀌나" 사용자 확인용.
export const getBomResyncPreview = (id) =>
  fetchJson(`${BASE_URL}/bom/${id}/resync/preview`).then((r) => r.preview)

// Phase 종결 (EOD/EOM/EOS — 2026-05-21)
export const closeBom = (id, reason) =>
  postJson(`${BASE_URL}/bom/${id}/close`, { reason }).then((r) => r.bom)
export const reopenBom = (id) =>
  postJson(`${BASE_URL}/bom/${id}/reopen`, {}).then((r) => r.bom)

export const updateBom = (id, data) =>
  fetchJson(`${BASE_URL}/bom/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    errorMsg: 'BOM 수정 실패',
  }).then((r) => r.bom)

export const deleteBom = (id) =>
  fetchJson(`${BASE_URL}/bom/${id}`, { method: 'DELETE', errorMsg: 'BOM 비활성화 실패' })

export const hardDeleteBom = (id) =>
  fetchJson(`${BASE_URL}/bom/${id}/hard`, { method: 'DELETE', errorMsg: 'BOM 완전 삭제 실패' })

// auto PATCH 전파 이력 (레이지 — 이력 볼 때만, event_id 로 묶임)
export const getBomVersionLog = (id) =>
  fetchJson(`${BASE_URL}/bom/${id}/version-log`).then((r) => r.logs || [])

// 사용자 정식 개정 — MAJOR +1, PATCH=0 (조상은 자식변경으로 patch 전파)
export const bumpBomMajor = (id) =>
  postJson(`${BASE_URL}/bom/${id}/bump-major`, {})

// ── 대체품 그룹 (Substitute Group) — 재사용 마스터 (2026-05-22) ────────────
// 서로 대체 가능한 부품 묶음. BomItem.substitute_group 이 참조 — 그룹 수정 시
// 그 그룹을 쓰는 모든 BOM 에 즉시 반영(live).
export const getSubstituteGroups = (activeOnly = true, q = '') => {
  const qs = new URLSearchParams({ active_only: String(activeOnly) })
  if (q) qs.set('q', q)
  return fetchJson(`${BASE_URL}/substitute-groups?${qs.toString()}`).then((r) => r.groups || [])
}

export const getSubstituteGroup = (id) =>
  fetchJson(`${BASE_URL}/substitute-groups/${id}`).then((r) => r.group)

export const createSubstituteGroup = (data) =>
  postJson(`${BASE_URL}/substitute-groups`, data).then((r) => r.group)

export const updateSubstituteGroup = (id, data) =>
  fetchJson(`${BASE_URL}/substitute-groups/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    errorMsg: '대체품 그룹 수정 실패',
  }).then((r) => r.group)

export const deleteSubstituteGroup = (id) =>
  fetchJson(`${BASE_URL}/substitute-groups/${id}`, {
    method: 'DELETE', errorMsg: '대체품 그룹 삭제 실패',
  })

// ── LOT 채번 오류 처리 (라벨 오발급 soft 삭제, 2026-05-20) ─────────────────
// 폐기(lot_discard)와 분리: 폐기=실물 있음, 채번오류=실물 없음/라벨만 잘못.
// 시퀀스에 영향 없음 (마킹 행도 채번 카운트에 포함).
export const previewIssueError = (process, lotNo) =>
  postJson(`${BASE_URL}/lot/issue-error/preview`, { process, lot_no: lotNo })
    .then((r) => r.preview)

export const markIssueError = (process, lotNo, reason) =>
  postJson(`${BASE_URL}/lot/issue-error`, { process, lot_no: lotNo, reason })

// undo 는 team_rnd 만 (BE 403)
export const undoIssueError = (process, lotNo) =>
  postJson(`${BASE_URL}/lot/issue-error/undo`, { process, lot_no: lotNo })

export const listIssueErrors = (limit = 100) =>
  fetchJson(`${BASE_URL}/lot/issue-error?limit=${limit}`).then((r) => r.items || [])

// 상위 Inventory 복원 (consumed→in_stock) — 예민한 동작이라 preview 분리.
// 가드: 다운스트림 LOT이 채번오류 처리됨 + 상위 Inventory.status='consumed'.
export const previewRestoreUpstream = (process, lotNo) =>
  postJson(`${BASE_URL}/lot/issue-error/restore-upstream/preview`,
    { process, lot_no: lotNo }).then((r) => r.preview)

export const restoreUpstreamInventory = (process, lotNo) =>
  postJson(`${BASE_URL}/lot/issue-error/restore-upstream`,
    { process, lot_no: lotNo })

// ── 품목 마스터 (사물 사전) — team_rnd 전용, BOM 이 참조 (2026-05-19) ─────
// RM 입고 종류 동적 조회 — 원자재 Item 카테고리 기반 (RM_KINDS 하드코딩 대체, 2026-06-11)
export const getRmKinds = () =>
  fetchJson(`${BASE_URL}/item/rm-kinds`).then((r) => r.kinds || [])

export const getItems = (activeOnly = true, q = '', categoryId = '', finishedOnly = false) =>
  fetchJson(`${BASE_URL}/item?active_only=${activeOnly}${q ? `&q=${encodeURIComponent(q)}` : ''}${categoryId ? `&category_id=${categoryId}` : ''}${finishedOnly ? '&finished_only=true' : ''}`)
    .then((r) => r.items || [])

export const getItem = (id) =>
  fetchJson(`${BASE_URL}/item/${id}`).then((r) => r.item)

// 요크/회전자 Item 목록 (생산 REA/BO 제품 선택용) — kind=yoke|rotor (2026-07-16)
export const getRotorLineItems = (kind) =>
  fetchJson(`${BASE_URL}/item/rotor-line-items?kind=${kind}`).then((r) => r.items || [])

// RBO 자석 사전점검 (2026-07-20) — 소비 전 개봉재고/수량/사양 확인(차감 없음).
//   {phi, motor_type, rotor_item_id?, po_id?} → {ok, via, total_need, lines[], blockers[], note?}
export const magnetPreflight = (body) =>
  postJson(`${BASE_URL}/inventory/rotor/magnet-preflight`, body)

// REA — 선택한 PO 의 동결 요크 구성품(+대체 버전) 목록. 요크 선택을 PO 기준 스코프 (2026-07-28)
export const getPoYokes = (poId) =>
  fetchJson(`${BASE_URL}/inventory/rotor/po-yokes?po_id=${poId}`).then((r) => r.yokes || [])

// RBO 요크 스캔 사전 검증 (2026-07-22) — 스캔 시점에 존재·소진·BOM 게이트 검사. 무효면 4xx throw → 스캔 거부.
//   {lot_no, rotor_item_id?, po_id?} → {ok, phi, motor_type} | throw
export const checkYoke = (body) =>
  postJson(`${BASE_URL}/inventory/rotor/yoke-check`, body)

// 2차 본딩 기록 (2026-07-30) — 1차 BO 에 2차 정보 추가(새 LOT·라벨 없음). 이미 2차면 409 → 스캔 거부.
//   {lot_bo_no, worker, date} → {lot_bo_no, phi, motor_type, bo2_worker, bo2_date} | throw
export const rotorBond2 = (body) =>
  postJson(`${BASE_URL}/inventory/rotor/bond2`, body)
// 2차 본딩 일괄 (2026-08-14) — 스캔 목록 전체가 '한 번의 작업'.
//   ★ LOT 마다 개별 호출하면 같은 작업시간이 N행에 복제돼 가동시간이 N배가 된다. 반드시 일괄로.
export const rotorBond2Bulk = (body) =>
  postJson(`${BASE_URL}/inventory/rotor/bond2-bulk`, body)

// 2차 본딩 스캔 사전 검증 (2026-08-04) — 스캔 시점에 존재·이미 2차완료 검사. {lot_bo_no} → {ok, reason, ...}.
//   ok=false 면 목록에 안 담음(잘못된/이미 처리된 BO 누적 방지).
export const checkBond2 = (body) =>
  postJson(`${BASE_URL}/inventory/rotor/bond2-check`, body)

// 회전자 요크(EA) 폐기 (2026-07-22) — 자석 붙인 채 폐기 시 N/S/AZ 소모분을 창고에서 함께 차감.
//   {lot_no, reason, category?, magnets:{N,S,AZ}} → {lot_no, discarded, phi, magnets, reason} (자석 부족 시 422)
export const discardRotorYoke = (body) =>
  postJson(`${BASE_URL}/inventory/rotor/discard-yoke`, body)

// 폐기 스캔 LOT 판별 (2026-08-05, 갱신 2026-08-11) — BO(본딩품) / 요크(EA,무자석) / 전량본딩(bonded_ea) 라우팅.
//   → {route:'bo'|'yoke'|'bonded_ea', bo_lot?, lot_ea_no, phi, motor_type, bo2_done?, has_stock, bonded_hist}
export const classifyRotorDiscard = (lot) =>
  fetchJson(`${BASE_URL}/inventory/rotor/discard-route/${encodeURIComponent(lot)}`)

// 본딩품(BO) 폐기 (2026-08-11) — 발급된 BO 로터를 BO 재고 기준 폐기. magnets=추가 부착분(보통 없음).
export const discardBo = (boLot, reason, magnets = null) =>
  postJson(`${BASE_URL}/inventory/rotor/discard-bo`, { bo_lot: boLot, reason, magnets })

// 로터 본딩 롤백 (2026-08-04) — 개수 잘못 입력해 과다 발급한 본딩(BO) 취소.
//   preview: BO LOT 의 요크 배치·복원될 자석 목록 확인 / rollback: 실제 무효+요크·자석 복원.
export const previewRboRollback = (boLot) =>
  fetchJson(`${BASE_URL}/inventory/rotor/rollback-bo/${encodeURIComponent(boLot)}`)
export const rollbackRbo = (boLot) =>
  postJson(`${BASE_URL}/inventory/rotor/rollback-bo`, { bo_lot: boLot })

// 녹 제거 대기 (2026-08-01) — 폐기와 달리 새 LOT 을 끊지 않고 상태만 옮김.
//   대기로 빼면 가용 재고에서 제외되고, 완료되면 **원래 LOT 에 수량이 복귀**한다.
// 가용 요크 목록 — 대기로 뺄 대상 선택용 (LOT 수기 입력 대체)
export const listAvailableYokes = (process = 'EA') =>
  fetchJson(withQs(`${BASE_URL}/inventory/rotor/rust-wait/available`, { process }))
    .then((r) => r.rows || [])

export const listRustWait = (process = 'EA') =>
  fetchJson(withQs(`${BASE_URL}/inventory/rotor/rust-wait`, { process }))
    .then((r) => r.rows || [])

// quantity 생략 = 잔량 전부
export const toRustWait = (lotNo, quantity = null, memo = '', process = 'EA') =>
  postJson(`${BASE_URL}/inventory/rotor/rust-wait`,
    { lot_no: lotNo, quantity, memo, process })

export const restoreFromRustWait = (lotNo, quantity = null, process = 'EA') =>
  postJson(`${BASE_URL}/inventory/rotor/rust-wait/restore`,
    { lot_no: lotNo, quantity, process })

export const createItem = (data) =>
  postJson(`${BASE_URL}/item`, data).then((r) => r.item)

export const updateItem = (id, data) =>
  fetchJson(`${BASE_URL}/item/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    errorMsg: '품목 수정 실패',
  }).then((r) => r.item)

export const deleteItem = (id) =>
  fetchJson(`${BASE_URL}/item/${id}`, { method: 'DELETE', errorMsg: '품목 비활성화 실패' })

export const hardDeleteItem = (id) =>
  fetchJson(`${BASE_URL}/item/${id}/hard`, { method: 'DELETE', errorMsg: '품목 완전 삭제 실패' })

// 품목 제조사/공급사 (행 다중) — RM 입고 공급사 선택용 (2026-06-10)
// 자석 강타입 스펙 upsert (2026-07-16) — pole/phi/inner_outer/grade_num/heat_class
export const updateItemMagnetSpec = (itemId, spec) =>
  fetchJson(`${BASE_URL}/item/${itemId}/magnet-spec`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  }).then((r) => r.magnet_spec)

// 요크 IPQ 검사규격 (2026-08-05) — 검사규격 페이지 '요크(IPQ)' 탭. 검사 공차 7필드만.
export const listYokeIpqSpecs = () =>
  fetchJson(`${BASE_URL}/item/yoke-ipq-specs`).then((r) => r.items || [])
export const updateYokeIpqSpec = (itemId, spec) =>
  fetchJson(`${BASE_URL}/item/${itemId}/yoke-ipq-spec`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec),
  }).then((r) => r.yoke_ipq_spec)

// 요크/회전자 강타입 스펙 upsert (2026-07-16) — phi + motor_type
export const updateItemYokeSpec = (itemId, spec) =>
  fetchJson(`${BASE_URL}/item/${itemId}/yoke-spec`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec),
  }).then((r) => r.yoke_spec)
export const updateItemRotorSpec = (itemId, spec) =>
  fetchJson(`${BASE_URL}/item/${itemId}/rotor-spec`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec),
  }).then((r) => r.rotor_spec)
// 고정자 강타입 스펙(StatorSpec) upsert (2026-07-27) — phi + motor_type. 완제품 Item↔StatorSpec 연결.
export const updateItemStatorSpec = (itemId, spec) =>
  fetchJson(`${BASE_URL}/item/${itemId}/stator-spec`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec),
  }).then((r) => r.stator_spec)

export const getItemSourcing = (id) =>
  fetchJson(`${BASE_URL}/item/${id}/sourcing`).then((r) => r.sourcing || [])

export const setItemSourcing = (id, pairs, defaultIndex = null) =>
  fetchJson(`${BASE_URL}/item/${id}/sourcing`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairs, default_index: defaultIndex }),
  }).then((r) => r.sourcing || [])

export const uploadItemPhoto = (id, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return fetchMultipart(`${BASE_URL}/item/${id}/photo`, fd, '사진 업로드 실패')
}

export const getItemPhotoUrl = (id, inline = true) =>
  fetchJson(`${BASE_URL}/item/${id}/photo?inline=${inline}`).then((r) => r.url)

export const deleteItemPhoto = (id) =>
  fetchJson(`${BASE_URL}/item/${id}/photo`, { method: 'DELETE', errorMsg: '사진 제거 실패' })

// 다중 첨부 (사진/파일 통합) — 2026-05-20. legacy photo 와는 별개 슬롯.
export const listItemAttachments = (id) =>
  fetchJson(`${BASE_URL}/item/${id}/attachments`).then((r) => r.items || [])

export const uploadItemAttachment = (id, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return fetchMultipart(`${BASE_URL}/item/${id}/attachments`, fd, '첨부 업로드 실패')
    .then((r) => r.item)
}

export const getItemAttachmentUrl = (attId, inline = true) =>
  fetchJson(`${BASE_URL}/item/attachments/${attId}/url?inline=${inline}`).then((r) => r.url)

export const deleteItemAttachment = (attId) =>
  fetchJson(`${BASE_URL}/item/attachments/${attId}`, {
    method: 'DELETE', errorMsg: '첨부 삭제 실패',
  })

// 이 품목을 쓰는 상위 BOM/제품 (단일 단계 where-used)
export const getItemWhereUsed = (id) =>
  fetchJson(`${BASE_URL}/item/${id}/where-used`).then((r) => r.used || [])

// 품목 분류 트리 (대>중>소 관리형)
export const getItemCategoryTree = (activeOnly = true) =>
  fetchJson(`${BASE_URL}/item-category?active_only=${activeOnly}`).then((r) => r.tree || [])

export const createItemCategory = (data) =>
  postJson(`${BASE_URL}/item-category`, data).then((r) => r.node)

export const updateItemCategory = (id, data) =>
  fetchJson(`${BASE_URL}/item-category/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    errorMsg: '분류 수정 실패',
  }).then((r) => r.node)

export const deleteItemCategory = (id) =>
  fetchJson(`${BASE_URL}/item-category/${id}`, { method: 'DELETE', errorMsg: '분류 삭제 실패' })

// ── 재고 직접 관리 (Stock Admin) — team_rnd 전용 CRUD (2026-05-01) ─────
// inventory 테이블 행을 직접 보고/추가/수정/삭제. LOT 흐름과 무관 (수동 보정용).
export const getStockAdminList = ({
  process = '', status = '', search = '', page = 1, pageSize = 50,
  sortBy = 'updated_at', sortOrder = 'desc',
  // 기간 필터 (2026-05-06): 'YYYY-MM-DD' 형식. 둘 다 비워두면 미적용.
  // dateField — 'updated_at' (기본) 또는 'created_at'
  dateFrom = '', dateTo = '', dateField = 'updated_at',
} = {}) =>
  fetchJson(withQs(`${BASE_URL}/inventory/admin`, {
    process, status, search, page, page_size: pageSize,
    sort_by: sortBy, sort_order: sortOrder,
    date_from: dateFrom, date_to: dateTo, date_field: dateField,
  }))

// (createStockRow 제거 — U/D 만 지원, 2026-05-01 v2)
export const updateStockRow = (invId, data) =>
  fetchJson(`${BASE_URL}/inventory/admin/${invId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    errorMsg: '재고 행 수정 실패',
  })

export const deleteStockRow = (invId) =>
  fetchJson(`${BASE_URL}/inventory/admin/${invId}`, { method: 'DELETE', errorMsg: '재고 행 삭제 실패' })

// ── 프린트 ──
// Phase 2 (2026-04-22): 공정 페이지 PrinterBadge 가 sessionStorage 에 저장한
// overridePrinterId 를 print 요청마다 자동 주입. BE 는 body.override_printer_id 로
// Machine.default_printer 를 override 해 그 프린터로 출력.
export const PRINTER_OVERRIDE_KEY = 'overridePrinterId'

function withPrinterOverride(body) {
  try {
    const raw = sessionStorage.getItem(PRINTER_OVERRIDE_KEY)
    if (raw) {
      const id = Number(raw)
      if (Number.isInteger(id) && id > 0) {
        return { ...body, override_printer_id: id }
      }
    }
  } catch { /* sessionStorage 접근 실패 시 default 사용 */ }
  return body
}

export const printLot = (lotNo, printCount = 1, fields = {}) =>
  postJson(`${BASE_URL}/printer/print-label`, withPrinterOverride({
    lot_num: lotNo,
    print_count: printCount,
    ...fields,
  }))

// withFinal=false 면 작은 FP(소형 스티커) 동반 생략 — 검사목록 'FP 라벨 출력' 재출력용 (2026-07-10)
export const printStLabel = (serialNo, lotOqNo, withFinal = true) =>
  postJson(`${BASE_URL}/printer/print-st`, withPrinterOverride({
    serial_no: serialNo,
    lot_oq_no: lotOqNo,
    with_final: withFinal,
  }))

// 범용 단순 QR 라벨 — 입력값을 그대로 QR 로 (공정·체인·재고 무관, 2026-06-12)
export const printQrSimple = (value, printCount = 1) =>
  postJson(`${BASE_URL}/printer/print-qr`, withPrinterOverride({
    value,
    print_count: printCount,
  }))

// ── OQ 검사 ──

export const submitInspection = (data) => postJson(`${BASE_URL}/lot/oq/inspect`, data)
// submitTest1 / submitTest2 제거 (2026-04-24) — OQ 검사 통합 운영으로 단일화

export const getInspectionData = (lotSoNo, line = 'stator') =>
  fetchJson(`${BASE_URL}/lot/oq/data/${encodeURIComponent(lotSoNo)}${line === 'rotor' ? '?line=rotor' : ''}`)

export const getOqInspections = (filters = {}) =>
  fetchJson(withQs(`${BASE_URL}/lot/oq/inspections`, filters))

// OQC 재공정 값 비교 (2026-08-07) — 재작업으로 여러 번 출하검사한 유닛의 회차별 측정값.
//   keyword = SO LOT / OQ 번호 / ST 시리얼 아무거나
export const compareOqChain = (keyword) =>
  fetchJson(withQs(`${BASE_URL}/lot/oq/compare`, { keyword }))

// 판정 순환 OK → FAIL → RECHECK → OK — InspectionList 판정 셀 클릭 시 호출
export const cycleInspectionJudgment = (inspectionId) =>
  fetchJson(`${BASE_URL}/lot/oq/inspection/${inspectionId}/cycle-judgment`, {
    method: 'PATCH',
  })

// ── 작업일지 (2026-08-12) — LOT 발급이 자동 기록, 여기선 조회·보정 ──
//   작업시간/가동시간/휴지시간은 BE 가 계산해 내려준다 (저장값 아님)
export const listWorkLogs = (params = {}) => {
  const q = qs(params)
  return fetchJson(`${BASE_URL}/work-log${q ? '?' + q : ''}`)
}
// 작업일지 엑셀 다운로드 — 목록과 같은 필터. 블롭을 받아 브라우저 저장을 트리거한다.
export async function downloadWorkLogXlsx(params = {}) {
  const q = qs(params)
  const res = await fetch(`${BASE_URL}/work-log/export${q ? '?' + q : ''}`, {
    credentials: 'include',
  })
  if (!res.ok) {
    let msg = '엑셀 다운로드에 실패했습니다.'
    try { msg = _normalizeDetail((await res.json()).detail) || msg } catch { /* */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') || ''
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  const name = m ? decodeURIComponent(m[1]) : '작업일지.xlsx'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
// 시각 보정은 배치 단위 — 같은 batch_key N행을 수량 비율로 다시 나눈다
export const patchWorkLogBatchTime = (body) =>
  fetchJson(`${BASE_URL}/work-log/batch-time`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
export const addWorkLogStop = (body) => postJson(`${BASE_URL}/work-log/stop`, body)
export const deleteWorkLogStop = (id) =>
  fetchJson(`${BASE_URL}/work-log/stop/${id}`, { method: 'DELETE' })
export const patchWorkLogRemark = (body) =>
  fetchJson(`${BASE_URL}/work-log/remark`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
// 작업일 STEP 프리필 — 시작(직전 종료 or 근무 시작시각)·종료(지금) 제안
export const getWorkTimeSuggest = ({ worker, line } = {}) =>
  fetchJson(`${BASE_URL}/work-log/suggest-time?${qs({ worker, line })}`)
// 근무시간 설정 — 시작시각 + 휴게시간(개수 제한 없음)
export const getWorkTimeConfig = (line = '회전자') =>
  fetchJson(`${BASE_URL}/work-time-config?${qs({ line })}`)
export const patchWorkShift = (body) =>
  fetchJson(`${BASE_URL}/work-time-config/shift`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
export const saveWorkBreak = (body) => postJson(`${BASE_URL}/work-time-config/break`, body)
export const deleteWorkBreak = (id) =>
  fetchJson(`${BASE_URL}/work-time-config/break/${id}`, { method: 'DELETE' })

// ── 요크 IPQ 검사 (전용 API, 2026-08-05) — OQ 와 분리 ──
export const getYokeIpqData = (lotEaNo) =>
  fetchJson(`${BASE_URL}/yoke-ipq/data/${encodeURIComponent(lotEaNo)}`)
export const submitYokeIpq = (data) => postJson(`${BASE_URL}/yoke-ipq/inspect`, data)
// 개체 N건 일괄 저장 (2026-08-12) — 한 트랜잭션. 개체별 저장은 중간에 끊기면 PENDING 반쪽 행이 남는다
export const submitYokeIpqBulk = ({ lot_ea_no, worker, samples }) =>
  postJson(`${BASE_URL}/yoke-ipq/inspect-bulk`, { lot_ea_no, worker, samples })
// 요크 IPQ 검사 후 '불량 폐기' 처분 (본딩 전 — 자석 차감 없는 단순 요크 폐기)
export const discardYokeIpq = (lotEaNo, reason = '') =>
  postJson(`${BASE_URL}/yoke-ipq/discard`, { lot_ea_no: lotEaNo, reason })
export const listYokeIpq = (filters = {}) =>
  fetchJson(withQs(`${BASE_URL}/yoke-ipq/inspections`, filters))
// 요크 검사 이력서 엑셀 — BE 가 utils/Yoke_IPQ_Template.xlsx 양식으로 생성 (목록과 같은 필터)
export const downloadYokeIpqExcel = (filters = {}) =>
  fetchBlob(withQs(`${BASE_URL}/yoke-ipq/inspections/export`, filters))

// ── 박스 관리 ──

export const createBox = (process, worker, printCount = 1, phi = '') =>
  postJson(`${BASE_URL}/box/create`, { process, worker, print_count: printCount, phi })

export const scanBox = (lotNo) => postJson(`${BASE_URL}/box/scan`, { lot_no: lotNo })

export const addBoxItem = (boxLotNo, itemLotNo) =>
  postJson(`${BASE_URL}/box/${boxLotNo}/add`, { item_lot_no: itemLotNo })

export const removeBoxItem = (boxLotNo, itemLotNo) =>
  postJson(`${BASE_URL}/box/${boxLotNo}/remove`, { item_lot_no: itemLotNo })

// ── 재고 조회 ──

export const getInventorySummary = () => fetchJson(`${BASE_URL}/inventory/summary`)

// 회전자 공정별 재고 요약 (실시간 재고 보드 회전자 섹션, 2026-06-17) — {EA,BO,RT: {total,phi_dist,motor_dist}}
export const getRotorInventorySummary = () => fetchJson(`${BASE_URL}/inventory/rotor/process-summary`)

// 원자재(RM) 요약 — Warehouse 기준, 분류(ItemCategory)별 + 품목 세부 (2026-06-17) — {categories:[{key,label,qty,weight,today,items}], total}
export const getRmWarehouseSummary = () => fetchJson(`${BASE_URL}/inventory/rm-summary`)

// 회전자/원자재 상세 — 카드 클릭 시 DetailPanel 용 (스테이터 detail 과 동일 형식, 2026-06-17)
export const getRotorInventoryDetail = (process) => fetchJson(`${BASE_URL}/inventory/rotor/detail/${process}`)
export const getRmCategoryDetail = (categoryKey) =>
  fetchJson(`${BASE_URL}/inventory/rm-detail?category=${encodeURIComponent(categoryKey)}`)

export const getInventoryDetail = (process) => fetchJson(`${BASE_URL}/inventory/detail/${process}`)

export const getFinishedProducts = () => fetchJson(`${BASE_URL}/inventory/finished-products`)

// ST + RT 통합 재고 — 모델별(phi+motor) × 위치별(자유/UB만/MB) 카운트 (2026-05-08)
export const getStockOverview = () => fetchJson(`${BASE_URL}/inventory/stock-overview`)

export const getBoxSummary = (process) => fetchJson(`${BASE_URL}/box/summary/${process}`)

// UB + MB 통합 요약 — 호출 수 절감 (2026-04-21)
export const getBoxSummaryAll = () => fetchJson(`${BASE_URL}/box/summary-all`)

export const getBoxItems = (lotNo) => fetchJson(`${BASE_URL}/box/${lotNo}/items`)

// ── Phase C: RT 로터 재고 ──
export const getRotorStocks = () => fetchJson(`${BASE_URL}/inventory/rotor`)

// getRotorSummary 제거 (2026-05-08) — 통합 stock-overview 로 대체

export const createRotorStock = (data) => postJson(`${BASE_URL}/inventory/rotor`, data)

// 자동 시퀀스 채번해 N개 행 생성 + 라벨 N장 인쇄 (2026-04-29) — phi+motor+count 만 입력
// 응답: { count, items[], printed, print_errors[] }
export const createRotorStocksBulk = ({ phi, motor_type, count, memo = '' }) =>
  postJson(`${BASE_URL}/inventory/rotor/bulk`, withPrinterOverride({ phi, motor_type, count, memo }))

// ── 액추에이터 · PCB · 감속기 (2026-08-14) — RT 와 같은 형태. LOT 먼저, BOM 은 나중 ──
//   kind: 'ACT' | 'PCB' | 'GEAR'
//   ★ 종류 목록은 서버가 준다 — FE 에 하드코딩하지 않는다(제품이 늘면 BE 한 줄로 따라옴).
export const getProductStockKinds = () => fetchJson(`${BASE_URL}/inventory/product-stock/kinds`)
export const getProductStockSummary = () => fetchJson(`${BASE_URL}/inventory/product-stock/summary`)
export const getProductStocks = (kind, includeOut = false) =>
  fetchJson(`${BASE_URL}/inventory/product-stock/${kind}?${qs({ include_out: includeOut || undefined })}`)
// 발급 + 라벨 N장 인쇄 (한 호출) — 인쇄 실패분은 응답 print_errors 로 돌아온다
export const createProductStocksBulk = (kind, { phi, count, memo = '' }) =>
  postJson(`${BASE_URL}/inventory/product-stock/${kind}/bulk`, withPrinterOverride({ phi, count, memo }))
export const printProductLabel = (kind, lotNo) =>
  postJson(`${BASE_URL}/printer/print-product`,
    withPrinterOverride({ kind, lot_no: lotNo, source: 'product_reprint' }))
export const updateProductStock = (kind, id, data) =>
  fetchJson(`${BASE_URL}/inventory/product-stock/${kind}/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  })
export const deleteProductStock = (kind, id) =>
  fetchJson(`${BASE_URL}/inventory/product-stock/${kind}/${id}`, { method: 'DELETE' })

// RT 라벨 단건 재인쇄 (2026-04-29) — RotorStock 행에서 phi/motor 자동 조회
export const reprintRotorLabel = (lotNo) =>
  postJson(`${BASE_URL}/printer/print-rt`, withPrinterOverride({ lot_no: lotNo, source: 'rotor_reprint' }))

// RT 라벨 신규발급 출력 (2026-07-31) — OQ 합격 시. source='rotor_input' 이라 소형 QR 스티커(최종 라벨) 자동 동반.
//   재인쇄(reprintRotorLabel)는 스티커 미동반이라 OQ 합격엔 이 함수를 써야 함.
export const printRotorRtLabel = (lotNo) =>
  postJson(`${BASE_URL}/printer/print-rt`, withPrinterOverride({ lot_no: lotNo, source: 'rotor_input' }))

export const updateRotorStock = (id, data) =>
  fetchJson(`${BASE_URL}/inventory/rotor/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const deleteRotorStock = (id) =>
  fetchJson(`${BASE_URL}/inventory/rotor/${id}`, { method: 'DELETE' })

// ── 재고 실사 (Inventory Survey) — 현장 vs 전산 차이 (2026-05-23) ──
// 입력 화면 미리보기: 현 시점 전산 스냅샷 (저장 전 확인용)
export const getInventorySurveySnapshot = () =>
  fetchJson(`${BASE_URL}/inventory-survey/snapshot/preview`)

// 실사 저장 — entries[] + (선택) surveyed_at + title + note. BE 가 그 순간 스냅샷 캡처.
export const createInventorySurvey = ({ entries, surveyed_at, title, note }) =>
  postJson(`${BASE_URL}/inventory-survey`, { entries, surveyed_at, title, note })

// 이력 목록 — ?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=
export const listInventorySurveys = ({ from, to, limit = 100 } = {}) => {
  const qs = new URLSearchParams()
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  if (limit) qs.set('limit', String(limit))
  const s = qs.toString()
  return fetchJson(`${BASE_URL}/inventory-survey${s ? '?' + s : ''}`)
}

// 단일 실사 상세 (entries + 동결 스냅샷 + 동결 차이)
export const getInventorySurvey = (id) =>
  fetchJson(`${BASE_URL}/inventory-survey/${id}`)

export const deleteInventorySurvey = (id) =>
  fetchJson(`${BASE_URL}/inventory-survey/${id}`, { method: 'DELETE' })

// ── 제품 모델 레지스트리 (2026-04-24) ──
// 조회는 모든 로그인 사용자, 쓰기는 team_rnd 만
export const getModels = (activeOnly = true) =>
  fetchJson(`${BASE_URL}/models?active_only=${activeOnly}`)

export const createModel = (data) =>
  postJson(`${BASE_URL}/models`, data)

export const updateModel = (id, data) =>
  fetchJson(`${BASE_URL}/models/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const deleteModel = (id) =>
  fetchJson(`${BASE_URL}/models/${id}`, { method: 'DELETE' })

// 완전 삭제 — 실수로 추가한 미사용 모델 제거용. 송장에서 참조 중이면 409.
export const hardDeleteModel = (id) =>
  fetchJson(`${BASE_URL}/models/${id}/hard`, { method: 'DELETE' })

// ── QC 검사규격 (InspectionSpec) — ModelRegistry QC 병존 이관 (Layer E, 2026-07-17) ──
//   ModelManagePage 와 별개 신규 편집면. 조회 키=(phi,motor,rt_st,stage,ver).
export const getInspectionSpecs = (stage) =>
  fetchJson(`${BASE_URL}/inspection-spec${stage ? `?stage=${stage}` : ''}`)

export const upsertInspectionSpec = (data) =>
  postJson(`${BASE_URL}/inspection-spec`, data)

// ModelRegistry QC → InspectionSpec 1회 백필 (멱등, resolution-aware)
export const backfillInspectionSpecs = (stage = 'OQ') =>
  postJson(`${BASE_URL}/inspection-spec/backfill?stage=${stage}`, {})

// BE 판정(oq_inspection_service→resolve_qc)과 '동일한' QC 스펙 해석 결과 — InspectionSpec 우선, ModelRegistry 폴백.
//   OQ 폼의 기준 표시·프리뷰·K_T 계산이 판정과 같은 소스를 읽게 하는 단일화 API (Layer E 컷오버, 2026-07-20)
export const resolveInspectionSpec = (phi, motorType, rtSt = 'st') =>
  fetchJson(`${BASE_URL}/inspection-spec/resolve?phi=${encodeURIComponent(phi)}&motor_type=${encodeURIComponent(motorType || '')}&rt_st_type=${rtSt}`)

// ── 수주 (Sales Order) — SO → PO → 송장 흐름의 수요원 (2026-07-22) ──
export const listSalesOrders = (params = {}) =>
  fetchJson(withQs(`${BASE_URL}/sales-order`, {
    so_type: params.soType, customer_id: params.customerId, status: params.status, q: params.q,
  }))
export const createSalesOrder = (data) => postJson(`${BASE_URL}/sales-order`, data)
export const getSalesOrder = (soId) => fetchJson(`${BASE_URL}/sales-order/${soId}`)
export const updateSalesOrder = (soId, patch) =>
  fetchJson(`${BASE_URL}/sales-order/${soId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  })
export const setSalesOrderStatus = (soId, status) =>
  postJson(`${BASE_URL}/sales-order/${soId}/status`, { status })
export const addSalesOrderLines = (soId, lines) =>
  postJson(`${BASE_URL}/sales-order/${soId}/lines`, { lines })
export const updateSalesOrderLine = (lineId, patch) =>
  fetchJson(`${BASE_URL}/sales-order/line/${lineId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  })
export const deleteSalesOrderLine = (lineId) =>
  fetchJson(`${BASE_URL}/sales-order/line/${lineId}`, { method: 'DELETE' })
export const getSalesOrderAvailableInvoices = () =>
  fetchJson(`${BASE_URL}/sales-order/available-invoices`)
export const linkSalesOrderInvoice = (soId, invoiceId) =>
  postJson(`${BASE_URL}/sales-order/${soId}/link-invoice`, { invoice_id: invoiceId })
export const unlinkSalesOrderInvoice = (soId, invoiceId) =>
  postJson(`${BASE_URL}/sales-order/${soId}/unlink-invoice`, { invoice_id: invoiceId })
// 수주 → 생산오더 파생 (정석 SO→PO, 2026-07-22 — 송장→PO 임시 경로 대체. 권한 ADMIN_BOM)
export const createSalesOrderProductionOrders = (soId) =>
  postJson(`${BASE_URL}/sales-order/${soId}/production-orders`, {})
// Blanket 부모 → 분할 수주(릴리스) 생성 — lines=[{line_id, total_qty}] (2026-07-23)
export const createSalesOrderRelease = (soId, lines) =>
  postJson(`${BASE_URL}/sales-order/${soId}/releases`, { lines })

// ── 알림 발송 설정 (알림종류 × 수신자 지정) — 2026-07-27 ──
//   서버가 발신하고, 관리자가 대상을 지정하는 개념 (수신자 주도 '구독' 아님)
export const getNotificationCatalog = () => fetchJson(`${BASE_URL}/notification/catalog`)
// 수신자 후보(이메일 등록된 활성 계정) — /users(ADMIN_USERS) 대신 알림 권한으로 조회 가능한 전용 API
export const getNotificationCandidates = () => fetchJson(`${BASE_URL}/notification/candidates`)
// 실제 발송될 주소 (미지정 시 .env 폴백까지 반영된 최종 결과)
export const getNotificationRecipients = (notifyType) =>
  fetchJson(`${BASE_URL}/notification/recipients/${notifyType}`)
export const addNotificationRecipient = (data) =>
  postJson(`${BASE_URL}/notification/recipient`, data)
export const setNotificationRecipientActive = (recipientId, isActive) =>
  fetchJson(`${BASE_URL}/notification/recipient/${recipientId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: isActive }),
  })
export const deleteNotificationRecipient = (recipientId) =>
  fetchJson(`${BASE_URL}/notification/recipient/${recipientId}`, { method: 'DELETE' })
// 지금 발송 (수동) — 정기 조건(부족 0건 등)과 무관하게 현재 상태를 즉시 발송. dev 는 dry-run (2026-07-27)
export const sendNotificationNow = (notifyType) =>
  postJson(`${BASE_URL}/notification/send-now/${notifyType}`, {})
// 발송 스케줄 — 요일/시간/모드를 앱에서 설정 (EC2 crontab 대체, 2026-08-07). 목록은 catalog 응답의 schedules.
export const addNotificationSchedule = (data) =>
  postJson(`${BASE_URL}/notification/schedule`, data)
export const updateNotificationSchedule = (scheduleId, data) =>
  fetchJson(`${BASE_URL}/notification/schedule/${scheduleId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
export const deleteNotificationSchedule = (scheduleId) =>
  fetchJson(`${BASE_URL}/notification/schedule/${scheduleId}`, { method: 'DELETE' })

// ── 생산오더 (ProductionOrder) — 제품 Item + BOM 완전동결 (Layer A, 2026-07-17) ──
//   ⚠️ 소비 바인딩(오더가 소비 구동)은 아직 미연결 — 이 화면은 오더 생성/조회/동결 확인만.
export const getProductionOrders = (line = '', status = '') => {
  const qs = new URLSearchParams()
  if (line) qs.set('line', line)
  if (status) qs.set('status', status)
  const s = qs.toString()
  return fetchJson(`${BASE_URL}/production-order${s ? `?${s}` : ''}`).then((r) => r.orders || [])
}

export const getProductionOrder = (id) =>
  fetchJson(`${BASE_URL}/production-order/${id}`).then((r) => r.order)

// 미착수(OPEN·미생산) PO 구성품을 현재 BOM 으로 재동결 — 생산 전 BOM 정정 반영 (2026-07-28)
export const refreshPoComponents = (id) =>
  postJson(`${BASE_URL}/production-order/${id}/refresh-components`, {}).then((r) => r.order)

export const createProductionOrder = (data) =>
  postJson(`${BASE_URL}/production-order`, data).then((r) => r.order)

// 송장 요구 라인 → 생산오더(PO) 생성 (라인당 1개, 증분, 2026-07-18). 반환 {created,updated,skipped,unresolved}
export const createInvoiceProductionOrders = (invoiceId) =>
  postJson(`${BASE_URL}/invoice/${invoiceId}/production-orders`, {})

// 박스 확인 (MB 전체 트리 + 엑셀) — BoxCheckPage
export const getBoxMbFull = (mbLotNo) => fetchJson(`${BASE_URL}/box/mb/${mbLotNo}/full`)

export const downloadBoxMbExcel = (mbLotNo) =>
  fetchBlob(`${BASE_URL}/box/mb/${mbLotNo}/export`, '엑셀 생성 실패')

// 자석 재고 엑셀 — 종류별 요약 + 박스별 상세 2시트 (2026-07-30)
export const downloadMagnetStockExcel = () =>
  fetchBlob(`${BASE_URL}/warehouse/magnet/stock-excel`, '자석 재고 엑셀 생성 실패')

// ── OB 출하 / 엑셀 ──

export const getObList = () => fetchJson(`${BASE_URL}/lot/ob/list`)

export const getObDetail = (obLotNo) => fetchJson(`${BASE_URL}/lot/ob/${obLotNo}/detail`)

export const downloadObExcel = (obLotNo) => fetchBlob(`${BASE_URL}/lot/ob/${obLotNo}/export`)

export const downloadAllOqExcel = () => fetchBlob(`${BASE_URL}/lot/oq/export-all`)

export async function downloadFilteredOqExcel(filters = {}) {
  return fetchBlob(withQs(`${BASE_URL}/lot/oq/export-filtered`, filters))
}

export const downloadKtReport = (inspectionId) =>
  fetchBlob(`${BASE_URL}/lot/oq/inspection/${inspectionId}/export`)

export const downloadPackingList = (obLotNo) =>
  fetchBlob(`${BASE_URL}/lot/ob/${obLotNo}/packing-list`)

// ── 인증서 (외부 공개 cert 페이지, 2026-04-27 갈아엎기) ──
// 기존 verifyCert(/cert/{ob}/verify) 폐기 — URL 에 OB 노출 + chain 정보 유출
// 새 흐름: HMAC public_token (URL) + PW 인증 → session_token → /sheet 호출

// 2026-06-12 v6: PW 게이트 폐기 — pw 없이 호출. 접근 통제는 회사 로그인(Phase D).
//   - 신규 `/{ub_lot}` 진입 → mbLotNo = UB- 번호 (BE 가 ub→mb 역추적), ub 생략
//   - 레거시 `/{mb}/{ub}` 진입 → mbLotNo = MB, ub = UB (그대로 동작)
export async function certAuth(mbLotNo, ub, pw = '') {
  const body = { mb_lot_no: mbLotNo }
  if (ub) body.ub = ub   // null/undefined/"" 인 경우 ub 필드 자체를 빼서 BE Optional 매칭
  if (pw) body.pw = pw   // 잔존 PW 캐시 호환 — 보내도 BE 가 무시
  const res = await fetch(`${BASE_URL}/cert/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = `Authentication failed (${res.status})`
    try {
      const d = await res.json()
      const norm = _normalizeDetail(d.detail)   // 422 array detail → string (2026-05-01 fix)
      if (norm) detail = norm
    } catch { /* */ }
    throw new Error(detail)
  }
  return res.json()
}

// 관리자용 — 출하된 MB 목록 + cert URL 사전 빌드 (2026-04-29, v5 토큰/PW URL 제거 2026-04-30)
// 응답 items[]: { mb_lot_no, ob_lot_no, ub_lot_no, ub_lot_nos, pw, shipped_at, url_mb, url_ub }
export const getCertAdminMbs = () => fetchJson(`${BASE_URL}/cert-admin/mbs`)

// cert 스냅샷 발행/갱신 (2026-07-31) — 지금 데이터로 JSON/XLSX/PDF 3종 재캡처. 이후 외부 cert 는 이 스냅샷 서빙.
export const issueCertSnapshot = (mbLotNo, ubLotNo = '') =>
  postJson(`${BASE_URL}/cert-admin/snapshot`, { mb_lot_no: mbLotNo, ub_lot_no: ubLotNo })

// ────────────────────────────────────────────────────────────
// Cert 회사 로그인 — Phase C (2026-05-02)
// 도메인 root 진입 → 회사 ID/PW → company_token (1h) → OB 목록 → OB PW → MB 마다 sheet_token
// ────────────────────────────────────────────────────────────

// 1. 회사 로그인 → company_token
// 응답: { company_token, company_id, company_name, company_name_ko, expires_in }
export async function certCompanyLogin(loginId, password) {
  const res = await fetch(`${BASE_URL}/cert/company-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_id: loginId, password }),
  })
  if (!res.ok) {
    let detail = `Login failed (${res.status})`
    try {
      const d = await res.json()
      const norm = _normalizeDetail(d.detail)
      if (norm) detail = norm
    } catch { /* */ }
    throw new Error(detail)
  }
  return res.json()
}

// 2. 회사 OB 목록 (company_token 인증)
// 응답: { company_id, company_name, orders: [{ ob_lot_no, shipped_at, mb_count, st_count, phi_stats[], invoice_no }] }
export async function certCompanyOrders(companyToken) {
  const res = await fetch(`${BASE_URL}/cert/company/orders`, {
    headers: { 'Authorization': `Bearer ${companyToken}` },
  })
  if (!res.ok) {
    let detail = `Orders fetch failed (${res.status})`
    try {
      const d = await res.json()
      const norm = _normalizeDetail(d.detail)
      if (norm) detail = norm
    } catch { /* */ }
    throw new Error(detail)
  }
  return res.json()
}

// 4. 회사 본인 비밀번호 변경 (2026-05-11) — company_token 유지, 재로그인 불필요
// 응답: { status: 'success' }
export async function certCompanyChangePassword(companyToken, currentPassword, newPassword) {
  const res = await fetch(`${BASE_URL}/cert/company/change-password`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${companyToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
  if (!res.ok) {
    let detail = `Password change failed (${res.status})`
    try {
      const d = await res.json()
      const norm = _normalizeDetail(d.detail)
      if (norm) detail = norm
    } catch { /* */ }
    throw new Error(detail)
  }
  return res.json()
}

// 3. OB PW 검증 → 그 OB 안 (회사 소유) MB 마다 sheet_token 발급
// 응답: { ob_lot_no, mbs: [{ mb_lot_no, sheet_token }] }
export async function certCompanyOrderAuth(companyToken, obLotNo, pw = '') {
  // 2026-06-12 v6: OB PW 게이트 폐기 — pw 없이 호출 (회사 로그인이 접근 통제).
  const body = { ob_lot_no: obLotNo }
  if (pw) body.pw = pw
  const res = await fetch(`${BASE_URL}/cert/company/order-auth`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${companyToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = `Order authentication failed (${res.status})`
    try {
      const d = await res.json()
      const norm = _normalizeDetail(d.detail)
      if (norm) detail = norm
    } catch { /* */ }
    throw new Error(detail)
  }
  return res.json()
}

// ────────────────────────────────────────────────────────────
// Cert 봉인지(SEALED) 영구 상태 — Phase D 확장 (2026-05-02)
// 회사 단위 DB 저장 → 다른 디바이스/직원 간 공유. 영구 (만료 없음).
// seal_key 형식: 'mb:{mb}:{phi}_{motor}' 또는 'ub:{ub_lot_no}'
// ────────────────────────────────────────────────────────────

// 1. 회사의 모든 opened seal_key 일괄 조회
// 응답: { keys: ['mb:..:..', 'ub:..', ...] }
export async function certListSeals(companyToken) {
  const res = await fetch(`${BASE_URL}/cert/seals`, {
    headers: { 'Authorization': `Bearer ${companyToken}` },
  })
  if (!res.ok) {
    let detail = `Seal list fetch failed (${res.status})`
    try {
      const d = await res.json()
      const norm = _normalizeDetail(d.detail)
      if (norm) detail = norm
    } catch { /* */ }
    throw new Error(detail)
  }
  return res.json()
}

// 2. 신규 seal open 기록 (idempotent — 이미 열려있어도 200)
// 응답: { seal_key, already_open: bool }
export async function certOpenSeal(companyToken, sealKey) {
  const res = await fetch(`${BASE_URL}/cert/seals/open`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${companyToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ seal_key: sealKey }),
  })
  if (!res.ok) {
    let detail = `Seal open failed (${res.status})`
    try {
      const d = await res.json()
      const norm = _normalizeDetail(d.detail)
      if (norm) detail = norm
    } catch { /* */ }
    throw new Error(detail)
  }
  return res.json()
}

export async function certFetchSheet(sessionToken) {
  const res = await fetch(`${BASE_URL}/cert/sheet`, {
    headers: { 'Authorization': `Bearer ${sessionToken}` },
  })
  if (!res.ok) {
    let detail = `데이터 조회 실패 (${res.status})`
    try {
      const d = await res.json()
      const norm = _normalizeDetail(d.detail)   // 422 array detail → string (2026-05-01 fix)
      if (norm) detail = norm
    } catch { /* */ }
    throw new Error(detail)
  }
  return res.json()
}

// cert sheet JSON 응답을 객체로 직접 받기 (다운로드 X — viewer 용, 2026-05-01)
export async function certFetchExportJson(sessionToken) {
  const res = await fetch(`${BASE_URL}/cert/export/json`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  })
  if (!res.ok) {
    let detail = `JSON 조회 실패 (${res.status})`
    try {
      const d = await res.json()
      const norm = _normalizeDetail(d.detail)
      if (norm) detail = norm
    } catch { /* 응답이 JSON 아님 — 기본 메시지 */ }
    throw new Error(detail)
  }
  return res.json()
}

// cert 데이터시트 다운로드 (XLSX/PDF) — session_token 필수 (2026-05-01)
// fmt: 'xlsx' | 'pdf'. JSON 은 certFetchExportJson 사용 (모달 표시).
export async function certDownload(sessionToken, fmt) {
  const res = await fetch(`${BASE_URL}/cert/export/${fmt}`, {
    headers: { 'Authorization': `Bearer ${sessionToken}` },
  })
  if (!res.ok) {
    let detail = `${fmt.toUpperCase()} 다운로드 실패 (${res.status})`
    try {
      const d = await res.json()
      const norm = _normalizeDetail(d.detail)
      if (norm) detail = norm
    } catch { /* */ }
    throw new Error(detail)
  }
  // JSON 은 application/json 으로 와도 blob 처리해 파일로 저장 (브라우저가 자동으로 보여주지 않게)
  const blob = await res.blob()
  // Content-Disposition 에서 filename 추출 시도
  const cd = res.headers.get('Content-Disposition') || ''
  const m = /filename=(?:"([^"]+)"|([^;]+))/i.exec(cd)
  const filename = (m && (m[1] || m[2])) || `cert.${fmt}`
  return { blob, filename }
}

// ── 시딩 (임시) ──

export const seedChain = (data) => postJson(`${BASE_URL}/seed/chain`, data)

export const getLinesData = () => fetchJson(`${BASE_URL}/statistics/lines-data`)

// 품질 대시보드 — FAIL/되돌리기/폐기/생산량 집계 (2026-04-22) — days: 1/7/30/90
// 하루 1회 BE 캐시 (2026-05-21) — force=true 면 캐시 무시 강제 재계산 (새로고침 버튼).
export const getQualityDashboard = (days = 7, force = false) =>
  fetchJson(`${BASE_URL}/statistics/quality-dashboard?days=${days}${force ? '&force=true' : ''}`)

// 품질 주간 리포트 — 검사이력 엑셀과 동일 로직(qc_xlsx 병합 행)으로 4분류 집계 (2026-08-03)
// 주차: {date_from,date_to}(범위) 또는 {iso_year,iso_week}, 둘 다 없으면 이번 주(ISO).
export const getQualityWeekly = (params = {}) => {
  const q = qs({ ...params, force: params.force ? 'true' : undefined })
  return fetchJson(`${BASE_URL}/statistics/quality-weekly${q ? '?' + q : ''}`)
}

// 생산 대시보드 — 공정별 LOT 실적(신규/재공정/경유) + 완제품 생산량 (2026-08-08)
export const getProductionWeekly = (params = {}) => {
  const q = qs(params)
  return fetchJson(`${BASE_URL}/statistics/production-weekly${q ? '?' + q : ''}`)
}

// 생산 현황 — 공정 × 일자 생산량 큐브 (2026-08-11). {date_from,date_to} 또는 {days}
export const getProductionDaily = (params = {}) => {
  const q = qs(params)
  return fetchJson(`${BASE_URL}/statistics/production-daily${q ? '?' + q : ''}`)
}

// 매트릭스 셀 드릴다운 — 그 라인·공정·그 날에 발급된 LOT 목록 (2026-08-11)
export const getProductionCellLots = ({ date, process, line }) =>
  fetchJson(`${BASE_URL}/statistics/production-cell-lots?${qs({ date, process, line })}`)

// 주간 리포트 → QC_Weekly_Report_Template.xlsx 채워서 blob 다운로드 (2026-08-03)
//   redistribute_oq=true 면 출하행 펼침(귀책 재분배) 상태 그대로 export
export const downloadQualityWeeklyXlsx = ({ date_from, date_to, redistribute_oq } = {}) => {
  const q = qs({ date_from, date_to, redistribute_oq: redistribute_oq ? 'true' : undefined })
  return fetchBlob(`${BASE_URL}/statistics/quality-weekly-xlsx${q ? '?' + q : ''}`, '주간 리포트 다운로드 실패')
}

// ── 송장(Invoice) — admin_rnd 전용 ──

// 업로드 (multipart) — file은 선택 (없으면 metadata만 생성).
// 2026-05-09: fetchMultipart 통합 — 401 처리 일관화 (이전엔 localStorage.removeItem + reload 만 — handle401 우회 버그)
export const uploadInvoice = ({
  invoiceNo,
  title = '',
  customer = '',
  companyId = null,    // Company FK (2026-05-02). null 이면 회사 미연결 (customer 텍스트만)
  notes = '',
  file = null,
}) => {
  const form = new FormData()
  form.append('invoice_no', invoiceNo)
  form.append('title', title)
  form.append('customer', customer)
  if (companyId) form.append('company_id', String(companyId))
  form.append('notes', notes)
  if (file) form.append('file', file) // null이면 append 하지 않음 — BE 쪽에서 None 처리
  return fetchMultipart(`${BASE_URL}/invoice/upload`, form, '업로드 실패')
}

// 기존 invoice에 파일 첨부/교체 — 파일 없이 생성한 송장에 나중에 연결 (2026-04-21).
// 2026-05-09: fetchMultipart 통합 (401 anomaly fix — uploadInvoice 와 동일).
export const attachInvoiceFile = (invoiceId, file) => {
  const form = new FormData()
  form.append('file', file)
  return fetchMultipart(`${BASE_URL}/invoice/${invoiceId}/attach-file`, form, '파일 첨부 실패')
}

// 목록 (페이징 + 날짜/검색어 필터)
export const listInvoices = ({ dateFrom, dateTo, q, limit = 50, offset = 0 } = {}) =>
  fetchJson(withQs(`${BASE_URL}/invoice/list`, {
    date_from: dateFrom, date_to: dateTo, q,
    limit: String(limit), offset: String(offset),
  }))

// 미리보기 URL (presigned, 10분 만료) — iframe src용
export const getInvoicePreviewUrl = (id) => fetchJson(`${BASE_URL}/invoice/${id}/preview`)

// PDF 다운로드 URL (attachment)
export const getInvoiceDownloadUrl = (id) => fetchJson(`${BASE_URL}/invoice/${id}/download`)

// 원본 파일(xlsx/xls) 다운로드 URL — admin_rnd 전용
export const getInvoiceOriginalUrl = (id) => fetchJson(`${BASE_URL}/invoice/${id}/original`)

// 삭제 — admin_rnd 전용
export const deleteInvoice = (id) => fetchJson(`${BASE_URL}/invoice/${id}`, { method: 'DELETE' })

// ── 운송장 (waybill) 첨부 / 다운로드 / 삭제 (2026-05-08) ──
export const attachInvoiceWaybill = (invoiceId, file) => {
  const form = new FormData()
  form.append('file', file)
  return fetchMultipart(`${BASE_URL}/invoice/${invoiceId}/waybill`, form, '운송장 업로드 실패')
}

export const getInvoiceWaybillUrl = (id) =>
  fetchJson(`${BASE_URL}/invoice/${id}/waybill`)

export const deleteInvoiceWaybill = (id) =>
  fetchJson(`${BASE_URL}/invoice/${id}/waybill`, { method: 'DELETE' })

// ── 인보이스 진척률 (2026-04-21) ──

// 요구 항목 upsert — items: [{phi, motor_type, quantity}]
export const setInvoiceItems = (invoiceId, items) =>
  fetchJson(`${BASE_URL}/invoice/${invoiceId}/items`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })

// 상세 — 요구 항목별 진행률 + 할당된 MB 목록
export const getInvoiceDetail = (invoiceId) => fetchJson(`${BASE_URL}/invoice/${invoiceId}/detail`)

// 할당 가능한 MB 후보
export const getInvoiceAvailableMbs = (invoiceId) =>
  fetchJson(`${BASE_URL}/invoice/${invoiceId}/available-mbs`)

// MB 할당 — mbLotNos: string[]
export const assignInvoiceMbs = (invoiceId, mbLotNos) =>
  fetchJson(`${BASE_URL}/invoice/${invoiceId}/assign-mbs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mb_lot_nos: mbLotNos }),
  })

// MB 해제
export const unassignInvoiceMbs = (invoiceId, mbLotNos) =>
  fetchJson(`${BASE_URL}/invoice/${invoiceId}/unassign-mbs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mb_lot_nos: mbLotNos }),
  })

// 활성 인보이스 전체 진척률 요약 — ProgressPage(/inventory/progress)용
export const getInvoiceProgress = () => fetchJson(`${BASE_URL}/invoice/progress`)

// 수동 종료 (archived) — 진척률 대시보드에서 숨김
export const archiveInvoice = (invoiceId) =>
  fetchJson(`${BASE_URL}/invoice/${invoiceId}/archive`, { method: 'POST' })

// 복구 — 종료된 인보이스를 다시 active 로
export const reopenInvoice = (invoiceId) =>
  fetchJson(`${BASE_URL}/invoice/${invoiceId}/reopen`, { method: 'POST' })

// 메타 편집 — title/customer/notes (invoice_no는 unique 제약 때문에 변경 대상 제외) (2026-04-21)
export const updateInvoiceMeta = (invoiceId, patch) =>
  fetchJson(`${BASE_URL}/invoice/${invoiceId}/meta`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

// ── 프린터 관리 (Phase 1, 2026-04-22) ──
// 공장 목록 — PrinterManagePage 드롭다운용
export const listFactoryLocations = () => fetchJson(`${BASE_URL}/factory-locations`)

// 공장(FactoryLocation) CRUD — 관리자(ADMIN_PRINTER) 전용 (2026-07-16)
export const createFactoryLocation = (payload) =>
  postJson(`${BASE_URL}/factory-locations`, payload)
export const updateFactoryLocation = (id, patch) =>
  fetchJson(`${BASE_URL}/factory-locations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
export const deleteFactoryLocation = (id) =>
  fetchJson(`${BASE_URL}/factory-locations/${id}`, { method: 'DELETE' })

// 관리자 CRUD — /admin/printer 페이지에서 사용
export const listPrinters = ({ locationId, activeOnly } = {}) =>
  fetchJson(withQs(`${BASE_URL}/printers`, {
    location_id: locationId,
    active_only: activeOnly ? 'true' : null,
  }))

export const createPrinter = (payload) =>
  postJson(`${BASE_URL}/printers`, payload)

export const updatePrinter = (printerId, patch) =>
  fetchJson(`${BASE_URL}/printers/${printerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

export const deletePrinter = (printerId) =>
  fetchJson(`${BASE_URL}/printers/${printerId}`, { method: 'DELETE' })

// 출하(최종 스티커) 프린터 — OQ 통과(ST)·RT 발급 시 자동 동반되는 소형 시리얼 스티커 대상 (2026-06-12)
export const getFinalLabelPrinter = () =>
  fetchJson(`${BASE_URL}/final-label-printer`)

export const setFinalLabelPrinter = (printerId) =>
  fetchJson(`${BASE_URL}/final-label-printer`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printer_id: printerId }),
  })

// MyPage — 본인 기본 프린터
// 작업자 코드 자동입력 on/off (개인설정, 계정 단위, 2026-07-31)
export const setMyWorkerAutofill = (enabled) =>
  fetchJson(`${BASE_URL}/me/worker-autofill`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ enabled }),
  })

export const getMyPrinter = () => fetchJson(`${BASE_URL}/me/printer`)

export const setMyPrinter = (printerId) =>
  fetchJson(`${BASE_URL}/me/printer`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printer_id: printerId }),
  })

// ── 계정(Machine) 관리 — team_rnd 전용 (Phase A+, 2026-04-23) ──
export const listUsers = ({ role, locationId } = {}) =>
  fetchJson(withQs(`${BASE_URL}/users`, { role, location_id: locationId }))

export const createUser = (payload) =>
  postJson(`${BASE_URL}/users`, payload)

export const updateUser = (userId, patch) =>
  fetchJson(`${BASE_URL}/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

export const deleteUser = (userId) =>
  fetchJson(`${BASE_URL}/users/${userId}`, { method: 'DELETE' })

// 계정 상세 — 권한 연동값(role 기본/실효/개인 override) + 담당 프린터. 클릭 시 온디맨드 (2026-07-16)
export const getUserDetail = (userId) =>
  fetchJson(`${BASE_URL}/users/${userId}/detail`)

// ── 계정 종류별 생성 (Account 분리 Phase 2, 2026-07-16) ──
// 공통(login_id/password/location_id/role) + 종류별 프로필. BE routers/account.py.
export const createPersonAccount = (payload) =>
  postJson(`${BASE_URL}/accounts/person`, payload)
export const createMachineAccount = (payload) =>
  postJson(`${BASE_URL}/accounts/machine`, payload)
export const createSharedAccount = (payload) =>
  postJson(`${BASE_URL}/accounts/shared`, payload)

// ─────────────────────────────────────────
// RBAC 권한 매트릭스 (team_rnd 전용, 2026-06-17)
// ─────────────────────────────────────────
export const getRolePermissions = () =>
  fetchJson(`${BASE_URL}/admin/role-permissions`)

export const saveRolePermissions = (grants) =>
  fetchJson(`${BASE_URL}/admin/role-permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grants }),
  })

// 개인별 권한 override (Phase 3, 2026-06-17) — {feature: 'grant'|'deny'}
export const getMachinePermissions = (machineId) =>
  fetchJson(`${BASE_URL}/admin/machine-permissions/${machineId}`)

export const saveMachinePermissions = (machineId, overrides) =>
  fetchJson(`${BASE_URL}/admin/machine-permissions/${machineId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides }),
  })

// 역할 마스터 — 동적 역할 (2026-06-18)
export const getRoles = () => fetchJson(`${BASE_URL}/admin/roles`)

export const createRole = (payload) =>
  fetchJson(`${BASE_URL}/admin/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),   // { role_key, label, is_admin }
  })

export const updateRole = (roleKey, patch) =>
  fetchJson(`${BASE_URL}/admin/roles/${roleKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),     // { label?, is_admin? }
  })

export const deleteRole = (roleKey) =>
  fetchJson(`${BASE_URL}/admin/roles/${roleKey}`, { method: 'DELETE' })

// ─────────────────────────────────────────
// 사용자 피드백 (에러 신고 / 개선 제안, 2026-05-07)
// ─────────────────────────────────────────

// 본인 제출. body: { category: 'error'|'improvement', title, body, page_url, location_text }
export const submitFeedback = (data) =>
  postJson(`${BASE_URL}/feedback`, data).then((r) => r.feedback)

// 본인 제출 이력
export const listMyFeedback = () =>
  fetchJson(`${BASE_URL}/feedback/me`).then((r) => r.items || [])

// 첨부 업로드 (multipart) — 제출자 본인만
export const attachFeedback = (feedbackId, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return fetchMultipart(`${BASE_URL}/feedback/${feedbackId}/attach`, fd, '첨부 업로드 실패')
    .then((r) => r.feedback)
}

// presigned URL 발급 (본인 OR 어드민)
export const getFeedbackAttachmentUrl = (feedbackId) =>
  fetchJson(`${BASE_URL}/feedback/${feedbackId}/attach`).then((r) => r.url)

// 어드민 — 목록 (status, category 필터 선택)
export const listAdminFeedback = ({ status = '', category = '' } = {}) =>
  fetchJson(withQs(`${BASE_URL}/feedback/admin`, { status, category }))
    .then((r) => r.items || [])

// 어드민 — severity / status / admin_note 갱신
export const updateAdminFeedback = (feedbackId, patch) =>
  fetchJson(`${BASE_URL}/feedback/admin/${feedbackId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => r.feedback)

// ── QC 온습도 모니터링 (2026-08-14) ──
//   수집(POST /env/readings)은 로컬 PC 가 X-Cron-Token 으로 직접 호출하므로 여기 없음.
//   화면은 조회/설정만 쓴다.
export const getEnvSensors = (includeInactive = false) =>
  fetchJson(withQs(`${BASE_URL}/env/sensors`, { include_inactive: includeInactive || '' }))

export const updateEnvSensor = (sensorId, patch) =>
  fetchJson(`${BASE_URL}/env/sensors/${sensorId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

// 기간 추이 — 구간이 길면 BE 가 알아서 묶어서(평균 + 구간 최소/최대) 내려준다.
export const getEnvHistory = ({ sensor, dateFrom = '', dateTo = '' }) =>
  fetchJson(withQs(`${BASE_URL}/env/readings`, {
    sensor, date_from: dateFrom, date_to: dateTo,
  }))
