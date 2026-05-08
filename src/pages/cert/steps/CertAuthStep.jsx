// pages/cert/steps/CertAuthStep.jsx
// PW 입력 화면 (CertFlow 분할, 2026-05-08).

import { useState } from 'react'
import { motion } from 'framer-motion'
import { certAuth } from '@/api'
import { PW_CACHE_KEY } from '../lib/constants'
import s from '../CertFlow.module.css'

export default function CertAuthStep({ token, ub, onAuth }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!pw.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      const sess = await certAuth(token, ub, pw)
      // 다음 박스 진입 시 자동 인증되도록 PW 캐시 (localStorage — 탭 닫고 재방문해도 유지)
      try {
        localStorage.setItem(PW_CACHE_KEY, pw)
      } catch {
        /* */
      }
      onAuth(sess)
    } catch (e) {
      setError(e.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      className={s.auth}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.3 } }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <img src="/FaradayDynamicsLogo.png" alt="" className={s.authLogo} />
      <h1 className={s.authTitle}>Certificate of Quality</h1>
      <p className={s.authSub}>Enter the password included with your shipment.</p>
      <input
        className={s.authInput}
        type="password"
        inputMode="text"
        placeholder="••••••"
        value={pw}
        onChange={(e) => {
          setPw(e.target.value)
          setError('')
        }}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        autoFocus
        maxLength={16}
        autoComplete="off"
      />
      {error && <p className={s.authError}>{error}</p>}
      <button className={s.authBtn} onClick={handleSubmit} disabled={!pw.trim() || loading}>
        {loading ? 'Verifying...' : 'Verify'}
      </button>
      <p className={s.footer}>cert.faraday-dynamics.com</p>
    </motion.div>
  )
}
