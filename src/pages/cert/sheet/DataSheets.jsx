// pages/cert/sheet/DataSheets.jsx
// ST/RT 데이터시트 + Chips + SheetSection (CertFlow 분할, 2026-05-08)

import { motion } from 'framer-motion'
import { fmtNum, JUDG_COLOR } from '../lib/format'
import s from '../CertFlow.module.css'

// ST 데이터시트 카드 — 와이어프레임의 하단 영역 (UB 박스 아래에 등장)
export function STDataSheet({ st }) {
  const m = st.measurements
  const _judgColor = JUDG_COLOR[m?.judgment] || '#9ca3af'   // 현재 미사용 — 출하=양품만 (2026-04-27 v3)
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
          <SheetSection
            title="Appearance / Dimensions"
            rows={[
              ['Appearance', m.appearance || '—'],
              // dim_a~d 의미 — etcConst.DIM_LABELS = ['Ring', 'Go/No-go', 'Height', 'Pin']
              ['dim_a (Ring)', m.dim_a || '—'],
              ['dim_b (Go/No-go)', m.dim_b || '—'],
              ['dim_c (Height)', m.dim_c || '—'],
              ['dim_d (Pin)', m.dim_d || '—'],
            ]}
          />
          <SheetSection
            title="Electrical Measurements"
            rows={[
              // R/L/Insulation: |값| ≥ 100 이면 정수, 그 외 소수점 3자리 (2026-04-28)
              ['Resistance R', fmtNum(m.resistance, 'Ω', { intIfLarge: true })],
              // Φ20 박스만 mH 단위, 그 외(Φ87/70/45) μH (사용자 정의 2026-04-27)
              [
                'Inductance L',
                fmtNum(m.inductance, m.phi === '20' ? 'mH' : 'μH', { intIfLarge: true }),
              ],
              ['Insulation', fmtNum(m.insulation, 'Ω', { intIfLarge: true })],
              // K_T 는 소수점 4자리 고정 (2026-04-28)
              // back_emf 컬럼이 사실 K_T 값 (oq_extra_models.py 의 레거시 별칭, 2026-05-02)
              ['K_T', fmtNum(m.back_emf, 'Nm/A', { decimals: 4 })],
            ]}
          />
        </div>
      ) : (
        <p className={s.stEmpty}>No measurement data.</p>
      )}
    </motion.div>
  )
}

// RT 데이터시트 — ST 와 별도 (속성값 다름). 측정 모델 미구현 → "준비 중" placeholder (2026-04-29)
export function RTDataSheet({ rt }) {
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
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>Inspection data is being prepared.</div>
      </div>
    </motion.div>
  )
}

// 모델 chip 묶음 (BoxBlock 에서 호출되던 — 현재 미사용이지만 export 유지)
export function Chips({ chips, small }) {
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
            {(c.ub_count || 0) > 0 ? `UB ${c.ub_count} · ` : ''}
            {`ST ${c.st_count}`}
          </span>
        </span>
      ))}
    </div>
  )
}

export function SheetSection({ title, rows }) {
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
