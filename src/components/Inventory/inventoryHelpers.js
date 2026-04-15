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

  if (cellQty && typeof cellQty === 'object') {
    if ('today' in cellQty) today = cellQty.today
    if ('phi_dist' in cellQty) phiDist = cellQty.phi_dist
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

  return { qty: cellQty, today, phiDist }
}
