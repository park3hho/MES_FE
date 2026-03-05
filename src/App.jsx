import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { PrintPage } from './pages/PrintPage'

export default function App() {
  const { user, token, loading, error, login, logout } = useAuth()

  return user
    ? <PrintPage user={user} token={token} onLogout={logout} />
    : <LoginPage onLogin={login} loading={loading} error={error} />
}
