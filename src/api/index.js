const BASE_URL = import.meta.env.VITE_API_URL || ''

export async function login(id, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ login_id: id, password }),
  })
  if (!res.ok) throw new Error('로그인 실패')
  return res.json()
}

export async function logout() {
  await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
}

export async function scanLot(process, lotNo) {
  const res = await fetch(`${BASE_URL}/lot/${process}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ lot_no: lotNo }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.detail || 'QR 인식 실패')
  }
  return res.json()
}

export async function traceLot(lotNo) {
  const res = await fetch(`${BASE_URL}/lot/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ lot_no: lotNo }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.detail || '이력 조회 실패')
  }
  return res.json()
}

export async function discardLot(lotNo, quantity = null, reason = null) {
  const res = await fetch(`${BASE_URL}/lot/discard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ lot_no: lotNo, quantity, reason }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.detail || '폐기 처리 실패')
  }
  return res.json()
}
// 수정 — print_count를 외부에서 받도록
export async function printLot(lotNo, printCount = 1, fields = {}) {
  const res = await fetch(`${BASE_URL}/printer/print-label`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      LOT_num: lotNo,
      print_count: printCount, // 개체 수 그대로 전달
      ...fields,
    }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.detail || '인쇄 실패')
  }
  return res.json()
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── 기존 printLot 함수 아래에 추가 ──

export async function submitInspection(data) {
  const res = await fetch(`${BASE_URL}/lot/oq/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || '검사 저장 실패')
  }
  return res.json()
}
// ── 기존 submitInspection 함수 아래에 추가 ──
// ── 기존 submitInspection 함수 바로 아래 ──

export async function createBox(process, worker, printCount = 1) {
  const res = await fetch(`${BASE_URL}/box/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ process, worker, print_count: printCount }),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || '박스 생성 실패')
  }
  return res.json()
}

export async function scanBox(lotNo) {
  const res = await fetch(`${BASE_URL}/box/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ lot_no: lotNo }),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || '박스 스캔 실패')
  }
  return res.json()
}

export async function addBoxItem(boxLotNo, itemLotNo) {
  const res = await fetch(`${BASE_URL}/box/${boxLotNo}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ item_lot_no: itemLotNo }),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || '아이템 추가 실패')
  }
  return res.json()
}

export async function removeBoxItem(boxLotNo, itemLotNo) {
  const res = await fetch(`${BASE_URL}/box/${boxLotNo}/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ item_lot_no: itemLotNo }),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || '아이템 제거 실패')
  }
  return res.json()
}
