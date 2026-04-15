// OQ Test 2: K_T 5포인트 측정 섹션
import s from '../InspectionForm.module.css'

const cx = (...classes) => classes.filter(Boolean).join(' ')

function checkOverLimit(value, refValue) {
  if (value === null || !refValue) return null
  const pct = ((value - refValue) / refValue) * 100
  return pct > 15 ? Math.round(pct * 10) / 10 : null
}

export default function KtSection({
  ktRows,
  openKtCell,
  ktComplete,
  ktCalc,
  ktRef,
  ktFail,
  polePairs,
}) {
  return (
    <div className={s.section}>
      <span className={s.label}>
        K_T 측정 (필수){polePairs ? ` — Pole pairs: ${polePairs}` : ''}
      </span>
      {!polePairs && (
        <p style={{ color: 'var(--color-danger)', fontSize: 11, margin: '0 0 6px' }}>
          pole pairs 미설정 — K_T 자동 계산 불가 (데이터만 수집)
        </p>
      )}
      <div className={s.ktTable}>
        <div className={s.ktHeader}>
          <span className={s.ktCol} style={{ flex: 0.4 }}>
            #
          </span>
          <span className={s.ktCol}>Freq</span>
          <span className={s.ktCol}>Peak1</span>
          <span className={s.ktCol}>Peak2</span>
          <span className={s.ktCol}>RMS</span>
        </div>
        {ktRows.map((row, i) => (
          <div key={i} className={s.ktRow}>
            <span className={s.ktCol} style={{ flex: 0.4, color: '#8a93a8' }}>
              {i + 1}
            </span>
            {['freq', 'peak1', 'peak2', 'rms'].map((field, fi) => {
              const labels = { freq: 'Freq', peak1: 'Peak1', peak2: 'Peak2', rms: 'RMS' }
              const units = { freq: 'Hz', peak1: 'V', peak2: 'V', rms: 'V' }
              const tabIdx = i * 4 + fi + 100
              return (
                <div
                  key={field}
                  className={cx(s.ktCell, row[field] !== null && s.ktCellFilled)}
                  tabIndex={tabIdx}
                  onClick={() => openKtCell(i, field, labels[field], units[field])}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openKtCell(i, field, labels[field], units[field])
                    }
                  }}
                >
                  {row[field] !== null ? row[field] : '-'}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {ktComplete && (
        <div className={s.ktResult}>
          <div className={s.ktResultRow}>
            <span>K_e(RMS): {ktCalc.keRms ?? '-'}</span>
            <span className={ktFail ? s.ktFail : ''}>K_T(RMS): {ktCalc.ktRms ?? '-'}</span>
          </div>
          <div className={s.ktResultRow}>
            <span>K_e(PEAK): {ktCalc.kePeak ?? '-'}</span>
            <span>K_T(PEAK): {ktCalc.ktPeak ?? '-'}</span>
          </div>
          {ktRef && (
            <div className={s.ktResultRow}>
              <span style={{ fontSize: 11, color: '#8a93a8' }}>기준값: {ktRef}</span>
              {ktFail && <span className={s.ktFail}>⚠ 기준 미달 (FAIL)</span>}
              {checkOverLimit(ktCalc.ktRms, ktRef) !== null && (
                <span className={s.warning}>⚠ 15% 초과 (의심 값)</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
