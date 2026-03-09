export function SelectionConfirmModal({ steps, selections, onConfirm, onCancel }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.title}>최종 확인</h2>
        <ul style={styles.list}>
          {steps.map((s) => (
            <li key={s.key} style={styles.item}>
              <span style={styles.label}>{s.label}</span>
              <span style={styles.value}>{selections[s.key] || '-'}</span>
            </li>
          ))}
        </ul>
        <div style={styles.btnRow}>
          <button
            style={styles.cancelBtn}
            onClick={onCancel}
            onMouseEnter={e => e.currentTarget.style.background = '#f4f6fb'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            수정
          </button>
          <button
            style={styles.confirmBtn}
            onClick={onConfirm}
            onMouseEnter={e => e.currentTarget.style.background = '#2a3f8e'}
            onMouseLeave={e => e.currentTarget.style.background = '#1a2f6e'}
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
  list: {
    listStyle: 'none', padding: 0, margin: '0 0 28px 0',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  item: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px', background: '#f4f6fb',
    borderRadius: 8, border: '1px solid #e0e4ef',
  },
  label: {
    fontSize: 12, color: '#8a93a8', fontWeight: 500, letterSpacing: '0.05em',
  },
  value: {
    fontSize: 14, fontWeight: 700, color: '#1a2540',
  },
  btnRow: {
    display: 'flex', gap: 10,
  },
  cancelBtn: {
    flex: 1, padding: '14px', background: '#fff', color: '#1a2f6e',
    border: '1.5px solid #1a2f6e', borderRadius: 8, fontSize: 14,
    fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s',
  },
  confirmBtn: {
    flex: 1, padding: '14px', background: '#1a2f6e', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 14,
    fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s',
  },
}
