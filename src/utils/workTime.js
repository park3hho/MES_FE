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
  const stops = (workTime.stops || [])
    .filter((st) => Number(st.minutes) > 0)
    .map(({ group, category, minutes, auto, note }) => ({
      group, category, minutes: Number(minutes), auto: !!auto, note: note || '',
    }))
  return {
    work_started_at: `${workTime.start}:00`,
    work_ended_at: `${workTime.end}:00`,
    ...(stops.length ? { work_stops: stops } : {}),
  }
}

// ── 정지(비가동) ─────────────────────────────────────────────
// stops = [{ key, group, category, minutes, auto, note }]
//   auto=true = 등록된 휴게시간과 작업 구간이 겹쳐 자동으로 들어간 항목.
//   작업 구간이 바뀔 때마다 auto 항목만 다시 계산한다(사람이 넣은 건 건드리지 않음).

let seq = 0
export const newStopKey = () => `st${(seq += 1)}`

const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

/** 작업 구간 × 등록 휴게 → 자동 정지 항목. 자정을 넘기면 날짜별로 나눠 더한다. */
export function autoBreakStops(start, end, breaks, autoGroup = 'planned') {
  const a = dtLocalToMs(start)
  const b = dtLocalToMs(end)
  if (a == null || b == null || b <= a || !breaks?.length) return []
  const acc = new Map()
  for (let d = dayStart(a); d <= dayStart(b); d += 86400000) {
    const seg0 = Math.max(0, Math.round((a - d) / 60000))
    const seg1 = Math.min(1440, Math.round((b - d) / 60000))
    if (seg1 <= seg0) continue
    for (const br of breaks) {
      const m = overlap(seg0, seg1, br.start_min, br.end_min)
      if (m > 0) acc.set(br.name, (acc.get(br.name) || 0) + m)
    }
  }
  return [...acc].map(([name, minutes]) => ({
    key: `auto-${name}`, group: autoGroup, category: '휴게', minutes, auto: true, note: name,
  }))
}

/** auto 항목만 갈아끼우고 수동 항목은 그대로 둔다. */
export const mergeAutoStops = (stops, autoList) =>
  [...autoList, ...(stops || []).filter((s) => !s.auto)]

export const totalStopMin = (stops) =>
  (stops || []).reduce((n, s) => n + (Number(s.minutes) || 0), 0)

/** 가동시간(분) = 작업시간 − 정지 합. 음수는 0으로 (입력 단계에서 막지만 방어). */
export function runMinutes(start, end, stops) {
  const a = dtLocalToMs(start)
  const b = dtLocalToMs(end)
  if (a == null || b == null) return 0
  return Math.max(0, Math.round((b - a) / 60000) - totalStopMin(stops))
}

/** 분 → '6시간 3분' / '30분' / '0분' */
export function minText(min) {
  const m = Math.max(0, Math.round(min || 0))
  if (m < 60) return `${m}분`
  return m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${Math.floor(m / 60)}시간`
}
