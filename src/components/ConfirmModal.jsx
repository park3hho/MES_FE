import { FaradayLogo } from './FaradayLogo'
import { isMobile } from '@/constants/styleConst'

// kg이면 소수점 3자리, 개수면 정수
const formatQty = (num, unit) => unit === 'kg'
  ? Math.round(num * 1000) / 1000
  : Math.floor(num)

export function ConfirmModal({ lotNo, printCount, totalWeight, items = [], consumedQty, printing, done, error, onConfirm, onCancel, producedUnit, consumedUnit, unit }) {
  return (
    <div style={confirmStyles.overlay}>
      <div style={confirmStyles.modal}>
        <div style={{ marginBottom: 24 }}>
          <FaradayLogo size="md" />
        </div>
        <div style={confirmStyles.lotDisplay}>
          <span style={confirmStyles.lotLabel}>LOT No</span>
          <span style={confirmStyles.lotValue}>{lotNo}</span>

          {totalWeight != null ? (
            // MP 모드 — 개체 리스트 표시
            <div style={{ marginTop: 12, textAlign: 'left' }}>
              {/* 헤더 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8a93a8', fontWeight: 600, marginBottom: 6, padding: '0 4px' }}>
                <span style={{ width: 24 }}>No</span>
                <span style={{ flex: 1, textAlign: 'center' }}>LOT</span>
                <span>무게</span>
              </div>
              {/* 개체 리스트 */}
              {items.map(item => (
                <div key={item.seq} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontWeight: 600, color: '#1a2540', padding: '5px 4px', borderBottom: '1px solid #f0f2f7' }}>
                  <span style={{ width: 24, color: '#8a93a8', fontSize: 11 }}>{item.seq}</span>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>
                    {lotNo.replace('-00', '')}-{String(item.seq).padStart(2, '0')}
                  </span>
                  <span>{item.weight} {producedUnit}</span>
                </div>
              ))}
              {/* 총합 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, padding: '6px 4px', borderTop: '1px solid #e0e4ef', fontSize: 13, fontWeight: 700, color: '#1a2f6e' }}>
                <span>총 {items.length}개</span>
                <span>{totalWeight} {producedUnit}</span>
              </div>
            </div>

          ) : consumedQty != null ? (
            // 일반 N:1 공정 — 투입량 → 생산량
            <div style={confirmStyles.qtyRow}>
              <div style={confirmStyles.qtyBlock}>
                <span style={confirmStyles.lotLabel}>투입량</span>
                <span style={confirmStyles.qtyValue}>
                  {formatQty(consumedQty, consumedUnit)} {consumedUnit}
                </span>
              </div>
              <span style={confirmStyles.arrow}>→</span>
              <div style={confirmStyles.qtyBlock}>
                <span style={confirmStyles.lotLabel}>생산량</span>
                <span style={confirmStyles.qtyValue}>
                  {formatQty(printCount, producedUnit)} {producedUnit}
                </span>
              </div>
            </div>

          ) : (
            // 단일 공정 — 수량만 표시
            <span style={{ ...confirmStyles.lotLabel, marginTop: 8 }}>
              {formatQty(printCount, unit)} {unit}
            </span>
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