import { useState, useRef } from 'react'
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { PrintPage } from './pages/PrintPage'
import ADMPage from './pages/ADMPage'
import RMPage from './pages/process/RMPage'
import MPPage from './pages/process/MPPage'
import EAPage from './pages/process/EAPage'
import HTPage from './pages/process/HTPage'
import BOPage from './pages/process/BOPage'
import ECPage from './pages/process/ECPage'
import WIPage from './pages/process/WIPage'
import SOPage from './pages/process/SOPage'
import OQPage from './pages/process/OQPage'
import BXPage from './pages/process/BXPage'
import OBPage from './pages/process/OBPage'
import InventoryPage from './pages/InventoryPage'
import TracePage from './pages/TracePage'
import LotManagePage from './pages/LotManagePage'
import CertPage from './pages/CertPage'
import PageTransition from './components/PageTransition'

export default function App() {
  // 공개 페이지 — 인증 없이 바로 표시
  if (window.location.pathname.startsWith('/cert/')) {
    return <CertPage />
  }

  const { user, loading, error, login, logout } = useAuth()
  const [selectedProcess, setSelectedProcess] = useState(null)
  const [direction, setDirection] = useState('forward')

  const handleLogout = () => {
    setDirection('back')
    setSelectedProcess(null)
    logout()
  }

  const handleBack = () => {
    setDirection('back')
    setSelectedProcess(null)
  }

  const handleSelect = (key) => {
    setDirection('forward')
    setSelectedProcess(key)
  }

  const getPageMap = (isADM = false) => {
    const back = isADM ? handleBack : undefined
    return {
      RM:        <RMPage        onLogout={handleLogout} onBack={back} />,
      MP:        <MPPage        onLogout={handleLogout} onBack={back} />,
      EA:        <EAPage        onLogout={handleLogout} onBack={back} />,
      HT:        <HTPage        onLogout={handleLogout} onBack={back} />,
      BO:        <BOPage        onLogout={handleLogout} onBack={back} />,
      EC:        <ECPage        onLogout={handleLogout} onBack={back} />,
      WI:        <WIPage        onLogout={handleLogout} onBack={back} />,
      SO:        <SOPage        onLogout={handleLogout} onBack={back} />,
      OQ:        <OQPage        onLogout={handleLogout} onBack={back} />,
      BX:        <BXPage        onLogout={handleLogout} onBack={back} />,
      OB:        <OBPage        onLogout={handleLogout} onBack={back} />,
      PRINT:     <PrintPage     onLogout={handleLogout} onBack={back} />,
      INVENTORY: <InventoryPage onLogout={handleLogout} onBack={back} />,
      TRACE:     <TracePage     onLogout={handleLogout} onBack={back} />,
      MANAGE:    <LotManagePage onLogout={handleLogout} onBack={back} />,
    }
  }

  // 현재 페이지 키 — 트랜지션 트리거용
  const pageKey = user
    ? (selectedProcess ?? user.process_type ?? 'login')
    : 'login'

  if (!user) {
    return (
      <PageTransition pageKey="login" direction={direction}>
        <LoginPage onLogin={login} loading={loading} error={error} />
      </PageTransition>
    )
  }

  if (user.process_type === 'ADM') {
    const page = !selectedProcess
      ? <ADMPage onSelect={handleSelect} onLogout={handleLogout} />
      : (getPageMap(true)[selectedProcess] ?? <PrintPage onLogout={handleLogout} onBack={handleBack} />)

    return (
      <PageTransition pageKey={pageKey} direction={direction}>
        {page}
      </PageTransition>
    )
  }

  return (
    <PageTransition pageKey={pageKey} direction={direction}>
      {getPageMap(false)[user.process_type] ?? <PrintPage onLogout={handleLogout} />}
    </PageTransition>
  )
}