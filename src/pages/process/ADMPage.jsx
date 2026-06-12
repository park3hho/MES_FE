// ══════════════════════════════════════════════════════════════
// ADMPage — 공정 선택 (Toss flat 스타일, 2026-04-16 개편)
// ══════════════════════════════════════════════════════════════
// 구조 변경:
//   BEFORE: .page-top > .card-wide > logo + title + grid(3열) + logout
//   AFTER : .page-flat > PageHeader + Section(List) × 4 + text logout
//
// 핵심 원칙:
//   - 외곽 카드 제거 (흰 배경이 페이지 자체)
//   - 3×N 그리드 → 리스트 아이템으로 전환
//   - 로고 제거 (로그인/스플래시에만)
//   - 섹션 라벨(생산/검사/출하/관리)로 그룹 구분

// '관리' 섹션은 별도 AdminPage 로 분리 (2026-05-02) — BottomNav '공정' 탭의 sub-view
// '기타' 섹션 (LOT 직접 입력 / 이력조회 / 되돌리기 / OQ 검사 목록) 은 일반 작업자도 사용 → 공정 페이지에 유지
import { RM_PRODUCE_LIST, STATOR_PRODUCE_LIST, ROTOR_PRODUCE_LIST, INSPECT_LIST, INSPECT_ETC_LIST, SHIPPING_LIST, PROCESS_ETC_LIST } from '@/constants/processConst'
import { canAccess, PROCESS_TO_FEATURE, ADMIN_TO_FEATURE } from '@/constants/permissions'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import ListItem from '@/components/common/ListItem'

// Phase A (2026-04-22): TEAM_ACCESS 폐기 → user.role 기반 canAccess 필터링
export default function ADMPage({ onSelect, onLogout, user }) {
  const filterByFeature = (list, mapper) =>
    list.filter((p) => canAccess(user, mapper[p.key]))

  // 생산(RM 공용) / 고정자(MP~SO) / 회전자(REA·RBO) 3분할 (2026-06-12)
  const rmItems = filterByFeature(RM_PRODUCE_LIST, PROCESS_TO_FEATURE)
  const statorItems = filterByFeature(STATOR_PRODUCE_LIST, PROCESS_TO_FEATURE)
  const rotorItems = filterByFeature(ROTOR_PRODUCE_LIST, PROCESS_TO_FEATURE)
  const inspectItems = [
    ...filterByFeature(INSPECT_LIST, PROCESS_TO_FEATURE),
    ...filterByFeature(INSPECT_ETC_LIST, ADMIN_TO_FEATURE),  // 품질검사 이력 (2026-06-04)
  ]
  const shippingItems = filterByFeature(SHIPPING_LIST, PROCESS_TO_FEATURE)
  // 기타 — LOT 도구 (PRINT/TRACE/MANAGE/INSPECT LIST), 권한별 노출 (2026-05-02)
  const etcItems = filterByFeature(PROCESS_ETC_LIST, ADMIN_TO_FEATURE)

  // 공정(2자 코드) → 2x / 4x 그리드
  const renderGrid = (items) => (
    <div className="grid-items">
      {items.map(p => (
        <ListItem
          key={p.key}
          leftKey={p.display || p.key}
          title={p.label}
          sub={p.desc}
          onClick={() => onSelect(p.key)}
          hideChevron
        />
      ))}
    </div>
  )

  return (
    <div className="page-flat">
      <PageHeader
        title="어떤 공정을 할까요?"
        subtitle="작업할 공정을 선택해주세요"
      />

      {rmItems.length > 0 && (
        <Section label="생산">
          {renderGrid(rmItems)}
        </Section>
      )}

      {statorItems.length > 0 && (
        <Section label="고정자">
          {renderGrid(statorItems)}
        </Section>
      )}

      {rotorItems.length > 0 && (
        <Section label="회전자">
          {renderGrid(rotorItems)}
        </Section>
      )}

      {inspectItems.length > 0 && (
        <Section label="검사">
          {renderGrid(inspectItems)}
        </Section>
      )}

      {shippingItems.length > 0 && (
        <Section label="출하">
          {renderGrid(shippingItems)}
        </Section>
      )}

      {/* 기타 — LOT 도구. 위 섹션과 동일한 grid 레이아웃 (2026-05-02) */}
      {etcItems.length > 0 && (
        <Section label="기타">
          {renderGrid(etcItems)}
        </Section>
      )}
    </div>
  )
}
