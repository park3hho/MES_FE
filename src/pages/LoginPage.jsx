import { useState } from 'react'
import { FaradayLogo } from '../components/FaradayLogo'

export function LoginPage({ onLogin, loading, error }) {
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')

  const handleSubmit = () => onLogin(id, pw)

  return (
    <div style={styles.pageCenter}>
      <div style={styles.card}>
        <div style={{ marginBottom: 36 }}>
          <FaradayLogo size="lg" />
        </div>

        <p style={styles.sectionLabel}>로그인</p>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>아이디</label>
          <input
            style={styles.input}
            type="text"
            value={id}
            onChange={e => setId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>비밀번호</label>
          <input
            style={styles.input}
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        {error && <p style={styles.errorText}>{error}</p>}

        <button
          style={{ ...styles.primaryBtn, marginTop: 24, opacity: loading ? 0.7 : 1 }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </div>
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
  sectionLabel: {
    fontSize: 13,
    color: '#8a93a8',
    fontWeight: 500,
    marginBottom: 20,
    letterSpacing: '0.05em',
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
  errorText: {
    fontSize: 12,
    color: '#c0392b',
    marginTop: 8,
    textAlign: 'center',
  },
}
