import { useState, useEffect } from 'react'
import { login as loginApi, logout as logoutApi, checkSession } from '../api'

export function useAuth() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 앱 로드 시 세션 유효성 검증 — localStorage와 BE 세션 동기화
  // role 이 DB에서 바뀌었을 수 있으니 BE 응답의 최신 role 반영 (2026-04-22)
  useEffect(() => {
    if (!user) return
    checkSession().then((data) => {
      if (!data) {
        setUser(null)
        localStorage.removeItem('user')
        return
      }
      if (data.role && data.role !== user.role) {
        const next = { ...user, role: data.role }
        setUser(next)
        localStorage.setItem('user', JSON.stringify(next))
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
      // Phase A (2026-04-22): process_type 폐기, role 기반 권한
      const userData = {
        id: data.user || id,
        login_id: data.login_id || id,
        role: data.role,
      }
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
