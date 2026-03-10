import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { PrintPage } from './pages/PrintPage'
import RMPage from './pages/RMPage'

const PAGE_MAP = {
  ADM: <PrintPage />,
  RM: <RMPage />,
}

export default function App() {
  const { user, loading, error, login, logout } = useAuth()

  return user
    ? PAGE_MAP[user.process_type] ?? <PrintPage />
    : <LoginPage onLogin={login} loading={loading} error={error} />
}