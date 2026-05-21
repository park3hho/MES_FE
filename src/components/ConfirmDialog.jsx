// ══════════════════════════════════════════════════════════════
// ConfirmDialog — 접근성 확인 모달 (window.confirm 대체)
// ══════════════════════════════════════════════════════════════
// ConfirmProvider(contexts/ConfirmDialogContext.jsx) 가 promise 기반으로 호출.
// requireText 지정 시 해당 문자열을 입력해야 확인 버튼 활성화 (위험 작업 안전장치).

import { useState } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useModalA11y } from '@/hooks/useModalA11y'
import s from './ConfirmDialog.module.css'

export default function ConfirmDialog({
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  danger = false,
  requireText = null,   // 입력해야 확인 활성화 (영구 삭제 등 위험 작업)
  onConfirm,
  onCancel,
}) {
  const [typed, setTyped] = useState('')
  const ref = useModalA11y(true, onCancel)
  const locked = requireText != null && typed.trim() !== String(requireText).trim()

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className={s.overlay} onClick={onCancel}>
      <motion.div
        ref={ref}
        className={s.modal}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title ? 'confirm-dialog-title' : undefined}
        aria-describedby={message ? 'confirm-dialog-msg' : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
      >
        {title && <h2 id="confirm-dialog-title" className={s.title}>{title}</h2>}
        {message && <p id="confirm-dialog-msg" className={s.message}>{message}</p>}

        {requireText != null && (
          <div className={s.requireWrap}>
            <label className={s.requireLabel} htmlFor="confirm-require-input">
              계속하려면 <b>{requireText}</b> 을(를) 그대로 입력하세요
            </label>
            <input
              id="confirm-require-input"
              className={s.requireInput}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !locked) onConfirm()
              }}
              autoComplete="off"
              placeholder={String(requireText)}
            />
          </div>
        )}

        <div className={s.btnRow}>
          <button type="button" className={s.cancelBtn} onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className={danger ? s.dangerBtn : s.confirmBtn}
            onClick={onConfirm}
            disabled={locked}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}
