// constants/releaseConst.js
// 배포 문서 상수 (2026-08-27) — ★ BE 와 문자열 동기 (scripts/check_enum_sync.py 가 검증).
//   BE: models/doc/release_note.py (RELEASE_SECTION_KINDS / RELEASE_PREREQ_KINDS / RELEASE_PREREQ_ENVS)
//       models/doc/arch_diagram.py (ARCH_CANVAS_W·H)
//   배열은 순서까지 화면 표시 순서로 쓴다. 라벨만 자유롭게 정정 가능(값은 DB 에 저장되므로 변경 금지).

// 본문 섹션 종류
export const RELEASE_SECTION_KINDS = ['feature', 'improve', 'fix']
export const SECTION_LABELS = {
  feature: '새 기능',
  improve: '개선',
  fix: '수정',
}

// 선행 작업 종류 — 이 프로젝트에서 실제로 배포를 깨뜨렸던 것들이 그대로 항목이 됐다
export const RELEASE_PREREQ_KINDS = ['sql', 'permission', 'env', 'aws', 'data']
export const PREREQ_LABELS = {
  sql: 'DB 마이그레이션',
  permission: '권한 부여',
  env: '환경변수',
  aws: 'AWS 설정',
  data: '기준 데이터',
}

// 선행 작업 적용 환경 — dev 에만 하고 운영을 빠뜨리는 사고가 실제로 있었다
export const RELEASE_PREREQ_ENVS = ['prod', 'dev', 'both']
export const ENV_LABELS = {
  prod: '운영',
  dev: '개발',
  both: '운영·개발',
}

// 다이어그램 논리 캔버스 — BE ARCH_CANVAS_W/H 와 동기 (3단계 SVG viewBox)
export const ARCH_CANVAS_W = 1000
export const ARCH_CANVAS_H = 600

// ★ 배포 대상(어느 리포에 무엇이 나갔나)은 두지 않는다 (2026-08-27 결정) —
//   이 문서의 독자는 현장 사용자다. 리포·커밋 추적은 git 의 몫이고 여기선 잡음이다.
