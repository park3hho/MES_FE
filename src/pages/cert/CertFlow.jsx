// pages/cert/CertFlow.jsx
// 외부 공개 인증서 페이지 — QR 진입 → Landing → PW Auth → Data Sheet
// 라우팅 엔트리 + state machine 만 담당. 내부 컴포넌트는 steps/, sheet/, lib/ 로 분할 (2026-05-08).
//
// 라우팅:
//   /                       → CertEmpty (token 없이 진입 시 안내)
//   /{mb_lot_no}            → MB 페이지 (UB 목록 + 모델 결합 버튼)
//   /{mb_lot_no}/{ub_lot}   → UB 페이지 (focus_ub 펼침 + ST 카드)
//
// 토큰 보존: localStorage(per-token key) — 새로고침 시 PW 재입력 안 해도 됨 (1시간 만료).
// LOT 번호 익명화: BE 응답에 RM~OQ 일체 없음. FE 표시할 게 없으니 자연스럽게 가림.

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { certAuth, certFetchSheet } from '@/api'
// 회사 로그인 게이트 — QR 직접 진입 시에도 회사 세션 강제 (Phase D, 2026-05-02)
import { CompanyLoginStep, getCompanySession, saveCompanySession } from './CertCompanyFlow'
// 봉인지 영구 상태 — 회사 단위 DB (Phase D 확장, 2026-05-02)
import { SealsProvider } from './SealsContext'
import { isLikelyLotNo } from './lib/boxLayout'
import { SESSION_KEY, PW_CACHE_KEY } from './lib/constants'
import CertIntro from './steps/CertIntro'
import CertAuthStep from './steps/CertAuthStep'
import CertSheetStep from './steps/CertSheetStep'
import s from './CertFlow.module.css'

// ════════════════════════════════════════════
// Empty — token 없이 / 진입 시 안내 (App.jsx 에서 직접 mount)
// ════════════════════════════════════════════
export function CertEmpty() {
  return (
    <div className={s.page}>
      <motion.div
        className={s.empty}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <img src="/FaradayDynamicsLogo.png" alt="Faraday Dynamics" className={s.emptyLogo} />
        <h1 className={s.emptyTitle}>Certificate of Quality</h1>
        <p className={s.emptySub}>
          Scan the QR code on your box to view
          <br />
          the inspection record of your product.
        </p>
        <p className={s.footer}>cert.faraday-dynamics.com</p>
      </motion.div>
    </div>
  )
}

// ════════════════════════════════════════════
// Invalid — 잘못된 LOT 형식 URL 진입 시 (2026-05-02)
// ════════════════════════════════════════════
function CertInvalid() {
  const navigate = useNavigate()
  return (
    <motion.div
      className={s.empty}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={{ duration: 0.4 }}
    >
      <img src="/FaradayDynamicsLogo.png" alt="Faraday Dynamics" className={s.emptyLogo} />
      <h1 className={s.emptyTitle}>Invalid Certificate Link</h1>
      <p className={s.emptySub}>
        The link you opened is not a valid certificate URL.
        <br />
        Please scan the QR code on your box again.
      </p>
      <button
        className={s.authBtn}
        style={{ marginTop: 24, maxWidth: 280 }}
        onClick={() => navigate('/')}
      >
        Go to home
      </button>
      <p className={s.footer}>cert.faraday-dynamics.com</p>
    </motion.div>
  )
}

// ════════════════════════════════════════════
// CertFlow — /:token 진입점, step 상태머신
// ════════════════════════════════════════════
export default function CertFlow() {
  // 2026-04-29 v3:
  //   - /{mb_token}            → MB 페이지 (ub undefined)
  //   - /{mb_token}/{ub_lot}   → UB 페이지 (focus_ub 진입)
  // 2026-05-02 Phase D:
  //   - QR 직접진입 시에도 회사 로그인 강제. 세션 없으면 'company-login' step 으로 시작.
  //   - 로그인 통과 후 자동으로 기존 흐름 (intro → auth → sheet) 복귀, URL 그대로 유지.
  const { token, ub, fp } = useParams()

  // URL 형식 검증 — 잘못된 path (`/sad` 같은) 진입 시 PW 입력 화면 띄우지 않고 invalid 화면으로 바로 (2026-05-02).
  const urlInvalid =
    !isLikelyLotNo(token) ||
    (ub !== undefined && !isLikelyLotNo(ub)) ||
    (fp !== undefined && !isLikelyLotNo(fp))

  const [step, setStep] = useState(() => {
    if (urlInvalid) return 'invalid'
    return getCompanySession() ? 'intro' : 'company-login'
  }) // invalid | company-login | intro | auth | sheet
  const [session, setSession] = useState(null)
  const [sheetData, setSheetData] = useState(null)
  const [sheetError, setSheetError] = useState(null)

  // sessionKey: MB 단위 — 같은 MB 안 다른 UB 진입 시 sheetData 재사용 (fetch 안 일어남, 즉시 전환 애니 가능, 2026-04-29)
  const sessionKey = `${SESSION_KEY}:${token}`

  // 자동 인증 — 두 단계 (2026-04-30 v5: HMAC 토큰 + URL fragment 둘 다 제거)
  //   1) 같은 (mb, ub) session_token 캐시 → 즉시 sheet
  //   2) 같은 OB 의 다른 박스에서 입력한 PW 캐시 → 자동 PW 인증 시도
  // 모두 실패 시 일반 PW 입력 화면 (CertAuthStep)
  // 2026-05-02 Phase D: 회사 로그인 게이트 통과 전엔 sheet/PW 캐시 자동인증 스킵
  //                     (보안 — 회사 로그인 없으면 어떤 박스도 못 봄)
  useEffect(() => {
    if (!token) return
    if (step === 'company-login') return

    // 1) session_token 캐시 (만료 시각 검증 — 2026-05-02 localStorage 전환 후 추가)
    try {
      const cachedSess = localStorage.getItem(sessionKey)
      if (cachedSess) {
        const parsed = JSON.parse(cachedSess)
        const stillValid = !parsed?.expires_at || parsed.expires_at > Date.now()
        if (parsed?.token && stillValid) {
          setSession(parsed)
          setStep('sheet')
          return
        }
        // 만료된 캐시는 정리
        if (!stillValid) localStorage.removeItem(sessionKey)
      }
    } catch {
      /* localStorage 차단 환경 — 무시 */
    }

    // 2) localStorage PW 캐시 — 같은 탭/디바이스에서 이미 한 박스를 통과했다면 자동 시도
    //    (2026-05-02 sessionStorage → localStorage 전환 — 탭 닫고 재방문해도 자동 인증)
    let cachedPwRaw = null
    try {
      cachedPwRaw = localStorage.getItem(PW_CACHE_KEY)
    } catch {
      /* */
    }
    // 신/구 포맷 모두 호환 — 평문 string (옛) 또는 {pw, expires_at} JSON (새)
    let cachedPw = null
    if (cachedPwRaw) {
      try {
        const parsed = JSON.parse(cachedPwRaw)
        if (parsed?.pw) {
          if (!parsed.expires_at || parsed.expires_at > Date.now()) {
            cachedPw = parsed.pw
          } else {
            try {
              localStorage.removeItem(PW_CACHE_KEY)
            } catch {
              /* */
            }
          }
        }
      } catch {
        // 옛 평문 string — 그대로 사용
        cachedPw = cachedPwRaw
      }
    }
    if (!cachedPw) return
    let cancelled = false
    certAuth(token, ub, cachedPw)
      .then((sess) => {
        if (cancelled) return
        try {
          // sheet token 캐시에 만료 시각 함께 저장 (BE 1시간 토큰)
          const sessWithExp = { ...sess, expires_at: Date.now() + 60 * 60 * 1000 }
          localStorage.setItem(sessionKey, JSON.stringify(sessWithExp))
        } catch {
          /* */
        }
        setSession(sess)
        setStep('sheet')
      })
      .catch(() => {
        // 캐시 PW 가 이 박스 OB 와 불일치 → 캐시 제거 후 일반 PW 입력으로 fallback
        try {
          localStorage.removeItem(PW_CACHE_KEY)
        } catch {
          /* */
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, ub, sessionKey, step])

  // sheet step 진입 시 데이터 fetch
  useEffect(() => {
    if (step !== 'sheet' || !session?.token) return
    let cancelled = false
    setSheetError(null)
    certFetchSheet(session.token)
      .then((data) => {
        if (!cancelled) setSheetData(data)
      })
      .catch((e) => {
        if (cancelled) return
        // 401/만료 → auth 로 회귀
        localStorage.removeItem(sessionKey)
        setSession(null)
        setSheetData(null)
        if (
          e.message?.includes('expired') ||
          e.message?.includes('만료') ||
          e.message?.includes('401')
        ) {
          setStep('auth')
        } else {
          setSheetError(e.message || 'Failed to load data')
        }
      })
    return () => {
      cancelled = true
    }
  }, [step, session, sessionKey])

  if (!token) return <Navigate to="/" replace />

  return (
    <div className={s.page}>
      <AnimatePresence mode="wait">
        {step === 'invalid' && <CertInvalid key="invalid" />}
        {step === 'company-login' && (
          <CompanyLoginStep
            key="company-login"
            onSuccess={(sess) => {
              saveCompanySession(sess)
              // intro 스킵 — QR 진입 사용자는 이미 박스 앞에 있음. 바로 PW 입력으로.
              setStep('auth')
            }}
          />
        )}
        {step === 'intro' && <CertIntro key="intro" onDone={() => setStep('auth')} />}
        {step === 'auth' && (
          <CertAuthStep
            key="auth"
            token={token}
            ub={ub}
            onAuth={(sess) => {
              try {
                localStorage.setItem(sessionKey, JSON.stringify(sess))
              } catch {
                /* */
              }
              setSession(sess)
              setStep('sheet')
            }}
          />
        )}
        {step === 'sheet' && (
          <SealsProvider key="sheet">
            <CertSheetStep
              data={sheetData}
              error={sheetError}
              token={token}
              sessionToken={session?.token || ''}
              onLogout={() => {
                localStorage.removeItem(sessionKey)
                setSession(null)
                setSheetData(null)
                setStep('auth')
              }}
            />
          </SealsProvider>
        )}
      </AnimatePresence>
    </div>
  )
}
