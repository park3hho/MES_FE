// utils/workTime.js
// 작업일지 구간 → 발급 요청 body (2026-08-12).
//   작업일 STEP 에서 확정한 `{start:'HH:MM', end:'HH:MM'}` 과 작업일(YYMMDD)을 합쳐 ISO 로 만든다.
//   ★ new Date().toISOString() 을 쓰면 UTC 로 나가 9시간 어긋난다 — 문자열로 직접 조립할 것.
//   값이 없거나 형식이 깨졌으면 아무것도 안 실어 보낸다 → BE 가 자동 추정(직전 종료 ~ 지금).
import { toInputDate } from '@/utils/dateConvert'

const HHMM = /^\d{2}:\d{2}$/

export function workTimeBody(workDateYYMMDD, workTime) {
  const day = toInputDate(workDateYYMMDD)   // YYMMDD → YYYY-MM-DD
  const start = workTime?.start
  const end = workTime?.end
  if (!day || !HHMM.test(start || '') || !HHMM.test(end || '')) return {}
  if (end <= start) return {}               // 역전이면 보내지 않는다 (BE 도 방어하지만 여기서 먼저 거른다)
  return {
    work_started_at: `${day}T${start}:00`,
    work_ended_at: `${day}T${end}:00`,
  }
}
