import { useState, useEffect } from 'react'
import { login as loginApi, logout as logoutApi, checkSession } from '../api'

export function useAuth() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 앱 로드 시 세션 유효성 검증 — localStorage와 BE 세션 동기화
  useEffect(() => {
    if (!user) return
    checkSession().then((data) => {
      if (!data) {
        // 세션 만료 → localStorage 정리 + 로그인 화면으로
        setUser(null)
        localStorage.removeItem('user')
      }
    }).catch(() => {
      setUser(null)
      localStorage.removeItem('user')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (id, password) => {
    setLoading(true)
    setError('')
    try {
      const data = await loginApi(id, password)
      const userData = { id: data.user || id, login_id: data.login_id || id, machine_type: data.machine_type, process_type: data.process_type }
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
