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
  // 2026-04-27 v2: URL = /{mb_token}/{ub_lot_no} — 1 MB = 1 토큰, UB 식별 평문
  const { token, ub } = useParams()
  const [step, setStep] = useState('intro')   // intro | auth | sheet
  const [session, setSession] = useState(null)
  const [sheetData, setSheetData] = useState(null)
  const [sheetError, setSheetError] = useState(null)

  const sessionKey = `${SESSION_KEY}:${token}:${ub}`

  // sessionStorage 캐시 — 같은 (token, ub) 로 재진입 시 PW 스킵
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(sessionKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed?.token) {
          setSession(parsed)
          setStep('sheet')
        }
      }
    } catch { /* sessionStorage 차단 환경 — 무시 */ }
  }, [sessionKey])

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

  if (!token || !ub) return <Navigate to="/" replace />

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

  const { ob, ub } = data

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
          <div className={s.sheetOb}>{ub.lot_no}</div>
          {ob?.shipped_at && (
            <div className={s.sheetMeta}>Shipped: {fmtDate(ob.shipped_at)}</div>
          )}
        </div>
        <DownloadGroup compact />
      </header>

      {/* UB 진입자에게는 그 UB 만 보여줌 — 다른 UB/MB 트리 노출 X (2026-04-27 v3) */}
      <UBBlock ub={ub} highlight />

      <footer className={s.sheetFooter}>
        <p className={s.footerText}>
          This certificate verifies the inspection record of every product in this box.
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
  // RT 자리: 같은 수, BE 매핑 미연결 → placeholder
  const rtSlots = Array(layout.cols).fill(null)

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
            {selectedSt && <STDataSheet key={selectedSt.serial_no} st={selectedSt} />}
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
        {rtSlots.map((_, i) => (
          <BoxItemEmpty key={`rt-${i}`} kind="rt" sizePct={rtPct} phi={phi} motor={motor} />
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
function BoxItemEmpty({ kind, sizePct, phi, motor }) {
  const [imgError, setImgError] = useState(false)
  const src = kind === 'rt' ? _drawingSrc(phi, motor, 'rotor') : null
  const hasImg = src && !imgError
  return (
    <span
      className={`${s.stItem} ${s.stItemEmpty} ${kind === 'rt' ? s.stItemRt : ''}`}
      style={{
        width: `${sizePct}%`,
        background: hasImg ? 'transparent' : undefined,
        border: hasImg ? 'none' : undefined,
      }}
      aria-hidden="true"
    >
      {hasImg && (
        <img
          src={src}
          alt=""
          className={`${s.stItemImg} ${s.stItemImgMuted}`}
          onError={() => setImgError(true)}
          draggable="false"
        />
      )}
    </span>
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
        <DownloadGroup compact />
      </header>
      {m ? (
        <div className={s.stCardBody}>
          <SheetSection title="Appearance / Dimensions" rows={[
            ['Appearance', m.appearance || '—'],
            ['dim_a', fmtNum(m.dim_a, 'mm')],
            ['dim_b', fmtNum(m.dim_b, 'mm')],
            ['dim_c', fmtNum(m.dim_c, 'mm')],
            ['dim_d', fmtNum(m.dim_d, 'mm')],
          ]} />
          <SheetSection title="Electrical Measurements" rows={[
            ['Resistance R', fmtNum(m.resistance, 'Ω')],
            // Φ20 박스만 mH 단위, 그 외(Φ87/70/45) μH (사용자 정의 2026-04-27)
            ['Inductance L', fmtNum(m.inductance, m.phi === '20' ? 'mH' : 'μH')],
            ['Insulation', fmtNum(m.insulation, 'Ω')],
            ['K_T', fmtNum(m.k_t_rms, 'Nm/A')],
          ]} />
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
