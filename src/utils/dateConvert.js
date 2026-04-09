// utils/dateConvert.js
// 날짜 포맷 변환 유틸 — BOPage, ECPage, WIPage, SOPage 공용

// YYMMDD → YYYY-MM-DD (input[type=date]용)
export const toInputDate = (yy) =>
  yy ? `20${yy.slice(0, 2)}-${yy.slice(2, 4)}-${yy.slice(4, 6)}` : ''

// YYYY-MM-DD → YYMMDD (LOT 번호용)
export const toYYMMDD = (iso) => (iso ? iso.slice(2).replace(/-/g, '') : '')
