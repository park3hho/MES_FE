// pages/cert/SealsContext.jsx
// Cert 봉인지(SEALED) 영구 상태 — 회사 단위 DB 동기 (Phase D 확장, 2026-05-02)
//
// 기존: FE localStorage 'cert_seal:{...}' 키. 같은 브라우저에서만.
// 변경: 회사 토큰으로 BE 동기. 다른 디바이스/직원과 공유.
//
// 사용:
//   <SealsProvider>
//     <CertSheetStep ... />
//   </SealsProvider>
//
// 컴포넌트:
//   const { isOpen, openSeal } = useSeals()
//   isOpen('mb:MB-..:20_outer') → bool
//   openSeal('ub:UB-..')         → optimistic 즉시 표시 + BE POST background

import {
  createContext, useContext, useEffect, useState, useCallback, useMemo,
} from 'react'
import { certListSeals, certOpenSeal } from '@/api'
import { getCompanySession } from './CertCompanyFlow'

const SealsContext = createContext(null)

export function SealsProvider({ children }) {
  const [openedKeys, setOpenedKeys] = useState(() => new Set())
  const [loaded, setLoaded] = useState(false)
  const sess = getCompanySession()
  const companyToken = sess?.company_token || ''

  // 회사 토큰 있을 때 BE 에서 일괄 fetch (sheet 페이지 마운트 시 1회)
  useEffect(() => {
    if (!companyToken) {
      setLoaded(true)
      return
    }
    let cancelled = false
    certListSeals(companyToken)
      .then((data) => {
        if (cancelled) return
        setOpenedKeys(new Set(data.keys || []))
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        // 401 / 네트워크 에러 — 빈 set 유지 (모든 박스 SEALED 표시)
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [companyToken])

  const isOpen = useCallback((key) => openedKeys.has(key), [openedKeys])

  // optimistic — 즉시 Set 추가 (UI 반영) + BE POST background.
  // 실패 시 silent: 다음 마운트의 list fetch 가 동기화함.
  const openSeal = useCallback((key) => {
    setOpenedKeys((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
    if (!companyToken) return
    certOpenSeal(companyToken, key).catch(() => { /* silent */ })
  }, [companyToken])

  const value = useMemo(
    () => ({ isOpen, openSeal, loaded }),
    [isOpen, openSeal, loaded],
  )

  return <SealsContext.Provider value={value}>{children}</SealsContext.Provider>
}

// Provider 외부에서 호출돼도 안전하게 — fallback noop.
export function useSeals() {
  const ctx = useContext(SealsContext)
  if (!ctx) return { isOpen: () => false, openSeal: () => {}, loaded: false }
  return ctx
}
