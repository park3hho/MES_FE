// utils/workTime.js
// 작업일지 구간 헬퍼 (2026-08-12, 2026-08-13 날짜 포함으로 개편).
//
// 값 형식 = `datetime-local` 그대로인 'YYYY-MM-DDTHH:MM' (로컬 시각, tz 표기 없음).
//   ★ Date#toISOString() 을 쓰면 UTC 로 바뀌어 9시간 어긋난다 — 문자열로 직접 조립할 것.
//   ★ 시각만(HH:MM) 받으면 야간 작업(전날 22:00 → 당일 01:00)을 표현할 수 없어 날짜를 포함한다.
//   BE 는 tz 없는 ISO 를 KST 로 해석한다(work_log_service.parse_work_time).

const DT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

// 최소 작업 구간 — 종료 < 시작(및 0분)을 입력 단계에서 아예 막기 위한 하한
export const MIN_SPAN_MS = 60 * 1000

const p2 = (n) => String(n).padStart(2, '0')

/** 'YYYY-MM-DDTHH:MM' → epoch ms (로컬 해석). 형식이 아니면 null. */
export function dtLocalToMs(v) {
  const m = DT.exec(v || '')
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  return new Date(+y, +mo - 1, +d, +h, +mi, 0, 0).getTime()
}

/** epoch ms → 'YYYY-MM-DDTHH:MM' (로컬). */
export function msToDtLocal(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
    + `T${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** 시간(HH:MM)은 그대로 두고 날짜만 교체 — 작업일을 바꿀 때 시각이 따라오게. */
export function reDate(dtLocal, isoDay) {
  const m = DT.exec(dtLocal || '')
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(isoDay || '')) return dtLocal
  return `${isoDay}T${m[4]}:${m[5]}`
}

/** 구간 표시 — 음수는 나올 수 없게 입력에서 막지만, 방어적으로 0 이하는 빈 문자열. */
export function spanText(start, end) {
  const a = dtLocalToMs(start)
  const b = dtLocalToMs(end)
  if (a == null || b == null) return ''
  const min = Math.round((b - a) / 60000)
  if (min <= 0) return ''
  const h = Math.floor(min / 60)
  return h ? `${h}시간 ${min % 60}분` : `${min}분`
}

/**
 * 발급 요청 body 로 변환. 값이 없거나 구간이 유효하지 않으면 아무것도 안 실어 보낸다
 * → BE 가 자동 추정(직전 종료 ~ 지금)으로 폴백한다.
 */
export function workTimeBody(workTime) {
  const a = dtLocalToMs(workTime?.start)
  const b = dtLocalToMs(workTime?.end)
  if (a == null || b == null || b <= a) return {}
  // 정지는 구간 그대로 보낸다 — BE 가 그 시각에 걸친 행만 깎는다(분만 보내면 균등 분배로 되돌아간다).
  const stops = (workTime.stops || [])
    .filter((st) => stopMinutes(st, a, b) > 0)
    .map(({ group, category, start, end, auto, note }) => ({
      group, category, auto: !!auto, note: note || '',
      started_at: `${start}:00`, ended_at: `${end}:00`,
    }))
  // ★ 비어 있어도 반드시 보낸다 — 안 보내면 BE 가 '미전송'으로 보고 휴게를 다시 자동 계산해서,
  //   화면에서 지운 휴게가 되살아난다(점심에도 돌린 날 가동시간이 조용히 깎임).
  return {
    work_started_at: `${workTime.start}:00`,
    work_ended_at: `${workTime.end}:00`,
    work_stops: stops,
  }
}

// ── 정지(비가동) ─────────────────────────────────────────────
// stops = [{ key, group, category, start, end, auto, note }]
//   start/end 는 작업시간과 같은 'YYYY-MM-DDTHH:MM'.
//   ★ 분(分)이 아니라 **구간**으로 받는다 (2026-08-18 변경) — 예전엔 분만 받아 LOT N행에 균등
//     분배했는데, 그러면 "몇 시에 멈췄나"가 기록에서 사라지고 실제로 멈춘 행과 무관하게 시간이
//     깎였다. 구간이면 그 시각에 걸친 행만 정확히 깎이고 현장 일지와 그대로 맞는다.
//   auto=true = 등록된 휴게시간과 작업 구간이 겹쳐 자동으로 들어간 항목.
//     작업 구간이 바뀔 때마다 auto 항목만 다시 계산한다(사람이 넣은 건 건드리지 않음).

let seq = 0
export const newStopKey = () => `st${(seq += 1)}`

const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

/** 정지 항목 → [시작ms, 종료ms]. 구간이 없거나 뒤집혔으면 null. */
export function stopSpan(st) {
  const a = dtLocalToMs(st?.start)
  const b = dtLocalToMs(st?.end)
  return a == null || b == null || b <= a ? null : [a, b]
}

/** 정지 1건의 분 — 작업 구간(a,b)을 주면 그 안쪽만 센다(밖으로 삐져나간 몫은 안 깎임). */
export function stopMinutes(st, a = null, b = null) {
  const sp = stopSpan(st)
  if (!sp) return 0
  const [s0, e0] = sp
  const ms = a == null || b == null ? e0 - s0 : overlap(s0, e0, a, b)
  return Math.round(ms / 60000)
}

/** 작업 구간 밖으로 나갔는지 — 화면에서 표시해 준다(자동 삭제하면 왜 사라졌는지 알 수 없다). */
export function stopOutside(st, start, end) {
  const sp = stopSpan(st)
  const a = dtLocalToMs(start)
  const b = dtLocalToMs(end)
  if (!sp || a == null || b == null) return false
  return overlap(sp[0], sp[1], a, b) < sp[1] - sp[0]
}

/** 정지 합(분) — 겹친 구간을 **합집합**으로 센다. 겹침을 그냥 더하면 가동시간이 이중으로 깎인다. */
export function totalStopMin(stops, start = null, end = null) {
  const a = start == null ? null : dtLocalToMs(start)
  const b = end == null ? null : dtLocalToMs(end)
  const spans = (stops || [])
    .map(stopSpan)
    .filter(Boolean)
    .map(([s0, e0]) => (a == null || b == null
      ? [s0, e0]
      : [Math.max(s0, a), Math.min(e0, b)]))
    .filter(([s0, e0]) => e0 > s0)
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let cur = null
  for (const [s0, e0] of spans) {
    if (!cur || s0 > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [s0, e0] } else if (e0 > cur[1]) cur[1] = e0
  }
  if (cur) total += cur[1] - cur[0]
  return Math.round(total / 60000)
}

/** 작업 구간 × 등록 휴게 → 자동 정지 항목. 자정을 넘기면 날짜별로 하나씩 만든다. */
export function autoBreakStops(start, end, breaks, autoGroup = 'planned') {
  const a = dtLocalToMs(start)
  const b = dtLocalToMs(end)
  if (a == null || b == null || b <= a || !breaks?.length) return []
  const out = []
  for (let d = dayStart(a); d <= dayStart(b); d += 86400000) {
    for (const br of breaks) {
      const s0 = Math.max(a, d + br.start_min * 60000)
      const e0 = Math.min(b, d + br.end_min * 60000)
      if (e0 <= s0) continue
      out.push({
        key: `auto-${msToDtLocal(s0)}-${br.name}`,
        group: autoGroup, category: '휴게', auto: true, note: br.name,
        start: msToDtLocal(s0), end: msToDtLocal(e0),
      })
    }
  }
  return out.sort((x, y) => (x.start < y.start ? -1 : 1))
}

/** auto 항목만 갈아끼우고 수동 항목은 그대로 둔다. 표시는 시작시각 순. */
export const mergeAutoStops = (stops, autoList) =>
  [...autoList, ...(stops || []).filter((s) => !s.auto)]
    .sort((x, y) => (String(x.start) < String(y.start) ? -1 : 1))

/** 새 구간과 겹치는 기존 정지 — 겹치면 BE 가 뒤엣것을 도려내므로 입력 단계에서 막는다. */
export function overlappingStop(stops, start, end) {
  const a = dtLocalToMs(start)
  const b = dtLocalToMs(end)
  if (a == null || b == null || b <= a) return null
  return (stops || []).find((st) => {
    const sp = stopSpan(st)
    return sp && overlap(sp[0], sp[1], a, b) > 0
  }) || null
}

/** 새 정지의 기본 시작시각 — 마지막 정지가 끝난 시각(없으면 작업 시작). 손을 덜 대게. */
export function nextStopStart(start, end, stops) {
  const a = dtLocalToMs(start)
  const b = dtLocalToMs(end)
  if (a == null || b == null) return start || ''
  let t = a
  for (const st of stops || []) {
    const sp = stopSpan(st)
    if (sp && sp[1] > t && sp[1] < b) t = sp[1]
  }
  return msToDtLocal(t)
}

/** 가동시간(분) = 작업시간 − 정지 합. 음수는 0으로 (입력 단계에서 막지만 방어). */
export function runMinutes(start, end, stops) {
  const a = dtLocalToMs(start)
  const b = dtLocalToMs(end)
  if (a == null || b == null) return 0
  return Math.max(0, Math.round((b - a) / 60000) - totalStopMin(stops, start, end))
}

/** 분 → '6시간 3분' / '30분' / '0분' */
export function minText(min) {
  const m = Math.max(0, Math.round(min || 0))
  if (m < 60) return `${m}분`
  return m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${Math.floor(m / 60)}시간`
}

/** 'HH:MM ~ HH:MM' (날짜가 다르면 종료 쪽에 날짜를 붙인다 — 야간 작업) */
export function stopRangeText(st) {
  const sp = stopSpan(st)
  if (!sp) return ''
  const hm = (v) => String(v).slice(11, 16)
  const sameDay = String(st.start).slice(0, 10) === String(st.end).slice(0, 10)
  return `${hm(st.start)} ~ ${sameDay ? hm(st.end) : String(st.end).slice(5, 16).replace('T', ' ')}`
}
