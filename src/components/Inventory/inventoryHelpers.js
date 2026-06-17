// src/components/Inventory/inventoryHelpers.js
// 재고 summary 원본 → 셀/행에서 쓰기 좋은 형태로 가공
// 사용처: InventoryListView(Row), InventoryBoardView(Cell)

// raw = data[processKey] (getInventorySummary 응답)
// 반환: { qty, today, todayRepair, phiDist }
//   qty 유형:
//     - number                                  (대부분 평면 공정)
//     - { weight, qty, unit: 'kg' }             (RM, MP)
//     - { filled, empty, total }                (UB, MB)
//     - { oqPending, probe }                    (OQ)
export function processCellData(key, raw) {
  let cellQty = raw ?? 0
  let today = null
  let todayRepair = null  // 2026-04-27: 그 중 공정 되돌리기 LOT 카운트
  let phiDist = null
  let motorDist = null // Phase B: { "87": {"outer": 3, "inner": 2}, ... }

  if (cellQty && typeof cellQty === 'object') {
    if ('today' in cellQty) today = cellQty.today
    if ('today_repair' in cellQty) todayRepair = cellQty.today_repair
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

  return { qty: cellQty, today, todayRepair, phiDist, motorDist }
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

// 메타(Meta) 제품 판정 — 95/87/70/45 는 모터 무관, 20 은 내전(inner)만 (외전형은 별도, 2026-06-17).
//   META_PHIS = ['95','87','70','45','20']. 20 외전형은 메타 아님.
import { META_PHIS } from '@/constants/processConst'
const META_PHI_SET = new Set(META_PHIS)
export function isMetaPhiMotor(phi, motor) {
  if (!META_PHI_SET.has(phi)) return false
  if (phi === '20') return motor === 'inner'   // 20파이는 내전만 메타
  return true                                   // 그 외 메타 파이는 모터 무관
}

// raw 셀을 메타 제품만으로 제한 (실시간 재고 "메타만" 토글, 2026-06-17)
//   - motor_dist 있으면 (phi,motor) 단위 정밀 필터 → 20 외전 제외 가능.
//   - motor_dist 없는 셀(박스 등)은 phi 단위 (20 외전 못 가름 → 일단 포함).
//   - total 이 phi 합과 동일한 평면 파이공정(BO/EC/WI/SO/FP 등)만 total 재계산.
//     box(filled/total)·OQ(total=검사건수) 는 total 의미가 달라 그대로 두고 분포만 제한.
//   - phi_dist 없는 셀(RM/MP weight, OB)·숫자/null 은 그대로 통과 (필터 불가).
export function filterRawToMeta(raw) {
  if (!raw || typeof raw !== 'object' || !raw.phi_dist) return raw
  const phi_dist = {}
  const motor_dist = {}
  let sum = 0
  const md = raw.motor_dist
  if (md && Object.keys(md).length) {
    for (const [phi, motors] of Object.entries(md)) {
      for (const [motor, cnt] of Object.entries(motors)) {
        if (!isMetaPhiMotor(phi, motor)) continue
        motor_dist[phi] = motor_dist[phi] || {}
        motor_dist[phi][motor] = cnt
        phi_dist[phi] = (phi_dist[phi] || 0) + cnt
        sum += cnt
      }
    }
  } else {
    // 모터 분포 없음 (박스 등) → phi 단위, 20 은 외전 분리 불가라 포함
    for (const [phi, cnt] of Object.entries(raw.phi_dist)) {
      if (!META_PHI_SET.has(phi)) continue
      phi_dist[phi] = cnt
      sum += cnt
    }
  }
  const out = { ...raw, phi_dist, motor_dist }
  if ('total' in raw && !('filled' in raw) && !('completed' in raw)) {
    out.total = sum
  }
  return out
}
