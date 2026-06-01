// ══════════════════════════════════════════════════════════════
// ConfirmDialogContext — promise 기반 확인/입력 모달 (window.confirm/prompt 대체)
// ══════════════════════════════════════════════════════════════
// 사용:
//   const confirm = useConfirm()
//   if (await confirm({ title: '삭제', message: '...', danger: true })) { ... }
//   if (await confirm({ ..., requireText: p.part_no })) { ... }  // 식별자 재입력 필요
//
//   const prompt = usePrompt()
//   const reason = await prompt({ title: '처분', message: '...', inputLabel: '사유 (선택)' })
//   if (reason === null) return    // 취소. 빈 문자열('')은 입력 없이 확인.

import { createContext, useContext, useCallback, useMemo, useRef, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'

const ConfirmCtx = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)   // ConfirmDialog props(+__prompt) 또는 null
  const resolverRef = useRef(null)

  // 직전 미해결 호출을 취소값으로 정리하고 새 다이얼로그를 띄움
  const open = useCallback((opts, cancelValue, extra) => {
    return new Promise((resolve) => {
      resolverRef.current?.(cancelValue)
      resolverRef.current = resolve
      setState({ ...(typeof opts === 'string' ? { message: opts } : (opts || {})), ...extra })
    })
  }, [])

  const confirm = useCallback((opts) => open(opts, false), [open])                    // → Promise<boolean>
  const prompt = useCallback((opts) => open(opts, null, { __prompt: true }), [open])  // → Promise<string|null>

  const settle = useCallback((result) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setState(null)
    resolve?.(result)
  }, [])

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt])
  const isPrompt = !!state?.__prompt

  return (
    <ConfirmCtx.Provider value={value}>
      {children}
      {state && (
        <ConfirmDialog
          {...state}
          withInput={isPrompt}
          onConfirm={(text) => settle(isPrompt ? (text ?? '') : true)}
          onCancel={() => settle(isPrompt ? null : false)}
        />
      )}
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm 은 ConfirmProvider 안에서만 사용할 수 있습니다.')
  return ctx.confirm
}

export function usePrompt() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('usePrompt 은 ConfirmProvider 안에서만 사용할 수 있습니다.')
  return ctx.prompt
}
