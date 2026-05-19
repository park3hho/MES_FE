// ══════════════════════════════════════════════════════════════
// AdminPage — 관리 메뉴 (2026-05-02)
// ══════════════════════════════════════════════════════════════
// 네비게이션 '공정' 탭의 sub-view 로 'process' 와 짝을 이룸.
// ADMPage(공정 선택) 에서 '관리' 섹션을 분리해 별도 페이지화.
// 접근 권한: admin (team_rnd / general_admin) — BottomNav/SideNav 가드

import { ADMIN_LIST, ADMIN_DEPTS } from '@/constants/processConst'
import { canAccess, ADMIN_TO_FEATURE } from '@/constants/permissions'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import ListItem from '@/components/common/ListItem'

export default function AdminPage({ onSelect, user }) {
  const adminItems = ADMIN_LIST.filter((p) => canAccess(user, ADMIN_TO_FEATURE[p.key]))

  // 부서별 그룹핑 (2026-05-20) — ADMIN_DEPTS 순서대로 섹션 분리.
  // dept 미지정 항목은 '전산' 으로 폴백 (신규 추가 시 누락 방어).
  const byDept = ADMIN_DEPTS.map((dept) => ({
    dept,
    items: adminItems.filter((p) => (p.dept || '전산') === dept),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="page-flat">
      <PageHeader
        title="미배포 기능"
        subtitle="아직 정식 배포 전인 기능 모음이에요"
      />

      {byDept.length > 0 ? (
        byDept.map(({ dept, items }) => (
          <Section key={dept} label={dept}>
            {/* ADMPage 와 동일한 grid 레이아웃 (2026-05-02) */}
            <div className="grid-items">
              {items.map((p) => (
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
          </Section>
        ))
      ) : (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-sub)', fontSize: 14 }}>
          접근 가능한 미배포 기능이 없습니다.
        </div>
      )}
    </div>
  )
}
