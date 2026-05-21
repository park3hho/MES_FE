// components/common/BomTypeBadge.jsx
// BOM 유형 배지 + (선택) phase 종결 + sync 상태 통합 컴포넌트 (2026-05-21).
//
// 추출 이유: BomManagePage 와 ItemManagePage 두 곳에 같은 시각 표현이 따로 정의되어 있었음.
//   - BomManagePage.module.css : typeEBOM/typeMBOM/typeSBOM (대문자)
//   - ItemManagePage.module.css : typeebom/typembom/typesbom (소문자, 색상도 다름)
// 같은 시각 가치를 두 군데에서 따로 유지하던 결함을 단일 컴포넌트로 봉합.
//
// 사용 예:
//   <BomTypeBadge type={b.bom_type} closedAt={b.closed_at} syncState={b.sync_state} />
//   <BomTypeBadge type={u.bom_type} deriveSeq={u.derive_seq} />   // where-used: "MBOM #2"

import s from './BomTypeBadge.module.css'

const PHASE_LABEL = { EBOM: 'EOD', MBOM: 'EOM', SBOM: 'EOS' }

export default function BomTypeBadge({
  type,
  deriveSeq,        // 숫자: 표시 시 " #N" 으로 붙임 (where-used)
  closedAt,         // ISO 문자열: phase 종결 라벨 추가
  closedReason,     // 종결 사유 (tooltip)
  syncState,        // 'STALE' 일 때 동기화 검토 요망 배지 추가
}) {
  const t = type || 'EBOM'
  const cls = s[`type${t}`] || ''
  return (
    <>
      <span className={`${s.typeBadge} ${cls}`}>
        {t}{deriveSeq != null ? ` #${deriveSeq}` : ''}
      </span>
      {closedAt && (
        <span
          className={s.closedBadge}
          title={`${closedReason || '종결됨'} (${closedAt.slice(0, 10)})`}
        >
          {PHASE_LABEL[t] || 'CLOSED'}
        </span>
      )}
      {syncState === 'STALE' && !closedAt && (
        <span className={s.staleBadge} title="출처 BOM 변경됨 — 동기화 검토 필요">
          변경 내역 확인 요망
        </span>
      )}
    </>
  )
}
