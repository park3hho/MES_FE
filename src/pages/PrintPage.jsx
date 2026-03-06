import { useState, useEffect } from 'react'
import { FaradayLogo } from '../components/FaradayLogo'
import { CountModal } from '../components/CountModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { usePrint } from '../hooks/usePrint'

export function PrintPage({ user, onLogout }) {
  const [lotNo, setLotNo] = useState('')
  const [printCount, setPrintCount] = useState(null)
  const [step, setStep] = useState(null) // 'count' | 'confirm'
  const { printing, done, error, print, reset } = usePrint()

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => {
      setStep(null)
      setLotNo('')
      setPrintCount(null)
      reset()
    }, 1200)
    return () => clearTimeout(t)
  }, [done])

  const handlePrintClick = () => {
    if (!lotNo.trim()) return
    reset()
    setStep('count')
  }

  const handleCountSelect = (count) => {
    setPrintCount(count)
    setStep('confirm')
  }

  const handleConfirm = () => print(lotNo, printCount)

  const handleCancel = () => {
    if (printing) return
    setStep(null)
    setPrintCount(null)
    reset()
  }

  return (
    <div style={styles.pageCenter}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 }}>
          <FaradayLogo size="lg" />
          <button style={styles.logoutBtn} onClick={onLogout}>로그아웃</button>
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>LOT No 입력</label>
          <input
            style={{ ...styles.input, fontSize: 15, letterSpacing: '0.05em' }}
            type="text"
            value={lotNo}
            onChange={e => setLotNo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePrintClick()}
            placeholder="LOT No를 입력하세요"
            autoFocus
          />
        </div>
        <button
          style={{ ...styles.primaryBtn, marginTop: 28, opacity: lotNo.trim() ? 1 : 0.45, cursor: lotNo.trim() ? 'pointer' : 'not-allowed' }}
          onClick={handlePrintClick}
          disabled={!lotNo.trim()}
        >
          LOT No 인쇄
        </button>
      </div>

      {step === 'count' && (
        <CountModal lotNo={lotNo} onSelect={handleCountSelect} onCancel={handleCancel} />
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={lotNo}
          printCount={printCount}
          printing={printing}
          done={done}
          error={error}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}

const styles = {
  pageCenter: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    background: '#ffffff',
    borderRadius: 12,
    padding: '64px 60px',
    width: '100%',
    maxWidth: 700,
    boxShadow: '0 4px 24px rgba(26,47,110,0.10), 0 1px 4px rgba(0,0,0,0.06)',
  },
  fieldGroup: { marginBottom: 16 },
  label: {
    display: 'block',
    fontSize: 12,
    color: '#6b7585',
    fontWeight: 500,
    marginBottom: 6,
    letterSpacing: '0.03em',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d8dce8',
    borderRadius: 6,
    fontSize: 14,
    color: '#1a2540',
    background: '#fafbfd',
    fontFamily: "'Noto Sans KR', sans-serif",
  },
  primaryBtn: {
    width: '100%',
    padding: '12px',
    background: '#1a2f6e',
    color: '#ffffff',
    border: 'none',
    borderRadius: 7,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Noto Sans KR', sans-serif",
    cursor: 'pointer',
    letterSpacing: '0.05em',
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid #d8dce8',
    color: '#8a93a8',
    borderRadius: 5,
    padding: '5px 12px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: "'Noto Sans KR', sans-serif",
  },
}