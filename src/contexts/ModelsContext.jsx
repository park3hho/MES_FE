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

  // (phi, motor) 만으로 검색 — rt_st_type 무관 (2026-05-06)
  //   resolveColor / 색 표시 같은 곳에서 rt_st_type 까지 일치할 필요 없을 때 사용.
  //   같은 (phi, motor) 행이 여러 rt_st_type 으로 등록되면 첫 발견된 행 반환.
  const lookupAny = useMemo(() => {
    const m = new Map()
    // 대표 변형 선택: ① 스펙(pole_pairs>0) 있는 모델 우선 → ② display_order.
    // ★ 같은 (phi,motor) 에 스펙 있는 ST 와 스펙 없는 RT 가 공존할 때, OQ 가 스펙 없는 변형을
    //   집어 K_T 계산이 막히던 버그 수정 (2026-06-18). BE get_any 도 같은 우선순위로 맞춰야 완전.
    const sorted = [...models]
      .filter((mod) => mod.is_active)
      .sort((a, b) => {
        const sa = a.pole_pairs > 0 ? 0 : 1
        const sb = b.pole_pairs > 0 ? 0 : 1
        return sa - sb || (a.display_order ?? 999) - (b.display_order ?? 999)
      })
    for (const mod of sorted) {
      const key = `${mod.phi}|${mod.motor_type}`
      if (!m.has(key)) m.set(key, mod)
    }
    return m
  }, [models])

  // findModel — 기존 processConst.findModel 인터페이스와 호환
  //   3번째 인자 미지정 시 (phi, motor) 만으로 매칭 — rt_st_type 무관 (2026-05-06 변경).
  //   이전엔 rt='none' default 라 RT/ST 등록된 모델을 못 찾아 색 안 들어오던 버그 수정.
  //   3번째 인자 명시 (예: 'rt' / 'st' / 'both' / 'none') 시 정확히 그 값으로 매칭.
  //   기존 bool(true)도 'both'로 호환 처리.
  const findModel = useCallback(
    (phi, motor_type, rt_st_type) => {
      if (phi == null) return null
      const p = String(phi)
      // 3번째 인자 미지정 → rt_st_type 무관 매칭
      if (rt_st_type === undefined || rt_st_type === null) {
        return lookupAny.get(`${p}|${motor_type}`) || null
      }
      let rt = rt_st_type
      if (rt === true) rt = 'both'
      else if (rt === false) rt = 'none'
      const key = `${p}|${motor_type}|${rt || 'none'}`
      return lookup.get(key) || null
    },
    [lookup, lookupAny],
  )

  const value = useMemo(
    () => ({ models, loading, error, reload, findModel }),
    [models, loading, error, reload, findModel],
  )

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>
}
