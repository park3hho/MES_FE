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

import { PRODUCE_LIST, INSPECT_LIST, SHIPPING_LIST, ADMIN_LIST, TEAM_ACCESS } from '@/constants/processConst'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import ListItem from '@/components/common/ListItem'

export default function ADMPage({ onSelect, onLogout, loginId }) {
  const team = TEAM_ACCESS[loginId]
  const filterProc = (list) => team ? list.filter(p => team.processes.includes(p.key)) : list
  const filterAdmin = (list) => team ? list.filter(p => team.admin.includes(p.key)) : list

  const produceItems = filterProc(PRODUCE_LIST)
  const inspectItems = team ? filterProc(INSPECT_LIST) : INSPECT_LIST
  const shippingItems = team ? filterProc(SHIPPING_LIST) : SHIPPING_LIST
  const adminItems = filterAdmin(ADMIN_LIST)

  // 개별 공정 → ListItem 렌더링 (grid 안에서 사용: chevron 숨김)
  // leftKey: produce/inspect/shipping은 2자 코드, admin은 긴 영문
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

  const logoutAction = (
    <button
      type="button"
      onClick={onLogout}
      style={{
        background: 'transparent',
        border: 'none',
        color: 'var(--color-text-sub)',
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--font-bold)',
        padding: '8px 4px',
        cursor: 'pointer',
      }}
    >
      로그아웃
    </button>
  )

  return (
    <div className="page-flat">
      <PageHeader
        title="어떤 공정을 할까요?"
        subtitle="작업할 공정을 선택해주세요"
        action={logoutAction}
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
          {renderGrid(adminItems)}
        </Section>
      )}
    </div>
  )
}
