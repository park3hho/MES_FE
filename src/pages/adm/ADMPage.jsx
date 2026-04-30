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
//   - 섹션 라벨(제작/검사/출하/관리)로 그룹 구분

import { PRODUCE_LIST, INSPECT_LIST, SHIPPING_LIST, ADMIN_LIST } from '@/constants/processConst'
import { canAccess, PROCESS_TO_FEATURE, ADMIN_TO_FEATURE } from '@/constants/permissions'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import ListItem from '@/components/common/ListItem'

// Phase A (2026-04-22): TEAM_ACCESS 폐기 → user.role 기반 canAccess 필터링
export default function ADMPage({ onSelect, onLogout, user }) {
  const filterByFeature = (list, mapper) =>
    list.filter((p) => canAccess(user, mapper[p.key]))

  const produceItems = filterByFeature(PRODUCE_LIST, PROCESS_TO_FEATURE)
  const inspectItems = filterByFeature(INSPECT_LIST, PROCESS_TO_FEATURE)
  const shippingItems = filterByFeature(SHIPPING_LIST, PROCESS_TO_FEATURE)
  const adminItems = filterByFeature(ADMIN_LIST, ADMIN_TO_FEATURE)

  // 공정(2자 코드) → 2x / 4x 그리드
  const renderGrid = (items) => (
    <div className="grid-items">
      {items.map(p => (
        <ListItem
          key={p.key}
          leftKey={p.key}
          title={p.label}
          sub={p.desc}
          onClick={() => onSelect(p.key)}
          hideChevron
        />
      ))}
    </div>
  )

  // 관리(긴 키) → 1열 리스트 (텍스트 잘림 없도록)
  const renderList = (items) =>
    items.map(p => (
      <ListItem
        key={p.key}
        title={p.label}
        sub={p.desc}
        onClick={() => onSelect(p.key)}
      />
    ))

  return (
    <div className="page-flat">
      <PageHeader
        title="어떤 공정을 할까요?"
        subtitle="작업할 공정을 선택해주세요"
      />

      {produceItems.length > 0 && (
        <Section label="제작">
          {renderGrid(produceItems)}
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

      {adminItems.length > 0 && (
        <Section label="관리">
          {renderList(adminItems)}
        </Section>
      )}
    </div>
  )
}
