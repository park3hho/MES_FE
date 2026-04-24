// contexts/ModelsContext.jsx
// 제품 모델 레지스트리 전역 Context (2026-04-24)
//
// - 앱 mount 시 GET /models 1회 → 전역 배열 보관
// - localStorage stale-while-revalidate: 이전 캐시 즉시 노출 + 백그라운드 갱신
// - findModel(phi, motor_type, has_rt_st) O(1) 룩업 헬퍼 제공
// - reload() 는 관리 페이지 CRUD 후 수동 호출

import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { getModels } from '@/api'

const LS_KEY = 'mesModels'

export const ModelsContext = createContext({
  models: [],
  loading: true,
  error: null,
  reload: () => {},
  findModel: () => null,
})

function loadCache() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCache(models) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(models))
  } catch {
    /* quota 초과 등 무시 */
  }
}

export function ModelsProvider({ children }) {
  // 초기값은 localStorage 캐시 — 네트워크 지연 중에도 UI 즉시 렌더
  const [models, setModels] = useState(() => loadCache())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getModels(true)
      const next = res?.models || []
      setModels(next)
      saveCache(next)
    } catch (e) {
      console.error('[ModelsContext] 로드 실패:', e)
      setError(e.message || '모델 목록 로드 실패')
      // 실패 시 기존 캐시는 그대로 유지 (stale-while-revalidate)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // phi + motor + rt_st_type 으로 O(1) 조회용 Map (2026-04-24 PR-11)
  const lookup = useMemo(() => {
    const m = new Map()
    for (const mod of models) {
      const rt = mod.rt_st_type || 'none'
      const key = `${mod.phi}|${mod.motor_type}|${rt}`
      m.set(key, mod)
    }
    return m
  }, [models])

  // findModel — 기존 processConst.findModel 인터페이스와 호환
  // 3번째 인자: rt_st_type (기본 'none'). 기존 bool(true)도 'both'로 호환 처리
  const findModel = useCallback(
    (phi, motor_type, rt_st_type = 'none') => {
      if (phi == null) return null
      const p = String(phi)
      // bool → enum 하위호환 (기존 3번째 인자가 has_rt_st boolean 이었음)
      let rt = rt_st_type
      if (rt === true) rt = 'both'
      else if (rt === false) rt = 'none'
      const key = `${p}|${motor_type}|${rt || 'none'}`
      return lookup.get(key) || null
    },
    [lookup],
  )

  const value = useMemo(
    () => ({ models, loading, error, reload, findModel }),
    [models, loading, error, reload, findModel],
  )

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>
}
