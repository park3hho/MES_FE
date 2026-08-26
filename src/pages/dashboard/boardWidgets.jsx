// pages/dashboard/boardWidgets.jsx
// 내 대시보드 위젯 레지스트리 (2026-08-26) — ★ 위젯 목록의 진실의 원천.
//
// ★ 위젯 = 기존 대시보드 페이지 컴포넌트 그대로 (사용자 확정: "해당 페이지 그대로 띄웠으면").
//   요약 카드를 따로 만들지 않는다 — 별도 컴포넌트를 만들면 원본 화면과 갈라지고,
//   각 페이지가 이미 자기 폴링·권한 API·모바일 반응형을 갖고 있어 임베드가 곧 재사용이다.
// ★ feature = 카드 게이트와 동일한 값 (App.jsx DASHBOARD_VIEWS·라우트 가드와 어긋나면
//   "카탈로그엔 보이는데 위젯은 빈 화면" 이 된다). null 없음 — 전 위젯이 원본 화면 권한을 따른다.
// ★ 새 위젯 추가 = 여기 한 항목 + (원한다면) 그룹 순서만. BE 는 id 를 검증하지 않으므로
//   (models/setting/user_dashboard.py 주석) BE 변경 불필요.
import ProgressPage from '@/pages/dashboard/ProgressPage'
import ProcessInventoryPage from '@/pages/dashboard/ProcessInventoryPage'
import FinishedInventoryPage from '@/pages/dashboard/FinishedInventoryPage'
import BlanketDashboardPage from '@/pages/dashboard/BlanketDashboardPage'
import QualityDashboardPage from '@/pages/dashboard/QualityDashboardPage'
import ProductionDashboardPage from '@/pages/dashboard/ProductionDashboardPage'
import EnvMonitorPage from '@/pages/process/manage/EnvMonitorPage'
import WorkLogPage from '@/pages/process/manage/WorkLogPage'
import YokeSpcPage from '@/pages/process/manage/YokeSpcPage'
import { Feature } from '@/constants/permissions'

// render(ctx): ctx = { logout }. onBack 은 일부러 안 넘긴다 — 보드 안에서 뒤로가기 화살표는
//   "어디로 돌아가는지" 가 없어 혼란만 준다 (PageHeader 는 onBack 없으면 버튼을 숨긴다).
export const BOARD_WIDGETS = {
  progress: {
    name: '포장 현황', group: '재고·출하', feature: Feature.DASH_PROGRESS,
    desc: '활성 인보이스별 출하 포장 진척',
    render: () => <ProgressPage />,
  },
  inventory: {
    name: '실시간 재고 현황', group: '재고·출하', feature: Feature.DASH_INVENTORY,
    desc: '공정별 재공 재고 — 고정자·회전자',
    render: (ctx) => <ProcessInventoryPage onLogout={ctx.logout} />,
  },
  finished: {
    name: '완제품 재고', group: '재고·출하', feature: Feature.DASH_INVENTORY,
    desc: 'ST·RT 모델별 × 위치별 재고',
    render: (ctx) => <FinishedInventoryPage onLogout={ctx.logout} />,
  },
  blanket: {
    name: '계약 소진', group: '재고·출하', feature: Feature.ADMIN_SALES_ORDER,
    desc: 'Blanket 포괄계약 소진 · 월별 계획 대비',
    render: () => <BlanketDashboardPage />,
  },
  production: {
    name: '생산 현황', group: '생산', feature: Feature.DASH_PRODUCTION,
    desc: 'LOT 발급 기준 생산 실적 (일별·주간)',
    render: () => <ProductionDashboardPage />,
  },
  worklog: {
    name: '작업일지', group: '생산', feature: Feature.PROD_WORKLOG,
    desc: '회전자 라인 가동·비가동 · 시간 보정',
    render: () => <WorkLogPage />,
  },
  quality: {
    name: '품질 현황', group: '품질', feature: Feature.DASH_QUALITY,
    desc: 'FAIL·되돌리기·폐기 집계 + 주간 리포트',
    render: (ctx) => <QualityDashboardPage onLogout={ctx.logout} />,
  },
  spc: {
    name: '요크 관리도', group: '품질', feature: Feature.QC_YOKE_IPQ_VIEW,
    desc: '요크 IPQ X̄-R 관리도',
    render: () => <YokeSpcPage />,
  },
  env: {
    name: '온습도 모니터링', group: '품질', feature: Feature.QC_ENV_MONITOR,
    desc: '현장 온습도 현재값 · 추이',
    render: () => <EnvMonitorPage />,
  },
}

export const WIDGET_GROUPS = ['재고·출하', '생산', '품질']

// 폭 체계 (2026-08-26 개편) — w = 6칸 그리드의 span 직접값(1~6).
//   (구) size 1|2|3(⅓/½/전폭) 3단 순환은 리사이즈 핸들 도입으로 폐기 — "내가 원하는 폭"이 안 됐다.
//   옛 저장값(size)은 normalizeBoard 가 흡수한다 (BE _clean_board 도 동일 매핑).
export const GRID_COLS = 6
const LEGACY_SIZE_TO_W = { 1: 2, 2: 3, 3: 6 }

export function normalizeBoard(raw) {
  return (raw || [])
    .filter((it) => it && typeof it === 'object' && it.id)
    .map((it) => {
      const w = Number.isInteger(it.w) && it.w >= 1 && it.w <= GRID_COLS
        ? it.w : (LEGACY_SIZE_TO_W[it.size] || 3)
      return { id: it.id, w }
    })
}

// 기본 구성 — 사용자가 브라우저 3창으로 나란히 띄워 쓰던 조합 그대로 (⅓ 3개 한 줄)
export const DEFAULT_BOARD = [
  { id: 'progress', w: 2 },
  { id: 'inventory', w: 2 },
  { id: 'blanket', w: 2 },
]
