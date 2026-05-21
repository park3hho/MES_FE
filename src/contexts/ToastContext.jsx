// ══════════════════════════════════════════════════════════════
// ToastContext — 전역 토스트 알림
// ══════════════════════════════════════════════════════════════
// 사용: const toast = useToast(); toast('저장되었습니다', 'success')
// 비-React 모듈(api/index.js 등): import { emitToast } from '...'; emitToast(msg, 'error')

import { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react'
import ToastContainer from '@/components/Toast'
import { TOAST_MSG_MS, TOAST_LONG_MS, TOAST_ERROR_MS } from '@/constants/etcConst'

const ToastCtx = createContext(null)

// 타입별 자동 해제 시간
const DURATION = {
  success: TOAST_MSG_MS,
  info: TOAST_MSG_MS,
  warn: TOAST_LONG_MS,
  error: TOAST_ERROR_MS,
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  // toast(message, type='info', duration?) — type: success|error|info|warn
  const show = useCallback((message, type = 'info', duration) => {
    if (!message) return
    const id = ++idRef.current
    setToasts((list) => [...list, { id, message: String(message), type }])
    const ms = duration ?? DURATION[type] ?? TOAST_MSG_MS
    setTimeout(() => dismiss(id), ms)
    return id
  }, [dismiss])

  // 비-React 코드(api/index.js handle401 등)에서 window 이벤트로 토스트 발행
  useEffect(() => {
    const handler = (e) => {
      const { message, type, duration } = e.detail || {}
      show(message, type, duration)
    }
    window.addEventListener('mes:toast', handler)
    return () => window.removeEventListener('mes:toast', handler)
  }, [show])

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast 는 ToastProvider 안에서만 사용할 수 있습니다.')
  return ctx
}

// 비-React 모듈용 — window 이벤트 디스패치 (ToastProvider 가 수신)
export function emitToast(message, type = 'info', duration) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('mes:toast', { detail: { message, type, duration } }))
}
