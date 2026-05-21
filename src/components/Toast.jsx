// ══════════════════════════════════════════════════════════════
// Toast — 전역 알림 스택 (상단 중앙)
// ══════════════════════════════════════════════════════════════
// ToastProvider(contexts/ToastContext.jsx) 가 상태를 관리하고
// 이 컴포넌트가 portal 로 document.body 에 렌더링.

import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import s from './Toast.module.css'

const ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warn: '!',
}

export default function ToastContainer({ toasts, onDismiss }) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className={s.stack} role="region" aria-label="알림" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`${s.toast} ${s[t.type] || s.info}`}
            role={t.type === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onDismiss(t.id)}
          >
            <span className={s.icon} aria-hidden="true">{ICONS[t.type] || ICONS.info}</span>
            <span className={s.msg}>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
