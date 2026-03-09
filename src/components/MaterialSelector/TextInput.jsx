export function TextInput({ value, onChange, onSubmit }) {
  return (
    <div style={styles.row}>
      <input
        type="text"
        placeholder="값을 입력하세요"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        style={styles.input}
      />
      <button
        onClick={onSubmit}
        style={styles.btn}
        onMouseEnter={e => e.currentTarget.style.background = '#2a3f8e'}
        onMouseLeave={e => e.currentTarget.style.background = '#1a2f6e'}
      >
        확인
      </button>
    </div>
  )
}

const styles = {
  row: {
    display: 'flex', gap: 8,
  },
  input: {
    flex: 1, border: '1px solid #e0e4ef', borderRadius: 8,
    padding: '10px 12px', fontSize: 13, outline: 'none',
  },
  btn: {
    padding: '10px 16px', background: '#1a2f6e', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'background 0.15s',
  },
}
