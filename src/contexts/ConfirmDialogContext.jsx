// ══════════════════════════════════════════════════════════════
// ConfirmDialogContext — promise 기반 확인 모달 (window.confirm 대체)
// ══════════════════════════════════════════════════════════════
// 사용:
//   const confirm = useConfirm()
//   if (await confirm({ title: '삭제', message: '...', danger: true })) { ... }
//   if (await confirm({ ..., requireText: p.part_no })) { ... }  // 식별자 재입력 필요

import { createContext, useContext, useCallback, useRef, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'

const ConfirmCtx = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)   // ConfirmDialog props 또는 null
  const resolverRef = useRef(null)

  // confirm(옵션객체) 또는 confirm('메시지') → Promise<boolean>
  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      // 직전 호출이 미해결 상태면 false 로 정리
      resolverRef.current?.(false)
      resolverRef.current = resolve
      setState(typeof opts === 'string' ? { message: opts } : (opts || {}))
    })
  }, [])

  const settle = useCallback((result) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setState(null)
    resolve?.(result)
  }, [])

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmDialog
          {...state}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm 은 ConfirmProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
