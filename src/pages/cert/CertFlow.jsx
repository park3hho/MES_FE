// pages/cert/CertFlow.jsx
// 외부 공개 인증서 페이지 — UB QR 진입 → Landing → PW Auth → Data Sheet (2026-04-27)
//
// 라우팅:
//   /          → CertEmpty (token 없이 진입 시 안내)
//   /:token    → CertFlow (intro → auth → sheet 흐름)
//
// 토큰 보존: sessionStorage(per-token key) — 새로고침 시 PW 재입력 안 해도 됨 (1시간 만료)
// LOT 번호 익명화: BE 응답 자체에 RM~OQ 일체 없음. FE 가 표시할 게 없으니 자연스럽게 가림

import { useState, useEffect } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { certAuth, certFetchSheet } from '@/api'
import { PHI_SPECS } from '@/constants/processConst'
import s from './CertFlow.module.css'

const SESSION_KEY = 'cert_session'

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
  const { token } = useParams()
  const [step, setStep] = useState('intro')   // intro | auth | sheet
  const [session, setSession] = useState(null)
  const [sheetData, setSheetData] = useState(null)
  const [sheetError, setSheetError] = useState(null)

  // sessionStorage 캐시 — 같은 토큰으로 재진입 시 PW 스킵
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(`${SESSION_KEY}:${token}`)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed?.token) {
          setSession(parsed)
          setStep('sheet')
        }
      }
    } catch { /* sessionStorage 차단 환경 — 무시 */ }
  }, [token])

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
        sessionStorage.removeItem(`${SESSION_KEY}:${token}`)
        setSession(null)
        setSheetData(null)
        if (e.message?.includes('expired') || e.message?.includes('만료') || e.message?.includes('401')) {
          setStep('auth')
        } else {
          setSheetError(e.message || 'Failed to load data')
        }
      })
    return () => { cancelled = true }
  }, [step, session, token])

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
            onAuth={(sess) => {
              try {
                sessionStorage.setItem(`${SESSION_KEY}:${token}`, JSON.stringify(sess))
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
            onLogout={() => {
              sessionStorage.removeItem(`${SESSION_KEY}:${token}`)
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
function CertAuthStep({ token, onAuth }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!pw.trim() || loading) return
    setLoading(true); setError('')
    try {
      const sess = await certAuth(token, pw)
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
function CertSheetStep({ data, error, onLogout }) {
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

  const { ob, scanned_ub, mbs } = data

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
          <div className={s.sheetOb}>{ob.lot_no}</div>
          {ob.shipped_at && (
            <div className={s.sheetMeta}>Shipped: {fmtDate(ob.shipped_at)}</div>
          )}
        </div>
        <DownloadGroup compact />
      </header>

      {mbs.map((mb) => (
        <BoxBlock key={mb.lot_no} mb={mb} highlightUb={scanned_ub} />
      ))}

      <footer className={s.sheetFooter}>
        <p className={s.footerText}>
          This certificate verifies the inspection record of every product in this shipment.
        </p>
        <p className={s.footer}>cert.faraday-dynamics.com</p>
      </footer>
    </motion.div>
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

function UBBlock({ ub, highlight }) {
  const [open, setOpen] = useState(highlight)
  const [selectedSerial, setSelectedSerial] = useState(null)
  const selectedSt = ub.sts.find((st) => st.serial_no === selectedSerial)

  // 박스 capacity — phi 별 PHI_SPECS.max (Φ20=5 / Φ45=3 / Φ70=1 / Φ87=1).
  // 박스 = ST max + RT max (같은 수).
  //   Φ20 = 5×2 grid (ST행 5 + RT행 5)
  //   Φ45 = 3×2 grid
  //   Φ70/Φ87 = 2×1 grid (ST + RT 가로 한 줄, compact 모드)
  const phi = ub.model_breakdown?.[0]?.phi
  const stMax = PHI_SPECS[phi]?.max || ub.sts.length || 1
  const compact = stMax === 1   // 1자리 박스 → ST/RT 가로 한 줄
  // Φ87 박스는 물리 배치상 ST 가 오른쪽 (RT 가 왼쪽). 다른 phi 는 ST 좌 / RT 우.
  // 추후 phi 별 layout 정보를 PHI_SPECS / ModelRegistry 로 이관 예정.
  const stOnRight = phi === '87'

  // ST 자리: 채워진 시리얼 + capacity 까지 빈 자리 채움
  const stSlots = [
    ...ub.sts,
    ...Array(Math.max(0, stMax - ub.sts.length)).fill(null),
  ]
  // RT 자리: ST 와 같은 수. BE 가 박스-RT 매핑 데이터 미보유 → 전부 placeholder
  const rtSlots = Array(stMax).fill(null)

  return (
    <section className={`${s.ub} ${highlight ? s.ubHighlight : ''}`}>
      <header className={s.ubHeader}>
        <button className={s.ubHeaderBtn} onClick={() => setOpen((o) => !o)}>
          <span className={s.chevron} style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)' }}>▸</span>
          <span className={s.ubLot}>{ub.lot_no}</span>
          <span className={s.ubCount}>ST {ub.st_count}</span>
        </button>
        <DownloadGroup compact />
      </header>
      <Chips chips={ub.model_breakdown} small />
      {open && (
        <>
          <div className={`${s.boxRows} ${compact ? s.boxRowsCompact : ''}`}>
            {/* phi 별 ST/RT 자리 순서 — Φ87 은 ST 가 우측 (RT 먼저 렌더) */}
            {stOnRight && (
              <BoxRow label="RT" capacity={stMax}>
                {rtSlots.map((_, i) => (
                  <EmptyCircle key={`rt-${i}`} />
                ))}
              </BoxRow>
            )}
            <BoxRow label="ST" capacity={stMax}>
              {stSlots.map((st, i) =>
                st ? (
                  <STCircle
                    key={st.serial_no}
                    st={st}
                    selected={st.serial_no === selectedSerial}
                    onClick={() => setSelectedSerial((cur) => (cur === st.serial_no ? null : st.serial_no))}
                  />
                ) : (
                  <EmptyCircle key={`st-empty-${i}`} />
                )
              )}
            </BoxRow>
            {!stOnRight && (
              <BoxRow label="RT" capacity={stMax}>
                {rtSlots.map((_, i) => (
                  <EmptyCircle key={`rt-${i}`} />
                ))}
              </BoxRow>
            )}
          </div>
          <AnimatePresence mode="wait">
            {selectedSt && <STDataSheet key={selectedSt.serial_no} st={selectedSt} />}
          </AnimatePresence>
        </>
      )}
    </section>
  )
}

// 박스 행 (ST 또는 RT) — 좌측 라벨 + capacity 만큼 grid
function BoxRow({ label, capacity, children }) {
  return (
    <div className={s.boxRow}>
      <span className={s.boxRowLabel}>{label}</span>
      <div
        className={s.boxGrid}
        style={{ gridTemplateColumns: `repeat(${capacity}, 1fr)` }}
      >
        {children}
      </div>
    </div>
  )
}

// 채워진 ST 자리 — 클릭 시 detail 토글. 양품만 출하되므로 판정 색 구분 X (단순 회색)
function STCircle({ st, selected, onClick }) {
  return (
    <button
      type="button"
      className={`${s.stCircle} ${s.stCircleFilled} ${selected ? s.stCircleSelected : ''}`}
      onClick={onClick}
      title={st.serial_no}
    >
      <span className={s.stCircleDot} />
    </button>
  )
}

// 빈 자리 — RT 전체 + 미충전 ST 자리 (점선 placeholder)
function EmptyCircle() {
  return <span className={`${s.stCircle} ${s.stCircleEmpty}`} aria-hidden="true" />
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
          {m?.judgment && (
            <span className={s.stJudg} style={{ background: judgColor }}>
              {m.judgment}
            </span>
          )}
        </div>
        <DownloadGroup compact />
      </header>
      {m ? (
        <div className={s.stCardBody}>
          <SheetSection title="Appearance / Dimensions" rows={[
            ['Appearance', m.appearance || '—'],
            ['dim_a', fmtNum(m.dim_a)],
            ['dim_b', fmtNum(m.dim_b)],
            ['dim_c', fmtNum(m.dim_c)],
            ['dim_d', fmtNum(m.dim_d)],
          ]} />
          <SheetSection title="Electrical Measurements" rows={[
            ['Resistance R', fmtNum(m.resistance, 'Ω')],
            ['Inductance L', fmtNum(m.inductance, 'mH')],
            ['Insulation', fmtNum(m.insulation, 'MΩ')],
            ['K_T (rms)', fmtNum(m.k_t_rms)],
            ['K_T (peak)', fmtNum(m.k_t_peak)],
            ['K_E (rms)', fmtNum(m.k_e_rms)],
            ['K_E (peak)', fmtNum(m.k_e_peak)],
            ['Back EMF', fmtNum(m.back_emf, 'V')],
          ]} />
          {m.kt_freq?.some((v) => v != null) && (
            <SheetSection title="K_T 5-Point" rows={
              m.kt_freq.map((f, i) => [
                f != null ? `${f} Hz` : '—',
                `peak1 ${fmtNum(m.kt_peak1?.[i])} · peak2 ${fmtNum(m.kt_peak2?.[i])} · rms ${fmtNum(m.kt_rms?.[i])}`,
              ])
            } />
          )}
        </div>
      ) : (
        <p className={s.stEmpty}>No measurement data.</p>
      )}
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

function fmtNum(v, unit = '') {
  if (v == null) return '—'
  const num = typeof v === 'number' ? v : parseFloat(v)
  if (Number.isNaN(num)) return '—'
  return `${num.toFixed(3)}${unit ? ' ' + unit : ''}`
}
