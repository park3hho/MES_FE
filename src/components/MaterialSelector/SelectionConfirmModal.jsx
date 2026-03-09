import { FaradayLogo } from '../FaradayLogo'

export function SelectionConfirmModal({ selections, onConfirm, onCancel }) {
  const lotNo = Object.values(selections).join('-')
  
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
        <p style={styles.title}>최종 확인</p>
        <div style={styles.btnRow}>
          <button
            style={styles.cancelBtn}
            onClick={onCancel}
          >
            수정
          </button>
          <button
            style={styles.confirmBtn}
            onClick={onConfirm}
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
    background: 'rgba(10, 18, 40, 0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, backdropFilter: 'blur(3px)', padding: 16,
  },
  modal: {
    background: '#fff', borderRadius: 14,
    padding: '40px 48px', width: '100%', maxWidth: 400,
    boxShadow: '0 20px 60px rgba(26,47,110,0.22)',
  },
  title: {
    fontSize: 18, fontWeight: 700, color: '#1a2540', marginBottom: 24, textAlign: 'center',
  },
  cancelBtn: {
      flex: 1, padding: '11px', background: '#fff',  // flex: 1 추가
      color: '#1a2f6e', border: '1.5px solid #1a2f6e',
      borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
  btnRow: {
      display: 'flex', gap: 10,
    },
  confirmBtn: {
    flex: 1, padding: '14px', background: '#1a2f6e', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 14,
    fontWeight: 600, cursor: 'pointer',
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
    display: 'block', fontSize: 18, fontWeight: 700, color: '#1a2540',
  },

}
