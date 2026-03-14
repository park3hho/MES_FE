import { useState } from 'react'
import { FaradayLogo } from './FaradayLogo'

const isMobile = window.innerWidth <= 480

export function CountModal({ lotNo, label = '수량 입력', onSelect, onCancel, cancelLabel = '취소', readOnly = false, defaultValue = null }) {
  const [value, setValue] = useState(defaultValue ? String(defaultValue) : '')

  const handleSubmit = () => {
    const num = parseInt(value)
    if (isNaN(num) || num < 0) return
    onSelect(num)
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={{ marginBottom: isMobile ? 16 : 24 }}>
          <FaradayLogo size="md" />
        </div>
        <div style={styles.lotDisplay}>
          <span style={styles.lotLabel}>LOT No</span>
          <span style={styles.lotValue}>{lotNo}</span>
        </div>

        <p style={styles.label}>{label}</p>
        <div style={styles.inputRow}>
          <input
            style={{ ...styles.input, background: readOnly ? '#f4f6fb' : '#fff' }}
            type="number"
            min={1}
            value={value}
            onChange={e => !readOnly && setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
            placeholder="수량 입력"
            readOnly={readOnly}
            autoFocus
          />
          <span style={styles.unit}>개</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: isMobile ? 16 : 28 }}>
          <button style={{ ...styles.secondaryBtn, flex: 1 }} onClick={onCancel}>{cancelLabel}</button>
          <button
            style={{ ...styles.primaryBtn, flex: 1, opacity: (value !== "" && parseInt(value) >= 0) ? 1 : 0.5 }}
            onClick={handleSubmit}
            disabled={value === "" || parseInt(value) < 0}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(10,18,40,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, backdropFilter: 'blur(3px)', padding: 16,
  },
  modal: {
    background: '#fff', borderRadius: 14,
    padding: isMobile ? '28px 24px' : '56px 60px',
    width: '100%', maxWidth: 700,
    boxShadow: '0 20px 60px rgba(26,47,110,0.22)',
  },
  lotDisplay: {
    background: '#f4f6fb', border: '1px solid #e0e4ef',
    borderRadius: 8, padding: isMobile ? '10px 14px' : '16px 20px',
    textAlign: 'center', marginBottom: isMobile ? 16 : 24,
  },
  lotLabel: {
    display: 'block', fontSize: 11, color: '#8a93a8',
    fontWeight: 500, letterSpacing: '0.1em', marginBottom: 4, textTransform: 'uppercase',
  },
  lotValue: {
    display: 'block',
    fontSize: isMobile ? 16 : 36,
    fontWeight: 700, color: '#1a2540', letterSpacing: '0.08em',
  },
  label: {
    fontSize: isMobile ? 12 : 13, fontWeight: 600, color: '#6b7585', marginBottom: 8,
  },
  inputRow: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  input: {
    flex: 1,
    padding: isMobile ? '10px 12px' : '14px 16px',
    border: '1.5px solid #d8dce8',
    borderRadius: 8,
    fontSize: isMobile ? 16 : 20,
    fontWeight: 600, color: '#1a2540',
    outline: 'none', textAlign: 'center',
  },
  unit: {
    fontSize: isMobile ? 13 : 16, fontWeight: 600, color: '#6b7585',
  },
  primaryBtn: {
    padding: isMobile ? '12px' : '20px',
    background: '#1a2f6e', color: '#fff',
    border: 'none', borderRadius: 7,
    fontSize: isMobile ? 14 : 20,
    fontWeight: 600, cursor: 'pointer',
  },
  secondaryBtn: {
    padding: isMobile ? '12px' : '20px',
    background: '#fff', color: '#1a2f6e',
    border: '1.5px solid #1a2f6e', borderRadius: 7,
    fontSize: isMobile ? 14 : 20,
    fontWeight: 600, cursor: 'pointer',
  },
}