const BASE_URL = import.meta.env.VITE_API_URL || ''

// ── 401 감지 → 자동 로그아웃 ──
function handle401() {
  localStorage.removeItem('user')
  // 이미 로그인 페이지면 무시
  if (window.__handling401) return
  window.__handling401 = true
  alert('세션이 만료되었습니다. 다시 로그인해주세요.')
  window.location.reload()
}

// ── 공통 fetch 래퍼 ──

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
      if (d.detail) detail = d.detail
    } catch { /* json 파싱 불가 시 기본 메시지 */ }
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

export const traceLot = (lotNo) =>
  postJson(`${BASE_URL}/lot/trace`, { lot_no: lotNo })

export const repairLot = (lotNo, destProcess, reason = '') =>
  postJson(`${BASE_URL}/lot/repair`, { lot_no: lotNo, dest_process: destProcess, reason })

// ── 프린트 ──

export const printLot = (lotNo, printCount = 1, fields = {}) =>
  postJson(`${BASE_URL}/printer/print-label`, { lot_num: lotNo, print_count: printCount, ...fields })

export const printStLabel = (serialNo, lotOqNo) =>
  postJson(`${BASE_URL}/printer/print-st`, { serial_no: serialNo, lot_oq_no: lotOqNo })

// ── OQ 검사 ──

export const submitInspection = (data) =>
  postJson(`${BASE_URL}/lot/oq/inspect`, data)

export const submitTest1 = (data) =>
  postJson(`${BASE_URL}/lot/oq/test1`, data)

export const submitTest2 = (data) =>
  postJson(`${BASE_URL}/lot/oq/test2`, data)

export const getInspectionData = (lotSoNo) =>
  fetchJson(`${BASE_URL}/lot/oq/data/${encodeURIComponent(lotSoNo)}`)

export async function getOqInspections(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v) })
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

export const scanBox = (lotNo) =>
  postJson(`${BASE_URL}/box/scan`, { lot_no: lotNo })

export const addBoxItem = (boxLotNo, itemLotNo) =>
  postJson(`${BASE_URL}/box/${boxLotNo}/add`, { item_lot_no: itemLotNo })

export const removeBoxItem = (boxLotNo, itemLotNo) =>
  postJson(`${BASE_URL}/box/${boxLotNo}/remove`, { item_lot_no: itemLotNo })

// ── 재고 조회 ──

export const getInventorySummary = () =>
  fetchJson(`${BASE_URL}/inventory/summary`)

export const getInventoryDetail = (process) =>
  fetchJson(`${BASE_URL}/inventory/detail/${process}`)

export const getFinishedProducts = () =>
  fetchJson(`${BASE_URL}/inventory/finished-products`)

export const getBoxSummary = (process) =>
  fetchJson(`${BASE_URL}/box/summary/${process}`)

// UB + MB 통합 요약 — 호출 수 절감 (2026-04-21)
export const getBoxSummaryAll = () =>
  fetchJson(`${BASE_URL}/box/summary-all`)

export const getBoxItems = (lotNo) =>
  fetchJson(`${BASE_URL}/box/${lotNo}/items`)

// ── Phase C: RT 로터 재고 ──
export const getRotorStocks = () =>
  fetchJson(`${BASE_URL}/inventory/rotor`)

export const getRotorSummary = () =>
  fetchJson(`${BASE_URL}/inventory/rotor/summary`)

export const createRotorStock = (data) =>
  postJson(`${BASE_URL}/inventory/rotor`, data)

export const updateRotorStock = (id, data) =>
  fetchJson(`${BASE_URL}/inventory/rotor/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const deleteRotorStock = (id) =>
  fetchJson(`${BASE_URL}/inventory/rotor/${id}`, { method: 'DELETE' })

// 박스 확인 (MB 전체 트리 + 엑셀) — BoxCheckPage
export const getBoxMbFull = (mbLotNo) =>
  fetchJson(`${BASE_URL}/box/mb/${mbLotNo}/full`)

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

export const getObList = () =>
  fetchJson(`${BASE_URL}/lot/ob/list`)

export const getObDetail = (obLotNo) =>
  fetchJson(`${BASE_URL}/lot/ob/${obLotNo}/detail`)

export const downloadObExcel = (obLotNo) =>
  fetchBlob(`${BASE_URL}/lot/ob/${obLotNo}/export`)

export const downloadAllOqExcel = () =>
  fetchBlob(`${BASE_URL}/lot/oq/export-all`)

export async function downloadFilteredOqExcel(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v) })
  return fetchBlob(`${BASE_URL}/lot/oq/export-filtered?${params}`)
}

export const downloadKtReport = (inspectionId) =>
  fetchBlob(`${BASE_URL}/lot/oq/inspection/${inspectionId}/export`)

export const downloadPackingList = (obLotNo) =>
  fetchBlob(`${BASE_URL}/lot/ob/${obLotNo}/packing-list`)

// ── 인증서 ──

export const verifyCert = (obLotNo, password) =>
  postJson(`${BASE_URL}/cert/${obLotNo}/verify`, { password })

// ── 시딩 (임시) ──

export const seedChain = (data) =>
  postJson(`${BASE_URL}/seed/chain`, data)

export const getLinesData = () =>
  fetchJson(`${BASE_URL}/statistics/lines-data`)

// ── 송장(Invoice) — admin_rnd 전용 ──

// 업로드 (multipart) — file은 선택 (없으면 metadata만 생성)
export async function uploadInvoice({ invoiceNo, title = '', customer = '', notes = '', file = null }) {
  const form = new FormData()
  form.append('invoice_no', invoiceNo)
  form.append('title', title)
  form.append('customer', customer)
  form.append('notes', notes)
  if (file) form.append('file', file)  // null이면 append 하지 않음 — BE 쪽에서 None 처리
  const res = await fetch(`${BASE_URL}/invoice/upload`, {
    method: 'POST',
    credentials: 'include',
    body: form,   // Content-Type 자동 설정 (boundary 포함) — 직접 넣지 말 것
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
export const getInvoicePreviewUrl = (id) =>
  fetchJson(`${BASE_URL}/invoice/${id}/preview`)

// PDF 다운로드 URL (attachment)
export const getInvoiceDownloadUrl = (id) =>
  fetchJson(`${BASE_URL}/invoice/${id}/download`)

// 원본 파일(xlsx/xls) 다운로드 URL — admin_rnd 전용
export const getInvoiceOriginalUrl = (id) =>
  fetchJson(`${BASE_URL}/invoice/${id}/original`)

// 삭제 — admin_rnd 전용
export const deleteInvoice = (id) =>
  fetchJson(`${BASE_URL}/invoice/${id}`, { method: 'DELETE' })

// ── 인보이스 진척률 (2026-04-21) ──

// 요구 항목 upsert — items: [{phi, motor_type, quantity}]
export const setInvoiceItems = (invoiceId, items) =>
  fetchJson(`${BASE_URL}/invoice/${invoiceId}/items`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })

// 상세 — 요구 항목별 진행률 + 할당된 MB 목록
export const getInvoiceDetail = (invoiceId) =>
  fetchJson(`${BASE_URL}/invoice/${invoiceId}/detail`)

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
export const getInvoiceProgress = () =>
  fetchJson(`${BASE_URL}/invoice/progress`)

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
