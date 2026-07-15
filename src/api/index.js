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
export const searchWarehouseItems = (q, materials = []) =>
  fetchJson(withQs(`${BASE_URL}/warehouse/item-search`, { q, material: (materials || []).join(',') }))
    .then((r) => r.items || [])

export const magnetIncoming = (body) =>
  postJson(`${BASE_URL}/warehouse/magnet/incoming`, body)

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

export const getItems = (activeOnly = true, q = '', categoryId = '') =>
  fetchJson(`${BASE_URL}/item?active_only=${activeOnly}${q ? `&q=${encodeURIComponent(q)}` : ''}${categoryId ? `&category_id=${categoryId}` : ''}`)
    .then((r) => r.items || [])

export const getItem = (id) =>
  fetchJson(`${BASE_URL}/item/${id}`).then((r) => r.item)

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

// 판정 순환 OK → FAIL → RECHECK → OK — InspectionList 판정 셀 클릭 시 호출
export const cycleInspectionJudgment = (inspectionId) =>
  fetchJson(`${BASE_URL}/lot/oq/inspection/${inspectionId}/cycle-judgment`, {
    method: 'PATCH',
  })

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

// RT 라벨 단건 재인쇄 (2026-04-29) — RotorStock 행에서 phi/motor 자동 조회
export const reprintRotorLabel = (lotNo) =>
  postJson(`${BASE_URL}/printer/print-rt`, withPrinterOverride({ lot_no: lotNo, source: 'rotor_reprint' }))

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

// 박스 확인 (MB 전체 트리 + 엑셀) — BoxCheckPage
export const getBoxMbFull = (mbLotNo) => fetchJson(`${BASE_URL}/box/mb/${mbLotNo}/full`)

export const downloadBoxMbExcel = (mbLotNo) =>
  fetchBlob(`${BASE_URL}/box/mb/${mbLotNo}/export`, '엑셀 생성 실패')

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
