
import { FaradayLogo } from './FaradayLogo'

const isMobile = window.innerWidth <= 480
 
export function ConfirmModal({ lotNo, printCount, consumedQty, printing, done, error, onConfirm, onCancel, unit_type }) {
  return (
    <div style={confirmStyles.overlay}>
      <div style={confirmStyles.modal}>
        <div style={{ marginBottom: 24 }}>
          <FaradayLogo size="md" />
        </div>
        <div style={confirmStyles.lotDisplay}>
          <span style={confirmStyles.lotLabel}>LOT No</span>
          <span style={confirmStyles.lotValue}>{lotNo}</span>
 
          {consumedQty != null ? (
            // N:1 공정 - 소비량 → 생산량 표시
            <div style={confirmStyles.qtyRow}>
              <div style={confirmStyles.qtyBlock}>
                <span style={confirmStyles.lotLabel}>투입량</span>
                <span style={confirmStyles.qtyValue}>{consumedQty} {unit_type}</span>
              </div>
              <span style={confirmStyles.arrow}>→</span>
              <div style={confirmStyles.qtyBlock}>
                <span style={confirmStyles.lotLabel}>생산량</span>
                <span style={confirmStyles.qtyValue}>{printCount} {unit_type}</span>
              </div>
            </div>
          ) : (
            // 일반 공정 - 수량만 표시
            <span style={{ ...confirmStyles.lotLabel, marginTop: 8 }}>{printCount} {unit_type}</span>
          )}
        </div>
 
        {done ? (
          <div style={confirmStyles.doneMsg}>✓ 인쇄 완료</div>
        ) : error ? (
          <div style={confirmStyles.failMsg}>✕ 인쇄 실패</div>
        ) : (
          <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
            <button style={{ ...confirmStyles.secondaryBtn, flex: 1 }} onClick={onCancel} disabled={printing}>취소</button>
            <button style={{ ...confirmStyles.primaryBtn, flex: 1, opacity: printing ? 0.7 : 1 }} onClick={onConfirm} disabled={printing}>
              {printing ? '인쇄 중...' : '확인 및 출력'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
 
const confirmStyles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(10, 18, 40, 0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, backdropFilter: 'blur(3px)', padding: 16,
  },
  modal: {
    background: '#ffffff', borderRadius: 14,
    padding: '56px 60px', width: '100%', maxWidth: 700,
    boxShadow: '0 20px 60px rgba(26,47,110,0.22)',
  },
  lotDisplay: {
    background: '#f4f6fb', border: '1px solid #e0e4ef',
    borderRadius: 8, padding: '16px 20px', textAlign: 'center',
  },
  lotLabel: {
    display: 'block', fontSize: 11, color: '#8a93a8',
    fontWeight: 500, letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase',
  },
  lotValue: {
    display: 'block', fontSize: isMobile ? 18 : 36, fontWeight: 700, color: '#1a2540',
    letterSpacing: '0.08em',
  },
  qtyRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 16, marginTop: 12,
  },
  qtyBlock: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  qtyValue: {
    fontSize: 20, fontWeight: 700, color: '#1a2540',
  },
  arrow: {
    fontSize: 20, color: '#8a93a8', fontWeight: 700,
  },
  doneMsg: {
    textAlign: 'center', color: '#27ae60', fontWeight: 700, fontSize: 16,
    marginTop: 24, padding: '12px', background: '#eafaf1', borderRadius: 8,
  },
  failMsg: {
    textAlign: 'center', color: '#c0392b', fontWeight: 700, fontSize: 16,
    marginTop: 24, padding: '12px', background: '#fdf0ee', borderRadius: 8,
  },
  primaryBtn: {
    padding: '20px', background: '#1a2f6e', color: '#ffffff',
    border: 'none', borderRadius: 7, fontSize: 20, fontWeight: 600, cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '20px', background: '#ffffff', color: '#1a2f6e',
    border: '1.5px solid #1a2f6e', borderRadius: 7, fontSize: 20, fontWeight: 600, cursor: 'pointer',
  },
}