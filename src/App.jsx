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
import { LoginPage } from '@/pages/LoginPage'
// 외부 공개 cert 도메인 (cert.*) 전용 — hostname 분기로 lot.* 호스트에서는 노출되지 않음 (2026-04-27)
import CertFlow, { CertEmpty } from '@/pages/cert/CertFlow'
// ── adm 탭 (홈) — ADMPage + produce/shipping/manage 서브 ──
import ADMPage from '@/pages/adm/ADMPage'
import RMPage from '@/pages/adm/produce/RMPage'
import MPPage from '@/pages/adm/produce/MPPage'
import EAPage from '@/pages/adm/produce/EAPage'
import HTPage from '@/pages/adm/produce/HTPage'
import BOPage from '@/pages/adm/produce/BOPage'
import ECPage from '@/pages/adm/produce/ECPage'
import WIPage from '@/pages/adm/produce/WIPage'
import SOPage from '@/pages/adm/produce/SOPage'
import IQPage from '@/pages/adm/shipping/IQPage'
import OQPage from '@/pages/adm/shipping/OQPage'
import UBPage from '@/pages/adm/shipping/UBPage'
import MBPage from '@/pages/adm/shipping/MBPage'
import OBPage from '@/pages/adm/shipping/OBPage'
import { PrintPage } from '@/pages/adm/manage/PrintPage'
import LotManagePage from '@/pages/adm/manage/LotManagePage'
import TracePage from '@/pages/adm/manage/TracePage'
import ExportPage from '@/pages/adm/manage/ExportPage'
import SeedChainPage from '@/pages/adm/manage/SeedChainPage'
import InspectionListPage from '@/pages/adm/manage/InspectionListPage'
import LinesChartPage from '@/pages/adm/manage/LinesChartPage'
import QualityDashboardPage from '@/pages/adm/dashboard/QualityDashboardPage'
import BoxCheckPage from '@/pages/adm/manage/BoxCheckPage'
import InvoicePage from '@/pages/adm/manage/InvoicePage'
import PrinterManagePage from '@/pages/adm/manage/PrinterManagePage'
import UserManagePage from '@/pages/adm/manage/UserManagePage'
import ModelManagePage from '@/pages/adm/manage/ModelManagePage'
import PrintHistoryPage from '@/pages/adm/manage/PrintHistoryPage'
import RequireFeature from '@/components/RequireFeature'
import { Feature } from '@/constants/permissions'
// ── 대시보드 탭 (구 재고) ── 공정/완제품/진척률 3뷰 — URL로 구분
import ProcessInventoryPage from '@/pages/inventory/ProcessInventoryPage'
import FinishedInventoryPage from '@/pages/inventory/FinishedInventoryPage'
import ProgressPage from '@/pages/inventory/ProgressPage'
// ── 홈 탭 (2026-04-24 신규) ── 릴리스 노트/뉴스레터 placeholder
import HomePage from '@/pages/home/HomePage'
// ── mypage 탭 ──
import MyPage from '@/pages/mypage/MyPage'
// ── 공용 컴포넌트 ──
import OQInspectionEditor from '@/components/OQInspectionEditor'
import BottomNav, { NAV_TABS } from '@/components/BottomNav'
import SideNav from '@/components/SideNav'
import PageTransition from '@/components/PageTransition'
import SplashScreen from '@/components/SplashScreen'
import { useIsDesktop } from '@/hooks/useBreakpoint'
import { ADMIN_ROUTE_MAP } from '@/constants/processConst'

// 공정 코드(RM~OB) → 페이지 컴포넌트 매핑
const PROCESS_PAGES = {
  RM: RMPage, MP: MPPage, EA: EAPage, HT: HTPage,
  BO: BOPage, EC: ECPage, WI: WIPage, SO: SOPage,
  IQ: IQPage, OQ: OQPage, UB: UBPage, MB: MBPage, OB: OBPage,
}

// ════════════════════════════════════════════════════════════
// 라우트 래퍼들 — Outlet context에서 logout/user 주입
// ════════════════════════════════════════════════════════════

// /process/:code — OQ edit 모드는 ?edit=... search param으로 분기
function ProcessRoute() {
  const { code } = useParams()
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const { logout } = useOutletContext()
  const editLotSoNo = sp.get('edit')

  if (code === 'OQ' && editLotSoNo) {
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
  return <Page onLogout={logout} onBack={() => navigate(-1)} />
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
      onEdit={(lotSoNo) => navigate(`/process/OQ?edit=${encodeURIComponent(lotSoNo)}`)}
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

// ADMPage 래퍼 — onSelect → 적절한 URL로 navigate
function ADMRoute() {
  const navigate = useNavigate()
  const { user, logout } = useOutletContext()
  const handleSelect = (key) => {
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
  return <ADMPage onSelect={handleSelect} onLogout={logout} user={user} />
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

  // 탑레벨(공정/QR/홈/대시보드/마이)에만 네비 표시 — 2026-04-24 5탭 확장
  const isTopLevel =
    path === '/' ||
    path === '/trace' ||
    path === '/home' ||
    path.startsWith('/inventory') ||
    path === '/my'
  const showNav = isTopLevel

  // activeTab 매핑 — URL 기반 활성 탭 결정
  const activeTab =
    path === '/trace' ? NAV_TABS.TRACE :
    path === '/home' ? NAV_TABS.HOME :
    path.startsWith('/inventory') ? NAV_TABS.DASHBOARD :
    path === '/my' ? NAV_TABS.MY :
    NAV_TABS.PROCESS

  // dashboardView: 'process' | 'finished' | 'progress' — URL 우선, 아니면 localStorage 폴백
  // (구 inventoryView 에서 리네이밍 — 대시보드 탭 의미 맞추기)
  const getStoredView = () => {
    try { return localStorage.getItem('inventoryView') || 'process' } catch { return 'process' }
  }
  const dashboardView =
    path === '/inventory/finished' ? 'finished' :
    path === '/inventory/progress' ? 'progress' :
    path === '/inventory/process' ? 'process' :
    getStoredView()

  // URL이 /inventory/* 로 바뀔 때 localStorage 동기화 (재진입 시 마지막 뷰 복원용)
  useEffect(() => {
    if (['/inventory/process', '/inventory/finished', '/inventory/progress'].includes(path)) {
      const v = path.split('/').pop()
      try { localStorage.setItem('inventoryView', v) } catch { /* */ }
    }
  }, [path])

  // 탭 전환: URL로 이동 — 5탭 구조 (2026-04-24)
  const handleNavTab = (tab) => {
    if (tab === NAV_TABS.PROCESS) navigate('/')
    else if (tab === NAV_TABS.TRACE) navigate('/trace')
    else if (tab === NAV_TABS.HOME) navigate('/home')
    else if (tab === NAV_TABS.DASHBOARD) navigate(`/inventory/${dashboardView}`)
    else if (tab === NAV_TABS.MY) navigate('/my')
  }
  const handleDashboardViewChange = (v) => navigate(`/inventory/${v}`)

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
        />
      )}
      {/* pageKey에 search 포함 — /process/OQ ↔ /process/OQ?edit=... 전환 시에도 재애니메이션 */}
      <PageTransition pageKey={`${path}${location.search}`}>
        <div
          style={{
            visibility: showSplash ? 'hidden' : 'visible',
            marginLeft: isDesktop && showNav ? 64 : 0,
            // 하단 BottomNav가 보일 때 .page padding-bottom에 nav 높이만큼 공간 예약
            ...(!isDesktop && showNav ? { '--bottom-nav-height': '68px' } : {}),
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
  // hostname 으로 분기. lot.* 호스트에서 cert/* 경로 진입은 자동으로 / 로 리다이렉트.
  // 임시 미리보기 토글: ?cert-preview 쿼리스트링 — cert.* DNS 활성화 전 디자인 확인용.
  // ⚠️ cert.faraday-dynamics.com DNS 가 활성화되면 아래 cert-preview 분기 제거할 것.
  const isPublicCert = typeof window !== 'undefined' && (
    window.location.hostname.startsWith('cert.') ||
    new URLSearchParams(window.location.search).has('cert-preview')
  )
  if (isPublicCert) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<CertEmpty />} />
          {/* 2026-04-29 v3:
                /{mb_token}                  → MB 페이지 (UB 목록 + 모델 결합 버튼)
                /{mb_token}/{ub_lot}         → UB 페이지 (focus_ub)
                /{mb_token}/{ub_lot}/{fp}    → UB 페이지 + 그 ST 카드 자동 펼침 (FP QR 직접 진입) */}
          <Route path="/:token" element={<CertFlow />} />
          <Route path="/:token/:ub" element={<CertFlow />} />
          <Route path="/:token/:ub/:fp" element={<CertFlow />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
            <Route path="/admin/dashboard/quality" element={<AdmPageRoute Component={QualityDashboardPage} />} />
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
    </ErrorBoundary>
  )
}
