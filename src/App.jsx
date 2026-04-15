import { useState, useEffect, useRef } from 'react'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useAuth } from '@/hooks/useAuth'
import { LoginPage } from '@/pages/LoginPage'
import CertPage from '@/pages/CertPage'
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
import FinishedProductPage from '@/pages/adm/manage/FinishedProductPage'
import LinesChartPage from '@/pages/adm/manage/LinesChartPage'
// ── inventory 탭 ──
import InventoryPage from '@/pages/inventory/InventoryPage'
// ── mypage 탭 ──
import MyPage from '@/pages/mypage/MyPage'
// ── 공용 컴포넌트 ──
import OQInspectionEditor from '@/components/OQInspectionEditor'
import BottomNav, { NAV_TABS, BottomNavSpacer } from '@/components/BottomNav'
import SideNav from '@/components/SideNav'
import PageTransition from '@/components/PageTransition'
import SplashScreen from '@/components/SplashScreen'
import { useIsDesktop } from '@/hooks/useBreakpoint'

export default function App() {
  // 공개 페이지 — 인증 없이 바로 표시
  if (window.location.pathname.startsWith('/cert/')) {
    return <ErrorBoundary><CertPage /></ErrorBoundary>
  }

  const { user, loading, error, login, logout } = useAuth()
  const [selectedProcess, setSelectedProcess] = useState(null)
  const [editLotSoNo, setEditLotSoNo] = useState(null) // InspectionList → OQ 수정
  const [activeTab, setActiveTab] = useState(NAV_TABS.HOME) // 하단 네비 활성 탭
  const [showSplash, setShowSplash] = useState(false)
  const isDesktop = useIsDesktop() // PC 레이아웃 — SideNav 표시 여부
  const prevUser = useRef(null)

  // null → user 로 바뀌는 순간 = 로그인 성공 → 스플래시 트리거
  useEffect(() => {
    if (!prevUser.current && user) {
      setShowSplash(true)
    }
    prevUser.current = user
  }, [user])

  const handleLogout = () => {
    setSelectedProcess(null)
    setActiveTab(NAV_TABS.HOME)
    logout()
  }

  const handleBack = () => setSelectedProcess(null)

  // 하단 네비 탭 전환 — 드릴다운 상태는 리셋
  const handleNavTab = (tab) => {
    setActiveTab(tab)
    setSelectedProcess(null)
    setEditLotSoNo(null)
  }

  // ADMPage onSelect 훅 — INVENTORY만 네비 탭으로 가로채기
  const handleADMSelect = (key) => {
    if (key === 'INVENTORY') {
      setActiveTab(NAV_TABS.INVENTORY)
      setSelectedProcess(null)
      return
    }
    setSelectedProcess(key)
  }

  const getPageMap = (isADM = false) => {
    const back = isADM ? handleBack : undefined
    return {
      RM: <RMPage onLogout={handleLogout} onBack={back} />,
      MP: <MPPage onLogout={handleLogout} onBack={back} />,
      EA: <EAPage onLogout={handleLogout} onBack={back} />,
      HT: <HTPage onLogout={handleLogout} onBack={back} />,
      BO: <BOPage onLogout={handleLogout} onBack={back} />,
      EC: <ECPage onLogout={handleLogout} onBack={back} />,
      WI: <WIPage onLogout={handleLogout} onBack={back} />,
      SO: <SOPage onLogout={handleLogout} onBack={back} />,

      IQ: <IQPage onLogout={handleLogout} onBack={back} />,
      OQ: editLotSoNo
        ? <OQInspectionEditor
            lotNo={editLotSoNo}
            onLogout={handleLogout}
            onBack={() => { setEditLotSoNo(null); setSelectedProcess('INSPECT LIST') }}
          />
        : <OQPage onLogout={handleLogout} onBack={back} />,
      UB: <UBPage onLogout={handleLogout} onBack={back} />,
      MB: <MBPage onLogout={handleLogout} onBack={back} />,
      OB: <OBPage onLogout={handleLogout} onBack={back} />,

      PRINT: <PrintPage onLogout={handleLogout} onBack={back} />,
      INVENTORY: <InventoryPage onLogout={handleLogout} onBack={back} />,
      TRACE: <TracePage onLogout={handleLogout} onBack={back} />,
      MANAGE: <LotManagePage onLogout={handleLogout} onBack={back} />,
      EXPORT: <ExportPage onLogout={handleLogout} onBack={back} />,
      'SEED CHAIN': <SeedChainPage onLogout={handleLogout} onBack={back} />,
      'INSPECT LIST': <InspectionListPage onLogout={handleLogout} onBack={back}
        onEdit={(lotSoNo) => { setEditLotSoNo(lotSoNo); setSelectedProcess('OQ') }} />,
      FINISHED: <FinishedProductPage onLogout={handleLogout} onBack={back} />,
      'LINES CHART': <LinesChartPage onLogout={handleLogout} onBack={back} />,
    }
  }

  const pageKey = user ? (selectedProcess ?? user.process_type ?? 'adm') : 'login'

  if (!user) {
    return (
      <PageTransition pageKey="login">
        <LoginPage onLogin={login} loading={loading} error={error} />
      </PageTransition>
    )
  }

  if (user.process_type === 'ADM') {
    // 탭별 페이지 결정
    let page
    if (activeTab === NAV_TABS.INVENTORY) {
      page = <InventoryPage onLogout={handleLogout} />
    } else if (activeTab === NAV_TABS.MY) {
      page = <MyPage user={user} onLogout={handleLogout} />
    } else {
      // HOME 탭 — 드릴다운 or ADMPage
      page = !selectedProcess ? (
        <ADMPage onSelect={handleADMSelect} onLogout={handleLogout} loginId={user?.login_id} />
      ) : (
        (getPageMap(true)[selectedProcess] ?? (
          <PrintPage onLogout={handleLogout} onBack={handleBack} />
        ))
      )
    }

    // 네비 바: HOME 탭에서 드릴다운 중일 땐 숨김 — 탑레벨(HOME/INVENTORY/MY)일 때만 표시
    const isDrilledIn = activeTab === NAV_TABS.HOME && !!selectedProcess
    const showNav = !isDrilledIn

    // 데스크탑: 좌측 SideNav, 모바일/태블릿: 하단 BottomNav
    return (
      <ErrorBoundary>
        <SplashScreen visible={showSplash} onDone={() => setShowSplash(false)} userName={user.id} />
        {isDesktop && showNav && (
          <SideNav active={activeTab} onSelect={handleNavTab} onLogout={handleLogout} />
        )}
        <PageTransition pageKey={`${activeTab}-${pageKey}`}>
          <div
            style={{
              visibility: showSplash ? 'hidden' : 'visible',
              marginLeft: isDesktop && showNav ? 64 : 0,
            }}
          >
            {page}
            {!isDesktop && showNav && <BottomNavSpacer />}
          </div>
        </PageTransition>
        {!isDesktop && showNav && <BottomNav active={activeTab} onSelect={handleNavTab} />}
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <SplashScreen visible={showSplash} onDone={() => setShowSplash(false)} userName={user.id} />
      <PageTransition pageKey={pageKey}>
        <div style={{ visibility: showSplash ? 'hidden' : 'visible' }}>
          {getPageMap(false)[user.process_type] ?? <PrintPage onLogout={handleLogout} />}
        </div>
      </PageTransition>
    </ErrorBoundary>
  )
}
