const BASE_URL = import.meta.env.VITE_API_URL || ''

// ── Auth ────────────────────────────────────────────────────────

export async function login(id, password) {
  // TODO: 실제 API 연결 시 아래 주석 해제
  // const res = await fetch(`${BASE_URL}/api/auth/login`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ id, password }),
  // })
  // if (!res.ok) throw new Error('로그인 실패')
  // return res.json()   // { access_token, user }

  // 임시: 로컬 테스트용 mock
  await delay(600)
  if (!id || !password) throw new Error('아이디와 비밀번호를 입력하세요.')
  return { user: id }
}

// ── Print ───────────────────────────────────────────────────────

export async function printLot(lotNo, token) {
  // TODO: 실제 API 연결 시 아래 주석 해제
  // const res = await fetch(`${BASE_URL}/api/print`, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${token}`,
  //   },
  //   body: JSON.stringify({ lot_no: lotNo }),
  // })
  // if (!res.ok) throw new Error('인쇄 실패')
  // return res.json()

  // 임시: 로컬 테스트용 mock
  await delay(1000)
  return { success: true }
}

// ── Utils ───────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
