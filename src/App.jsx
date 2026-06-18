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
import LinesChartPage from '@/pages/process/manage/LinesChartPage'
import QualityDashboardPage from '@/pages/dashboard/QualityDashboardPage'
import BoxCheckPage from '@/pages/process/manage/BoxCheckPage'
import InvoicePage from '@/pages/process/manage/InvoicePage'
import InventorySurveyPage from '@/pages/process/manage/InventorySurveyPage'
import BomViewPage from '@/pages/process/manage/BomViewPage'
import PrinterManagePage from '@/pages/process/manage/PrinterManagePage'
import UserManagePage from '@/pages/process/manage/UserManagePage'
import RolePermissionPage from '@/pages/process/manage/RolePermissionPage'
import MachinePermissionPage from '@/pages/process/manage/MachinePermissionPage'
import RoleManagePage from '@/pages/process/manage/RoleManagePage'
import ModelManagePage from '@/pages/process/manage/ModelManagePage'
import PrintHistoryPage from '@/pages/process/manage/PrintHistoryPage'
import CertPreviewPage from '@/pages/process/manage/CertPreviewPage'
import StockAdminPage from '@/pages/process/manage/StockAdminPage'      // 2026-05-01 — 재고 직접 관리 CRUD (team_rnd 전용)
import WarehousePage from '@/pages/process/manage/WarehousePage'  // 2026-06-08 — 자유 입력 단순 재고 CRUD
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
import { Feature, isAdmin } from '@/constants/permissions'
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
function AdmPageRoute({ Component }) {
  const navigate = useNavigate()
  const { logout } = useOutletContext()
  return <Component onLogout={logout} onBack={() => navigate(-1)} />
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
function InventoryRoute({ view }) {
  const { user, logout } = useOutletContext()
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

  // SideNav 는 항상 노출 (2026-05-21).
  //   이전에는 탑레벨 5탭만 노출 → admin 서브(/bom, /item, /print 등) 와 /process/:code
  //   에서 네비가 사라져 사용자 혼란. SideNav 는 position:fixed 라 오버레이 레이어 —
  //   페이지 레이아웃 영향 없음. 페이지의 좌측 margin (64px) 만 확보.
  const showNav = true

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
      if (dashboardView === 'quality') navigate('/admin/dashboard/quality')
      else if (dashboardView === 'production') navigate('/admin/dashboard/production')
      else navigate(`/inventory/${dashboardView}`)
    }
    else if (tab === NAV_TABS.MY) navigate('/my')
  }
  const handleDashboardViewChange = (v) => {
    if (v === 'quality') navigate('/admin/dashboard/quality')
    else if (v === 'production') navigate('/admin/dashboard/production')
    else navigate(`/inventory/${v}`)
  }
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
            <Route path="/admin/users" element={
              <RequireFeature feature={Feature.ADMIN_USERS}>
                <AdmPageRoute Component={UserManagePage} />
              </RequireFeature>
            } />
            <Route path="/admin/permissions" element={
              <RequireFeature feature={Feature.ADMIN_PERMISSIONS}>
                <AdmPageRoute Component={RolePermissionPage} />
              </RequireFeature>
            } />
            <Route path="/admin/permissions/user" element={
              <RequireFeature feature={Feature.ADMIN_PERMISSIONS}>
                <AdmPageRoute Component={MachinePermissionPage} />
              </RequireFeature>
            } />
            <Route path="/admin/roles" element={
              <RequireFeature feature={Feature.ADMIN_PERMISSIONS}>
                <AdmPageRoute Component={RoleManagePage} />
              </RequireFeature>
            } />
            <Route path="/admin/manage/models" element={
              <RequireFeature feature={Feature.ADMIN_MODEL_REGISTRY}>
                <AdmPageRoute Component={ModelManagePage} />
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
            <Route path="/admin/qc-inspect" element={
              <RequireFeature feature={Feature.QC_INSPECT}>
                <AdmPageRoute Component={QcEntryPage} />
              </RequireFeature>
            } />
            <Route path="/admin/qc-inspect/iq" element={
              <RequireFeature feature={Feature.QC_INSPECT}>
                <AdmPageRoute Component={IQInspectPage} />
              </RequireFeature>
            } />
            <Route path="/admin/qc-inspect/ipq" element={
              <RequireFeature feature={Feature.QC_INSPECT}>
                <AdmPageRoute Component={IPQInspectPage} />
              </RequireFeature>
            } />
            <Route path="/admin/qc-list" element={
              <RequireFeature feature={Feature.QC_VIEW}>
                <AdmPageRoute Component={QcListPage} />
              </RequireFeature>
            } />
            <Route path="/admin/qc-nonconforming" element={
              <RequireFeature feature={Feature.QC_INSPECT}>
                <AdmPageRoute Component={NonconformingListPage} />
              </RequireFeature>
            } />
            <Route path="/admin/dashboard/quality" element={<AdmPageRoute Component={QualityDashboardPage} />} />
            <Route path="/admin/dashboard/production" element={<AdmPageRoute Component={ProductionDashboardPage} />} />
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
