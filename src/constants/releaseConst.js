// constants/releaseConst.js
// 배포 문서 상수 (2026-08-27) — ★ BE 와 문자열 동기 (scripts/check_enum_sync.py 가 검증).
//   BE: models/doc/release_note.py (RELEASE_SECTION_KINDS / RELEASE_PREREQ_KINDS / RELEASE_PREREQ_ENVS)
//       models/doc/arch_diagram.py (ARCH_NODE_KINDS / ARCH_CANVAS_W·H)
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

// 아키텍처 노드 분류 — 목록 필터 칩의 축
export const ARCH_NODE_KINDS = ['BE', 'FE', 'DB', 'MW', 'ETC']
export const NODE_KIND_LABELS = {
  BE: '백엔드',
  FE: '프론트',
  DB: '데이터베이스',
  MW: '미들웨어',
  ETC: '기타',
}

// 다이어그램 논리 캔버스 — BE ARCH_CANVAS_W/H 와 동기 (3단계 SVG viewBox)
export const ARCH_CANVAS_W = 1000
export const ARCH_CANVAS_H = 600

// 배포 대상 (target_refs 의 키) — ★ ARCH_NODE_KINDS 와 값이 같아 보여도 별개 어휘다.
//   저건 다이어그램 노드 분류(BE 와 동기 검사 대상)고, 이건 '무엇을 배포했나' 다.
//   재사용하면 다이어그램 분류를 하나 늘릴 때 배포 대상 드롭다운이 조용히 따라 바뀐다.
export const RELEASE_TARGETS = ['BE', 'FE', 'DB', 'MW']
export const TARGET_LABELS = {
  BE: 'BE (백엔드)',
  FE: 'FE (프론트)',
  DB: 'DB (스키마)',
  MW: 'MW (미들웨어)',
}
