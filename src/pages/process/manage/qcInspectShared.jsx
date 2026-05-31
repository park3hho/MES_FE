// pages/process/manage/qcInspectShared.jsx
// IQ/IPQ 페이지 공통 유틸 — 진행형 섹션 래퍼, 자동 산출, 저장 로직 (2026-05-31)

import { motion, AnimatePresence } from 'framer-motion'
import { QC_JUDGMENT } from '@/constants/qcConst'

// 한 섹션 fade-in 래퍼. `show=true` 면 노출 + 부드럽게 등장.
export function Section({ show, children, title, hint }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            background: 'var(--color-white, #fff)',
            marginBottom: 12,
          }}
        >
          {title && (
            <div style={{
              fontSize: 12, fontWeight: 700,
              color: 'var(--color-text-sub, var(--color-gray))',
              marginBottom: 10,
              display: 'flex', gap: 6, alignItems: 'baseline',
            }}>
              <span>{title}</span>
              {hint && <span style={{ fontWeight: 400, fontSize: 10.5, color: 'var(--color-text-muted)' }}>· {hint}</span>}
            </div>
          )}
          {children}
        </motion.section>
      )}
    </AnimatePresence>
  )
}

// 한 줄 라벨+컨트롤. 라벨 위/아래 단순.
export function Field({ label, required, hint, children, wide }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      flex: wide ? '1 1 100%' : '1 1 180px',
      minWidth: 0,
    }}>
      <span style={{
        fontSize: 11.5, fontWeight: 600,
        color: 'var(--color-text-sub, var(--color-gray))',
        display: 'flex', gap: 4, alignItems: 'baseline',
      }}>
        {label}
        {required && <span style={{ color: '#c0392b' }}>*</span>}
        {hint && <span style={{ fontWeight: 400, fontSize: 10.5, color: 'var(--color-text-muted)' }}>({hint})</span>}
      </span>
      {children}
    </label>
  )
}

// 한 섹션 안에서 flex row 로 묶어주는 컨테이너
export function Row({ children }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{children}</div>
}

// 합/부 배지 (display only)
export function JudgmentBadge({ value }) {
  const ng = value === QC_JUDGMENT.NG
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 32, padding: '4px 14px', borderRadius: 6, fontWeight: 700,
      fontSize: 13, letterSpacing: '0.04em',
      background: ng ? '#fee2e2' : '#dcfce7',
      color: ng ? '#991b1b' : '#166534',
    }}>
      {value}
    </span>
  )
}

// ─────────────────────────────────────────
// 자동 산출 — BE/QcRecordPage 동일 로직
// ─────────────────────────────────────────
export function computeRate(insp, defect) {
  const i = parseFloat(insp), d = parseFloat(defect) || 0
  if (!i || i <= 0) return null
  return Math.round((d / i) * 10000) / 100
}
export function computeJudgment(defect) {
  return (parseFloat(defect) || 0) > 0 ? QC_JUDGMENT.NG : QC_JUDGMENT.OK
}

export const TODAY = () => new Date().toISOString().slice(0, 10)
