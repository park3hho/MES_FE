// pages/cert/CertCompanyFlow.jsx
// Cert 도메인 root (cert.faraday-dynamics.com/) 진입점 — 회사 로그인 흐름 (Phase D, 2026-05-02)
//
// step machine:
//   intro (2.5s 자동) → login → orders → order-pw → mb-select OR navigate(/${mb})
//
// 기존 QR 직접 진입 (/{mb_token}) 은 CertFlow 가 그대로 처리.
// OB PW 통과 후 받은 sheet_token 들은 localStorage('cert_session:{mb}') 에 미리 캐시 →
// CertFlow 가 같은 localStorage 키를 보고 자동 로그인 → PW 입력 스킵.
//
// localStorage 키 (탭 닫고 다시 들어와도 1시간까지 유지 — 2026-05-02 localStorage 에서 변경):
//   cert_company_session = { company_token, company_id, company_name, company_name_ko, expires_at }
//   cert_session:{mb}    = { token, mb_lot_no, ub_lot_no, ob_lot_no, expires_at }   ← CertFlow 호환

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  certCompanyLogin, certCompanyOrders, certCompanyOrderAuth,
  certCompanyChangePassword,
} from '@/api'
import { useToast } from '@/contexts/ToastContext'
import s from './CertFlow.module.css'
import c from './CertCompanyFlow.module.css'

export const COMPANY_SESSION_KEY = 'cert_company_session'
const SHEET_SESSION_PREFIX = 'cert_session'

// 외부에서 호출 가능한 헬퍼 — localStorage 에 살아있는 회사 세션이 있으면 객체 반환, 없으면 null.
// CertFlow 가 QR 진입 시 회사 로그인 강제 게이트로 사용.
export function getCompanySession() {
  try {
    const raw = localStorage.getItem(COMPANY_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.company_token) return null
    if (parsed.expires_at && parsed.expires_at < Date.now()) {
      localStorage.removeItem(COMPANY_SESSION_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

// 회사 세션 저장 헬퍼 — CompanyLoginStep onSuccess 처리 일원화.
export function saveCompanySession(sess) {
  const session = {
    ...sess,
    expires_at: Date.now() + (sess.expires_in || 3600) * 1000,
  }
  try {
    localStorage.setItem(COMPANY_SESSION_KEY, JSON.stringify(session))
  } catch { /* */ }
  return session
}

// ════════════════════════════════════════════
// 메인 — step 상태머신
// ════════════════════════════════════════════
export default function CertCompanyFlow() {
  const navigate = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState('intro')      // intro | login | orders | order-pw | mb-select | change-pw
  const [companySession, setCompanySession] = useState(null)  // { company_token, company_id, company_name, ... }
  const [orders, setOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)    // 선택한 OB { ob_lot_no, ... }
  const [mbList, setMbList] = useState([])                    // OB PW 통과 후 [{mb_lot_no, sheet_token}]

  // ── 자동 복원: 기존 회사 세션이 살아있으면 orders 로 직행 ──
  useEffect(() => {
    if (step !== 'intro') return
    const existing = getCompanySession()
    if (existing) setCompanySession(existing)
  }, [step])

  // ── 로그인 성공 처리 ──
  const handleLoginSuccess = useCallback((sess) => {
    const session = saveCompanySession(sess)
    setCompanySession(session)
    setStep('orders')
  }, [])

  // ── 로그아웃 ──
  const handleLogout = useCallback(() => {
    try { localStorage.removeItem(COMPANY_SESSION_KEY) } catch { /* */ }
    setCompanySession(null)
    setOrders([])
    setSelectedOrder(null)
    setMbList([])
    setStep('login')
  }, [])

  // ── orders 로드 ──
  useEffect(() => {
    if (step !== 'orders' || !companySession?.company_token) return
    let cancelled = false
    certCompanyOrders(companySession.company_token)
      .then((data) => {
        if (cancelled) return
        setOrders(data.orders || [])
      })
      .catch((e) => {
        if (cancelled) return
        // 401 → 세션 만료 → 로그인 화면 복귀
        if (e.message?.includes('expired') || e.message?.includes('401')) {
          handleLogout()
        } else {
          toast(e.message || 'Failed to load orders', 'error')
        }
      })
    return () => { cancelled = true }
  }, [step, companySession, handleLogout])

  // ── OB PW 통과 → MB 캐시 → 이동 ──
  // OB PW 한 번 통과하면 그 OB 안 모든 MB 의 sheet_token 을 미리 localStorage 에 저장 →
  //   CertFlow 가 자동으로 sheet 단계 진입 (사용자 PW 재입력 불필요, UX 우선).
  const handleOrderAuthSuccess = useCallback((data) => {
    const mbs = data.mbs || []
    if (mbs.length === 0) {
      toast('No accessible MB in this order.', 'warn')
      return
    }
    // 각 sheet_token 을 localStorage 에 미리 캐시 → CertFlow 가 자동 로그인
    // expires_at 함께 저장 (BE 가 1시간 토큰 발급) — CertFlow 로드 시 만료 체크 (2026-05-02)
    const sheetExpiresAt = Date.now() + 60 * 60 * 1000
    // 형제 MB 목록 — 같은 OB 안 회사 소유 MB 전부. sheet 헤더 바의 MB 전환 드롭다운용 (2026-05-15).
    const siblingMbs = mbs.map((m) => m.mb_lot_no)
    for (const m of mbs) {
      try {
        const sess = {
          token: m.sheet_token,
          mb_lot_no: m.mb_lot_no,
          ub_lot_no: '',
          ob_lot_no: data.ob_lot_no,
          sibling_mbs: siblingMbs,
          expires_at: sheetExpiresAt,
        }
        localStorage.setItem(`${SHEET_SESSION_PREFIX}:${m.mb_lot_no}`, JSON.stringify(sess))
      } catch { /* */ }
    }
    setMbList(mbs)
    if (mbs.length === 1) {
      // 단일 MB — 바로 sheet 페이지로 (?cert-preview 등 dev query 보존)
      const search = window.location.search || ''
      navigate(`/${mbs[0].mb_lot_no}${search}`)
    } else {
      // 여러 MB — 선택 화면
      setStep('mb-select')
    }
  }, [navigate])

  // intro 가 끝나면 세션 유무에 따라 분기
  const handleIntroDone = useCallback(() => {
    setStep(companySession ? 'orders' : 'login')
  }, [companySession])

  return (
    <div className={s.page}>
      <AnimatePresence mode="wait">
        {step === 'intro' && (
          <CompanyIntro key="intro" onDone={handleIntroDone} />
        )}
        {step === 'login' && (
          <CompanyLoginStep key="login" onSuccess={handleLoginSuccess} />
        )}
        {step === 'orders' && (
          <OrdersStep
            key="orders"
            orders={orders}
            companyName={companySession?.company_name || ''}
            onSelectOrder={(ob) => { setSelectedOrder(ob); setStep('order-pw') }}
            onChangePw={() => setStep('change-pw')}
            onLogout={handleLogout}
          />
        )}
        {step === 'change-pw' && companySession && (
          <ChangePasswordStep
            key="change-pw"
            companyToken={companySession.company_token}
            companyName={companySession.company_name}
            onDone={() => setStep('orders')}
            onCancel={() => setStep('orders')}
          />
        )}
        {step === 'order-pw' && selectedOrder && companySession && (
          <OrderPwStep
            key="order-pw"
            order={selectedOrder}
            companyToken={companySession.company_token}
            onSuccess={handleOrderAuthSuccess}
            onBack={() => { setSelectedOrder(null); setStep('orders') }}
            onLogout={handleLogout}
          />
        )}
        {step === 'mb-select' && selectedOrder && (
          <MbSelectStep
            key="mb-select"
            order={selectedOrder}
            mbs={mbList}
            onPick={(mbLot) => {
              // dev preview 토글 (?cert-preview) 진입 시 query 보존 — CertFlow goBackToMB 패턴 동일
              const search = window.location.search || ''
              navigate(`/${mbLot}${search}`)
            }}
            onBack={() => { setMbList([]); setSelectedOrder(null); setStep('orders') }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ════════════════════════════════════════════
// Step 0 — Intro (CertFlow 의 CertIntro 재현, 짧게)
// ════════════════════════════════════════════
function CompanyIntro({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800)  // 1.8초 — 이미 본 적 있을 수 있으니 짧게
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <motion.div
      className={s.intro}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <motion.img
        src="/FaradayDynamicsLogo.png"
        alt="Faraday Dynamics"
        className={s.introLogo}
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div
        className={s.introTagline}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        Certificate of Quality
      </motion.div>
    </motion.div>
  )
}

// ════════════════════════════════════════════
// Step 1 — 회사 로그인 (ID + PW)
// CertFlow (QR 직접진입) 에서도 게이트로 재사용 — export.
// ════════════════════════════════════════════
export function CompanyLoginStep({ onSuccess }) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!loginId.trim() || !password || loading) return
    setLoading(true); setError('')
    try {
      const sess = await certCompanyLogin(loginId.trim(), password)
      onSuccess(sess)
    } catch (e) {
      setError(e.message || 'Login failed')
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
      <h1 className={s.authTitle}>Company Login</h1>
      <p className={s.authSub}>
        Sign in to view your shipment certificates.
      </p>
      <div className={s.authField}>
        <label className={s.authLabel} htmlFor="login-id">Company ID</label>
        <input
          id="login-id"
          className={s.authInputForm}
          type="text"
          placeholder="Enter your company ID"
          value={loginId}
          onChange={(e) => { setLoginId(e.target.value); setError('') }}
          onKeyDown={(e) => e.key === 'Enter' && password && handleSubmit()}
          autoFocus
          autoComplete="username"
          maxLength={64}
        />
      </div>
      <div className={s.authField}>
        <label className={s.authLabel} htmlFor="login-pw">Password</label>
        <input
          id="login-pw"
          className={s.authInputForm}
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError('') }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          autoComplete="current-password"
          maxLength={128}
        />
      </div>
      {error && <p className={s.authError}>{error}</p>}
      <button
        className={s.authBtn}
        onClick={handleSubmit}
        disabled={!loginId.trim() || !password || loading}
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
      <p className={s.footer}>cert.faraday-dynamics.com</p>
    </motion.div>
  )
}

// ════════════════════════════════════════════
// Step 2 — OB 카드 목록 (회사 출하분 — 5 metas)
// ════════════════════════════════════════════
function OrdersStep({ orders, companyName, onSelectOrder, onChangePw, onLogout }) {
  return (
    <motion.div
      className={c.orders}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.3 } }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={c.ordersHeader}>
        <div>
          <p className={c.ordersHello}>Welcome,</p>
          <h1 className={c.ordersCompany}>{companyName}</h1>
        </div>
        <div className={c.ordersHeaderActions}>
          <button className={c.logoutBtn} onClick={onChangePw} title="Change password">
            Change PW
          </button>
          <button className={c.logoutBtn} onClick={onLogout} title="Logout">
            Logout
          </button>
        </div>
      </div>
      <p className={c.ordersSub}>
        Select a shipment to view its certificate of quality.
      </p>

      {orders.length === 0 ? (
        <div className={c.ordersEmpty}>
          No shipments found yet.
        </div>
      ) : (
        <ul className={c.orderList}>
          {orders.map((o) => (
            <OrderCard key={o.ob_lot_no} order={o} onClick={() => onSelectOrder(o)} />
          ))}
        </ul>
      )}
      <p className={s.footer}>cert.faraday-dynamics.com</p>
    </motion.div>
  )
}

function OrderCard({ order, onClick }) {
  const dt = order.shipped_at ? new Date(order.shipped_at) : null
  const dtStr = dt ? `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}` : '-'
  return (
    <li className={c.orderCard} onClick={onClick} role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}>
      <div className={c.orderCardTop}>
        <span className={c.orderObNo}>{order.ob_lot_no}</span>
        <span className={c.orderDate}>{dtStr}</span>
      </div>
      <div className={c.orderStats}>
        <span className={c.statChip}>MB {order.mb_count}</span>
        {order.invoice_no && (
          <span className={c.invoiceChip} title="Invoice number">📄 {order.invoice_no}</span>
        )}
      </div>
      {order.phi_stats?.length > 0 && (
        <div className={c.phiRow}>
          {order.phi_stats.map((p) => (
            <span
              key={`${p.phi}-${p.motor_type}`}
              className={c.phiChip}
              style={{ borderColor: p.color_hex, color: p.color_hex }}
              title={p.label}
            >
              <span className={c.phiDot} style={{ background: p.color_hex }} />
              {p.label}
            </span>
          ))}
        </div>
      )}
      <div className={c.orderCardArrow}>›</div>
    </li>
  )
}

const pad = (n) => String(n).padStart(2, '0')

// ════════════════════════════════════════════
// Step 3 — OB PW 입력 (선택한 OB 의 access_pw)
// ════════════════════════════════════════════
function OrderPwStep({ order, companyToken, onSuccess, onBack, onLogout }) {
  // 2026-06-12 v6: OB PW 게이트 폐기 — mount 시 pw 없이 자동 order-auth.
  // 접근 통제는 이미 회사 로그인이 수행. onSuccess 는 부모 인라인이라 ref 로 최신 참조.
  const [error, setError] = useState('')
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  useEffect(() => {
    let cancelled = false
    certCompanyOrderAuth(companyToken, order.ob_lot_no)
      .then((data) => {
        if (!cancelled) onSuccessRef.current(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to open order.')
      })
    return () => {
      cancelled = true
    }
  }, [companyToken, order])

  return (
    <motion.div
      className={s.auth}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.3 } }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <img src="/FaradayDynamicsLogo.png" alt="" className={s.authLogo} />
      <h1 className={s.authTitle}>{order.ob_lot_no}</h1>
      {error ? (
        <p className={s.authError}>{error}</p>
      ) : (
        <p className={s.authSub}>Loading certificate…</p>
      )}
      <div className={c.authActions}>
        <button className={c.linkBtn} onClick={onBack}>← Back to orders</button>
        <button className={c.linkBtn} onClick={onLogout}>Logout</button>
      </div>
    </motion.div>
  )
}

// ════════════════════════════════════════════
// Step 3.5 — 비밀번호 변경 (회사 본인, 2026-05-11)
// orders 화면 헤더의 "Change PW" 진입. company_token 유지 — 변경 후에도 재로그인 불필요.
// ════════════════════════════════════════════
function ChangePasswordStep({ companyToken, companyName, onDone, onCancel }) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const newPwValid = newPw.length >= 4
  const confirmMatch = newPw && newPw === confirmPw
  const canSubmit = currentPw && newPwValid && confirmMatch && !loading && !success

  const handleSubmit = async () => {
    if (!canSubmit) return
    if (newPw === currentPw) {
      setError('New password must differ from current password.')
      return
    }
    setLoading(true); setError('')
    try {
      await certCompanyChangePassword(companyToken, currentPw, newPw)
      setSuccess(true)
      // 1.6초 후 자동 복귀 (사용자가 메시지 읽을 시간)
      setTimeout(() => onDone(), 1600)
    } catch (e) {
      setError(e.message || 'Password change failed')
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
      <h1 className={s.authTitle}>Change Password</h1>
      <p className={s.authSub}>{companyName}</p>

      <div className={s.authField}>
        <label className={s.authLabel} htmlFor="cpw-current">Current password</label>
        <input
          id="cpw-current"
          className={s.authInputForm}
          type="password"
          placeholder="Enter current password"
          value={currentPw}
          onChange={(e) => { setCurrentPw(e.target.value); setError('') }}
          autoComplete="current-password"
          maxLength={128}
          disabled={success}
          autoFocus
        />
      </div>
      <div className={s.authField}>
        <label className={s.authLabel} htmlFor="cpw-new">New password</label>
        <input
          id="cpw-new"
          className={s.authInputForm}
          type="password"
          placeholder="At least 4 characters"
          value={newPw}
          onChange={(e) => { setNewPw(e.target.value); setError('') }}
          autoComplete="new-password"
          maxLength={128}
          disabled={success}
        />
      </div>
      <div className={s.authField}>
        <label className={s.authLabel} htmlFor="cpw-confirm">Confirm new password</label>
        <input
          id="cpw-confirm"
          className={s.authInputForm}
          type="password"
          placeholder="Re-enter new password"
          value={confirmPw}
          onChange={(e) => { setConfirmPw(e.target.value); setError('') }}
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
          autoComplete="new-password"
          maxLength={128}
          disabled={success}
        />
      </div>

      {confirmPw && !confirmMatch && !error && (
        <p className={s.authError}>Passwords do not match.</p>
      )}
      {error && <p className={s.authError}>{error}</p>}
      {success && (
        <p className={s.authError} style={{ color: '#0a8f3e' }}>
          ✓ Password changed successfully.
        </p>
      )}

      <button
        className={s.authBtn}
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        {loading ? 'Changing...' : success ? 'Done' : 'Change Password'}
      </button>
      <div className={c.authActions}>
        <button className={c.linkBtn} onClick={onCancel} disabled={loading}>
          ← Back to orders
        </button>
      </div>
    </motion.div>
  )
}

// ════════════════════════════════════════════
// Step 4 — MB 선택 (OB 안 MB 가 여러 개일 때)
// ════════════════════════════════════════════
function MbSelectStep({ order, mbs, onPick, onBack }) {
  return (
    <motion.div
      className={c.orders}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.3 } }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={c.ordersHeader}>
        <div>
          <p className={c.ordersHello}>{order.ob_lot_no}</p>
          <h1 className={c.ordersCompany}>Select Master Box</h1>
        </div>
        <button className={c.logoutBtn} onClick={onBack}>← Back</button>
      </div>
      <p className={c.ordersSub}>
        This shipment contains {mbs.length} master boxes.
      </p>
      <ul className={c.mbList}>
        {mbs.map((m) => (
          <li
            key={m.mb_lot_no}
            className={c.mbCard}
            onClick={() => onPick(m.mb_lot_no)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(m.mb_lot_no)}
          >
            <span className={c.mbCardLot}>{m.mb_lot_no}</span>
            <span className={c.orderCardArrow}>›</span>
          </li>
        ))}
      </ul>
    </motion.div>
  )
}
