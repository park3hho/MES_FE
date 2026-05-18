// ══════════════════════════════════════════════════════════════
// AdminPage — 관리 메뉴 (2026-05-02)
// ══════════════════════════════════════════════════════════════
// 네비게이션 '공정' 탭의 sub-view 로 'process' 와 짝을 이룸.
// ADMPage(공정 선택) 에서 '관리' 섹션을 분리해 별도 페이지화.
// 접근 권한: admin (team_rnd / general_admin) — BottomNav/SideNav 가드

import { ADMIN_LIST } from '@/constants/processConst'
import { canAccess, ADMIN_TO_FEATURE } from '@/constants/permissions'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import ListItem from '@/components/common/ListItem'

export default function AdminPage({ onSelect, user }) {
  const adminItems = ADMIN_LIST.filter((p) => canAccess(user, ADMIN_TO_FEATURE[p.key]))

  return (
    <div className="page-flat">
      <PageHeader
        title="미배포 기능"
        subtitle="아직 정식 배포 전인 기능 모음이에요"
      />

      {adminItems.length > 0 ? (
        <Section label="미배포">
          {/* ADMPage 와 동일한 grid 레이아웃 (2026-05-02) */}
          <div className="grid-items">
            {adminItems.map((p) => (
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
      ) : (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-sub)', fontSize: 14 }}>
          접근 가능한 미배포 기능이 없습니다.
        </div>
      )}
    </div>
  )
}
