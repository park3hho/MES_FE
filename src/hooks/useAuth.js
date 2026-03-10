import { useState } from 'react'
import { login as loginApi, logout as logoutApi } from '../api'

export function useAuth() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null)
  // const [user, setUser] = useState({ process_type: 'MP' }) // 테스트용 하드코딩

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
    localStorage.removeItem('user')  // ← 추가
  }

  return { user, loading, error, login, logout }
}
