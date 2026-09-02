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
  //   ★ BE 가 직접 센 pending 을 쓴다 (2026-08-31). 옛 뺄셈(total−completed−fail−probe)은
  //     어느 분류에도 없는 행까지 삼켜 phi 칩·상세 목록과 숫자가 어긋났다(54 vs 18).
  //     구버전 BE 응답 호환으로 폴백만 남긴다 — BE 재시작 전에도 화면이 죽지 않게.
  if (key === 'OQ' && cellQty && typeof cellQty === 'object') {
    const pending = Number.isFinite(cellQty.pending)
      ? cellQty.pending
      : Math.max(0, cellQty.total - (cellQty.completed || 0)
          - (cellQty.fail || 0) - (cellQty.probe || 0))
    cellQty = {
      oqPending: pending,
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

// (phi_dist, motor_dist) 한 쌍을 메타 제품만으로 잘라낸다 — 잘린 분포 + 합계.
//   - motor_dist 있으면 (phi,motor) 단위 정밀 필터 → 20 외전 제외 가능.
//   - motor_dist 없는 셀(박스 등)은 phi 단위 (20 외전 못 가름 → 일단 포함).
function metaSlice(phiDist, motorDist) {
  const phi_dist = {}
  const motor_dist = {}
  let sum = 0
  if (motorDist && Object.keys(motorDist).length) {
    for (const [phi, motors] of Object.entries(motorDist)) {
      for (const [motor, cnt] of Object.entries(motors)) {
        if (!isMetaPhiMotor(phi, motor)) continue
        motor_dist[phi] = motor_dist[phi] || {}
        motor_dist[phi][motor] = cnt
        phi_dist[phi] = (phi_dist[phi] || 0) + cnt
        sum += cnt
      }
    }
  } else {
    for (const [phi, cnt] of Object.entries(phiDist || {})) {
      if (!META_PHI_SET.has(phi)) continue
      phi_dist[phi] = cnt
      sum += cnt
    }
  }
  return { phi_dist, motor_dist, sum }
}

// raw 셀을 메타 제품만으로 제한 (실시간 재고 "메타만" 토글, 2026-06-17)
//   - total 이 phi 합과 동일한 평면 파이공정(BO/EC/WI/SO/FP 등)만 total 재계산.
//     box(filled/total) 는 total 의미가 달라 분포만 제한.
//   - OQ (2026-08-31): total(=검사건수 누계)은 그대로 두고, 화면에 뜨는 두 값
//     pending(검사중)·probe(조사)를 각자의 분포로 다시 센다 — 이전엔 뺄셈 값이라
//     phi 로 쪼갤 수가 없어 '메타만' 을 눌러도 OQ 만 숫자가 안 변했다.
//   - phi_dist 없는 셀(RM/MP weight, OB)·숫자/null 은 그대로 통과 (필터 불가).
export function filterRawToMeta(raw) {
  if (!raw || typeof raw !== 'object' || !raw.phi_dist) return raw
  const main = metaSlice(raw.phi_dist, raw.motor_dist)
  const out = { ...raw, phi_dist: main.phi_dist, motor_dist: main.motor_dist }
  if ('total' in raw && !('filled' in raw) && !('completed' in raw)) {
    out.total = main.sum
  }
  if ('pending' in raw) out.pending = main.sum        // OQ 메인 숫자
  if (raw.probe_dist) {                                // OQ '조사' 칩
    const p = metaSlice(raw.probe_dist, raw.probe_motor_dist)
    out.probe_dist = p.phi_dist
    out.probe_motor_dist = p.motor_dist
    out.probe = p.sum
  }
  return out
}

// 상세 패널(LOT 목록)도 같은 범위로 제한 (2026-08-14)
//   ★ 셀 수량이 필터되는 곳에서만 필터한다 — filterRawToMeta 가 total 을 다시 계산하는 조건
//     (평면 파이 공정 · 회전자 공정)과 정확히 짝을 맞춰야 카드와 목록이 어긋나지 않는다.
//     박스(UB/MB)는 total 이 그대로라 여기서도 건드리지 않는다 — 건드리면 새 불일치가 생김.
//     OQ 는 2026-08-31 부터 셀 숫자(pending)가 필터되므로 상세도 함께 필터한다.
//   group.key = phi, item.motor_type = outer/inner (BE 가 상세 응답에 실어줌).
//   ★ 빈 motor_type 은 'unknown' 으로 정규화 — summary 의 motor_dist 집계와 같은 규칙이라야
//     Φ20 레거시 행(모터 미기재)이 카드에선 빠지고 목록엔 남는 반대 불일치가 안 생긴다.
export function filterDetailToMeta(detail) {
  if (!detail || detail.display_type !== 'grouped' || !Array.isArray(detail.groups)) return detail

  const groups = []
  let sum = 0
  for (const g of detail.groups) {
    if (!META_PHI_SET.has(g.key)) continue
    const items = (g.items || []).filter(
      (it) => isMetaPhiMotor(g.key, (it.motor_type || '').trim().toLowerCase() || 'unknown'),
    )
    if (!items.length) continue
    const total = items.reduce((a, it) => a + Number(it.quantity || 0), 0)
    groups.push({ ...g, items, total })
    sum += total
  }
  // total 이 객체({qty,weight})인 셀(RM/MP)은 파이 그룹이 아니므로 여기 오지 않는다 — 숫자만 재계산.
  const total = typeof detail.total === 'number' ? Math.round(sum * 1000) / 1000 : detail.total
  return { ...detail, groups, total }
}
