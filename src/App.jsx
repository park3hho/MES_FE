import { useState, useEffect, useRef } from 'react'
import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
  useOutletContext,
} from 'react-router-dom'
import ErrorBoundary from '@/components/ErrorBoundary'
import UpdateBanner from '@/components/UpdateBanner'
import { useAuth } from '@/hooks/useAuth'
import { ModelsProvider } from '@/contexts/ModelsContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { ConfirmProvider } from '@/contexts/ConfirmDialogContext'
import { LoginPage } from '@/pages/auth/LoginPage'
// 외부 공개 cert 도메인 (cert.*) 전용 — hostname 분기로 lot.* 호스트에서는 노출되지 않음 (2026-04-27)
import CertFlow from '@/pages/cert/CertFlow'
// 도메인 root 진입점 — 회사 로그인 흐름 (Phase D, 2026-05-02). 기존 CertEmpty 대체.
import CertCompanyFlow from '@/pages/cert/CertCompanyFlow'
// ── adm 탭 (홈) — ADMPage + produce/shipping/manage 서브 ──
import ADMPage from '@/pages/process/ADMPage'
import AdminPage from '@/pages/process/AdminPage'   // 2026-05-02 — 공정 탭의 '관리' sub-view
import RMPage from '@/pages/process/produce/RMPage'
import MPPage from '@/pages/process/produce/MPPage'
import EAPage from '@/pages/process/produce/EAPage'
import HTPage from '@/pages/process/produce/HTPage'
import BOPage from '@/pages/process/produce/BOPage'
import ECPage from '@/pages/process/produce/ECPage'
import WIPage from '@/pages/process/produce/WIPage'
import SOPage from '@/pages/process/produce/SOPage'
import REAPage from '@/pages/process/produce/REAPage'   // 로터 요크가공 (2026-06-12)
import RBOPage from '@/pages/process/produce/RBOPage'   // 로터 본딩
import RRTPage from '@/pages/process/produce/RRTPage'   // 로터 완성
import IQPage from '@/pages/process/shipping/IQPage'
import OQPage from '@/pages/process/shipping/OQPage'
import UBPage from '@/pages/process/shipping/UBPage'
import MBPage from '@/pages/process/shipping/MBPage'
import OBPage from '@/pages/process/shipping/OBPage'
import { PrintPage } from '@/pages/process/manage/PrintPage'
import LotManagePage from '@/pages/process/manage/LotManagePage'
import TracePage from '@/pages/trace/TracePage'
import DayBatchPage from '@/pages/process/manage/DayBatchPage' // 2026-05-22 — 공정 일별 작업 (Trace 유도)
import ExportPage from '@/pages/process/manage/ExportPage'
import SeedChainPage from '@/pages/process/manage/SeedChainPage'
import InspectionListPage from '@/pages/process/manage/InspectionListPage'
import YokeIpqListPage from '@/pages/process/manage/YokeIpqListPage' // 2026-08-06 — 요크 IPQ 검사 이력 조회
import YokeSpcPage from '@/pages/process/manage/YokeSpcPage' // 2026-08-06 — 요크 X̄-R 관리도
import OqComparePage from '@/pages/process/manage/OqComparePage' // 2026-08-07 — OQC 재공정 값 비교
import LinesChartPage from '@/pages/process/manage/LinesChartPage'
import WorkLogPage from '@/pages/process/manage/WorkLogPage'   // 작업일지 (2026-08-12)
import QualityDashboardPage from '@/pages/dashboard/QualityDashboardPage'
import BoxCheckPage from '@/pages/process/manage/BoxCheckPage'
import InvoicePage from '@/pages/process/manage/InvoicePage'
import InventorySurveyPage from '@/pages/process/manage/InventorySurveyPage'
import BomViewPage from '@/pages/process/manage/BomViewPage'
import PrinterManagePage from '@/pages/process/manage/PrinterManagePage'
import FactoryManagePage from '@/pages/process/manage/FactoryManagePage'
import UserManagePage from '@/pages/process/manage/UserManagePage'
import AccessControlPage from '@/pages/process/manage/AccessControlPage'
import ModelManagePage from '@/pages/process/manage/ModelManagePage'
import InspectionSpecPage from '@/pages/process/manage/InspectionSpecPage' // 2026-07-17 — QC 검사규격 편집 (Layer E, ModelManagePage 와 별개)
import ProductionOrderPage from '@/pages/process/manage/ProductionOrderPage' // 2026-07-17 — 생산오더 관리 (Layer A, BOM 동결)
import SalesOrderPage from '@/pages/process/manage/SalesOrderPage' // 2026-07-22 — 수주(SO) 관리 (SO → PO → 송장)
import NotificationSettingPage from '@/pages/process/manage/NotificationSettingPage' // 2026-07-27 — 알림 수신 설정
import SafetyStockPage from '@/pages/process/manage/SafetyStockPage' // 2026-07-28 — 안전재고 전용 설정
import RustWaitPage from '@/pages/process/manage/RustWaitPage' // 2026-08-01 — 녹 제거 대기 (요크 잔량 임시 격리↔복귀)
import RustScanPage from '@/pages/process/manage/RustScanPage' // 2026-08-13 — 요크 녹 QR 스캔 (대기로 빼기 전용 진입점)
import PrintHistoryPage from '@/pages/process/manage/PrintHistoryPage'
import CertPreviewPage from '@/pages/process/manage/CertPreviewPage'
import StockAdminPage from '@/pages/process/manage/StockAdminPage'      // 2026-05-01 — 재고 직접 관리 CRUD (team_rnd 전용)
import WarehousePage from '@/pages/process/manage/WarehousePage'  // 2026-06-08 — 자유 입력 단순 재고 CRUD
import WarehouseUsageScanPage from '@/pages/process/manage/WarehouseUsageScanPage'  // 2026-07-29 — QR 스캔 사용/미사용 전환
import RotorBondRollbackPage from '@/pages/process/manage/RotorBondRollbackPage'  // 2026-08-04 — 로터 본딩 과다발급 롤백
import StockLocationPage from '@/pages/process/manage/StockLocationPage'  // 2026-06-09 — 통합 재고 현황 (위치/NC)
import CompanyManagePage from '@/pages/process/manage/CompanyManagePage' // 2026-05-02 — 업체 마스터 (team_rnd 전용)
import AdminFeedbackPage from '@/pages/process/manage/AdminFeedbackPage' // 2026-05-07 — 사용자 피드백 처리
import BomManagePage from '@/pages/process/manage/BomManagePage' // 2026-05-19 — 제품 BOM 다단계 (team_rnd 전용)
import ItemManagePage from '@/pages/process/manage/ItemManagePage' // 2026-05-19 — 품목 마스터 사물 사전 + 분류 트리 (team_rnd 전용)
import SubstituteGroupManagePage from '@/pages/process/manage/SubstituteGroupManagePage' // 2026-05-22 — 대체품 그룹 마스터 (team_rnd 전용)
import IssuedErrorPage from '@/pages/process/manage/IssuedErrorPage' // 2026-05-20 — LOT 채번 오류 처리 (admin.manage)
import QcEntryPage from '@/pages/process/manage/QcEntryPage'   // 2026-05-31 — QC 진입 (3 카드 랜딩)
import IQInspectPage from '@/pages/process/manage/IQInspectPage'   // 2026-05-31 — IQ 입고검사 (진행형)
import IPQInspectPage from '@/pages/process/manage/IPQInspectPage' // 2026-05-31 — IPQ 공정검사 (진행형)
import QcListPage from '@/pages/process/manage/QcListPage'     // 2026-05-30 — QC 검사 이력 조회
import NonconformingListPage from '@/pages/process/manage/NonconformingListPage' // 2026-05-31 — 부적합품 관리
import RequireFeature from '@/components/RequireFeature'
import { Feature, isAdmin, canAccess, PROCESS_TO_FEATURE } from '@/constants/permissions'
// ── 대시보드 탭 (구 재고) ── 공정/완제품/진척률 3뷰 — URL로 구분
import ProcessInventoryPage from '@/pages/dashboard/ProcessInventoryPage'
import FinishedInventoryPage from '@/pages/dashboard/FinishedInventoryPage'
import ProgressPage from '@/pages/dashboard/ProgressPage'
import ProductionDashboardPage from '@/pages/dashboard/ProductionDashboardPage' // 2026-05-21 — 스테이터 생산량 (품질 대시보드에서 분리)
// ── 홈 탭 (2026-04-24 신규) ── 릴리스 노트/뉴스레터 placeholder
import HomePage from '@/pages/home/HomePage'
// ── mypage 탭 ──
import MyPage from '@/pages/mypage/MyPage'
// ── 공용 컴포넌트 ──
import OQInspectionEditor from '@/components/OQInspectionEditor'
import RotorOqInspectionEditor from '@/components/RotorOqInspectionEditor'
import BottomNav, { NAV_TABS } from '@/components/BottomNav'
import SideNav from '@/components/SideNav'
import PageTransition from '@/components/PageTransition'
import SplashScreen from '@/components/SplashScreen'
import { useIsDesktop } from '@/hooks/useBreakpoint'
import { ADMIN_ROUTE_MAP } from '@/constants/processConst'

// 공정 코드(RM~OB) → 페이지 컴포넌트 매핑
// IQ/IPQ 는 QC 검사 입력 페이지(IQInspectPage/IPQInspectPage)로 라우팅 (2026-05-31).
// 옛 IQPage 라벨인쇄 컴포넌트는 코드 보존 — PROCESS_PAGES 에서만 제거.
const PROCESS_PAGES = {
  RM: RMPage, MP: MPPage, EA: EAPage, HT: HTPage,
  BO: BOPage, EC: ECPage, WI: WIPage, SO: SOPage,
  IQ: IQInspectPage, IPQ: IPQInspectPage, OQ: OQPage,
  UB: UBPage, MB: MBPage, OB: OBPage,
  REA: REAPage, RBO: RBOPage, RT: RRTPage,   // 로터 생산체인 (2026-06-12)
}

// ════════════════════════════════════════════════════════════
// 라우트 래퍼들 — Outlet context에서 logout/user 주입
// ════════════════════════════════════════════════════════════

// /process/:code — OQ edit 모드는 ?edit=... search param으로 분기
function ProcessRoute() {
  const { code } = useParams()
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const { user, logout } = useOutletContext()    // user — IQ/IPQ 검사자 자동입력용 (2026-05-31)
  const editLotSoNo = sp.get('edit')
  const editLine = sp.get('line')   // rotor 면 회전자 OQ 편집 (2026-06-16)

  // ★ 공정별 권한 가드 (2026-07-31) — 카드 필터만으로는 부족하다.
  //   ADMPage 에서 카드를 숨겨도 /process/WI 주소 입력·뒤로가기·북마크로 그대로 열렸음.
  //   PROCESS_TO_FEATURE 에 없는 code(오타·폐기 공정)도 여기서 함께 차단.
  const feature = PROCESS_TO_FEATURE[code]
  if (!feature || !canAccess(user, feature)) return <Navigate to="/" replace />

  if (code === 'OQ' && editLotSoNo) {
    if (editLine === 'rotor') {
      return (
        <RotorOqInspectionEditor
          lotNo={editLotSoNo}
          onLogout={logout}
          onBack={() => navigate(-1)}
        />
      )
    }
    return (
      <OQInspectionEditor
        lotNo={editLotSoNo}
        onLogout={logout}
        // navigate(-1) — push 대신 history 뒤로 이동. 아니면 편집 페이지가 history에 남아서
        // 검사목록에서 "이전" 누를 때 편집으로 되돌아가는 버그 발생
        onBack={() => navigate(-1)}
      />
    )
  }

  const Page = PROCESS_PAGES[code]
  if (!Page) return <Navigate to="/" replace />
  // user 주입 — IQ/IPQ InspectPage 가 검사자 자동입력에 사용. 다른 페이지는 무시.
  return <Page user={user} onLogout={logout} onBack={() => navigate(-1)} />
}

// ADM 관리 페이지 공통 래퍼 — onBack + onLogout 주입
function AdmPageRoute({ Component, ...rest }) {
  const navigate = useNavigate()
  // user 도 함께 넘긴다 (2026-08-07) — 계정 종류(PERSON/MACHINE/SHARED)에 따라 작업자 입력을
  //   요구하는 화면이 생겼다. 선언 안 한 페이지는 그냥 무시하고, rest 가 뒤라 명시 지정이 우선.
  const { user, logout } = useOutletContext()
  return <Component user={user} onLogout={logout} onBack={() => navigate(-1)} {...rest} />
}

// InspectionList 전용 — onEdit으로 /process/OQ?edit=... navigate
function InspectionListRoute() {
  const navigate = useNavigate()
  const { logout } = useOutletContext()
  return (
    <InspectionListPage
      onLogout={logout}
      onBack={() => navigate(-1)}
      onEdit={(lot, line) => navigate(`/process/OQ?edit=${encodeURIComponent(lot)}${line === 'rotor' ? '&line=rotor' : ''}`)}
    />
  )
}

// MyPage 래퍼
function MyPageRoute() {
  const { user, logout } = useOutletContext()
  return <MyPage user={user} onLogout={logout} />
}

// HomePage 래퍼 (2026-04-24 신규 탑레벨 탭) — 릴리스 노트/뉴스레터 placeholder
function HomePageRoute() {
  const { user } = useOutletContext()
  return <HomePage user={user} />
}

// TracePage 탑레벨 래퍼 (QR 탭) — 탭 전환은 navigate(-1) 대신 홈으로
//   탑레벨 탭의 "뒤로" 는 이전 탭으로 돌아가는 게 자연스러우므로 navigate(-1) 유지
function TraceTopRoute() {
  const navigate = useNavigate()
  const { logout } = useOutletContext()
  return <TracePage onLogout={logout} onBack={() => navigate(-1)} />
}

// ADM key → URL 이동 (ADMPage / AdminPage 공용)
function makeAdmSelectHandler(navigate) {
  return (key) => {
    if (key === 'INVENTORY') {
      navigate('/inventory/process')
      return
    }
    if (PROCESS_PAGES[key]) {
      navigate(`/process/${key}`)
      return
    }
    const route = ADMIN_ROUTE_MAP[key]
    if (route) navigate(route)
  }
}

// ADMPage 래퍼 — '공정' sub-view (제작/검사/출하)
function ADMRoute() {
  const navigate = useNavigate()
  const { user, logout } = useOutletContext()
  return <ADMPage onSelect={makeAdmSelectHandler(navigate)} onLogout={logout} user={user} />
}

// AdminPage 래퍼 — '관리' sub-view (admin_rnd / general_admin 만 노출, 2026-05-02)
//   비-admin 가 URL 직접 진입 시 ADMPage 로 리다이렉트
function AdminPageRoute() {
  const navigate = useNavigate()
  const { user } = useOutletContext()
  if (!isAdmin(user)) return <Navigate to="/" replace />
  return <AdminPage onSelect={makeAdmSelectHandler(navigate)} user={user} />
}

// Inventory 라우트 (view="process"|"finished"|"progress")
//   ★ 대시보드도 권한 게이트 적용 (2026-07-31) — 이전엔 로그인만 하면 전부 열람 가능했다.
//     진척(progress)은 수주·단가가 보여 재고 현황과 열람 범위가 다르므로 별도 권한.
const INVENTORY_VIEW_FEATURE = {
  process: Feature.DASH_INVENTORY,
  finished: Feature.DASH_INVENTORY,
  progress: Feature.DASH_PROGRESS,
}

// 대시보드 뷰 카탈로그 — 네비 서브메뉴 필터와 탭 진입 경로를 한 곳에서 결정 (2026-07-31).
//   라우트 가드와 같은 feature 를 참조해야 "메뉴엔 보이는데 누르면 튕김" 이 안 생긴다.
const DASHBOARD_VIEWS = [
  { key: 'process', path: '/inventory/process', feature: Feature.DASH_INVENTORY },
  { key: 'finished', path: '/inventory/finished', feature: Feature.DASH_INVENTORY },
  { key: 'progress', path: '/inventory/progress', feature: Feature.DASH_PROGRESS },
  { key: 'quality', path: '/admin/dashboard/quality', feature: Feature.DASH_QUALITY },
  { key: 'production', path: '/admin/dashboard/production', feature: Feature.DASH_PRODUCTION },
]

function InventoryRoute({ view }) {
  const { user, logout } = useOutletContext()
  if (!canAccess(user, INVENTORY_VIEW_FEATURE[view])) return <Navigate to="/" replace />
  if (view === 'progress') return <ProgressPage user={user} />
  if (view === 'finished') return <FinishedInventoryPage onLogout={logout} />
  return <ProcessInventoryPage onLogout={logout} />
}

// /admin/invoice 등 역할 가드 라우트는 이제 <RequireFeature feature=...> 로 통일 (Phase A, 2026-04-22)
// InvoiceAccessRoute 는 폐기됨 — 기존 canAccessInvoice 대체

// ════════════════════════════════════════════════════════════
// ADM 레이아웃 — BottomNav / SideNav 관리 + <Outlet/>
// ════════════════════════════════════════════════════════════
function AdmLayout({ user, logout, showSplash, setShowSplash }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const path = location.pathname

  // nav 노출 정책 (2026-06-19 개편):
  //   · 데스크탑 — SideNav 상시 노출 (position:fixed 오버레이, 페이지 좌측 margin 64px 만 확보).
  //   · 모바일   — 5개 탭 랜딩 경로에서만 BottomNav. 그 안의 스캔·입력·상세 화면은 숨김
  //               → 하단 input/CTA 가 nav 에 가려지던 문제 근절 (BottomNav 자동숨김은 폐지).
  //   토큰(--bottom-nav-height)도 이 showNav 기준으로만 관리 — BottomNav 는 더 이상 토큰 안 건드림.
  // 랜딩 경로 = handleNavTab 의 각 탭 목적지 (공정 '/'·관리 '/admin' / QR '/trace' / 홈 '/home'
  //   / 마이 '/my' / 대시보드 '/inventory/*'·'/admin/dashboard/*'). 그 외(/process/:code, /admin/print 등)는 숨김.
  const isNavLanding =
    path === '/' || path === '/admin' || path === '/trace' ||
    path === '/home' || path === '/my' ||
    path.startsWith('/inventory') || path.startsWith('/admin/dashboard')
  const showNav = isDesktop || isNavLanding

  // nav 공간 토큰을 :root 에 주입 (2026-05-28) — 모든 fixed 요소(UpdateBanner, sticky-cta,
  // QRScanner 등)가 wrapper DOM 위치와 무관하게 var() 로 참조 가능.
  useEffect(() => {
    const root = document.documentElement
    if (showNav && isDesktop) {
      root.style.setProperty('--side-nav-width', '64px')
      root.style.setProperty('--bottom-nav-height', '0px')
    } else if (showNav && !isDesktop) {
      root.style.setProperty('--side-nav-width', '0px')
      root.style.setProperty('--bottom-nav-height', '68px')
    } else {
      root.style.setProperty('--side-nav-width', '0px')
      root.style.setProperty('--bottom-nav-height', '0px')
    }
    return () => {
      root.style.removeProperty('--side-nav-width')
      root.style.removeProperty('--bottom-nav-height')
    }
  }, [showNav, isDesktop])

  // activeTab 매핑 — URL 기반 활성 탭 결정 (모든 path 커버)
  const activeTab =
    path === '/trace' ? NAV_TABS.TRACE :
    path === '/home' ? NAV_TABS.HOME :
    path.startsWith('/inventory') ? NAV_TABS.DASHBOARD :
    path.startsWith('/admin/dashboard') ? NAV_TABS.DASHBOARD :
    path === '/my' ? NAV_TABS.MY :
    // /admin/* 서브 (BOM/Item/Print/Trace/Manage/Export) + /process/:code + /admin 모두 PROCESS 탭
    NAV_TABS.PROCESS

  // processView: 'process' | 'manage' — 공정 탭 sub-view (2026-05-02)
  //   process = 공정 선택 (제작/검사/출하 — ADMPage)
  //   manage  = 관리 메뉴 (ADMIN_LIST — AdminPage, admin 만)
  const getStoredProcessView = () => {
    try { return localStorage.getItem('processView') || 'process' } catch { return 'process' }
  }
  const processView =
    path === '/admin' ? 'manage' :
    path === '/' ? 'process' :
    getStoredProcessView()

  // 공정 탭 내 sub-view 변경 시 localStorage 동기화
  useEffect(() => {
    if (path === '/') {
      try { localStorage.setItem('processView', 'process') } catch { /* */ }
    } else if (path === '/admin') {
      try { localStorage.setItem('processView', 'manage') } catch { /* */ }
    }
  }, [path])

  // dashboardView: 'process' | 'finished' | 'progress' | 'quality' — URL 우선, 아니면 localStorage 폴백
  // (구 inventoryView 에서 리네이밍 — 대시보드 탭 의미 맞추기)
  // quality 는 /admin/dashboard/quality 경로 — 재고 탭이 아닌 품질 대시보드로 라우팅 (2026-05-01)
  const getStoredView = () => {
    try { return localStorage.getItem('inventoryView') || 'process' } catch { return 'process' }
  }
  const dashboardView =
    path === '/inventory/finished' ? 'finished' :
    path === '/inventory/progress' ? 'progress' :
    path === '/inventory/process' ? 'process' :
    path === '/admin/dashboard/quality' ? 'quality' :
    path === '/admin/dashboard/production' ? 'production' :
    getStoredView()

  // URL이 대시보드 뷰로 바뀔 때 localStorage 동기화 (재진입 시 마지막 뷰 복원용)
  useEffect(() => {
    if (['/inventory/process', '/inventory/finished', '/inventory/progress'].includes(path)) {
      const v = path.split('/').pop()
      try { localStorage.setItem('inventoryView', v) } catch { /* */ }
    } else if (path === '/admin/dashboard/quality') {
      try { localStorage.setItem('inventoryView', 'quality') } catch { /* */ }
    } else if (path === '/admin/dashboard/production') {
      try { localStorage.setItem('inventoryView', 'production') } catch { /* */ }
    }
  }, [path])

  // 탭 전환: URL로 이동 — 5탭 구조 (2026-04-24)
  // 공정 탭은 sub-view 기억 (2026-05-02): 마지막 'process'/'manage' 로 복원
  const handleNavTab = (tab) => {
    if (tab === NAV_TABS.PROCESS) {
      if (processView === 'manage' && isAdmin(user)) navigate('/admin')
      else navigate('/')
    }
    else if (tab === NAV_TABS.TRACE) navigate('/trace')
    else if (tab === NAV_TABS.HOME) navigate('/home')
    else if (tab === NAV_TABS.DASHBOARD) {
      // 대시보드 진입 기본 = 재공현황(process) — 마지막 뷰 복원 대신 항상 process 먼저 (2026-08-04 사용자 요청).
      //   접근 불가면 허용된 첫 뷰로 (가드 튕김 방지).
      const target = DASHBOARD_VIEWS.find((v) => v.key === 'process' && canAccess(user, v.feature))
        || DASHBOARD_VIEWS.find((v) => canAccess(user, v.feature))
      if (target) navigate(target.path)
    }
    else if (tab === NAV_TABS.MY) navigate('/my')
  }
  const handleDashboardViewChange = (v) => {
    const target = DASHBOARD_VIEWS.find((x) => x.key === v)
    if (target && canAccess(user, target.feature)) navigate(target.path)
  }
  // 권한 있는 대시보드 뷰만 네비에 노출
  const allowedDashboardViews = DASHBOARD_VIEWS
    .filter((v) => canAccess(user, v.feature)).map((v) => v.key)
  // 공정 탭 sub-view 전환 — 'process' 또는 'manage' (2026-05-02)
  const handleProcessViewChange = (v) => {
    if (v === 'manage' && isAdmin(user)) navigate('/admin')
    else navigate('/')
  }

  return (
    <>
      <SplashScreen visible={showSplash} onDone={() => setShowSplash(false)} userName={user.id} />
      {isDesktop && showNav && (
        <SideNav
          active={activeTab}
          onSelect={handleNavTab}
          onLogout={logout}
          dashboardView={dashboardView}
          onDashboardViewChange={handleDashboardViewChange}
          allowedDashboardViews={allowedDashboardViews}
          processView={processView}
          onProcessViewChange={handleProcessViewChange}
          canAdmin={isAdmin(user)}
        />
      )}
      {/* pageKey에 search 포함 — /process/OQ ↔ /process/OQ?edit=... 전환 시에도 재애니메이션 */}
      <PageTransition pageKey={`${path}${location.search}`}>
        <div
          style={{
            visibility: showSplash ? 'hidden' : 'visible',
            marginLeft: isDesktop && showNav ? 64 : 0,
            /* nav 토큰(--side-nav-width / --bottom-nav-height) 은 :root 에 useEffect 로 주입 (2026-05-28) */
          }}
        >
          <Outlet context={{ user, logout }} />
        </div>
      </PageTransition>
      {!isDesktop && showNav && (
        <BottomNav
          active={activeTab}
          onSelect={handleNavTab}
          dashboardView={dashboardView}
          onDashboardViewChange={handleDashboardViewChange}
          processView={processView}
          onProcessViewChange={handleProcessViewChange}
          canAdmin={isAdmin(user)}
        />
      )}
    </>
  )
}

// NonAdmLayout 은 Phase A (2026-04-22) 에서 폐기 — 모든 역할이 AdmLayout 사용
// process_type 필드 자체가 폐기되었고, 역할별 접근 제한은 <RequireFeature> 가드로 통일

// ════════════════════════════════════════════════════════════
// 진입점 App — Routes 분기
// ════════════════════════════════════════════════════════════
export default function App() {
  const { user, loading, error, login, logout } = useAuth()
  const [showSplash, setShowSplash] = useState(false)
  const prevUser = useRef(null)

  // null → user 로 바뀌는 순간 = 로그인 성공 → 스플래시 트리거
  useEffect(() => {
    if (!prevUser.current && user) setShowSplash(true)
    prevUser.current = user
  }, [user])

  // 외부 공개 cert 도메인 (cert.*) — 내부 라우트 일체 노출 X (2026-04-27)
  // hostname 분기. lot.* 호스트에서 cert/* 경로 진입은 자동으로 / 로 리다이렉트.
  // dev 검증용 토글: `?cert-preview` — dev-lot.* 에서 cert 페이지 진입 (2026-04-29 부활)
  const isPublicCert = typeof window !== 'undefined' && (
    window.location.hostname.startsWith('cert.') ||
    new URLSearchParams(window.location.search).has('cert-preview')
  )
  if (isPublicCert) {
    return (
      <ErrorBoundary>
      <ToastProvider>
      <ConfirmProvider>
        {/* cert.* — Service Worker 미사용 (main.jsx 에서 hostname 보고 등록 skip).
            일반 웹사이트처럼 매 방문 신선한 HTML/JS 받음 → 자동 업데이트 로직 불필요 (2026-05-02) */}
        <Routes>
          {/* 2026-05-02 Phase D — 도메인 root 진입점이 회사 로그인 흐름으로 변경 (CertEmpty → CertCompanyFlow).
                login → orders → order-pw → mb-select → navigate(/{mb}) → CertFlow 가 이어받음
                (sheet_token 은 sessionStorage 에 미리 캐시되어 있어 PW 입력 스킵) */}
          <Route path="/" element={<CertCompanyFlow />} />
          {/* 2026-04-29 v3:
                /{mb_token}                  → MB 페이지 (UB 목록 + 모델 결합 버튼)
                /{mb_token}/{ub_lot}         → UB 페이지 (focus_ub)
                /{mb_token}/{ub_lot}/{fp}    → UB 페이지 + 그 ST 카드 자동 펼침 (FP QR 직접 진입) */}
          <Route path="/:token" element={<CertFlow />} />
          <Route path="/:token/:ub" element={<CertFlow />} />
          <Route path="/:token/:ub/:fp" element={<CertFlow />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ConfirmProvider>
      </ToastProvider>
      </ErrorBoundary>
    )
  }

  // 로그인 전에는 ModelsProvider 를 마운트하지 않음 — /models 호출이 401 을 유발해
  // alert 루프가 발생하는 문제 방지 (2026-04-24)
  const Shell = user
    ? ({ children }) => <ModelsProvider>{children}</ModelsProvider>
    : ({ children }) => <>{children}</>

  return (
    <ErrorBoundary>
    <ToastProvider>
    <ConfirmProvider>
      {/* 배포 감지 시 상단 고정 배너 — 모든 라우트 위에 표시 */}
      <UpdateBanner />
      <Shell>
      <Routes>
        {/* 기존 /cert/:obLotNo 라우트 폐기 (2026-04-27) — cert.* 도메인으로 분리,
           이 lot.* 호스트에서는 cert 진입점 자체 노출 안 됨 */}

        {!user ? (
          <>
            <Route path="/login" element={
              <PageTransition pageKey="login">
                <LoginPage onLogin={login} loading={loading} error={error} />
              </PageTransition>
            } />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          // Phase A (2026-04-22): process_type 폐기 — 모든 역할이 AdmLayout 사용
          // 각 경로의 접근 제한은 <RequireFeature feature="..."> 가드로 처리
          <Route element={
            <AdmLayout
              user={user}
              logout={logout}
              showSplash={showSplash}
              setShowSplash={setShowSplash}
            />
          }>
            <Route path="/" element={<ADMRoute />} />
            {/* 관리 메뉴 — 공정 탭의 sub-view (admin 전용, 2026-05-02) */}
            <Route path="/admin" element={<AdminPageRoute />} />
            <Route path="/process/:code" element={<ProcessRoute />} />
            <Route path="/admin/print" element={
              <RequireFeature feature={Feature.ADMIN_PRINT}>
                <AdmPageRoute Component={PrintPage} />
              </RequireFeature>
            } />
            <Route path="/admin/trace" element={
              <RequireFeature feature={Feature.ADMIN_TRACE}>
                <AdmPageRoute Component={TracePage} />
              </RequireFeature>
            } />
            <Route path="/admin/day-batch" element={
              <RequireFeature feature={Feature.ADMIN_TRACE}>
                <AdmPageRoute Component={DayBatchPage} />
              </RequireFeature>
            } />
            <Route path="/admin/manage" element={
              <RequireFeature feature={Feature.ADMIN_MANAGE}>
                <AdmPageRoute Component={LotManagePage} />
              </RequireFeature>
            } />
            <Route path="/admin/export" element={
              <RequireFeature feature={Feature.ADMIN_EXPORT}>
                <AdmPageRoute Component={ExportPage} />
              </RequireFeature>
            } />
            {/* 요크 IPQ 검사 목록 — 카드/BE(qc.yoke_ipq_view)와 게이트 일치 (2026-08-06 정정:
                기존 ADMIN_INSPECT_LIST(OQ 목록)라 요크 조회 권한자가 카드는 보이나 진입 시 튕겼음) */}
            <Route path="/admin/ipq-list" element={
              <RequireFeature feature={Feature.QC_YOKE_IPQ_VIEW}>
                <AdmPageRoute Component={YokeIpqListPage} />
              </RequireFeature>
            } />
            {/* 요크 X̄-R 관리도 — IPQ 실측의 다른 표현(읽기 전용) 이라 조회 권한을 그대로 재사용 */}
            <Route path="/admin/ipq-spc" element={
              <RequireFeature feature={Feature.QC_YOKE_IPQ_VIEW}>
                <AdmPageRoute Component={YokeSpcPage} />
              </RequireFeature>
            } />
            {/* OQC 재공정 값 비교 — OQ 검사 데이터 읽기 전용이라 검사목록과 같은 게이트 */}
            <Route path="/admin/oq-compare" element={
              <RequireFeature feature={Feature.ADMIN_INSPECT_LIST}>
                <AdmPageRoute Component={OqComparePage} />
              </RequireFeature>
            } />
            <Route path="/admin/inspect-list" element={
              <RequireFeature feature={Feature.ADMIN_INSPECT_LIST}>
                <InspectionListRoute />
              </RequireFeature>
            } />
            <Route path="/admin/seed-chain" element={
              <RequireFeature feature={Feature.ADMIN_SEED_CHAIN}>
                <AdmPageRoute Component={SeedChainPage} />
              </RequireFeature>
            } />
            <Route path="/admin/box-check" element={
              <RequireFeature feature={Feature.ADMIN_BOX_CHECK}>
                <AdmPageRoute Component={BoxCheckPage} />
              </RequireFeature>
            } />
            <Route path="/admin/invoice" element={
              <RequireFeature feature={Feature.ADMIN_INVOICE}>
                <AdmPageRoute Component={InvoicePage} />
              </RequireFeature>
            } />
            <Route path="/admin/inventory-survey" element={
              <RequireFeature feature={Feature.ADMIN_INVENTORY_SURVEY}>
                <AdmPageRoute Component={InventorySurveyPage} />
              </RequireFeature>
            } />
            <Route path="/admin/bom-view" element={
              <RequireFeature feature={Feature.ADMIN_BOM_VIEW}>
                <AdmPageRoute Component={BomViewPage} />
              </RequireFeature>
            } />
            <Route path="/admin/printer" element={
              <RequireFeature feature={Feature.ADMIN_PRINTER}>
                <AdmPageRoute Component={PrinterManagePage} />
              </RequireFeature>
            } />
            <Route path="/admin/factory" element={
              <RequireFeature feature={Feature.ADMIN_PRINTER}>
                <AdmPageRoute Component={FactoryManagePage} />
              </RequireFeature>
            } />
            <Route path="/admin/users" element={
              <RequireFeature feature={Feature.ADMIN_USERS}>
                <AdmPageRoute Component={UserManagePage} />
              </RequireFeature>
            } />
            <Route path="/admin/permissions" element={
              <RequireFeature feature={Feature.ADMIN_PERMISSIONS}>
                <AdmPageRoute Component={AccessControlPage} />
              </RequireFeature>
            } />
            <Route path="/admin/manage/models" element={
              <RequireFeature feature={Feature.ADMIN_MODEL_REGISTRY}>
                <AdmPageRoute Component={ModelManagePage} />
              </RequireFeature>
            } />
            <Route path="/admin/inspection-spec" element={
              <RequireFeature feature={Feature.ADMIN_MODEL_REGISTRY}>
                <AdmPageRoute Component={InspectionSpecPage} />
              </RequireFeature>
            } />
            <Route path="/admin/production-order" element={
              <RequireFeature feature={Feature.ADMIN_BOM}>
                <AdmPageRoute Component={ProductionOrderPage} />
              </RequireFeature>
            } />
            <Route path="/admin/sales-order" element={
              <RequireFeature feature={Feature.ADMIN_SALES_ORDER}>
                <AdmPageRoute Component={SalesOrderPage} />
              </RequireFeature>
            } />
            <Route path="/admin/notification" element={
              <RequireFeature feature={Feature.ADMIN_NOTIFY}>
                <AdmPageRoute Component={NotificationSettingPage} />
              </RequireFeature>
            } />
            <Route path="/admin/print-history" element={
              <RequireFeature feature={Feature.ADMIN_PRINT_HISTORY}>
                <AdmPageRoute Component={PrintHistoryPage} />
              </RequireFeature>
            } />
            <Route path="/admin/lines-chart" element={<AdmPageRoute Component={LinesChartPage} />} />
            <Route path="/admin/cert-preview" element={<AdmPageRoute Component={CertPreviewPage} />} />
            <Route path="/admin/stock-admin" element={
              <RequireFeature feature={Feature.ADMIN_STOCK_ADMIN}>
                <AdmPageRoute Component={StockAdminPage} />
              </RequireFeature>
            } />
            <Route path="/admin/warehouse" element={<AdmPageRoute Component={WarehousePage} />} />
            {/* 카드만 숨기면 URL 직접 진입이 뚫린다 — BE /warehouse/scan-usage 게이트와 같은 feature 로 일치 */}
            <Route path="/admin/warehouse-usage" element={
              <RequireFeature feature={Feature.ADMIN_WH_SCAN}>
                <AdmPageRoute Component={WarehouseUsageScanPage} />
              </RequireFeature>
            } />
            <Route path="/admin/rotor-bond-rollback" element={<AdmPageRoute Component={RotorBondRollbackPage} />} />
            {/* 안전재고 전용 설정 (2026-07-28) — 창고와 동일 게이트(로그인). 카드 노출은 ADMIN_TO_FEATURE 참조 */}
            {/* 요크 녹 제거 — 대기 목록·복귀 + QR 스캔. 2026-08-13 전용 feature 로 분리
                (요크가공=생산 게이트 재사용 시 권한 매트릭스에 항목이 안 떴음). BE 도 같은 feature. */}
            <Route path="/admin/rust-wait" element={
              <RequireFeature feature={Feature.ADMIN_RUST_WAIT}>
                <AdmPageRoute Component={RustWaitPage} />
              </RequireFeature>
            } />
            <Route path="/admin/rust-scan" element={
              <RequireFeature feature={Feature.ADMIN_RUST_WAIT}>
                <AdmPageRoute Component={RustScanPage} />
              </RequireFeature>
            } />
            <Route path="/admin/safety-stock" element={<AdmPageRoute Component={SafetyStockPage} />} />
            <Route path="/admin/stock-location" element={<AdmPageRoute Component={StockLocationPage} />} />
            <Route path="/admin/companies" element={
              <RequireFeature feature={Feature.ADMIN_COMPANY}>
                <AdmPageRoute Component={CompanyManagePage} />
              </RequireFeature>
            } />
            <Route path="/admin/feedback" element={
              <RequireFeature feature={Feature.ADMIN_FEEDBACK}>
                <AdmPageRoute Component={AdminFeedbackPage} />
              </RequireFeature>
            } />
            <Route path="/admin/bom" element={
              <RequireFeature feature={Feature.ADMIN_BOM}>
                <AdmPageRoute Component={BomManagePage} />
              </RequireFeature>
            } />
            <Route path="/admin/item" element={
              <RequireFeature feature={Feature.ADMIN_BOM}>
                <AdmPageRoute Component={ItemManagePage} />
              </RequireFeature>
            } />
            <Route path="/admin/substitute-groups" element={
              <RequireFeature feature={Feature.ADMIN_BOM}>
                <AdmPageRoute Component={SubstituteGroupManagePage} />
              </RequireFeature>
            } />
            <Route path="/admin/issue-error" element={
              <RequireFeature feature={Feature.ADMIN_MANAGE}>
                <AdmPageRoute Component={IssuedErrorPage} />
              </RequireFeature>
            } />
            {/* QC 진입 랜딩 — 검사 단계(IQ/IPQ/OQ/요크) 중 하나라도 있으면 진입.
                카드별 게이트는 QcEntryPage 가 수행 (2026-08-06 단계 분해) */}
            <Route path="/admin/qc-inspect" element={
              <RequireFeature feature={[Feature.QC_IQ, Feature.QC_IPQ, Feature.QC_OQ, Feature.QC_YOKE_IPQ]}>
                <AdmPageRoute Component={QcEntryPage} />
              </RequireFeature>
            } />
            <Route path="/admin/qc-inspect/iq" element={
              <RequireFeature feature={Feature.QC_IQ}>
                <AdmPageRoute Component={IQInspectPage} />
              </RequireFeature>
            } />
            {/* IPQ — 라인(고정자 qc.ipq / 요크 qc.yoke_ipq)별 게이트는 IPQInspectPage 가 수행 */}
            <Route path="/admin/qc-inspect/ipq" element={
              <RequireFeature feature={[Feature.QC_IPQ, Feature.QC_YOKE_IPQ]}>
                <AdmPageRoute Component={IPQInspectPage} />
              </RequireFeature>
            } />
            {/* FP 번호 재공정 — IPQInspectPage 재사용, 라벨만 FP 로 (2026-07-14). 고정자 전용 흐름 */}
            <Route path="/admin/fp-repair" element={
              <RequireFeature feature={Feature.QC_IPQ}>
                <AdmPageRoute Component={IPQInspectPage} entryLabel="FP 번호 재공정" skipLineSelect />
              </RequireFeature>
            } />
            <Route path="/admin/qc-list" element={
              <RequireFeature feature={Feature.QC_VIEW}>
                <AdmPageRoute Component={QcListPage} />
              </RequireFeature>
            } />
            {/* 부적합품 관리 — 검사 FAIL 후속 처분. 어느 단계 담당자든 처분 가능 (기존 qc.inspect 범위 유지) */}
            <Route path="/admin/qc-nonconforming" element={
              <RequireFeature feature={[Feature.QC_IQ, Feature.QC_IPQ]}>
                <AdmPageRoute Component={NonconformingListPage} />
              </RequireFeature>
            } />
            <Route path="/admin/dashboard/quality" element={
              <RequireFeature feature={Feature.DASH_QUALITY}>
                <AdmPageRoute Component={QualityDashboardPage} />
              </RequireFeature>
            } />
            <Route path="/admin/dashboard/production" element={
              <RequireFeature feature={Feature.DASH_PRODUCTION}>
                <AdmPageRoute Component={ProductionDashboardPage} />
              </RequireFeature>
            } />
            {/* 작업일지 — 카드 게이트(ADMIN_TO_FEATURE['WORK LOG'])와 같은 feature 여야 튕기지 않는다 */}
            <Route path="/admin/manage/worklog" element={
              <RequireFeature feature={Feature.PROD_WORKLOG}>
                <AdmPageRoute Component={WorkLogPage} />
              </RequireFeature>
            } />
            <Route path="/inventory" element={<Navigate to="/inventory/process" replace />} />
            <Route path="/inventory/process" element={<InventoryRoute view="process" />} />
            <Route path="/inventory/finished" element={<InventoryRoute view="finished" />} />
            <Route path="/inventory/progress" element={<InventoryRoute view="progress" />} />
            {/* 2026-04-24: 5탭 확장 — QR(트레이스) + 홈 탑레벨 추가 */}
            <Route path="/trace" element={<TraceTopRoute />} />
            <Route path="/home" element={<HomePageRoute />} />
            <Route path="/my" element={<MyPageRoute />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
      </Shell>
    </ConfirmProvider>
    </ToastProvider>
    </ErrorBoundary>
  )
}
