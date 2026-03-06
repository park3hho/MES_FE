import { useState, useEffect } from 'react'
import { FaradayLogo } from '../components/FaradayLogo'
import { ConfirmModal } from '../components/ConfirmModal'
import { usePrint } from '../hooks/usePrint'

export function PrintPage({ user, onLogout }) {
  const [lotNo, setLotNo] = useState('')
  const [showModal, setShowModal] = useState(false)
  const { printing, done, error, print, reset } = usePrint()

  // 인쇄 완료 후 1.2초 뒤 자동으로 모달 닫기
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => {
      setShowModal(false)
      setLotNo('')
      reset()
    }, 1200)
    return () => clearTimeout(t)
  }, [done])

  const handlePrintClick = () => {
    if (!lotNo.trim()) return
    reset()
    setShowModal(true)
  }

  const handleConfirm = () => print(lotNo)

  const handleCancel = () => {
    if (printing) return
    setShowModal(false)
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
          style={{
            ...styles.primaryBtn,
            marginTop: 28,
            opacity: lotNo.trim() ? 1 : 0.45,
            cursor: lotNo.trim() ? 'pointer' : 'not-allowed',
          }}
          onClick={handlePrintClick}
          disabled={!lotNo.trim()}
        >
          LOT No 인쇄
        </button>
      </div>

      {showModal && (
        <ConfirmModal
          lotNo={lotNo}
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
    padding: '44px 40px',
    width: '100%',
    maxWidth: 380,
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
    transition: 'border-color 0.15s, box-shadow 0.15s',
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
    transition: 'opacity 0.15s, transform 0.1s',
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
    transition: 'border-color 0.15s, color 0.15s',
  },
}
