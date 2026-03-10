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

  const PAGE_MAP = {
    RM:    <RMPage    onLogout={handleLogout} />,
    MP:    <MPPage    onLogout={handleLogout} />,
    EA:    <EAPage    onLogout={handleLogout} />,
    HT:    <HTPage    onLogout={handleLogout} />,
    BO:    <BOPage    onLogout={handleLogout} />,
    EC:    <ECPage    onLogout={handleLogout} />,
    IQ:    <IQPage    onLogout={handleLogout} />,
    WI:    <WIPage    onLogout={handleLogout} />,
    SO:    <SOPage    onLogout={handleLogout} />,
    OQ:    <OQPage    onLogout={handleLogout} />,
    BOX:   <BOXPage   onLogout={handleLogout} />,
    PRINT: <PrintPage onLogout={handleLogout} />,
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
    return PAGE_MAP[selectedProcess] ?? <PrintPage onLogout={handleLogout} />
  }

  // 일반 계정: 해당 공정 페이지 바로 이동
  return PAGE_MAP[user.process_type] ?? <PrintPage onLogout={handleLogout} />
}
