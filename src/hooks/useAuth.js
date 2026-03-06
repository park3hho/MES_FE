import { useState } from 'react'
import { login as loginApi } from '../api'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async (id, password) => {
    setLoading(true)
    setError('')
    try {
      const data = await loginApi(id, password)
      setUser(data.user) // 유저 정보만 저장
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
  }

  return { user, loading, error, login, logout }
}
