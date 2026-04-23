// components/TracePage/InspectionGrid.jsx
// OQ 검사 결과 상세 그리드 (2026-04-24)
// SO/FP 엔티티의 inspection 필드 렌더 — 판정/R/L/I.T./K_T 5포인트 전부

import s from './InspectionGrid.module.css'

const JUDGMENT_COLORS = {
  OK: 'var(--color-success, #27ae60)',
  FAIL: 'var(--color-error, #e74c3c)',
  PENDING: '#f39c12',
  RECHECK: '#3498db',
  PROBE: '#9b59b6',
}

const fmtNum = (v, digits = 3) => {
  if (v == null || v === '') return '-'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return n.toFixed(digits)
}

const fmtTime = (iso) => {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return iso }
}

export default function InspectionGrid({ inspection }) {
  if (!inspection) return null
  const insp = inspection
  const jColor = JUDGMENT_COLORS[insp.judgment] || 'var(--color-gray)'

  // K_T 5포인트 row 변환
  const ktRows = [1, 2, 3, 4, 5].map((i) => ({
    idx: i,
    freq: insp[`kt_freq_${i}`],
    peak1: insp[`kt_peak1_${i}`],
    peak2: insp[`kt_peak2_${i}`],
    rms: insp[`kt_rms_${i}`],
  }))

  return (
    <div className={s.section}>
      <div className={s.sectionHeader}>
        <h3 className={s.sectionTitle}>OQ 검사 결과</h3>
        <span className={s.judgBadge} style={{ background: jColor }}>
          {insp.judgment || '-'}
        </span>
      </div>

      {/* 기본 정보 행 */}
      <div className={s.basicRow}>
        <div className={s.basicItem}>
          <span className={s.basicKey}>OQ</span>
          <span className={s.basicVal}>{insp.lot_oq_no || '-'}</span>
        </div>
        {insp.serial_no && (
          <div className={s.basicItem}>
            <span className={s.basicKey}>ST</span>
            <span className={s.basicVal}>{insp.serial_no}</span>
          </div>
        )}
        <div className={s.basicItem}>
          <span className={s.basicKey}>Φ</span>
          <span className={s.basicVal}>{insp.phi || '-'}</span>
        </div>
        <div className={s.basicItem}>
          <span className={s.basicKey}>Motor</span>
          <span className={s.basicVal}>{insp.motor_type || '-'}</span>
        </div>
        <div className={s.basicItem}>
          <span className={s.basicKey}>Wire</span>
          <span className={s.basicVal}>{insp.wire_type || '-'}</span>
        </div>
        <div className={s.basicItem}>
          <span className={s.basicKey}>단계</span>
          <span className={s.basicVal}>{insp.test_phase ?? '-'}</span>
        </div>
      </div>

      {/* 외관 / 치수 */}
      <div className={s.subGrid}>
        <div className={s.subCard}>
          <h4 className={s.subTitle}>외관 / 치수</h4>
          <div className={s.kvRow}><span>외관</span><b>{insp.appearance || '-'}</b></div>
          <div className={s.kvRow}><span>A</span><b>{insp.dim_a || '-'}</b></div>
          <div className={s.kvRow}><span>B</span><b>{insp.dim_b || '-'}</b></div>
          <div className={s.kvRow}><span>C</span><b>{insp.dim_c || '-'}</b></div>
          <div className={s.kvRow}><span>D</span><b>{insp.dim_d || '-'}</b></div>
        </div>

        {/* 저항 R */}
        <div className={s.subCard}>
          <h4 className={s.subTitle}>저항 R (Ω)</h4>
          <div className={s.kvRow}><span>R1</span><b>{fmtNum(insp.r1)}</b></div>
          <div className={s.kvRow}><span>R2</span><b>{fmtNum(insp.r2)}</b></div>
          <div className={s.kvRow}><span>R3</span><b>{fmtNum(insp.r3)}</b></div>
          <div className={`${s.kvRow} ${s.kvAvg}`}><span>평균</span><b>{fmtNum(insp.resistance)}</b></div>
        </div>

        {/* 인덕턴스 L */}
        <div className={s.subCard}>
          <h4 className={s.subTitle}>인덕턴스 L</h4>
          <div className={s.kvRow}><span>L1</span><b>{fmtNum(insp.l1)}</b></div>
          <div className={s.kvRow}><span>L2</span><b>{fmtNum(insp.l2)}</b></div>
          <div className={s.kvRow}><span>L3</span><b>{fmtNum(insp.l3)}</b></div>
          <div className={`${s.kvRow} ${s.kvAvg}`}><span>평균</span><b>{fmtNum(insp.inductance)}</b></div>
        </div>

        {/* 절연 I.T. */}
        <div className={s.subCard}>
          <h4 className={s.subTitle}>절연 I.T.</h4>
          <div className={s.kvRow}>
            <span>I.T.</span>
            <b>{insp.insulation != null ? fmtNum(insp.insulation, 0) : '-'}</b>
          </div>
        </div>
      </div>

      {/* K_T 5포인트 */}
      <div className={s.subCard}>
        <h4 className={s.subTitle}>K_T 5포인트</h4>
        <table className={s.ktTable}>
          <thead>
            <tr>
              <th>#</th><th>Freq</th><th>Peak1</th><th>Peak2</th><th>RMS</th>
            </tr>
          </thead>
          <tbody>
            {ktRows.map((r) => (
              <tr key={r.idx}>
                <td className={s.ktIdx}>{r.idx}</td>
                <td>{fmtNum(r.freq, 0)}</td>
                <td>{fmtNum(r.peak1)}</td>
                <td>{fmtNum(r.peak2)}</td>
                <td>{fmtNum(r.rms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 최종 계산값 */}
      <div className={s.subGrid}>
        <div className={s.subCard}>
          <h4 className={s.subTitle}>K_E</h4>
          <div className={s.kvRow}><span>RMS</span><b>{fmtNum(insp.k_e_rms)}</b></div>
          <div className={s.kvRow}><span>Peak</span><b>{fmtNum(insp.k_e_peak)}</b></div>
        </div>
        <div className={s.subCard}>
          <h4 className={s.subTitle}>K_T</h4>
          <div className={s.kvRow}><span>RMS</span><b>{fmtNum(insp.k_t_rms)}</b></div>
          <div className={s.kvRow}><span>Peak</span><b>{fmtNum(insp.k_t_peak)}</b></div>
        </div>
      </div>

      {insp.remark && (
        <div className={s.remarkBox}>
          <span className={s.remarkLabel}>비고</span>
          <span className={s.remarkText}>{insp.remark}</span>
        </div>
      )}

      <div className={s.footNote}>측정: {fmtTime(insp.created_at)}</div>
    </div>
  )
}
