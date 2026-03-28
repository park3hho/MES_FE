import { useState } from 'react'
import { login as loginApi, logout as logoutApi } from '../api'

export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user')) || null
    } catch {
      localStorage.removeItem('user')
      return null
    }
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async (id, password) => {
    setLoading(true)
    setError('')
    try {
      const data = await loginApi(id, password)
      const userData = { id: data.user || id, machine_type: data.machine_type, process_type: data.process_type }
      setUser(userData)
      localStorage.setItem('user', JSON.stringify(userData))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await logoutApi()
    setUser(null)
    localStorage.removeItem('user')
  }

  return { user, loading, error, login, logout }
}
