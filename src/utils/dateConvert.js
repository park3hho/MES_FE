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

// ── '지금' → 날짜 문자열 (2026-08-06) ───────────────────────
// ★ `new Date().toISOString().slice(0, 10)` 금지.
//   toISOString() 은 UTC 라 KST 00~09시엔 하루 전 날짜가 나온다 — 아침 근무가 대부분인
//   현장에서 조회 기본기간·입력일자 기본값·파일명이 통째로 '어제'가 되던 원인.
//   sv-SE 로케일이 'YYYY-MM-DD' 를 주므로 KST 달력 날짜를 그대로 얻는다.

// Date → 'YYYY-MM-DD' (KST). 인자 없으면 오늘.
export const kstDateOf = (d = new Date()) =>
  d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

// 오늘 (KST) 'YYYY-MM-DD'
export const todayKst = () => kstDateOf()

// 오늘(KST) 기준 n일 전 'YYYY-MM-DD'. n<0 이면 n일 후.
export const kstDaysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return kstDateOf(d)
}

// 'YYYY-MM-DD' + n일 → 'YYYY-MM-DD'. 날짜 문자열끼리만 오가는 계산(차트 축 등)용.
//   UTC 로만 더해서 로컬 타임존·DST 를 아예 타지 않는다 — '지금'과 무관하므로 KST 변환도 불필요.
export const addDaysStr = (ymd, n) => {
  const [y, m, d] = String(ymd).split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000)
  const pad = (v) => String(v).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}
