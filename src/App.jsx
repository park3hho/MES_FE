import { useState } from 'react'
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
import IQPage from './pages/process/IQPage'
import WIPage from './pages/process/WIPage'
import SOPage from './pages/process/SOPage'
import OQPage from './pages/process/OQPage'
import BXPage from './pages/process/BXPage'
import OBPage from './pages/process/OBPage'
import InventoryPage from './pages/InventoryPage'
import TracePage from './pages/TracePage'
import LotManagePage from './pages/LotManagePage'

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
      RM:        <RMPage        onLogout={handleLogout} onBack={back} />,
      MP:        <MPPage        onLogout={handleLogout} onBack={back} />,
      EA:        <EAPage        onLogout={handleLogout} onBack={back} />,
      HT:        <HTPage        onLogout={handleLogout} onBack={back} />,
      BO:        <BOPage        onLogout={handleLogout} onBack={back} />,
      EC:        <ECPage        onLogout={handleLogout} onBack={back} />,
      IQ:        <IQPage        onLogout={handleLogout} onBack={back} />,
      WI:        <WIPage        onLogout={handleLogout} onBack={back} />,
      SO:        <SOPage        onLogout={handleLogout} onBack={back} />,
      OQ:        <OQPage        onLogout={handleLogout} onBack={back} />,
      BX:        <BXPage        onLogout={handleLogout} onBack={back} />,
      OB:        <OBPage        onLogout={handleLogout} onBack={back} />,
      PRINT:     <PrintPage     onLogout={handleLogout} onBack={back} />,
      INVENTORY: <InventoryPage onLogout={handleLogout} onBack={back} />,
      TRACE: <TracePage onLogout={handleLogout} onBack={back} />,
      MANAGE: <LotManagePage onLogout={handleLogout} onBack={back} />,
    }
  }

  if (!user) {
    return <LoginPage onLogin={login} loading={loading} error={error} />
  }

  if (user.process_type === 'ADM') {
    if (!selectedProcess) {
      return <ADMPage onSelect={setSelectedProcess} onLogout={handleLogout} />
    }
    return getPageMap(true)[selectedProcess] ?? <PrintPage onLogout={handleLogout} onBack={handleBack} />
  }

  return getPageMap(false)[user.process_type] ?? <PrintPage onLogout={handleLogout} />
}
