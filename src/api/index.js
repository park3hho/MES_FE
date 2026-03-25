// ── 기존 submitInspection 아래에 추가 ──

// ★ 박스 생성 + QR 출력
// 호출: BoxManager.jsx → 박스 생성 화면
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

// ★ 박스 QR 스캔 → 존재 확인 + 기존 내용물
// 호출: BoxManager.jsx → 첫 스캔(박스 QR)
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

// ★ 아이템 리스트 확정 — DB만 처리, 출력 없음
// 호출: BoxManager.jsx → 확인 버튼
export async function confirmBox(boxLotNo, items) {
  const res = await fetch(`${BASE_URL}/box/${boxLotNo}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ items }),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || '확정 실패')
  }
  return res.json()
}
