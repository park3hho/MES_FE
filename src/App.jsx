import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { PrintPage } from './pages/PrintPage'
import ADMPage from './pages/ADMPage'
import RMPage from './pages/RMPage'
import MPPage from './pages/MPPage'
import EAPage from './pages/EAPage'
import HTPage from './pages/HTPage'
import BOPage from './pages/BOPage'
import ECPage from './pages/ECPage'
import IQPage from './pages/IQPage'
import WIPage from './pages/WIPage'
import SOPage from './pages/SOPage'
import OQPage from './pages/OQPage'
import BOXPage from './pages/BOXPage'

export default function App() {
  const { user, loading, error, login, logout } = useAuth()
  const [selectedProcess, setSelectedProcess] = useState(null)

  const handleLogout = () => {
    setSelectedProcess(null)
    logout()
  }

  const handleBack = () => setSelectedProcess(null)

  const getPageMap = (isADM = false) => {
    const back = isADM ? handleBack : undefined
    return {
      RM:    <RMPage    onLogout={handleLogout} onBack={back} />,
      MP:    <MPPage    onLogout={handleLogout} onBack={back} />,
      EA:    <EAPage    onLogout={handleLogout} onBack={back} />,
      HT:    <HTPage    onLogout={handleLogout} onBack={back} />,
      BO:    <BOPage    onLogout={handleLogout} onBack={back} />,
      EC:    <ECPage    onLogout={handleLogout} onBack={back} />,
      IQ:    <IQPage    onLogout={handleLogout} onBack={back} />,
      WI:    <WIPage    onLogout={handleLogout} onBack={back} />,
      SO:    <SOPage    onLogout={handleLogout} onBack={back} />,
      OQ:    <OQPage    onLogout={handleLogout} onBack={back} />,
      BOX:   <BOXPage   onLogout={handleLogout} onBack={back} />,
      PRINT: <PrintPage onLogout={handleLogout} onBack={back} />,
    }
  }

  if (!user) {
    return <LoginPage onLogin={login} loading={loading} error={error} />
  }

  // ADM 계정: 공정 미선택이면 목록, 선택됐으면 해당 페이지
  if (user.process_type === 'ADM') {
    if (!selectedProcess) {
      return (
        <ADMPage
          onSelect={setSelectedProcess}
          onLogout={handleLogout}
        />
      )
    }
    return getPageMap(true)[selectedProcess] ?? <PrintPage onLogout={handleLogout} onBack={handleBack} />
  }

  // 일반 계정: 해당 공정 페이지 바로 이동
  return getPageMap(false)[user.process_type] ?? <PrintPage onLogout={handleLogout} />
}
