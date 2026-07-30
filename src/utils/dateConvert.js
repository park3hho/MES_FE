// utils/dateConvert.js
// 날짜 포맷 변환 유틸 — BOPage, ECPage, WIPage, SOPage 공용

// YYMMDD → YYYY-MM-DD (input[type=date]용)
export const toInputDate = (yy) =>
  yy ? `20${yy.slice(0, 2)}-${yy.slice(2, 4)}-${yy.slice(4, 6)}` : ''

// YYYY-MM-DD → YYMMDD (LOT 번호용)
export const toYYMMDD = (iso) => (iso ? iso.slice(2).replace(/-/g, '') : '')

// ── KST 표시 변환 (2026-07-30) ──────────────────────────────
// BE 는 use_tz=True 로 created_at 등을 UTC 로 저장/직렬화한다.
// 과거 코드가 ISO 문자열을 그냥 문자열 슬라이스(.replace('T',' ').slice(0,16)) 해서
// UTC 시각을 KST 인 척 그대로 보여줬다(9시간 어긋남). 아래 헬퍼로 통일한다.
//   · tz 표기(Z / +00:00 / +09:00)가 없으면 UTC 로 간주(Z 부착) — 브라우저 로컬 오해석 방지.
const _toDate = (iso) => {
  if (!iso) return null
  const hasTz = /([zZ])$|([+-]\d{2}:?\d{2})$/.test(iso)
  const d = new Date(hasTz ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

// UTC ISO → 'YYYY-MM-DD HH:mm' (KST)
export const fmtKstDateTime = (iso) => {
  const d = _toDate(iso)
  if (!d) return iso || '-'
  return d.toLocaleString('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// UTC ISO → 'YYYY-MM-DD' (KST) — 날짜만. 자정 경계에서 UTC→KST 날짜 밀림 방지.
export const fmtKstDate = (iso) => {
  const d = _toDate(iso)
  if (!d) return iso || '-'
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}
