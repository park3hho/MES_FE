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

  // await delay(600)
  // if (!id || !password) throw new Error('아이디와 비밀번호를 입력하세요.')
  // return { user: id }
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

export async function printLot(lotNo, printCount = 1, fields = {}) {
  const res = await fetch(`${BASE_URL}/printer/print-label`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ LOT_num: lotNo, print_count: printCount, ...fields,}),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.detail || '인쇄 실패')
  }
  return res.json()

  // await delay(1000)
  // return { success: true }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}