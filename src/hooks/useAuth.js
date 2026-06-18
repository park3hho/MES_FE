import { useState, useEffect } from 'react'
import { login as loginApi, logout as logoutApi, checkSession } from '../api'

// localStorage 의 user 를 안전하게 파싱 — 손상된 JSON 이면 앱 크래시 대신 null 로 폴백 (2026-05-21)
function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user')) || null
  } catch {
    localStorage.removeItem('user')
    return null
  }
}

export function useAuth() {
  const [user, setUser] = useState(readStoredUser())
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
      // role 또는 유효 권한(features) 변경 시 반영 — 개인 override 변경분도 앱 로드 시 동기화 (Phase 3)
      const nextFeatures = Array.isArray(data.features) ? data.features : (user.features ?? null)
      const roleChanged = data.role && data.role !== user.role
      const featuresChanged =
        JSON.stringify(nextFeatures) !== JSON.stringify(user.features ?? null)
      if (roleChanged || featuresChanged) {
        const next = { ...user, role: data.role || user.role, features: nextFeatures }
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
        features: Array.isArray(data.features) ? data.features : null,  // 유효 권한 (Phase 3)
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
