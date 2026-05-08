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
  alert('세션이 만료되었습니다. 다시 로그인해주세요.')
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

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options })
  if (res.status === 401) {
    handle401()
    throw new Error('세션 만료')
  }
  if (!res.ok) {
    let detail = `요청 실패 (${res.status})`
    try {
      const d = await res.json()
      const norm = _normalizeDetail(d.detail)
      if (norm) detail = norm
    } catch {
      /* json 파싱 불가 시 기본 메시지 */
    }
    throw new Error(detail)
  }
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
  if (res.status === 401) {
    handle401()
    throw new Error('세션 만료')
  }
  if (!res.ok) throw new Error(errorMsg)
  return res.blob()
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

// options:
//   reason       — 자유 입력 사유 (필수, BE 도 검증)
//   category     — REPAIR_CATEGORIES code (통계 분류용)
//   skipEc       — BO 만 재공정 (EC 페이지 거치지 않고 옛 EC 매핑) — dest='HT' 일 때만 의미
//   markOqFail   — chain 의 OQ 검사 결과 자동 FAIL 처리 (FE confirm 후 true 로 보냄)
// discardLot 와 동일한 options 객체 패턴 (2026-05-06 정리).
export const repairLot = (
  lotNo, destProcess,
  { reason = '', category = '', skipEc = false, markOqFail = false } = {},
) =>
  postJson(`${BASE_URL}/lot/repair`, {
    lot_no: lotNo,
    dest_process: destProcess,
    reason,
    category,
    skip_ec: !!skipEc,
    mark_oq_fail: !!markOqFail,
  })

// LOT 폐기 — quantity 생략 시 전량 폐기. category: REPAIR_CATEGORIES code (선택)
export const discardLot = (lotNo, { quantity = null, reason = '', category = '' } = {}) =>
  postJson(`${BASE_URL}/lot/discard`, { lot_no: lotNo, quantity, reason, category })

// OQ 검사 시 발견된 phi/motor_type 잘못 입력 정정 — chain 전체 일괄 갱신 (2026-05-08)
// 권한: PROCESS_IQ_OQ. 영향 범위: Inventory + LotEA/HT + snbt PHI + OqInspection.
export const correctLotModel = (lotNo, phi, motorType) =>
  postJson(`${BASE_URL}/lot/correct-model`, {
    lot_no: lotNo, phi: String(phi), motor_type: motorType,
  })

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
export async function getAllPrintHistory(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.append(k, v)
  })
  return fetchJson(`${BASE_URL}/printer/history?${params}`)
}

// 프린트 이력 상세 — LOT 메타 / 재료 체인 / 현재 상태 / 공정별 특화
export const getPrintHistoryDetail = (printLogId) =>
  fetchJson(`${BASE_URL}/printer/history/detail/${printLogId}`)

// 프린트 이력 엑셀 다운로드
export async function downloadPrintHistoryExcel(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && k !== 'page' && k !== 'page_size') {
      params.append(k, v)
    }
  })
  return fetchBlob(`${BASE_URL}/printer/history/export?${params}`, '엑셀 생성 실패')
}

// 재출력 — 기존 LOT의 라벨만 ZPL 재전송 (PrintLog X, 새 LOT X, DB 비접촉)
export const reprintLabel = (lotNum) => postJson(`${BASE_URL}/printer/reprint`, { lot_num: lotNum })

// OQ 검사 이력 라벨 출력 — 텍스트=OQ, QR=SO (2026-04-24)
export const printOqFromInspection = (lotOqNo, lotSoNo) =>
  postJson(`${BASE_URL}/printer/print-oq-from-inspection`, {
    lot_oq_no: lotOqNo,
    lot_so_no: lotSoNo,
  })

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

export async function updateCompany(id, data) {
  const r = await fetch(`${BASE_URL}/companies/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const out = await r.json()
  if (!r.ok) throw new Error(out.detail || '업체 수정 실패')
  return out
}

export async function deleteCompany(id) {
  const r = await fetch(`${BASE_URL}/companies/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  const out = await r.json()
  if (!r.ok) throw new Error(out.detail || '업체 비활성화 실패')
  return out
}

export async function hardDeleteCompany(id) {
  const r = await fetch(`${BASE_URL}/companies/${id}/hard`, {
    method: 'DELETE',
    credentials: 'include',
  })
  const out = await r.json()
  if (!r.ok) throw new Error(out.detail || '업체 완전 삭제 실패')
  return out
}

// 사업자등록증 업로드 (multipart/form-data) — pdf/png/jpg, 최대 10MB
export async function uploadCompanyCert(id, file) {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`${BASE_URL}/companies/${id}/cert`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  })
  const out = await r.json()
  if (!r.ok) throw new Error(out.detail || '사업자등록증 업로드 실패')
  return out
}

// 사업자등록증 presigned URL — inline=true 면 미리보기, false 면 다운로드 attachment
export const getCompanyCertUrl = (id, inline = true) =>
  fetchJson(`${BASE_URL}/companies/${id}/cert?inline=${inline}`)

export async function deleteCompanyCert(id) {
  const r = await fetch(`${BASE_URL}/companies/${id}/cert`, {
    method: 'DELETE',
    credentials: 'include',
  })
  const out = await r.json()
  if (!r.ok) throw new Error(out.detail || '사업자등록증 제거 실패')
  return out
}

// ── 재고 직접 관리 (Stock Admin) — team_rnd 전용 CRUD (2026-05-01) ─────
// inventory 테이블 행을 직접 보고/추가/수정/삭제. LOT 흐름과 무관 (수동 보정용).
export async function getStockAdminList({
  process = '', status = '', search = '', page = 1, pageSize = 50,
  sortBy = 'updated_at', sortOrder = 'desc',
  // 기간 필터 (2026-05-06): 'YYYY-MM-DD' 형식. 둘 다 비워두면 미적용.
  // dateField — 'updated_at' (기본) 또는 'created_at'
  dateFrom = '', dateTo = '', dateField = 'updated_at',
} = {}) {
  const params = new URLSearchParams()
  if (process) params.set('process', process)
  if (status) params.set('status', status)
  if (search) params.set('search', search)
  if (page) params.set('page', page)
  if (pageSize) params.set('page_size', pageSize)
  if (sortBy) params.set('sort_by', sortBy)
  if (sortOrder) params.set('sort_order', sortOrder)
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  if (dateField) params.set('date_field', dateField)
  return fetchJson(`${BASE_URL}/inventory/admin?${params}`)
}

// (createStockRow 제거 — U/D 만 지원, 2026-05-01 v2)
export async function updateStockRow(invId, data) {
  const r = await fetch(`${BASE_URL}/inventory/admin/${invId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const out = await r.json()
  if (!r.ok) throw new Error(out.detail || '재고 행 수정 실패')
  return out
}

export async function deleteStockRow(invId) {
  const r = await fetch(`${BASE_URL}/inventory/admin/${invId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  const out = await r.json()
  if (!r.ok) throw new Error(out.detail || '재고 행 삭제 실패')
  return out
}

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

export const printStLabel = (serialNo, lotOqNo) =>
  postJson(`${BASE_URL}/printer/print-st`, withPrinterOverride({
    serial_no: serialNo,
    lot_oq_no: lotOqNo,
  }))

// ── OQ 검사 ──

export const submitInspection = (data) => postJson(`${BASE_URL}/lot/oq/inspect`, data)
// submitTest1 / submitTest2 제거 (2026-04-24) — OQ 검사 통합 운영으로 단일화

export const getInspectionData = (lotSoNo) =>
  fetchJson(`${BASE_URL}/lot/oq/data/${encodeURIComponent(lotSoNo)}`)

export async function getOqInspections(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.append(k, v)
  })
  return fetchJson(`${BASE_URL}/lot/oq/inspections?${params}`)
}

// 판정 순환 OK → FAIL → RECHECK → OK — InspectionList 판정 셀 클릭 시 호출
export const cycleInspectionJudgment = (inspectionId) =>
  fetchJson(`${BASE_URL}/lot/oq/inspection/${inspectionId}/cycle-judgment`, {
    method: 'PATCH',
  })

// ── 박스 관리 ──

export const createBox = (process, worker, printCount = 1) =>
  postJson(`${BASE_URL}/box/create`, { process, worker, print_count: printCount })

export const scanBox = (lotNo) => postJson(`${BASE_URL}/box/scan`, { lot_no: lotNo })

export const addBoxItem = (boxLotNo, itemLotNo) =>
  postJson(`${BASE_URL}/box/${boxLotNo}/add`, { item_lot_no: itemLotNo })

export const removeBoxItem = (boxLotNo, itemLotNo) =>
  postJson(`${BASE_URL}/box/${boxLotNo}/remove`, { item_lot_no: itemLotNo })

// ── 재고 조회 ──

export const getInventorySummary = () => fetchJson(`${BASE_URL}/inventory/summary`)

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

// 박스 확인 (MB 전체 트리 + 엑셀) — BoxCheckPage
export const getBoxMbFull = (mbLotNo) => fetchJson(`${BASE_URL}/box/mb/${mbLotNo}/full`)

export const downloadBoxMbExcel = async (mbLotNo) => {
  const r = await fetch(`${BASE_URL}/box/mb/${mbLotNo}/export`, {
    credentials: 'include',
  })
  if (!r.ok) {
    const data = await r.json().catch(() => ({}))
    throw new Error(data.detail || '엑셀 생성 실패')
  }
  return r.blob()
}

// ── OB 출하 / 엑셀 ──

export const getObList = () => fetchJson(`${BASE_URL}/lot/ob/list`)

export const getObDetail = (obLotNo) => fetchJson(`${BASE_URL}/lot/ob/${obLotNo}/detail`)

export const downloadObExcel = (obLotNo) => fetchBlob(`${BASE_URL}/lot/ob/${obLotNo}/export`)

export const downloadAllOqExcel = () => fetchBlob(`${BASE_URL}/lot/oq/export-all`)

export async function downloadFilteredOqExcel(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.append(k, v)
  })
  return fetchBlob(`${BASE_URL}/lot/oq/export-filtered?${params}`)
}

export const downloadKtReport = (inspectionId) =>
  fetchBlob(`${BASE_URL}/lot/oq/inspection/${inspectionId}/export`)

export const downloadPackingList = (obLotNo) =>
  fetchBlob(`${BASE_URL}/lot/ob/${obLotNo}/packing-list`)

// ── 인증서 (외부 공개 cert 페이지, 2026-04-27 갈아엎기) ──
// 기존 verifyCert(/cert/{ob}/verify) 폐기 — URL 에 OB 노출 + chain 정보 유출
// 새 흐름: HMAC public_token (URL) + PW 인증 → session_token → /sheet 호출

// 2026-04-30 v5: MB lot_no + (옵션) UB lot_no + PW (HMAC 토큰 제거)
//   - URL `/{mb_lot_no}` 진입 → ub null/undefined (MB 페이지)
//   - URL `/{mb_lot_no}/{ub_lot}` 진입 → ub 평문 (UB 페이지, focus 용도)
export async function certAuth(mbLotNo, ub, pw) {
  const body = { mb_lot_no: mbLotNo, pw }
  if (ub) body.ub = ub   // null/undefined/"" 인 경우 ub 필드 자체를 빼서 BE Optional 매칭
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

// 3. OB PW 검증 → 그 OB 안 (회사 소유) MB 마다 sheet_token 발급
// 응답: { ob_lot_no, mbs: [{ mb_lot_no, sheet_token }] }
export async function certCompanyOrderAuth(companyToken, obLotNo, pw) {
  const res = await fetch(`${BASE_URL}/cert/company/order-auth`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${companyToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ob_lot_no: obLotNo, pw }),
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

// 품질 대시보드 — FAIL/되돌리기/폐기 집계 (2026-04-22) — days: 1/7/30/90
export const getQualityDashboard = (days = 7) =>
  fetchJson(`${BASE_URL}/statistics/quality-dashboard?days=${days}`)

// ── 송장(Invoice) — admin_rnd 전용 ──

// 업로드 (multipart) — file은 선택 (없으면 metadata만 생성)
export async function uploadInvoice({
  invoiceNo,
  title = '',
  customer = '',
  companyId = null,    // Company FK (2026-05-02). null 이면 회사 미연결 (customer 텍스트만)
  notes = '',
  file = null,
}) {
  const form = new FormData()
  form.append('invoice_no', invoiceNo)
  form.append('title', title)
  form.append('customer', customer)
  if (companyId) form.append('company_id', String(companyId))
  form.append('notes', notes)
  if (file) form.append('file', file) // null이면 append 하지 않음 — BE 쪽에서 None 처리
  const res = await fetch(`${BASE_URL}/invoice/upload`, {
    method: 'POST',
    credentials: 'include',
    body: form, // Content-Type 자동 설정 (boundary 포함) — 직접 넣지 말 것
  })
  if (res.status === 401) {
    localStorage.removeItem('user')
    window.location.reload()
    throw new Error('세션 만료')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || '업로드 실패')
  return data
}

// 기존 invoice에 파일 첨부/교체 — 파일 없이 생성한 송장에 나중에 연결 (2026-04-21)
export async function attachInvoiceFile(invoiceId, file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE_URL}/invoice/${invoiceId}/attach-file`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  if (res.status === 401) {
    localStorage.removeItem('user')
    window.location.reload()
    throw new Error('세션 만료')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || '파일 첨부 실패')
  return data
}

// 목록 (페이징 + 날짜/검색어 필터)
export async function listInvoices({ dateFrom, dateTo, q, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams()
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  if (q) params.set('q', q)
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  return fetchJson(`${BASE_URL}/invoice/list?${params}`)
}

// 미리보기 URL (presigned, 10분 만료) — iframe src용
export const getInvoicePreviewUrl = (id) => fetchJson(`${BASE_URL}/invoice/${id}/preview`)

// PDF 다운로드 URL (attachment)
export const getInvoiceDownloadUrl = (id) => fetchJson(`${BASE_URL}/invoice/${id}/download`)

// 원본 파일(xlsx/xls) 다운로드 URL — admin_rnd 전용
export const getInvoiceOriginalUrl = (id) => fetchJson(`${BASE_URL}/invoice/${id}/original`)

// 삭제 — admin_rnd 전용
export const deleteInvoice = (id) => fetchJson(`${BASE_URL}/invoice/${id}`, { method: 'DELETE' })

// ── 운송장 (waybill) 첨부 / 다운로드 / 삭제 (2026-05-08) ──
export async function attachInvoiceWaybill(invoiceId, file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE_URL}/invoice/${invoiceId}/waybill`, {
    method: 'POST', credentials: 'include', body: form,
  })
  if (res.status === 401) { handle401(); throw new Error('세션 만료') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || '운송장 업로드 실패')
  return data
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
export const listPrinters = ({ locationId, activeOnly } = {}) => {
  const q = new URLSearchParams()
  if (locationId != null) q.set('location_id', locationId)
  if (activeOnly) q.set('active_only', 'true')
  const qs = q.toString()
  return fetchJson(`${BASE_URL}/printers${qs ? `?${qs}` : ''}`)
}

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

// MyPage — 본인 기본 프린터
export const getMyPrinter = () => fetchJson(`${BASE_URL}/me/printer`)

export const setMyPrinter = (printerId) =>
  fetchJson(`${BASE_URL}/me/printer`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printer_id: printerId }),
  })

// ── 계정(Machine) 관리 — team_rnd 전용 (Phase A+, 2026-04-23) ──
export const listUsers = ({ role, locationId } = {}) => {
  const q = new URLSearchParams()
  if (role) q.set('role', role)
  if (locationId != null) q.set('location_id', locationId)
  const qs = q.toString()
  return fetchJson(`${BASE_URL}/users${qs ? `?${qs}` : ''}`)
}

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
// 사용자 피드백 (에러 신고 / 개선 제안, 2026-05-07)
// ─────────────────────────────────────────

// 본인 제출. body: { category: 'error'|'improvement', title, body, page_url, location_text }
export const submitFeedback = (data) =>
  postJson(`${BASE_URL}/feedback`, data).then((r) => r.feedback)

// 본인 제출 이력
export const listMyFeedback = () =>
  fetchJson(`${BASE_URL}/feedback/me`).then((r) => r.items || [])

// 첨부 업로드 (multipart) — 제출자 본인만
export const attachFeedback = async (feedbackId, file) => {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${BASE_URL}/feedback/${feedbackId}/attach`, {
    method: 'POST', credentials: 'include', body: fd,
  })
  if (res.status === 401) { handle401(); throw new Error('세션 만료') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || '첨부 업로드 실패')
  return data.feedback
}

// presigned URL 발급 (본인 OR 어드민)
export const getFeedbackAttachmentUrl = (feedbackId) =>
  fetchJson(`${BASE_URL}/feedback/${feedbackId}/attach`).then((r) => r.url)

// 어드민 — 목록 (status, category 필터 선택)
export const listAdminFeedback = ({ status = '', category = '' } = {}) => {
  const q = new URLSearchParams()
  if (status) q.set('status', status)
  if (category) q.set('category', category)
  const qs = q.toString()
  return fetchJson(`${BASE_URL}/feedback/admin${qs ? `?${qs}` : ''}`).then((r) => r.items || [])
}

// 어드민 — severity / status / admin_note 갱신
export const updateAdminFeedback = (feedbackId, patch) =>
  fetchJson(`${BASE_URL}/feedback/admin/${feedbackId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => r.feedback)
