// src/components/Inventory/inventoryHelpers.js
// 재고 summary 원본 → 셀/행에서 쓰기 좋은 형태로 가공
// 사용처: InventoryListView(Row), InventoryBoardView(Cell)

// raw = data[processKey] (getInventorySummary 응답)
// 반환: { qty, today, phiDist }
//   qty 유형:
//     - number                                  (대부분 평면 공정)
//     - { weight, qty, unit: 'kg' }             (RM, MP)
//     - { filled, empty, total }                (UB, MB)
//     - { oqPending, probe }                    (OQ)
export function processCellData(key, raw) {
  let cellQty = raw ?? 0
  let today = null
  let phiDist = null
  let motorDist = null // Phase B: { "87": {"outer": 3, "inner": 2}, ... }

  if (cellQty && typeof cellQty === 'object') {
    if ('today' in cellQty) today = cellQty.today
    if ('phi_dist' in cellQty) phiDist = cellQty.phi_dist
    if ('motor_dist' in cellQty) motorDist = cellQty.motor_dist
  }

  // OQ: 검사중(PENDING+RECHECK) 메인 + PROBE(조사)는 서브
  if (key === 'OQ' && cellQty && typeof cellQty === 'object') {
    const pending =
      cellQty.total -
      (cellQty.completed || 0) -
      (cellQty.fail || 0) -
      (cellQty.probe || 0)
    cellQty = {
      oqPending: Math.max(0, pending),
      probe: cellQty.probe || 0,
    }
  }
  // BE 신규 스키마 {total, today, phi_dist} — 평면 공정은 total만 추출
  else if (
    cellQty &&
    typeof cellQty === 'object' &&
    'total' in cellQty &&
    !('filled' in cellQty) &&
    !('completed' in cellQty) &&
    !('unit' in cellQty)
  ) {
    cellQty = cellQty.total
  }

  return { qty: cellQty, today, phiDist, motorDist }
}

// motorDist({ "87": {"outer": 3, "inner": 2} }) → 평탄화
// [{ phi: "87", motor: "outer", count: 3 }, ...]
// 유효한 motor만 (outer/inner) 반환 — unknown/빈값 제외
// 정렬: phi 내림차순(87, 70, 45, 20), motor outer → inner 순
const MOTOR_ORDER = { outer: 0, inner: 1 }
export function expandByMotorType(motorDist) {
  if (!motorDist || typeof motorDist !== 'object') return []
  const rows = []
  for (const [phi, motors] of Object.entries(motorDist)) {
    if (!motors || typeof motors !== 'object') continue
    for (const [motor, count] of Object.entries(motors)) {
      if (!count || count <= 0) continue
      if (motor !== 'outer' && motor !== 'inner') continue
      rows.push({ phi, motor, count })
    }
  }
  // phi 숫자 내림차순, 같은 phi 내 outer → inner
  rows.sort((a, b) => {
    const pa = parseInt(a.phi) || 0
    const pb = parseInt(b.phi) || 0
    if (pa !== pb) return pb - pa
    return (MOTOR_ORDER[a.motor] ?? 9) - (MOTOR_ORDER[b.motor] ?? 9)
  })
  return rows
}

// motor_type 약어 표시 — UI 배지용
export const motorBadge = (m) => (m === 'outer' ? 'O' : m === 'inner' ? 'I' : '')
