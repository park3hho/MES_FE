// ══════════════════════════════════════════════════════════════
// ADMPage — 공정 선택 (전산 시스템별 섹션, 2026-06-22 개편)
// ══════════════════════════════════════════════════════════════
// 섹션: MES(생산/고정자/회전자) → QMS(검사) → WMS(출하) → CRM → 기타
// '관리' 섹션은 별도 AdminPage (미배포 탭)
import { RM_PRODUCE_LIST, STATOR_PRODUCE_LIST, ROTOR_PRODUCE_LIST, INSPECT_LIST, INSPECT_ETC_LIST, SHIPPING_LIST, PROCESS_ETC_LIST } from '@/constants/processConst'
import { canAccess, PROCESS_TO_FEATURE, ADMIN_TO_FEATURE, Role } from '@/constants/permissions'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import ListItem from '@/components/common/ListItem'

export default function ADMPage({ onSelect, onLogout, user }) {
  const filterByFeature = (list, mapper) =>
    list.filter((p) => canAccess(user, mapper[p.key]))

  // MES — 생산/고정자/회전자
  const rmItems = filterByFeature(RM_PRODUCE_LIST, PROCESS_TO_FEATURE)
  const statorItems = filterByFeature(STATOR_PRODUCE_LIST, PROCESS_TO_FEATURE)
  const rotorItems = filterByFeature(ROTOR_PRODUCE_LIST, PROCESS_TO_FEATURE)
  const hasMes = rmItems.length > 0 || statorItems.length > 0 || rotorItems.length > 0

  // QMS — 검사
  const inspectItems = [
    ...filterByFeature(INSPECT_LIST, PROCESS_TO_FEATURE),
    ...filterByFeature(INSPECT_ETC_LIST, ADMIN_TO_FEATURE),
  ]

  // WMS — 박싱
  const shippingItems = filterByFeature(
    SHIPPING_LIST.filter((p) => p.key !== 'OB'),
    PROCESS_TO_FEATURE,
  )

  // CRM — 출하 (패키징 전용 역할은 OB 카드 숨김 — UB/MB 박스 출력만, 2026-06-19)
  const crmItems = user?.role === Role.PACKAGING ? [] : filterByFeature(
    SHIPPING_LIST.filter((p) => p.key === 'OB'),
    PROCESS_TO_FEATURE,
  )

  // 기타 — LOT 도구 (PRINT/TRACE)
  const etcItems = filterByFeature(PROCESS_ETC_LIST, ADMIN_TO_FEATURE)

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

      {hasMes && (
        <Section label="MES">
          {rmItems.length > 0 && (
            <>
              <p className="section-sub-label">생산</p>
              {renderGrid(rmItems)}
            </>
          )}
          {statorItems.length > 0 && (
            <>
              <p className="section-sub-label">고정자</p>
              {renderGrid(statorItems)}
            </>
          )}
          {rotorItems.length > 0 && (
            <>
              <p className="section-sub-label">회전자</p>
              {renderGrid(rotorItems)}
            </>
          )}
        </Section>
      )}

      {inspectItems.length > 0 && (
        <Section label="QMS">
          {renderGrid(inspectItems)}
        </Section>
      )}

      {shippingItems.length > 0 && (
        <Section label="WMS">
          {renderGrid(shippingItems)}
        </Section>
      )}

      {crmItems.length > 0 && (
        <Section label="CRM">
          {renderGrid(crmItems)}
        </Section>
      )}

      {etcItems.length > 0 && (
        <Section label="기타">
          {renderGrid(etcItems)}
        </Section>
      )}
    </div>
  )
}
