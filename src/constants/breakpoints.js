// constants/breakpoints.js
// JS 브레이크포인트 단일 원천 — variables.css --bp-* 값과 반드시 동일하게 유지
// 사용처: hooks/useMobile.js, 컴포넌트 내 조건부 렌더링

export const BP = {
  mini:    360,   // --bp-mini (iPhone SE 1세대, 소형 안드로이드)
  mobile:  480,   // --bp-mobile
  tablet:  768,   // --bp-tablet
  laptop:  1024,  // --bp-laptop (태블릿 landscape 이상)
  desktop: 1200,  // --bp-desktop (PC — 사이드바 레이아웃 시작)
}
