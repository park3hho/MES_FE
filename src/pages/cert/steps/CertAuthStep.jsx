// pages/cert/steps/CertAuthStep.jsx
// 자동 인증 화면 (2026-06-12 v6: PW 게이트 폐기 — pw 입력 제거).
//
// 접근 통제는 이미 회사 로그인(Phase D)이 수행하므로 박스 PW 를 따로 받지 않는다.
// mount 시 pw 없이 certAuth 를 1회 호출 → session_token 발급 → onAuth 로 sheet 진입.
//   - token 이 UB- 면 BE 가 ub→mb 역추적 (신규 /{ub} 단독 URL)
//   - 레거시 /{mb}/{ub} 는 token=MB, ub=UB 그대로 전달 (BE 기존 경로)

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { certAuth } from '@/api'
import s from '../CertFlow.module.css'

export default function CertAuthStep({ token, ub, onAuth }) {
  const [error, setError] = useState('')
  // onAuth 는 CertFlow 에서 인라인이라 매 렌더 새 함수 → deps 제외하고 ref 로 최신값 참조
  // (token/ub 가 바뀔 때만 재인증; 같은 박스에서 불필요 재호출 방지)
  const onAuthRef = useRef(onAuth)
  onAuthRef.current = onAuth

  useEffect(() => {
    let cancelled = false
    certAuth(token, ub)
      .then((sess) => {
        if (!cancelled) onAuthRef.current(sess)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load certificate.')
      })
    return () => {
      cancelled = true
    }
  }, [token, ub])

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
      {error ? (
        <p className={s.authError}>{error}</p>
      ) : (
        <p className={s.authSub}>Loading certificate…</p>
      )}
      <p className={s.footer}>cert.faraday-dynamics.com</p>
    </motion.div>
  )
}
