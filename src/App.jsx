import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { PrintPage } from './pages/PrintPage'
import RMPage from './pages/RMPage'

export default function App() {
  const { user, loading, error, login, logout } = useAuth()

  const PAGE_MAP = {
    ADM: <PrintPage onLogout={logout} />,
    RM: <RMPage onLogout={logout} />,
  }

  return user
    ? PAGE_MAP[user.process_type] ?? <PrintPage onLogout={logout} />
    : <LoginPage onLogin={login} loading={loading} error={error} />
}