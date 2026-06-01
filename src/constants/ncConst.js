// constants/ncConst.js
// NCR (부적합품) 통합 상수 — BE core/nc_config.py 와 동기 필수 (2026-06-01)
//
// 설계: docs/ncr-design.md
// 동기 검증: scripts/check_enum_sync.py (NC_SOURCE / NC_DISP / NC_STATUS)

// ─────────────────────────────────────────
// 부적합 발생 소스 (NonConformance.source_type)
// ─────────────────────────────────────────
export const NC_SOURCE = Object.freeze({
  IQ:     'IQ',
  IPQ:    'IPQ',
  OQ:     'OQ',
  MANUAL: 'MANUAL',
  RETURN: 'RETURN',
  DAMAGE: 'DAMAGE',
})

export const NC_SOURCE_LABELS = Object.freeze({
  IQ:     '입고검사',
  IPQ:    '공정검사',
  OQ:     '출하검사',
  MANUAL: '작업자 발견',
  RETURN: '고객 반품',
  DAMAGE: '창고 손상',
})

// ─────────────────────────────────────────
// 처분 (NonConformance.disposition) — 한글 = DB 저장값
// ─────────────────────────────────────────
export const NC_DISP = Object.freeze({
  PENDING:    '미정',
  REWORK:     '재공정',
  SCRAP:      '폐기',
  RETURN:     '반품',
  CONCESSION: '조건부출하',
  USE_AS_IS:  '용도변경',
})

// 재공정 진입 (send_repair 단일 경로)
export const NC_DISP_REWORK_SET = new Set([NC_DISP.REWORK])
// 격리 해제(재고 복귀) 처분
export const NC_DISP_RELEASE_SET = new Set([NC_DISP.CONCESSION, NC_DISP.USE_AS_IS])
// 종료(폐기) 처분
export const NC_DISP_TERMINAL_SET = new Set([NC_DISP.SCRAP, NC_DISP.RETURN])

// ─────────────────────────────────────────
// 생명주기 (NonConformance.status) — disposition 과 별개 축
// ─────────────────────────────────────────
export const NC_STATUS = Object.freeze({
  OPEN:          'OPEN',
  INVESTIGATION: 'INVESTIGATION',
  DISPOSED:      'DISPOSED',
  CLOSED:        'CLOSED',
})

export const NC_STATUS_LABELS = Object.freeze({
  OPEN:          '발생',
  INVESTIGATION: '조사 중',
  DISPOSED:      '처분 완료',
  CLOSED:        '종결',
})

// 부적합품 관리 목록 노출 상태 (종결 제외)
export const NC_STATUSES_ACTIVE = new Set([
  NC_STATUS.OPEN, NC_STATUS.INVESTIGATION, NC_STATUS.DISPOSED,
])

// 색상 (배지) — 진행상태 시각화
export const NC_STATUS_COLORS = Object.freeze({
  OPEN:          { bg: '#fef3c7', fg: '#92400e' },
  INVESTIGATION: { bg: '#dbeafe', fg: '#1e40af' },
  DISPOSED:      { bg: '#e5e7eb', fg: '#374151' },
  CLOSED:        { bg: '#dcfce7', fg: '#166534' },
})
