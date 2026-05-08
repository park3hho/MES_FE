// pages/cert/lib/constants.js
// cert 페이지 공유 localStorage 키 (CertFlow 분할, 2026-05-08)
//
// SESSION_KEY    : sheet token 캐시 prefix — `${SESSION_KEY}:${mb_lot_no}` 형태로 저장
// PW_CACHE_KEY   : OB PW 캐시 — 같은 OB 의 다른 박스 진입 시 자동 인증 (1시간 만료)

export const SESSION_KEY = 'cert_session'
export const PW_CACHE_KEY = 'cert_pw_cached'
