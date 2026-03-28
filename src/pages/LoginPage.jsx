import { useState } from 'react'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './LoginPage.module.css'

export function LoginPage({ onLogin, loading, error }) {
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')

  const handleSubmit = () => onLogin(id, pw)

  return (
    <div className="page">
      <div className={s.loginCard}>
        <div className={s.logoWrap}>
          <FaradayLogo size="lg" />
        </div>

        <p className={s.sectionLabel}>로그인</p>

        <div className="form-group">
          <label className="form-label">아이디</label>
          <input
            className="form-input"
            type="text"
            value={id}
            onChange={e => setId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">비밀번호</label>
          <input
            className="form-input"
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button
          className={`btn-primary btn-full ${s.submitBtn}`}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </div>
    </div>
  )
}
