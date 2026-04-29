// pages/cert/CertFlow.jsx
// 외부 공개 인증서 페이지 — QR 진입 → Landing → PW Auth → Data Sheet (2026-04-29 v3)
//
// 라우팅:
//   /                       → CertEmpty (token 없이 진입 시 안내)
//   /{mb_token}              → MB 페이지 (UB 목록 + 모델 결합 버튼)
//   /{mb_token}/{ub_lot}     → UB 페이지 (focus_ub 펼침 + ST 카드)
//
// 토큰 보존: sessionStorage(per-token key) — 새로고침 시 PW 재입력 안 해도 됨 (1시간 만료)
// LOT 번호 익명화: BE 응답에 RM~OQ 일체 없음. FE 표시할 게 없으니 자연스럽게 가림.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { motion, AnimatePresence, useMotionValue, animate as fmAnimate } from 'framer-motion'
import { certAuth, certFetchSheet } from '@/api'
import { PHI_SPECS } from '@/constants/processConst'
import s from './CertFlow.module.css'

const SESSION_KEY = 'cert_session'
const PW_CACHE_KEY = 'cert_pw_cached'   // 같은 sessionStorage 안 PW 캐시 — 다른 박스 진입 시 자동 인증

// 박스 통일 사이즈 — 모든 phi 동일. 사용자 확정 (2026-04-27).
const _BOX_W = 175
const _BOX_H = 105

// phi 기본값 ↔ 페어 직경 매핑 (mm).
// 내전형 (inner): ST = 기본 phi, RT = 페어
// 외전형 (outer): RT = 기본 phi, ST = 페어 (ST/RT 자리 swap → ST 우측)
const _PHI_PAIR = {
  '87': 73,
  '70': 53,
  '45': 31,
  '20': 13,
}

// phi 별 박스 grid (cols × 2 rows, 위 ST 행 / 아래 RT 행)
//   Φ87, Φ70 → 1×2 (compact, 가로 한 줄)
//   Φ45      → 3×2
//   Φ20      → 5×2
const _PHI_COLS = { '87': 1, '70': 1, '45': 3, '20': 5 }

function _getBoxLayout(phi, motor) {
  const base = parseFloat(phi) || 70
  const pair = _PHI_PAIR[phi] || base * 0.76   // 미등록 phi fallback
  const { stD, rtD } = motor === 'outer'
    ? { stD: pair, rtD: base }   // 외전형: RT 가 기본 phi (큰 쪽)
    : { stD: base, rtD: pair }   // 내전형 default: ST 가 기본 phi
  const cols = _PHI_COLS[phi] || 1
  return { boxW: _BOX_W, boxH: _BOX_H, stD, rtD, cols, compact: cols === 1 }
}

// 도면 PNG 경로 — public/{phi}phi_{motor}_{kind}.png 규약 (예: 70phi_inner_stator.png)
// SVG path 변환 디테일 손실 회피 위해 PNG 사용 (투명 배경 권장, 256~512px)
// 파일 없으면 onError → fallback (dot 또는 점선)
// motor_type 이 BE 응답에서 빈 string 인 legacy 데이터는 inner 로 가정
function _drawingSrc(phi, motor, kind) {
  if (!phi) return null
  const m = motor || 'inner'
  return `/${phi}phi_${m}_${kind}.png`
}

// ════════════════════════════════════════════
// Empty — token 없이 / 진입 시 안내
// ════════════════════════════════════════════
export function CertEmpty() {
  return (
    <div className={s.page}>
      <motion.div className={s.empty}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <img src="/FaradayDynamicsLogo.png" alt="Faraday Dynamics" className={s.emptyLogo} />
        <h1 className={s.emptyTitle}>Certificate of Quality</h1>
        <p className={s.emptySub}>
          Scan the QR code on your box to view<br />
          the inspection record of your product.
        </p>
        <p className={s.footer}>cert.faraday-dynamics.com</p>
      </motion.div>
    </div>
  )
}

// ════════════════════════════════════════════
// CertFlow — /:token 진입점, step 상태머신
// ════════════════════════════════════════════
export default function CertFlow() {
  // 2026-04-29 v3:
  //   - /{mb_token}            → MB 페이지 (ub undefined)
  //   - /{mb_token}/{ub_lot}   → UB 페이지 (focus_ub 진입)
  const { token, ub } = useParams()
  const [step, setStep] = useState('intro')   // intro | auth | sheet
  const [session, setSession] = useState(null)
  const [sheetData, setSheetData] = useState(null)
  const [sheetError, setSheetError] = useState(null)

  // sessionKey: MB 단위 — 같은 MB 안 다른 UB 진입 시 sheetData 재사용 (fetch 안 일어남, 즉시 전환 애니 가능, 2026-04-29)
  const sessionKey = `${SESSION_KEY}:${token}`

  // 자동 인증 — 두 단계 (2026-04-27 v3)
  //   1) 같은 (token, ub) session_token 캐시 → 즉시 sheet
  //   2) 같은 OB 의 다른 박스에서 입력한 PW 캐시 → 자동 PW 인증 시도
  // 둘 다 실패 시 일반 PW 입력 화면 (CertAuthStep)
  useEffect(() => {
    if (!token) return

    // 1) session_token 캐시
    try {
      const cachedSess = sessionStorage.getItem(sessionKey)
      if (cachedSess) {
        const parsed = JSON.parse(cachedSess)
        if (parsed?.token) {
          setSession(parsed)
          setStep('sheet')
          return
        }
      }
    } catch { /* sessionStorage 차단 환경 — 무시 */ }

    // 2) 다른 박스에서 캐시된 PW 자동 시도 (같은 OB 면 통과)
    let cachedPw = null
    try { cachedPw = sessionStorage.getItem(PW_CACHE_KEY) } catch { /* */ }
    if (!cachedPw) return
    let cancelled = false
    certAuth(token, ub, cachedPw)
      .then((sess) => {
        if (cancelled) return
        try { sessionStorage.setItem(sessionKey, JSON.stringify(sess)) } catch { /* */ }
        setSession(sess)
        setStep('sheet')
      })
      .catch(() => {
        // 캐시 PW 가 이 박스의 OB 와 다름 → 제거 후 일반 PW 입력으로 fallback
        try { sessionStorage.removeItem(PW_CACHE_KEY) } catch { /* */ }
      })
    return () => { cancelled = true }
  }, [token, ub, sessionKey])

  // sheet step 진입 시 데이터 fetch
  useEffect(() => {
    if (step !== 'sheet' || !session?.token) return
    let cancelled = false
    setSheetError(null)
    certFetchSheet(session.token)
      .then((data) => { if (!cancelled) setSheetData(data) })
      .catch((e) => {
        if (cancelled) return
        // 401/만료 → auth 로 회귀
        sessionStorage.removeItem(sessionKey)
        setSession(null)
        setSheetData(null)
        if (e.message?.includes('expired') || e.message?.includes('만료') || e.message?.includes('401')) {
          setStep('auth')
        } else {
          setSheetError(e.message || 'Failed to load data')
        }
      })
    return () => { cancelled = true }
  }, [step, session, sessionKey])

  if (!token) return <Navigate to="/" replace />

  return (
    <div className={s.page}>
      <AnimatePresence mode="wait">
        {step === 'intro' && (
          <CertIntro key="intro" onDone={() => setStep('auth')} />
        )}
        {step === 'auth' && (
          <CertAuthStep
            key="auth"
            token={token}
            ub={ub}
            onAuth={(sess) => {
              try {
                sessionStorage.setItem(sessionKey, JSON.stringify(sess))
              } catch { /* */ }
              setSession(sess)
              setStep('sheet')
            }}
          />
        )}
        {step === 'sheet' && (
          <CertSheetStep
            key="sheet"
            data={sheetData}
            error={sheetError}
            token={token}
            onLogout={() => {
              sessionStorage.removeItem(sessionKey)
              setSession(null)
              setSheetData(null)
              setStep('auth')
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ════════════════════════════════════════════
// 1. Intro — Faraday Dynamics 로고 차분히 등장 (2.5초 후 자동 진행)
// ════════════════════════════════════════════
function CertIntro({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
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
        transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div
        className={s.introTagline}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        Certificate of Quality
      </motion.div>
      <motion.div
        className={s.introHint}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.5 }}
      >
        Just a moment...
      </motion.div>
    </motion.div>
  )
}

// ════════════════════════════════════════════
// 2. Auth — PW 입력
// ════════════════════════════════════════════
function CertAuthStep({ token, ub, onAuth }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!pw.trim() || loading) return
    setLoading(true); setError('')
    try {
      const sess = await certAuth(token, ub, pw)
      // 다음 박스 진입 시 자동 인증되도록 PW 캐시 (sessionStorage — 탭 닫으면 사라짐)
      try { sessionStorage.setItem(PW_CACHE_KEY, pw) } catch { /* */ }
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
        onChange={(e) => { setPw(e.target.value); setError('') }}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        autoFocus
        maxLength={16}
        autoComplete="off"
      />
      {error && <p className={s.authError}>{error}</p>}
      <button
        className={s.authBtn}
        onClick={handleSubmit}
        disabled={!pw.trim() || loading}
      >
        {loading ? 'Verifying...' : 'Verify'}
      </button>
      <p className={s.footer}>cert.faraday-dynamics.com</p>
    </motion.div>
  )
}

// ════════════════════════════════════════════
// 3. Sheet — 데이터시트 (MB → UB → ST → 측정값)
// ════════════════════════════════════════════
function CertSheetStep({ data, error, onLogout, token }) {
  const navigate = useNavigate()
  // URL 의 ub / fp 직접 사용 — BE 의 focus_ub 보다 우선. 이러면 sheetData 변경 없이 URL 만 바꿔도 즉시 전환 (애니 가능)
  // fp 는 외부 QR 스캔 진입용 (사용자 정책 2026-04-29) — UB 페이지의 그 ST 카드 자동 펼침
  const { ub: urlUB, fp: urlFP } = useParams()
  if (error) {
    return (
      <motion.div className={s.sheetError}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      >
        <p>⚠ {error}</p>
        <button className={s.linkBtn} onClick={onLogout}>Re-enter password</button>
      </motion.div>
    )
  }
  if (!data) {
    return (
      <motion.div className={s.sheetLoading}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      >
        <div className={s.spinner} />
        <p>Loading data...</p>
      </motion.div>
    )
  }

  // v4 응답: { ob, mb: { lot_no, ub_count, st_count, models, ubs }, focus_ub }
  // URL ub 만 진실의 원천 — BE focus_ub 는 무시 (session token 의 잔존 ub 때문에 MB URL 도 UB 로 분기되던 버그 fix, 2026-04-29)
  const { ob, mb } = data
  const ubLotKey = urlUB ? decodeURIComponent(urlUB) : ''
  const focusedUB = ubLotKey ? mb?.ubs?.find((u) => u.lot_no === ubLotKey) : null

  // 페이지 전환 애니용 key (UB 마다 다른 key → AnimatePresence 가 트리거)
  const viewKey = focusedUB ? `ub:${focusedUB.lot_no}` : 'mb'

  // prev/next UB — 같은 MB 안 ubs 순서 기반 (사용자 정책 H, 2026-04-29)
  const ubIndex = focusedUB && mb?.ubs ? mb.ubs.findIndex((u) => u.lot_no === focusedUB.lot_no) : -1
  const prevUB = ubIndex > 0 ? mb.ubs[ubIndex - 1] : null
  const nextUB = ubIndex >= 0 && ubIndex < (mb?.ubs?.length || 0) - 1 ? mb.ubs[ubIndex + 1] : null

  // 뒤로가기 / UB 이동 헬퍼 — query (cert-preview) 보존
  const goBackToMB = () => {
    const search = window.location.search || ''
    navigate(`/${token}${search}`)
  }
  const goToUB = (ubLot) => {
    const search = window.location.search || ''
    navigate(`/${token}/${encodeURIComponent(ubLot)}${search}`)
  }

  return (
    <motion.div
      className={s.sheet}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className={s.sheetHeader}>
        <img src="/FaradayDynamicsLogo.png" alt="" className={s.sheetLogo} />
        <div className={s.sheetHeaderText}>
          <div className={s.sheetTag}>Certificate of Quality</div>
          {/* 헤더는 항상 MB 번호 (UB 페이지에서도 동일) — 사용자 정책 I (2026-04-29) */}
          <div className={s.sheetOb}>{mb?.lot_no}</div>
          {ob?.shipped_at && (
            <div className={s.sheetMeta}>Shipped: {fmtDate(ob.shipped_at)}</div>
          )}
        </div>
        <DownloadGroup compact />
      </header>

      {/* UB 페이지 — 상위 MB 페이지 유도 안내 바 (2026-04-29) */}
      {/* UB QR 만 라벨에 박혀 외부 사용자는 UB 페이지부터 진입 → MB 페이지로 가는 명시적 링크 */}
      {focusedUB && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 16px', margin: '0 0 8px',
            background: 'rgba(0,0,0,0.04)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--color-text-sub, #5f6b7a)',
          }}
        >
          <span>Part of master box <strong style={{ color: 'inherit' }}>{mb?.lot_no}</strong></span>
          <button
            type="button"
            onClick={goBackToMB}
            title="View master box page"
            style={{
              background: 'none',
              border: '1px solid currentColor',
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              color: 'inherit',
              opacity: 0.85,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85' }}
          >
            ← View Master Box
          </button>
        </motion.div>
      )}

      {/* focus_ub 있으면 UB 페이지, 없으면 MB 페이지. URL ub 변경 시 즉시 전환 + 슬라이드 애니. */}
      <AnimatePresence mode="wait">
        {focusedUB ? (
          <motion.div
            key={viewKey}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <UBBlock
              ub={focusedUB}
              highlight
              onBack={goBackToMB}
              mbToken={token}
              initialFP={urlFP ? decodeURIComponent(urlFP) : null}
              prevUB={prevUB}
              nextUB={nextUB}
              onNavigate={goToUB}
            />
          </motion.div>
        ) : (
          <motion.div
            key={viewKey}
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <MBSheet
              mb={mb}
              onSelectUB={(ubLot) => {
                // dev preview 토글 (?cert-preview) 진입 시 query 보존
                const search = window.location.search || ''
                navigate(`/${token}/${encodeURIComponent(ubLot)}${search}`)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <footer className={s.sheetFooter}>
        <p className={s.footerText}>
          This certificate verifies the inspection record of every product in this box.
        </p>
        <p className={s.footer}>cert.faraday-dynamics.com</p>
      </footer>

      {/* 최근 본 UB 5개 플로팅 버튼 (2026-04-29) — 같은 MB 안 UB 만 표시 */}
      <RecentFab currentToken={token} />
    </motion.div>
  )
}

// ════════════════════════════════════════════
// MB 페이지 (2026-04-29 v4)
//   - 헤더: phi 별 통계 (NN ea / MM box) + total
//   - 모델 결합 버튼 (ST + RT 도면 합성, RT 만 회전, 봉인지 띠 → 클릭 시 찢어짐)
//   - 선택된 모델의 UB 그리드 (UBCard)
//   - UBCard 클릭 → /{mb_token}/{ub_lot} 로 navigate
// ════════════════════════════════════════════

// 봉인지 영속 — localStorage. 한 번 열어보면 영구 표시.
function _useSeal(key) {
  const [opened, setOpened] = useState(() => {
    try { return localStorage.getItem(key) === '1' } catch { return false }
  })
  const open = useCallback(() => {
    setOpened(true)
    try { localStorage.setItem(key, '1') } catch { /* */ }
  }, [key])
  return [opened, open]
}

// 호버/클릭 시 RT 회전 — 누적식. 매번 ±60°~±240° 랜덤 추가.
function _randomRotateDelta() {
  const sign = Math.random() < 0.5 ? -1 : 1
  return sign * (60 + Math.random() * 180)
}

// 봉인지 띠 — 단순 fade (초기 버전 복원, 2026-04-29)
function SealBand({ color }) {
  return (
    <motion.div
      className={s.sealBand}
      initial={{ scaleX: 1, opacity: 1 }}
      animate={{ scaleX: 1, opacity: 1 }}
      exit={{ scaleX: 0, opacity: 0 }}
      transition={{ duration: 0.55, ease: [0.55, 0, 0.65, 0.5] }}
      style={{ background: color }}
    >
      <span className={s.sealText}>SEALED</span>
    </motion.div>
  )
}

// 결합 도면 버튼 — ST + RT 합성, RT 만 회전 (외전형은 바깥 RT, 내전형은 가운데 RT)
function ModelButton({ phi, motor, label, color, mbLotNo, selected, onSelect }) {
  const sealKey = `cert_seal:${mbLotNo}:${phi}_${motor}`
  const [opened, openSeal] = _useSeal(sealKey)
  const [rotation, setRotation] = useState(0)

  // motor_type 별 ST/RT 자리 결정. legacy 빈 값 → inner 가정
  const motorEff = motor || 'inner'
  const isOuter = motorEff === 'outer'
  const rotorSrc = `/${phi}phi_${motorEff}_rotor.png`
  const statorSrc = `/${phi}phi_${motorEff}_stator.png`

  // 안쪽 도면 (작은 쪽) 의 너비 % — PHI_PAIR 비율
  const base = parseFloat(phi) || 70
  const pair = _PHI_PAIR[phi] || base * 0.76
  const innerSizePct = (pair / base) * 100

  const handleClick = () => {
    setRotation((r) => r + _randomRotateDelta())
    if (!opened) openSeal()
    onSelect?.()
  }
  const handleHover = () => {
    setRotation((r) => r + _randomRotateDelta() * 0.3)
  }

  // 회전 도면: motor 따라 outer/inner 자리 swap
  const RotorImg = (
    <motion.img
      src={rotorSrc}
      alt=""
      className={isOuter ? s.modelLayerOuter : s.modelLayerInner}
      style={isOuter ? undefined : { width: `${innerSizePct}%`, height: `${innerSizePct}%` }}
      animate={{ rotate: rotation }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      draggable="false"
    />
  )
  const StatorImg = (
    <img
      src={statorSrc}
      alt=""
      className={isOuter ? s.modelLayerInner : s.modelLayerOuter}
      style={isOuter ? { width: `${innerSizePct}%`, height: `${innerSizePct}%` } : undefined}
      onError={(e) => { e.currentTarget.style.opacity = '0.25' }}
      draggable="false"
    />
  )

  return (
    <button
      type="button"
      className={`${s.modelBtn} ${selected ? s.modelBtnSelected : ''}`}
      onClick={handleClick}
      onMouseEnter={handleHover}
      style={{ '--model-color': color }}
    >
      <div className={s.modelDrawing}>
        {/* 바깥 → 안 순서로 z-index 쌓기 */}
        {isOuter ? <>{RotorImg}{StatorImg}</> : <>{StatorImg}{RotorImg}</>}
        {/* 봉인지 띠 — 안 열렸을 때만 */}
        <AnimatePresence>
          {!opened && <SealBand color={color} />}
        </AnimatePresence>
      </div>
      <div className={s.modelLabel}>{label}</div>
    </button>
  )
}

// UB 그리드 카드 — UB 번호 + Φ × N + 봉인 테이프 (카드 상단 가로띠)
//   - 호버: 좌측이 살짝 뜯어진 듯 약간 회전
//   - 클릭: 테이프 완전히 뜯어지며 카드가 살짝 떠오름 (박스 열리는 느낌) → navigate
function UBCard({ ub, onClick }) {
  const sealKey = `cert_seal_ub:${ub.lot_no}`
  const [opened, openSeal] = _useSeal(sealKey)
  const [hovered, setHovered] = useState(false)
  // 두 상태 분리:
  //   tearing — 봉인지 뜯어지는 애니. 안 열린 박스 첫 클릭만.
  //   opening — 박스 오픈 모션. 클릭마다 항상 (열린 박스 재클릭도).
  const [tearing, setTearing] = useState(false)
  const [opening, setOpening] = useState(false)
  const m = ub.model_breakdown?.[0]
  const phi = m?.phi || ''
  const color = m?.color_hex || '#9CA3AF'

  const handleClick = () => {
    if (opening) return   // 더블 클릭 방지
    setOpening(true)
    // 봉인지는 안 열린 박스에만 — 첫 클릭만 적용
    if (!opened) setTearing(true)
    const delay = opened ? 220 : 480
    setTimeout(() => {
      if (!opened) openSeal()
      onClick?.(ub.lot_no)
    }, delay)
  }

  // 테이프 motion — 단순 fade (초기 버전 복원, 2026-04-29)
  //   tearing: scaleX 0 + opacity 0
  //   hover:   좌측 살짝 들림
  //   idle:    평평
  const tapeAnimate = tearing
    ? { scaleX: 0, opacity: 0 }
    : hovered
      ? { rotate: -4, y: -1, opacity: 1 }
      : { rotate: 0, y: 0, opacity: 1 }
  const tapeTransition = tearing
    ? { duration: 0.45, ease: [0.55, 0, 0.65, 0.5] }
    : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }

  return (
    <motion.button
      type="button"
      className={s.ubCard}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // 박스 오픈 모션 — 매 클릭마다 (opened 여부 무관)
      animate={opening ? { y: -4, scale: 1.02 } : { y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={s.ubCardLot}>{ub.lot_no}</div>
      <div className={s.ubCardSpec}>{phi ? `Φ${phi} × ${ub.st_count}` : `ST ${ub.st_count}`}</div>

      {/* 봉인 테이프 — 안 열린 박스만 표시. 단순 fade (초기 버전) */}
      <AnimatePresence>
        {!opened && (
          <motion.div
            className={s.ubCardTape}
            initial={{ scaleX: 1, rotate: 0, y: 0, opacity: 1 }}
            animate={tapeAnimate}
            exit={{ scaleX: 0, opacity: 0 }}
            transition={tapeTransition}
            style={{ background: color }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
    </motion.button>
  )
}

// MB 페이지 본체
function MBSheet({ mb, onSelectUB }) {
  const [selectedModel, setSelectedModel] = useState(null) // {phi, motor} | null

  // 모델 미선택 = 모든 UB. 선택 시 그 모델 UB 만.
  const filteredUbs = useMemo(() => {
    if (!mb?.ubs) return []
    if (!selectedModel) return mb.ubs
    return mb.ubs.filter((ub) => {
      const m = ub.model_breakdown?.[0]
      return m?.phi === selectedModel.phi && m?.motor_type === selectedModel.motor
    })
  }, [mb?.ubs, selectedModel])

  if (!mb) return null

  return (
    <section className={s.mbSheet}>
      {/* phi 별 통계 */}
      <div className={s.mbStats}>
        {(mb.models || []).map((m) => (
          <div key={`${m.phi}-${m.motor_type}`} className={s.mbStatRow}>
            <span style={{ color: m.color_hex }}>● </span>
            <span>{m.label}: {m.st_count}ea / {m.ub_count}box</span>
          </div>
        ))}
        <div className={s.mbStatTotal}>
          Total: {mb.st_count}ea / {mb.ub_count}box
        </div>
      </div>

      {/* 모델 결합 버튼 행 */}
      <div className={s.modelRow}>
        {(mb.models || []).map((m) => (
          <ModelButton
            key={`${m.phi}-${m.motor_type}`}
            phi={m.phi}
            motor={m.motor_type}
            label={m.label}
            color={m.color_hex}
            mbLotNo={mb.lot_no}
            selected={selectedModel?.phi === m.phi && selectedModel?.motor === m.motor_type}
            onSelect={() =>
              setSelectedModel((prev) =>
                prev?.phi === m.phi && prev?.motor === m.motor_type
                  ? null
                  : { phi: m.phi, motor: m.motor_type }
              )
            }
          />
        ))}
      </div>

      {/* UB 그리드 */}
      <div className={s.ubGrid}>
        {filteredUbs.map((ub) => (
          <UBCard key={ub.lot_no} ub={ub} onClick={onSelectUB} />
        ))}
      </div>
    </section>
  )
}

// ════════════════════════════════════════════
// 최근 본 UB 박스 5개 — 우하단 floating 버튼 (2026-04-29)
// localStorage 'cert_recent_ubs' = [{ mb, ub, phi, st_count, at }, ...] FIFO 5
// 클릭 시 popup → 항목 클릭 시 /{mb}/{ub} 로 navigate
// ════════════════════════════════════════════
function RecentFab({ currentToken }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])

  // 항상 최신 list 유지 — popup 열린 상태에서 다른 박스 진입해도 즉시 반영 (2026-04-29)
  //   1) mount 시 1회 로드
  //   2) 같은 탭 내 변경: UBBlock 의 'cert_recent_updated' custom event
  //   3) 다른 탭 변경: 'storage' event
  useEffect(() => {
    const refresh = (e) => {
      try {
        const next = e?.detail || JSON.parse(localStorage.getItem('cert_recent_ubs') || '[]')
        setItems(Array.isArray(next) ? next : [])
      } catch { setItems([]) }
    }
    refresh()
    window.addEventListener('cert_recent_updated', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('cert_recent_updated', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  // 같은 MB 안 UB 만 표시 — 다른 MB 박스 history 노출 방지 (2026-04-29)
  // currentToken 미전달 시 (예외) 전체 표시 fallback
  const visibleItems = currentToken
    ? items.filter((it) => it.mb === currentToken)
    : items

  const handleSelect = (it) => {
    setOpen(false)
    const search = window.location.search || ''
    navigate(`/${it.mb}/${encodeURIComponent(it.ub)}${search}`)
  }

  return (
    <>
      <button
        type="button"
        className={s.recentFab}
        onClick={() => setOpen((o) => !o)}
        aria-label="Recent boxes"
        title="Recent boxes"
      >
        {/* 미니멀 history 아이콘 (얇은 stroke) */}
        <svg
          width="22" height="22" viewBox="0 0 24 24"
          fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 2.6-6.36" />
          <polyline points="3 3 3 8 8 8" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={s.recentPopup}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={s.recentTitle}>Recent boxes</div>
            {visibleItems.length === 0 ? (
              <div className={s.recentEmpty}>No history yet.</div>
            ) : (
              <AnimatePresence initial={false}>
                {visibleItems.map((it) => (
                  <motion.button
                    key={`${it.mb}:${it.ub}`}
                    layout
                    type="button"
                    className={s.recentItem}
                    onClick={() => handleSelect(it)}
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className={s.recentItemTop}>{it.ub}</div>
                    <div className={s.recentItemSub}>
                      {it.phi ? `Φ${it.phi} · ` : ''}ST {it.st_count}
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ════════════════════════════════════════════
// 박스/시리얼 블록들
// ════════════════════════════════════════════
function BoxBlock({ mb, highlightUb }) {
  const [open, setOpen] = useState(true)
  return (
    <section className={s.mb}>
      <header className={s.mbHeader}>
        <button className={s.mbHeaderBtn} onClick={() => setOpen((o) => !o)}>
          <span className={s.chevron} style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)' }}>▸</span>
          <span className={s.mbLot}>{mb.lot_no}</span>
          <span className={s.mbCount}>UB {mb.ub_count} · ST {mb.st_count}</span>
        </button>
        <DownloadGroup compact />
      </header>
      <Chips chips={mb.model_breakdown} />
      {open && (
        <div className={s.mbBody}>
          {mb.ubs.map((ub) => (
            <UBBlock key={ub.lot_no} ub={ub} highlight={ub.lot_no === highlightUb} />
          ))}
        </div>
      )}
    </section>
  )
}

function UBBlock({ ub, highlight, onBack, mbToken, initialFP, prevUB, nextUB, onNavigate }) {
  const [open, setOpen] = useState(highlight)
  // initialFP — URL `/{token}/{ub}/{fp}` 진입 시 자동으로 그 ST 카드 펼침. URL 변경 시 reset.
  const [selectedSerial, setSelectedSerial] = useState(initialFP || null)
  useEffect(() => {
    setSelectedSerial(initialFP || null)
  }, [initialFP, ub.lot_no])

  // UB 페이지 진입 시 (highlight=true) 최근 본 UB 이력에 푸시 — localStorage FIFO 5개
  // RecentFab 열린 상태에서도 즉시 갱신되게 custom event 발행 (2026-04-29)
  useEffect(() => {
    if (!highlight || !mbToken) return
    try {
      const list = JSON.parse(localStorage.getItem('cert_recent_ubs') || '[]')
      const filtered = list.filter((it) => !(it.mb === mbToken && it.ub === ub.lot_no))
      filtered.unshift({
        mb: mbToken,
        ub: ub.lot_no,
        phi: ub.model_breakdown?.[0]?.phi || '',
        st_count: ub.st_count,
        at: Date.now(),
      })
      const next = filtered.slice(0, 5)
      localStorage.setItem('cert_recent_ubs', JSON.stringify(next))
      // 같은 탭의 RecentFab 에게 갱신 알림 (storage 이벤트는 같은 탭에선 안 발생)
      window.dispatchEvent(new CustomEvent('cert_recent_updated', { detail: next }))
    } catch { /* 차단 환경 무시 */ }
  }, [highlight, mbToken, ub.lot_no])
  // selectedSerial 이 ST 또는 RT 매칭. RT 는 ub.rts (BoxUB 의 RT 시리얼) 에서 (2026-04-29)
  const selectedSt = ub.sts.find((st) => st.serial_no === selectedSerial)
  const selectedRt = !selectedSt
    ? (ub.rts || []).find((rt) => rt.serial_no === selectedSerial)
    : null

  // 박스 레이아웃 — phi + motor_type 기반 (박스 사이즈 통일, ST/RT 직경은 motor 따라 swap)
  const phi = ub.model_breakdown?.[0]?.phi
  const motor = ub.model_breakdown?.[0]?.motor_type
  const layout = _getBoxLayout(phi, motor)
  const stOnRight = motor === 'outer'   // 외전형: RT 좌(큰쪽) / ST 우(작은쪽)

  // ST 자리: 채워진 시리얼 + capacity 까지 빈 자리
  const stSlots = [
    ...ub.sts.slice(0, layout.cols),
    ...Array(Math.max(0, layout.cols - ub.sts.length)).fill(null),
  ]
  // RT 자리: BE 응답의 ub.rts (UB 박스에 담긴 RT 시리얼) + 빈 자리 (2026-04-29)
  const rtData = ub.rts || []
  const rtSlots = [
    ...rtData.slice(0, layout.cols),
    ...Array(Math.max(0, layout.cols - rtData.length)).fill(null),
  ]

  return (
    <section className={`${s.ub} ${highlight ? s.ubHighlight : ''}`}>
      <header className={s.ubHeader}>
        {onBack && (
          <button
            type="button"
            className={s.ubBackBtn}
            onClick={onBack}
            aria-label="Back to MB"
            title="Back to MB"
          >
            ◀
          </button>
        )}
        {/* chevron 제거 — UB 페이지에서는 항상 펼쳐짐, 토글 시각 표시 불필요 (사용자 정책 2026-04-29) */}
        <div className={s.ubHeaderBtn}>
          <span className={s.ubLot}>{ub.lot_no}</span>
          <span className={s.ubCount}>ST {ub.st_count}</span>
        </div>
        {/* prev/next UB 이동 — UB 페이지 진입(highlight=true) 시만 노출 (사용자 정책 H) */}
        {highlight && onNavigate && (prevUB || nextUB) && (
          <div className={s.ubNavBtns}>
            <button
              type="button"
              className={s.ubNavBtn}
              onClick={() => prevUB && onNavigate(prevUB.lot_no)}
              disabled={!prevUB}
              aria-label="Previous UB"
              title={prevUB ? prevUB.lot_no : 'No previous'}
            >‹</button>
            <button
              type="button"
              className={s.ubNavBtn}
              onClick={() => nextUB && onNavigate(nextUB.lot_no)}
              disabled={!nextUB}
              aria-label="Next UB"
              title={nextUB ? nextUB.lot_no : 'No next'}
            >›</button>
          </div>
        )}
        {/* DownloadGroup 제거 — 사용자 정책 J: MB 헤더에만 유지 (2026-04-29) */}
      </header>
      {/* phi chip 제거 — 내부 인덱싱이라 외부 노출 불필요 (2026-04-27 v3) */}
      {open && (
        <>
          <BoxFrame
            layout={layout}
            phi={phi}
            motor={motor}
            stSlots={stSlots}
            rtSlots={rtSlots}
            stOnRight={stOnRight}
            selectedSerial={selectedSerial}
            onSelect={(serial) => setSelectedSerial((cur) => (cur === serial ? null : serial))}
          />
          <AnimatePresence mode="wait">
            {selectedSt && <STDataSheet key={`st:${selectedSt.serial_no}`} st={selectedSt} />}
            {selectedRt && <RTDataSheet key={`rt:${selectedRt.serial_no}`} rt={selectedRt} />}
          </AnimatePresence>
        </>
      )}
    </section>
  )
}

// ════════════════════════════════════════════
// BoxFrame — 박스 outline + 안 ST/RT 동그라미 (실제 mm 비율 mini-rendering)
// 박스 가로 = 100% 기준, 동그라미 width = (지름/박스가로) × 100%.
// compact 박스 (Φ70/Φ87) — ST + RT 가로 한 줄.
// 다중 자리 (Φ45/Φ20) — ST 행 + RT 행 (위/아래).
// ════════════════════════════════════════════
function BoxFrame({ layout, phi, motor, stSlots, rtSlots, stOnRight, selectedSerial, onSelect }) {
  const aspect = `${layout.boxW} / ${layout.boxH}`
  const stPct = (layout.stD / layout.boxW) * 100
  const rtPct = (layout.rtD / layout.boxW) * 100

  if (layout.compact) {
    // ST + RT 한 줄. stOnRight 면 RT 먼저, ST 뒤
    const ordered = stOnRight
      ? [{ kind: 'rt', list: rtSlots }, { kind: 'st', list: stSlots }]
      : [{ kind: 'st', list: stSlots }, { kind: 'rt', list: rtSlots }]
    return (
      <div className={s.boxFrame} style={{ aspectRatio: aspect }}>
        <div className={s.boxFrameLine}>
          {ordered.flatMap(({ kind, list }) =>
            list.map((slot, i) => {
              const sizePct = kind === 'st' ? stPct : rtPct
              return kind === 'st' && slot ? (
                <BoxItemFilled
                  key={`${kind}-${slot.serial_no}`}
                  st={slot}
                  sizePct={sizePct}
                  selected={selectedSerial === slot.serial_no}
                  onClick={() => onSelect(slot.serial_no)}
                  phi={phi}
                  motor={motor}
                />
              ) : kind === 'rt' && slot ? (
                // RT 채워짐 — 도면 명확히 표시 + 클릭 가능 (RTDataSheet 표시, 2026-04-29)
                <BoxItemEmpty
                  key={`rt-${slot.serial_no}`}
                  kind="rt"
                  sizePct={sizePct}
                  phi={phi}
                  motor={motor}
                  filled
                  selected={selectedSerial === slot.serial_no}
                  onClick={() => onSelect(slot.serial_no)}
                />
              ) : (
                <BoxItemEmpty
                  key={`${kind}-empty-${i}`}
                  kind={kind}
                  sizePct={sizePct}
                  phi={phi}
                  motor={motor}
                />
              )
            })
          )}
        </div>
      </div>
    )
  }

  // 다중 자리 — ST 행 위, RT 행 아래
  return (
    <div className={s.boxFrame} style={{ aspectRatio: aspect }}>
      <div className={s.boxFrameLine}>
        {stSlots.map((slot, i) =>
          slot ? (
            <BoxItemFilled
              key={`st-${slot.serial_no}`}
              st={slot}
              sizePct={stPct}
              selected={selectedSerial === slot.serial_no}
              onClick={() => onSelect(slot.serial_no)}
              phi={phi}
              motor={motor}
            />
          ) : (
            <BoxItemEmpty key={`st-empty-${i}`} kind="st" sizePct={stPct} phi={phi} motor={motor} />
          )
        )}
      </div>
      <div className={s.boxFrameLine}>
        {rtSlots.map((slot, i) => (
          <BoxItemEmpty
            key={slot ? `rt-${slot.serial_no}` : `rt-empty-${i}`}
            kind="rt"
            sizePct={rtPct}
            phi={phi}
            motor={motor}
            filled={!!slot}
            selected={!!slot && selectedSerial === slot.serial_no}
            onClick={slot ? () => onSelect(slot.serial_no) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

// 박스 안 채움 자리 (ST, 양품) — 클릭 시 datasheet 토글
// SVG 도면 있으면 표시, 없으면 회색 dot fallback
function BoxItemFilled({ st, sizePct, selected, onClick, phi, motor }) {
  const [imgError, setImgError] = useState(false)
  const src = _drawingSrc(phi, motor, 'stator')
  const hasImg = src && !imgError
  return (
    <button
      type="button"
      className={`${s.stItem} ${s.stItemFilled} ${selected ? s.stItemSelected : ''}`}
      style={{
        width: `${sizePct}%`,
        background: hasImg ? 'transparent' : undefined,
        borderColor: hasImg ? 'transparent' : undefined,
      }}
      onClick={onClick}
      title={st.serial_no}
    >
      {hasImg ? (
        <img
          src={src}
          alt=""
          className={s.stItemImg}
          onError={() => setImgError(true)}
          draggable="false"
        />
      ) : (
        <span className={s.stItemDot} />
      )}
    </button>
  )
}

// 박스 안 빈 자리 — RT 자리는 도면 시도, ST 빈 자리는 점선 placeholder
function BoxItemEmpty({ kind, sizePct, phi, motor, filled = false, selected = false, onClick }) {
  // filled — RT 자리 실제 시리얼 매핑된 경우 (2026-04-29). onClick 있으면 button 으로 렌더.
  const [imgError, setImgError] = useState(false)
  const [hovered, setHovered] = useState(false)
  const src = kind === 'rt' ? _drawingSrc(phi, motor, 'rotor') : null
  const hasImg = src && !imgError
  const Tag = onClick ? motion.button : 'span'

  // RT 도면 회전 — useMotionValue 로 직접 제어 (감속 정지 자연스럽게, 2026-04-29)
  //   selected ON  → 1500 deg/s 무한 회전 (= 250 RPM)
  //   selected OFF → 현재 각도에서 +540° 더 돌고 ease-out 으로 천천히 정지
  //   hover         → selected 아닐 때만 살짝 (+18°) 돌아감
  const rotate = useMotionValue(0)
  const isRotor = kind === 'rt' && filled
  useEffect(() => {
    if (!isRotor) return
    let controls
    if (selected) {
      // 무한 회전 — 큰 target 으로 사실상 무한 (linear)
      controls = fmAnimate(rotate, rotate.get() + 100000, {
        duration: 100000 / 1500,    // deg/s = 1500 → 250 RPM
        ease: 'linear',
      })
    } else if (hovered) {
      controls = fmAnimate(rotate, rotate.get() + 18, {
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
      })
    } else {
      // selected 해제 — 감속 (현재 각도에서 +540° 추가, easeOutQuint)
      controls = fmAnimate(rotate, rotate.get() + 540, {
        duration: 1.6,
        ease: [0.16, 1, 0.3, 1],
      })
    }
    return () => controls?.stop()
  }, [selected, hovered, isRotor, rotate])

  const commonProps = {
    className: `${s.stItem} ${s.stItemEmpty} ${kind === 'rt' ? s.stItemRt : ''} ${selected ? s.stItemSelected : ''}`,
    style: {
      width: `${sizePct}%`,
      background: hasImg ? 'transparent' : undefined,
      border: hasImg ? 'none' : undefined,
      cursor: onClick ? 'pointer' : undefined,
    },
    onClick,
    onMouseEnter: onClick ? () => setHovered(true) : undefined,
    onMouseLeave: onClick ? () => setHovered(false) : undefined,
    'aria-hidden': onClick ? undefined : 'true',
    title: onClick ? 'Rotor' : undefined,
  }
  return (
    <Tag {...(onClick ? { type: 'button' } : {})} {...commonProps}>
      {hasImg && (
        <motion.img
          src={src}
          alt=""
          className={`${s.stItemImg} ${filled ? '' : s.stItemImgMuted}`}
          style={isRotor ? { rotate } : undefined}
          onError={() => setImgError(true)}
          draggable="false"
        />
      )}
    </Tag>
  )
}

// ST 데이터시트 카드 — 와이어프레임의 하단 영역 (UB 박스 아래에 등장)
function STDataSheet({ st }) {
  const m = st.measurements
  const judgColor = JUDG_COLOR[m?.judgment] || '#9ca3af'
  return (
    <motion.div
      className={s.stCard}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
    >
      <header className={s.stCardHeader}>
        <div className={s.stCardTitle}>
          <span className={s.stCardSerial}>{st.serial_no}</span>
          {/* 출하 = 양품(OK)만 나가므로 판정 chip 불필요 (2026-04-27 v3) */}
        </div>
        {/* DownloadGroup 제거 — 사용자 정책 J: MB 헤더에만 유지 (2026-04-29) */}
      </header>
      {m ? (
        <div className={s.stCardBody}>
          {/* dim_a~d 는 OqInspection.dim_* CharField — OK/NG/- 판정 문자열 (실측값 아님). raw 표시 */}
          <SheetSection title="Appearance / Dimensions" rows={[
            ['Appearance', m.appearance || '—'],
            // dim_a~d 의미 — etcConst.DIM_LABELS = ['Ring', 'Go/No-go', 'Height', 'Pin']
            ['dim_a (Ring)', m.dim_a || '—'],
            ['dim_b (Go/No-go)', m.dim_b || '—'],
            ['dim_c (Height)', m.dim_c || '—'],
            ['dim_d (Pin)', m.dim_d || '—'],
          ]} />
          <SheetSection title="Electrical Measurements" rows={[
            // R/L/Insulation: |값| ≥ 100 이면 정수, 그 외 소수점 3자리 (2026-04-28)
            ['Resistance R', fmtNum(m.resistance, 'Ω', { intIfLarge: true })],
            // Φ20 박스만 mH 단위, 그 외(Φ87/70/45) μH (사용자 정의 2026-04-27)
            ['Inductance L', fmtNum(m.inductance, m.phi === '20' ? 'mH' : 'μH', { intIfLarge: true })],
            ['Insulation', fmtNum(m.insulation, 'Ω', { intIfLarge: true })],
            // K_T 는 소수점 4자리 고정 (2026-04-28)
            ['K_T', fmtNum(m.k_t_rms, 'Nm/A', { decimals: 4 })],
          ]} />
        </div>
      ) : (
        <p className={s.stEmpty}>No measurement data.</p>
      )}
    </motion.div>
  )
}

// RT 데이터시트 — ST 와 별도 (속성값 다름). 측정 모델 미구현 → "준비 중" placeholder (2026-04-29)
function RTDataSheet({ rt }) {
  return (
    <motion.div
      className={s.stCard}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
    >
      <header className={s.stCardHeader}>
        <div className={s.stCardTitle}>
          <span className={s.stCardSerial}>⚙ {rt.serial_no}</span>
        </div>
      </header>
      <div
        className={s.stCardBody}
        style={{
          padding: '32px 16px',
          textAlign: 'center',
          color: 'var(--color-text-sub, #5f6b7a)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Rotor</div>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          Inspection data is being prepared.
        </div>
      </div>
    </motion.div>
  )
}

function Chips({ chips, small }) {
  if (!chips?.length) return null
  return (
    <div className={`${s.chips} ${small ? s.chipsSmall : ''}`}>
      {chips.map((c, i) => (
        <span
          key={`${c.phi}-${c.motor_type}-${i}`}
          className={s.chip}
          style={c.color_hex ? { background: c.color_hex, borderColor: c.color_hex } : undefined}
        >
          <span className={s.chipLabel}>{c.label}</span>
          <span className={s.chipCount}>
            {(c.ub_count || 0) > 0 ? `UB ${c.ub_count} · ` : ''}{`ST ${c.st_count}`}
          </span>
        </span>
      ))}
    </div>
  )
}

const JUDG_COLOR = {
  OK: '#27ae60',
  FAIL: '#e74c3c',
  PENDING: '#f39c12',
  RECHECK: '#3498db',
  PROBE: '#9b59b6',
}

function SheetSection({ title, rows }) {
  return (
    <div className={s.sect}>
      <div className={s.sectTitle}>{title}</div>
      <dl className={s.sectGrid}>
        {rows.map(([k, v], i) => (
          <div key={`${k}-${i}`} className={s.sectRow}>
            <dt>{k}</dt>
            <dd>{v ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function DownloadGroup({ compact }) {
  // Phase 3: BE 다운로드 엔드포인트 미구현 — UI 만 (disabled)
  const handle = (fmt) => {
    // TODO: 인증된 download endpoint 호출 (PDF/XLSX/JSON 변환)
    alert(`${fmt} download is not yet available.`)
  }
  return (
    <div className={compact ? s.dlGroupCompact : s.dlGroup}>
      <button className={s.dlBtn} onClick={() => handle('PDF')}>PDF</button>
      <button className={s.dlBtn} onClick={() => handle('XLSX')}>XLSX</button>
      <button className={s.dlBtn} onClick={() => handle('JSON')}>JSON</button>
    </div>
  )
}

// ════════════════════════════════════════════
// 헬퍼
// ════════════════════════════════════════════
const _MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

// opts.decimals: 소수점 자리 (default 3)
// opts.intIfLarge: |값| ≥ 100 이면 정수로 표시 (R/L/Insulation 가독성)
function fmtNum(v, unit = '', opts = {}) {
  if (v == null) return '—'
  const num = typeof v === 'number' ? v : parseFloat(v)
  if (Number.isNaN(num)) return '—'
  const decimals = opts.decimals ?? 3
  const useInt = opts.intIfLarge && Math.abs(num) >= 100
  const formatted = useInt ? Math.round(num).toString() : num.toFixed(decimals)
  return `${formatted}${unit ? ' ' + unit : ''}`
}
