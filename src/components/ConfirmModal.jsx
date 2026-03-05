import { FaradayLogo } from './FaradayLogo'

export function ConfirmModal({ lotNo, printing, done, error, onConfirm, onCancel }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={{ marginBottom: 24 }}>
          <FaradayLogo size="md" />
        </div>

        <div style={styles.lotDisplay}>
          <span style={styles.lotLabel}>LOT No</span>
          <span style={styles.lotValue}>{lotNo}</span>
        </div>

        {done ? (
          <div style={styles.doneMsg}>✓ 인쇄 완료</div>
        ) : error ? (
          <div style={styles.failMsg}>✕ 인쇄 실패</div>
        ) : (
          <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
            <button
              style={{ ...styles.secondaryBtn, flex: 1 }}
              onClick={onCancel}
              disabled={printing}
            >
              취소
            </button>
            <button
              style={{ ...styles.primaryBtn, flex: 1, opacity: printing ? 0.7 : 1 }}
              onClick={onConfirm}
              disabled={printing}
            >
              {printing ? '인쇄 중...' : '확인 및 출력'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10, 18, 40, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    backdropFilter: 'blur(3px)',
    padding: 16,
    animation: 'fadeIn 0.15s ease',
  },
  modal: {
    background: '#ffffff',
    borderRadius: 14,
    padding: '36px 36px 32px',
    width: '100%',
    maxWidth: 340,
    boxShadow: '0 20px 60px rgba(26,47,110,0.22), 0 4px 12px rgba(0,0,0,0.1)',
    animation: 'slideUp 0.2s ease',
  },
  lotDisplay: {
    background: '#f4f6fb',
    border: '1px solid #e0e4ef',
    borderRadius: 8,
    padding: '16px 20px',
    marginTop: 8,
    textAlign: 'center',
  },
  lotLabel: {
    display: 'block',
    fontSize: 11,
    color: '#8a93a8',
    fontWeight: 500,
    letterSpacing: '0.1em',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  lotValue: {
    display: 'block',
    fontSize: 22,
    fontWeight: 700,
    color: '#1a2540',
    letterSpacing: '0.08em',
    fontFamily: "'Montserrat', sans-serif",
  },
  doneMsg: {
    textAlign: 'center',
    color: '#27ae60',
    fontWeight: 700,
    fontSize: 16,
    marginTop: 24,
    padding: '12px',
    background: '#eafaf1',
    borderRadius: 8,
    letterSpacing: '0.05em',
  },
  failMsg: {
    textAlign: 'center',
    color: '#c0392b',
    fontWeight: 700,
    fontSize: 16,
    marginTop: 24,
    padding: '12px',
    background: '#fdf0ee',
    borderRadius: 8,
    letterSpacing: '0.05em',
  },
  primaryBtn: {
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
  secondaryBtn: {
    padding: '12px',
    background: '#ffffff',
    color: '#1a2f6e',
    border: '1.5px solid #1a2f6e',
    borderRadius: 7,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Noto Sans KR', sans-serif",
    cursor: 'pointer',
    letterSpacing: '0.05em',
    transition: 'opacity 0.15s, transform 0.1s',
  },
}