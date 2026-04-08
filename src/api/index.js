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
      lot_num: lotNo,
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

// ── OQ 검사 ──

export async function printStLabel(serialNo, lotOqNo) {
  const res = await fetch(`${BASE_URL}/printer/print-st`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ serial_no: serialNo, lot_oq_no: lotOqNo }),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || 'ST 라벨 출력 실패')
  }
  return res.json()
}

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

export async function submitTest1(data) {
  const res = await fetch(`${BASE_URL}/lot/oq/test1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || '테스트1 저장 실패')
  }
  return res.json()
}

export async function submitTest2(data) {
  const res = await fetch(`${BASE_URL}/lot/oq/test2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || '테스트2 저장 실패')
  }
  return res.json()
}
export async function getTestStatus(lotSoNo) {
  const res = await fetch(`${BASE_URL}/lot/oq/test-status/${encodeURIComponent(lotSoNo)}`, {
    credentials: 'include',
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || '테스트 상태 조회 실패')
  }
  return res.json()
}

// ── 박스 관리 ──

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

// ── 재고 조회 ──

export async function getInventorySummary() {
  const res = await fetch(`${BASE_URL}/inventory/summary`, { credentials: 'include' })
  if (!res.ok) throw new Error('재고 조회 실패')
  return res.json()
}

export async function getInventoryDetail(process) {
  const res = await fetch(`${BASE_URL}/inventory/detail/${process}`, { credentials: 'include' })
  if (!res.ok) throw new Error('재고 상세 조회 실패')
  return res.json()
}

export async function getBoxSummary(process) {
  const res = await fetch(`${BASE_URL}/box/summary/${process}`, { credentials: 'include' })
  if (!res.ok) throw new Error('박스 조회 실패')
  return res.json()
}

export async function getBoxItems(lotNo) {
  const res = await fetch(`${BASE_URL}/box/${lotNo}/items`, { credentials: 'include' })
  if (!res.ok) throw new Error('박스 내용물 조회 실패')
  return res.json()
}

// ── OB 출하 / 엑셀 ──

export async function getObList() {
  const res = await fetch(`${BASE_URL}/lot/ob/list`, { credentials: 'include' })
  if (!res.ok) throw new Error('출하 목록 조회 실패')
  return res.json()
}

export async function getObDetail(obLotNo) {
  const res = await fetch(`${BASE_URL}/lot/ob/${obLotNo}/detail`, { credentials: 'include' })
  if (!res.ok) throw new Error('출하 상세 조회 실패')
  return res.json()
}

export async function downloadObExcel(obLotNo) {
  const res = await fetch(`${BASE_URL}/lot/ob/${obLotNo}/export`, { credentials: 'include' })
  if (!res.ok) throw new Error('엑셀 다운로드 실패')
  return res.blob()
}

// ── LOT 관리 ──

export async function repairLot(lotNo, destProcess) {
  const res = await fetch(`${BASE_URL}/lot/repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ lot_no: lotNo, dest_process: destProcess }),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || '수리 처리 실패')
  }
  return res.json()
}

// ── 인증서 ──

export async function verifyCert(obLotNo, password) {
  const res = await fetch(`${BASE_URL}/cert/${obLotNo}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || '인증 실패')
  }
  return res.json()
}

export async function downloadAllOqExcel() {
  const res = await fetch(`${BASE_URL}/lot/oq/export-all`, { credentials: 'include' })
  if (!res.ok) throw new Error('전체 OQ 엑셀 다운로드 실패')
  return res.blob()
}

export async function getOqInspections(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v) })
  const res = await fetch(`${BASE_URL}/lot/oq/inspections?${params}`, { credentials: 'include' })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || 'OQ 검사 목록 조회 실패')
  }
  return res.json()
}

export async function downloadFilteredOqExcel(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v) })
  const res = await fetch(`${BASE_URL}/lot/oq/export-filtered?${params}`, { credentials: 'include' })
  if (!res.ok) throw new Error('필터 OQ 엑셀 다운로드 실패')
  return res.blob()
}

export async function downloadPackingList(obLotNo) {
  const res = await fetch(`${BASE_URL}/lot/ob/${obLotNo}/packing-list`, { credentials: 'include' })
  if (!res.ok) throw new Error('패킹리스트 다운로드 실패')
  return res.blob()
}

// ── HT 시딩 (임시) ──

export async function seedHT(lotRmNo, lotMpNo, lotEaNo, vendor, phi, motorType, count, lotHtNo = null) {
  const body = {
    lot_rm_no: lotRmNo,
    lot_mp_no: lotMpNo,
    lot_ea_no: lotEaNo,
    vendor,
    phi,
    motor_type: motorType,
    count,
  }
  if (lotHtNo) body.lot_ht_no = lotHtNo
  const res = await fetch(`${BASE_URL}/seed/ht`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || 'HT 시딩 실패')
  }
  return res.json()
}

// ── 체인 시딩 (임시) — RM~SO 임의 구간 ──
export async function seedChain(data) {
  const res = await fetch(`${BASE_URL}/seed/chain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const d = await res.json()
    throw new Error(d.detail || '체인 시딩 실패')
  }
  return res.json()
}
