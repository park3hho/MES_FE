import { FaradayLogo } from './FaradayLogo'

const isMobile = window.innerWidth <= 480

export function CountModal({ lotNo, onSelect, onCancel, cancelLabel = '취소' }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={{ marginBottom: 20 }}>
          <FaradayLogo size="md" />
        </div>
        <div style={styles.lotDisplay}>
          <span style={styles.lotLabel}>LOT No</span>
          <span style={styles.lotValue}>{lotNo}</span>
        </div>
        <p style={styles.title}>매수 선택</p>
        <div style={styles.grid}>
          {[1,2,3,4,5,6,7,8].map(n => (
            <button key={n} style={styles.countBtn} onClick={() => onSelect(n)}>
              {n}
            </button>
          ))}
        </div>
        <button style={styles.cancelBtn} onClick={onCancel}>{cancelLabel}</button>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(10, 18, 40, 0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, backdropFilter: 'blur(3px)', padding: 16,
  },
  modal: {
    background: '#ffffff', borderRadius: 14,
    padding: isMobile ? '32px 24px' : '56px 60px',  // ← 변경: 모바일 모달 패딩 축소
    boxShadow: '0 20px 60px rgba(26,47,110,0.22)',
  },
  lotDisplay: {
    background: '#f4f6fb', border: '1px solid #e0e4ef',
    borderRadius: 8, padding: '12px 20px', textAlign: 'center', marginBottom: 20,
  },
  lotLabel: {
    display: 'block', fontSize: 11, color: '#8a93a8',
    fontWeight: 500, letterSpacing: '0.1em', marginBottom: 4, textTransform: 'uppercase',
  },
  lotValue: {
    display: 'block', fontSize: isMobile ? 15 : 18, fontWeight: 700, color: '#1a2540',
  },
  title: {
    textAlign: 'center', fontSize: 14, color: '#6b7585', marginBottom: 16,
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: isMobile ? 6 : 10, marginBottom: 16,
  },
  countBtn: {
    padding: isMobile ? '16px' : '28px',
    background: '#1a2f6e', color: '#fff',
    border: 'none', borderRadius: 8,
    fontSize: isMobile ? 20 : 28,
    fontWeight: 700, cursor: 'pointer',
  },
  cancelBtn: {
    width: '100%', padding: '11px', background: '#fff',
    color: '#1a2f6e', border: '1.5px solid #1a2f6e',
    borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
}