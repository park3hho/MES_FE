import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { PrintPage } from './pages/PrintPage'
import RMPage from './pages/RMPage'

export default function App() {
  const { user, loading, error, login, logout } = useAuth()

const PAGE_MAP = {
  RM:  <RMPage onLogout={logout} />,   // 1
  MP:  <MPPage onLogout={logout} />,   // 2
  EA:  <EAPage onLogout={logout} />,   // 3
  HT:  <HTPage onLogout={logout} />,   // 4
  BO:  <BOPage onLogout={logout} />,   // 5
  EC:  <ECPage onLogout={logout} />,   // 6
  IQ:  <IQPage onLogout={logout} />,   // 7
  WI:  <WIPage onLogout={logout} />,   // 8
  SO:  <SOPage onLogout={logout} />,   // 9
  OQ:  <OQPage onLogout={logout} />,   // 10
  BOX: <BOXPage onLogout={logout} />,  // 11
  ADM: <PrintPage onLogout={logout} />, // 12
}

  return user
    ? PAGE_MAP[user.process_type] ?? <PrintPage onLogout={logout} />
    : <LoginPage onLogin={login} loading={loading} error={error} />
}

