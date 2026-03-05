import { useState } from 'react'
import { login as loginApi } from '../api'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async (id, password) => {
    setLoading(true)
    setError('')
    try {
      const data = await loginApi(id, password)
      setUser(data.user)
      setToken(data.access_token || 'mock-token')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
  }

  return { user, token, loading, error, login, logout }
}
