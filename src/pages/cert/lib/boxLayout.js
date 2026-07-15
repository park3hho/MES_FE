// pages/cert/lib/boxLayout.js
// 박스 레이아웃 + 도면 경로 — 순수 helper. CertFlow 분할 시 추출 (2026-05-08).
//
// 호출처: ModelButton, UBBlock, BoxFrame, BoxItemFilled, BoxItemEmpty

// LOT 번호 형식 사전 검증 — `/sad` 같은 잘못된 URL 진입 시 PW 입력 화면 띄우지 않게 (2026-05-02)
// MB/UB/ST 모두 영문+숫자+하이픈 4~50자, 영문 1자 + 숫자 1자 이상 필수.
//   예: MB-260427-02, UB-260427-01, ST45-20260416-002, SM10260427-16
export function isLikelyLotNo(s) {
  if (!s || s.length < 4 || s.length > 50) return false
  if (!/^[A-Za-z0-9-]+$/.test(s)) return false
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return false
  return true
}

// 박스 통일 사이즈 — 모든 phi 동일. 사용자 확정 (2026-04-27).
export const BOX_W = 175
export const BOX_H = 105

// phi 기본값 ↔ 페어 직경 매핑 (mm).
// 내전형 (inner): ST = 기본 phi, RT = 페어
// 외전형 (outer): RT = 기본 phi, ST = 페어 (ST/RT 자리 swap → ST 우측)
export const PHI_PAIR = {
  87: 73,
  70: 53,
  45: 31,
  20: 13,
}

// phi 별 박스 grid (cols × 2 rows, 위 ST 행 / 아래 RT 행)
//   Φ87, Φ70 → 1×2 (compact, 가로 한 줄)
//   Φ45      → 3×2
//   Φ20      → 5×2
const _PHI_COLS = { 87: 1, 70: 1, 45: 3, 20: 5 }

export function getBoxLayout(phi, motor, maxPerBox) {
  const base = parseFloat(phi) || 70
  const pair = PHI_PAIR[phi] || base * 0.76 // 미등록 phi fallback
  const { stD, rtD } =
    motor === 'outer'
      ? { stD: pair, rtD: base } // 외전형: RT 가 기본 phi (큰 쪽)
      : { stD: base, rtD: pair } // 내전형 default: ST 가 기본 phi
  // cols = 모델 정원(max_per_box) 우선 → 없으면 하드코딩 _PHI_COLS → 1 (신규 phi 잘림 방지, 2026-07-14)
  const cols = Number(maxPerBox) || _PHI_COLS[phi] || 1
  return { boxW: BOX_W, boxH: BOX_H, stD, rtD, cols, compact: cols === 1 }
}

// 도면 SVG 경로 (2026-05-04 PNG → SVG 전환):
//   - stator: public/{phi}phi_stator.svg (phi 별 1개, motor 무관 — 동일 외형 재사용)
//   - rotor:  public/rotor.svg            (전체 공통 회전자 1개)
// SVG 라 phi 별 색상은 CSS 로 currentColor 처리 가능. 파일 없으면 onError → opacity 감소.
export function drawingSrc(phi, _motor, kind) {
  if (!phi) return null
  if (kind === 'rotor') return '/rotor.svg'
  return `/${phi}phi_stator.svg`
}
