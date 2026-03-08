import { useState } from 'react'
import { login as loginApi } from '../api'

export function useAuth() {
  const [user, setUser] = useState(localStorage.getItem('user') || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async (id, password) => {
      setLoading(true)
      setError('')
      try {
        const data = await loginApi(id, password)
        const userData = data.user || id
        setUser(userData)
        localStorage.setItem('user', userData)  // ← 추가
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('user')  // ← 추가
  }

  return { user, loading, error, login, logout }
}
