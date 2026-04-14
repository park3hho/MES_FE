import { useState, useEffect, useRef } from 'react'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useAuth } from '@/hooks/useAuth'
import { LoginPage } from '@/pages/LoginPage'
import { PrintPage } from '@/pages/manage/PrintPage'
import ADMPage from '@/pages/ADMPage'
import RMPage from '@/pages/produce/RMPage'
import MPPage from '@/pages/produce/MPPage'
import EAPage from '@/pages/produce/EAPage'
import HTPage from '@/pages/produce/HTPage'
import BOPage from '@/pages/produce/BOPage'
import ECPage from '@/pages/produce/ECPage'
import WIPage from '@/pages/produce/WIPage'
import SOPage from '@/pages/produce/SOPage'
import IQPage from '@/pages/shipping/IQPage'
import OQPage from '@/pages/shipping/OQPage'
import OQInspectionEditor from '@/components/OQInspectionEditor'
import UBPage from '@/pages/shipping/UBPage'
import MBPage from '@/pages/shipping/MBPage'
import OBPage from '@/pages/shipping/OBPage'
import InventoryPage from '@/pages/manage/InventoryPage'
import LotManagePage from '@/pages/manage/LotManagePage'
import CertPage from '@/pages/CertPage'
import TracePage from '@/pages/manage/TracePage'
import ExportPage from '@/pages/manage/ExportPage'
import SeedChainPage from '@/pages/manage/SeedChainPage'
import InspectionListPage from '@/pages/manage/InspectionListPage'
import FinishedProductPage from '@/pages/manage/FinishedProductPage'
import LinesChartPage from '@/pages/manage/LinesChartPage'
import PageTransition from '@/components/PageTransition'
import SplashScreen from '@/components/SplashScreen'

export default function App() {
  // 공개 페이지 — 인증 없이 바로 표시
  if (window.location.pathname.startsWith('/cert/')) {
    return <ErrorBoundary><CertPage /></ErrorBoundary>
  }

  const { user, loading, error, login, logout } = useAuth()
  const [selectedProcess, setSelectedProcess] = useState(null)
  const [editLotSoNo, setEditLotSoNo] = useState(null) // InspectionList → OQ 수정
  const [showSplash, setShowSplash] = useState(false)
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
    logout()
  }

  const handleBack = () => setSelectedProcess(null)

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
            onBack={() => { setEditLotSoNo(null); setSelectedProcess('INSPECT_LIST') }}
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
      SEED_CHAIN: <SeedChainPage onLogout={handleLogout} onBack={back} />,
      INSPECT_LIST: <InspectionListPage onLogout={handleLogout} onBack={back}
        onEdit={(lotSoNo) => { setEditLotSoNo(lotSoNo); setSelectedProcess('OQ') }} />,
      FINISHED: <FinishedProductPage onLogout={handleLogout} onBack={back} />,
      LINES_CHART: <LinesChartPage onLogout={handleLogout} onBack={back} />,
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
    const page = !selectedProcess ? (
      <ADMPage onSelect={setSelectedProcess} onLogout={handleLogout} loginId={user?.login_id} />
    ) : (
      (getPageMap(true)[selectedProcess] ?? (
        <PrintPage onLogout={handleLogout} onBack={handleBack} />
      ))
    )

    return (
      <ErrorBoundary>
        <SplashScreen visible={showSplash} onDone={() => setShowSplash(false)} userName={user.id} />
        <PageTransition pageKey={pageKey}>
          <div style={{ visibility: showSplash ? 'hidden' : 'visible' }}>{page}</div>
        </PageTransition>
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
