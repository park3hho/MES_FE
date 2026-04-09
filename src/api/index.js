const BASE_URL = import.meta.env.VITE_API_URL || ''

// ── 공통 fetch 래퍼 ──

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options })
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

async function postJson(url, body, errorMsg) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function fetchBlob(url, errorMsg = '다운로드 실패') {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(errorMsg)
  return res.blob()
}

// ── 인증 ──

export const login = (id, password) =>
  postJson(`${BASE_URL}/auth/login`, { login_id: id, password })

export const logout = () =>
  fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' })

// ── QR 스캔 / LOT 이력 ──

export const scanLot = (process, lotNo) =>
  postJson(`${BASE_URL}/lot/${process}/scan`, { lot_no: lotNo })

export const traceLot = (lotNo) =>
  postJson(`${BASE_URL}/lot/trace`, { lot_no: lotNo })

export const repairLot = (lotNo, destProcess) =>
  postJson(`${BASE_URL}/lot/repair`, { lot_no: lotNo, dest_process: destProcess })

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

export const getTestStatus = (lotSoNo) =>
  fetchJson(`${BASE_URL}/lot/oq/test-status/${encodeURIComponent(lotSoNo)}`)

export async function getOqInspections(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v) })
  return fetchJson(`${BASE_URL}/lot/oq/inspections?${params}`)
}

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

export const getBoxItems = (lotNo) =>
  fetchJson(`${BASE_URL}/box/${lotNo}/items`)

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

export const downloadPackingList = (obLotNo) =>
  fetchBlob(`${BASE_URL}/lot/ob/${obLotNo}/packing-list`)

// ── 인증서 ──

export const verifyCert = (obLotNo, password) =>
  postJson(`${BASE_URL}/cert/${obLotNo}/verify`, { password })

// ── 시딩 (임시) ──

export function seedHT(lotRmNo, lotMpNo, lotEaNo, vendor, phi, motorType, count, lotHtNo = null) {
  const body = { lot_rm_no: lotRmNo, lot_mp_no: lotMpNo, lot_ea_no: lotEaNo, vendor, phi, motor_type: motorType, count }
  if (lotHtNo) body.lot_ht_no = lotHtNo
  return postJson(`${BASE_URL}/seed/ht`, body)
}

export const seedChain = (data) =>
  postJson(`${BASE_URL}/seed/chain`, data)
