// src/hooks/usePrinterSelection.js
// 공정 페이지 PrinterBadge 전용 훅 (Phase 2, 2026-04-22)
//
// 제공:
//   - default / override / active (실제 사용될) 프린터
//   - 공장 내 활성 프린터 목록 (드롭다운용)
//   - setOverride(id|null), clearOverride()
//
// override 는 sessionStorage 에 저장 → 로그아웃/탭 종료 시 자동 리셋
// 같은 탭 안에서 여러 컴포넌트가 동시에 override 변경하는 시나리오가 생기면
// 여기 custom event 로 broadcast 하는 로직 추가 필요 (현재는 PrinterBadge 한 곳만 사용).

import { useState, useEffect, useCallback } from 'react'
import { listPrinters, getMyPrinter, PRINTER_OVERRIDE_KEY } from '@/api'

function readOverrideId() {
  try {
    const raw = sessionStorage.getItem(PRINTER_OVERRIDE_KEY)
    if (!raw) return null
    const id = Number(raw)
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

export function usePrinterSelection() {
  const [defaultPrinter, setDefaultPrinter] = useState(null)
  const [printers, setPrinters] = useState([])
  const [overrideId, setOverrideId] = useState(readOverrideId)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      getMyPrinter().catch(() => ({ printer: null })),
      listPrinters({ activeOnly: true }).catch(() => []),
    ]).then(([mine, list]) => {
      if (!alive) return
      setDefaultPrinter(mine?.printer ?? null)
      setPrinters(list)
    }).finally(() => {
      if (alive) setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const setOverride = useCallback((id) => {
    try {
      if (id == null) sessionStorage.removeItem(PRINTER_OVERRIDE_KEY)
      else sessionStorage.setItem(PRINTER_OVERRIDE_KEY, String(id))
    } catch { /* ignore */ }
    setOverrideId(id ?? null)
  }, [])

  const clearOverride = useCallback(() => setOverride(null), [setOverride])

  const overridePrinter = overrideId
    ? printers.find((p) => p.id === overrideId) ?? null
    : null

  // 실제 사용될 프린터: override > default
  const activePrinter = overridePrinter ?? defaultPrinter

  return {
    defaultPrinter,
    overridePrinter,
    activePrinter,
    printers,
    loading,
    isOverride: Boolean(overridePrinter),
    setOverride,
    clearOverride,
  }
}
