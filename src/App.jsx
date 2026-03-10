import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { PrintPage } from './pages/PrintPage'
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

  const PAGE_MAP = {
    RM:  <RMPage  onLogout={logout} />,
    MP:  <MPPage  onLogout={logout} />,
    EA:  <EAPage  onLogout={logout} />,
    HT:  <HTPage  onLogout={logout} />,
    BO:  <BOPage  onLogout={logout} />,
    EC:  <ECPage  onLogout={logout} />,
    IQ:  <IQPage  onLogout={logout} />,
    WI:  <WIPage  onLogout={logout} />,
    SO:  <SOPage  onLogout={logout} />,
    OQ:  <OQPage  onLogout={logout} />,
    BOX: <BOXPage onLogout={logout} />,
    ADM: <PrintPage onLogout={logout} />,
  }

  return user
    ? PAGE_MAP[user.process_type] ?? <PrintPage onLogout={logout} />
    : <LoginPage onLogin={login} loading={loading} error={error} />
}