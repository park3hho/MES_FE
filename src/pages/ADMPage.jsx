import { FaradayLogo } from '../components/FaradayLogo'

const PROCESS_LIST = [
  { key: 'RM',    label: '원자재',      desc: 'Raw Material' },
  { key: 'MP',    label: '자재준비',    desc: 'Material Prep' },
  { key: 'EA',    label: '낱장가공',    desc: 'Each Processing' },
  { key: 'HT',    label: '열처리',      desc: 'Heat Treatment' },
  { key: 'BO',    label: '본딩',        desc: 'Bonding' },
  { key: 'EC',    label: '전착도장',    desc: 'E-Coating' },
  { key: 'IQ',    label: '수입검사',    desc: 'Incoming QC' },
  { key: 'WI',    label: '권선',        desc: 'Winding' },
  { key: 'SO',    label: '중성점',      desc: 'Star Point' },
  { key: 'OQ',    label: '출하검사',    desc: 'Outgoing QC' },
  { key: 'BX',    label: '포장',        desc: 'Boxing' },
  { key: 'OB',    label: '출하',        desc: 'Shipping' },
  { key: 'PRINT', label: 'LOT 직접입력', desc: 'Admin Print' },
]

export default function ADMPage({ onSelect, onLogout }) {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <FaradayLogo size="md" />
          <button style={styles.logoutBtn} onClick={onLogout}>로그아웃</button>
        </div>
        <h2 style={styles.title}>공정 선택</h2>
        <div style={styles.grid}>
          {PROCESS_LIST.map((p) => (
            <button
              key={p.key}
              style={styles.processBtn}
              onClick={() => onSelect(p.key)}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f3fb'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <span style={styles.processKey}>{p.key}</span>
              <span style={styles.processLabel}>{p.label}</span>
              <span style={styles.processDesc}>{p.desc}</span>
            </button>
          ))}
        </div>

        {/* 재고 현황 버튼 */}
        <button
          style={styles.inventoryBtn}
          onClick={() => onSelect('INVENTORY')}
          onMouseEnter={e => e.currentTarget.style.background = '#1a2f6e'}
          onMouseLeave={e => e.currentTarget.style.background = '#1a3a8f'}
        >
          📦 실시간 재고 현황
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh', background: '#f4f6fb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '40px 16px',
  },
  card: {
    background: '#fff', borderRadius: 14, padding: '32px 36px',
    width: 640,
    boxShadow: '0 4px 24px rgba(26,47,110,0.09)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 32, position: 'relative',
  },
  logoutBtn: {
    fontSize: 13, color: '#8a93a8', background: 'none',
    border: '1px solid #e0e4ef', borderRadius: 8, right: 0,
    padding: '6px 14px', cursor: 'pointer', position: 'absolute'
  },
  title: {
    fontSize: 16, fontWeight: 700, color: '#1a2540',
    textAlign: 'center', marginBottom: 24,
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
  },
  processBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '16px 12px', background: '#fff',
    border: '1px solid #e0e4ef', borderRadius: 12,
    cursor: 'pointer', transition: 'background 0.15s',
    gap: 4,
  },
  processKey: {
    fontSize: 16, fontWeight: 800, color: '#1a2f6e',
  },
  processLabel: {
    fontSize: 13, fontWeight: 600, color: '#1a2540',
  },
  processDesc: {
    fontSize: 11, color: '#adb4c2',
  },
  inventoryBtn: {
    marginTop: 20, width: '100%', padding: '14px',
    background: '#1a3a8f', color: '#fff', border: 'none',
    borderRadius: 10, fontSize: 15, fontWeight: 700,
    cursor: 'pointer', transition: 'background 0.15s',
  },
}
