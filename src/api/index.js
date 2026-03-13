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

// quantity: 실제 산출물 수량 (재고 반영)
// 라벨 출력은 항상 1장 고정 (print_count=1)
export async function printLot(lotNo, quantity = 1, fields = {}) {
  const res = await fetch(`${BASE_URL}/printer/print-label`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      LOT_num: lotNo,
      print_count: 1,       // 라벨 항상 1장
      quantity,             // 실제 수량
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
  return new Promise(resolve => setTimeout(resolve, ms))
}