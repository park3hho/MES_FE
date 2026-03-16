export const isMobile = window.innerWidth <= 480

export function OptionButtons({ options, onSelect, etc, onEtcChange, onEtcSubmit, size = 'md' }) {
  const btnStyle = size === 'sm' ? styles.btnSm : styles.btn

  return (
    <>
      <div style={size === 'sm' ? styles.gridSm : styles.grid}>
        {options.map((opt) => {
          const label = typeof opt === 'object' ? opt.label : opt
          const value = typeof opt === 'object' ? opt.value : opt
          const num = parseInt(value)
          const isExternal = !isNaN(num) && num >= 61
          const isOutsource = !isNaN(num) && num >= 31 && num < 61
          const base = isExternal ? '#7c6fcd' : isOutsource ? '#c9732e' : '#1a2f6e'
          const hover = isExternal ? '#9688e0' : isOutsource ? '#e0854a' : '#2a3f8e'
          return (
            <button
              key={value}
              onClick={() => onSelect(value)}
              style={{ ...btnStyle, background: base }}
              onMouseEnter={e => e.currentTarget.style.background = hover}
              onMouseLeave={e => e.currentTarget.style.background = base}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div style={styles.etcRow}>
        <input
          type="text"
          placeholder="직접 입력 (ETC)"
          value={etc}
          onChange={(e) => onEtcChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onEtcSubmit()}
          style={styles.input}
        />
        <button
          onClick={onEtcSubmit}
          style={styles.etcBtn}
          onMouseEnter={e => e.currentTarget.style.background = '#555'}
          onMouseLeave={e => e.currentTarget.style.background = '#6b7585'}
        >
          확인
        </button>
      </div>
    </>
  )
}

const styles = {
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12,
  },
  gridSm: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12,
  },
  btn: {
    padding: isMobile ? '12px 4px' : '24px 4px', background: '#1a2f6e', color: '#fff',
    border: 'none', borderRadius: 10, fontSize: isMobile ? 11 : 18, fontWeight: 700,
    cursor: 'pointer', transition: 'background 0.15s',
  },
  btnSm: {
    padding: isMobile ? '8px 2px' : '14px 2px', background: '#1a2f6e', color: '#fff',
    border: 'none', borderRadius: 10, fontSize: isMobile ? 11 : 18, fontWeight: 700,
    cursor: 'pointer', transition: 'background 0.15s',
  },
  etcRow: {
    display: 'flex', gap: 8, marginTop: 4,
  },
  input: {
    flex: 1, border: '1px solid #e0e4ef', borderRadius: 8,
    padding: '10px 12px', fontSize: 13, outline: 'none',
  },
  etcBtn: {
    padding: '10px 16px', background: '#6b7585', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'background 0.15s',
  },
}