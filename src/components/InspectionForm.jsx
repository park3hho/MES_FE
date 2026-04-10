// src/components/InspectionForm.jsx
// ★ OQ 검사 입력 폼
// 호출: OQPage.jsx → step='inspect'
// 기능: Wire/Appearance/Dimension/R(3회)/L(3회)/I.T./K_T → judgment 자동 판정

import { useState, useRef } from 'react'
import { FaradayLogo } from './FaradayLogo'
import NumPad from './NumPad'
import s from './InspectionForm.module.css'
import { DIM_KEYS, DIM_LABELS, DIM_DISABLED, DIM_OPTIONS, IT_OPTIONS, OQ_SPEC, calcKT } from '@/constants/etcConst'

// 3회 측정 평균
function avg(arr) {
  const nums = arr.filter(v => v !== null)
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1000) / 1000
}

// 하한 -5% 체크 — 기준값 대비 아래로 5% 초과 시 오차율(%) 반환, 이내 or 상한 초과는 null
// (상한 초과는 허용 — 밸런스가 안무너지면 OK)
function checkDeviation(value, refValue) {
  if (value === null || !refValue) return null
  const pct = (value - refValue) / refValue * 100  // 음수 = 기준 미달
  return pct < -5 ? Math.round(Math.abs(pct) * 10) / 10 : null
}

// 클래스 조합 헬퍼
const cx = (...classes) => classes.filter(Boolean).join(' ')


export default function InspectionForm({ phi, motorType, lotOqNo, testPhase = 0, initialData = null, onSubmit, onCancel }) {
  // testPhase: 0 = 전체(하위호환), 1 = R/L/I.T.만, 2 = K_T만
  // initialData: 기존 검사 데이터 (수정 모드 프리필)
  const d = initialData || {}
  const [wire, setWire] = useState(d.wire_type || '')
  const [appearance, setAppearance] = useState(d.appearance || 'OK')
  const [dims, setDims] = useState({
    dim_a: d.dim_a || '-', dim_b: d.dim_b || 'OK',
    dim_c: d.dim_c || '-', dim_d: d.dim_d || 'OK',
  })
  const [rVals, setRVals] = useState([d.r1 ?? null, d.r2 ?? null, d.r3 ?? null])
  const [lVals, setLVals] = useState([d.l1 ?? null, d.l2 ?? null, d.l3 ?? null])
  const [it, setIt] = useState(d.insulation ?? null)
  // K_T 5포인트 측정
  const emptyRow = () => ({ freq: null, peak1: null, peak2: null, rms: null })
  const [ktRows, setKtRows] = useState([
    { freq: d.kt_freq_1 ?? null, peak1: d.kt_peak1_1 ?? null, peak2: d.kt_peak2_1 ?? null, rms: d.kt_rms_1 ?? null },
    { freq: d.kt_freq_2 ?? null, peak1: d.kt_peak1_2 ?? null, peak2: d.kt_peak2_2 ?? null, rms: d.kt_rms_2 ?? null },
    { freq: d.kt_freq_3 ?? null, peak1: d.kt_peak1_3 ?? null, peak2: d.kt_peak2_3 ?? null, rms: d.kt_rms_3 ?? null },
    { freq: d.kt_freq_4 ?? null, peak1: d.kt_peak1_4 ?? null, peak2: d.kt_peak2_4 ?? null, rms: d.kt_rms_4 ?? null },
    { freq: d.kt_freq_5 ?? null, peak1: d.kt_peak1_5 ?? null, peak2: d.kt_peak2_5 ?? null, rms: d.kt_rms_5 ?? null },
  ])
  const [numPad, setNumPad] = useState(null)
  const [error, setError] = useState(null)

  // motor_type이 있어야 정확한 기준값 조회 가능 — 없으면 null (자유값 처리)
  const spec = motorType ? (OQ_SPEC[`${phi}_${motorType}`] ?? null) : null
  const noMotorType = !motorType  // 경고 표시용
  const lUnit = spec?.lUnit ?? (phi === '20' ? 'mH' : 'µH')
  const slotRefs = useRef([])

  // ── 슬롯 열기 → 확인 후 다음 슬롯 자동 포커스 ──
  const openSlot = (target, idx, vals, setVals, label, unit, slotIndex) => {
    setNumPad({
      label: `${label} #${idx + 1}`,
      unit,
      onConfirm: (v) => {
        const next = [...vals]
        next[idx] = parseFloat(v)
        setVals(next)
        setNumPad(null)
        if (slotIndex != null && slotIndex + 1 < 7) {
          setTimeout(() => slotRefs.current[slotIndex + 1]?.focus(), 100)
        }
      },
    })
  }

  // K_T 5포인트 셀 입력
  const KT_FIELDS = ['freq', 'peak1', 'peak2', 'rms']
  const openKtCell = (rowIdx, field, label, unit) => {
    setNumPad({
      label: `#${rowIdx + 1} ${label}`,
      unit,
      onConfirm: (v) => {
        setKtRows(prev => prev.map((row, i) =>
          i === rowIdx ? { ...row, [field]: parseFloat(v) } : row
        ))
        setNumPad(null)
        // 다음 셀로 자동 포커스 (TAB 순서: freq→peak1→peak2→rms→다음행 freq)
        const fi = KT_FIELDS.indexOf(field)
        const nextFi = fi + 1
        const nextTabIdx = nextFi < 4
          ? rowIdx * 4 + nextFi + 100
          : (rowIdx + 1) * 4 + 100
        setTimeout(() => {
          const el = document.querySelector(`[tabindex="${nextTabIdx}"]`)
          if (el) el.focus()
        }, 50)
      },
    })
  }

  // K_T 자동 계산
  const ktComplete = ktRows.every(r => r.freq !== null && r.peak1 !== null && r.peak2 !== null && r.rms !== null)
  const polePairs = spec?.polePairs || null
  const ktCalc = ktComplete && polePairs
    ? calcKT(
        ktRows.map(r => r.freq), ktRows.map(r => r.rms),
        ktRows.map(r => r.peak1), ktRows.map(r => r.peak2), polePairs
      )
    : { keRms: null, kePeak: null, ktRms: null, ktPeak: null }
  const ktRef = spec?.ktRef || null
  const ktFail = ktRef && ktCalc.ktRms !== null && ((ktCalc.ktRms - ktRef) / ktRef * 100) < -5

  // ── 검사 완료 → 자동 판정 ──
  const handleSubmit = () => {
    // 테스트 1: R/L/I.T. 검증만
    if (testPhase !== 2) {
      if (!wire) return setError('Wire type을 선택하세요')
      const rAvg = avg(rVals)
      const lAvg = avg(lVals)
      if (rAvg === null) return setError('저항(R) 1회 이상 입력하세요')
      if (lAvg === null) return setError('인덕턴스(L) 1회 이상 입력하세요')
      if (it === null) return setError('절연(I.T.)을 선택하세요')

      if (testPhase === 1) {
        // 테스트 1만 — K_T 없이 판정
        const appFail = appearance === 'NG'
        const dimFail = Object.values(dims).some(v => v === 'NG')
        const itFail = it === 'FAIL'
        const rFail = spec && rVals.some(v => checkDeviation(v, spec.r) !== null)
        const lFail = spec && lVals.some(v => checkDeviation(v, spec.l) !== null)
        const judgment = (appFail || dimFail || itFail || rFail || lFail) ? 'FAIL' : 'OK'

        return onSubmit({
          phi, motor_type: motorType || '', wire_type: wire, appearance, ...dims,
          r1: rVals[0], r2: rVals[1], r3: rVals[2],
          l1: lVals[0], l2: lVals[1], l3: lVals[2],
          resistance: avg(rVals), inductance: avg(lVals),
          insulation: it === 'FAIL' ? 0 : it,
          judgment,
        })
      }
    }

    // 테스트 2: K_T 검증만
    if (testPhase === 2) {
      if (!ktComplete) return setError('K_T 5포인트를 모두 입력하세요')
      const judgment = ktFail ? 'FAIL' : 'OK'

      return onSubmit({
        phi, motor_type: motorType || '',
        kt_freq_1: ktRows[0].freq, kt_freq_2: ktRows[1].freq, kt_freq_3: ktRows[2].freq, kt_freq_4: ktRows[3].freq, kt_freq_5: ktRows[4].freq,
        kt_peak1_1: ktRows[0].peak1, kt_peak1_2: ktRows[1].peak1, kt_peak1_3: ktRows[2].peak1, kt_peak1_4: ktRows[3].peak1, kt_peak1_5: ktRows[4].peak1,
        kt_peak2_1: ktRows[0].peak2, kt_peak2_2: ktRows[1].peak2, kt_peak2_3: ktRows[2].peak2, kt_peak2_4: ktRows[3].peak2, kt_peak2_5: ktRows[4].peak2,
        kt_rms_1: ktRows[0].rms, kt_rms_2: ktRows[1].rms, kt_rms_3: ktRows[2].rms, kt_rms_4: ktRows[3].rms, kt_rms_5: ktRows[4].rms,
        k_e_rms: ktCalc.keRms, k_e_peak: ktCalc.kePeak,
        k_t_rms: ktCalc.ktRms, k_t_peak: ktCalc.ktPeak,
        judgment,
      })
    }

    // testPhase=0 (하위 호환): 전체
    if (!ktComplete) return setError('K_T 5포인트를 모두 입력하세요')
    const appFail = appearance === 'NG'
    const dimFail = Object.values(dims).some(v => v === 'NG')
    const itFail = it === 'FAIL'
    const rFail = spec && rVals.some(v => checkDeviation(v, spec.r) !== null)
    const lFail = spec && lVals.some(v => checkDeviation(v, spec.l) !== null)
    const judgment = (appFail || dimFail || itFail || rFail || lFail || ktFail) ? 'FAIL' : 'OK'

    onSubmit({
      lot_oq_no: lotOqNo, phi, motor_type: motorType || '', wire_type: wire, appearance, ...dims,
      r1: rVals[0], r2: rVals[1], r3: rVals[2],
      l1: lVals[0], l2: lVals[1], l3: lVals[2],
      resistance: avg(rVals), inductance: avg(lVals),
      insulation: it === 'FAIL' ? 0 : it,
      kt_freq_1: ktRows[0].freq, kt_freq_2: ktRows[1].freq, kt_freq_3: ktRows[2].freq, kt_freq_4: ktRows[3].freq, kt_freq_5: ktRows[4].freq,
      kt_peak1_1: ktRows[0].peak1, kt_peak1_2: ktRows[1].peak1, kt_peak1_3: ktRows[2].peak1, kt_peak1_4: ktRows[3].peak1, kt_peak1_5: ktRows[4].peak1,
      kt_peak2_1: ktRows[0].peak2, kt_peak2_2: ktRows[1].peak2, kt_peak2_3: ktRows[2].peak2, kt_peak2_4: ktRows[3].peak2, kt_peak2_5: ktRows[4].peak2,
      kt_rms_1: ktRows[0].rms, kt_rms_2: ktRows[1].rms, kt_rms_3: ktRows[2].rms, kt_rms_4: ktRows[3].rms, kt_rms_5: ktRows[4].rms,
      k_e_rms: ktCalc.keRms, k_e_peak: ktCalc.kePeak,
      k_t_rms: ktCalc.ktRms, k_t_peak: ktCalc.ktPeak,
      back_emf: ktCalc.ktRms,
      judgment,
    })
  }

  // ── 클래스 헬퍼 ──
  const btnClass = (active, isRed = false) =>
    cx(s.btn, active && (isRed ? s.btnActiveRed : s.btnActive))

  const itBtnClass = (v) =>
    cx(s.itBtn, it === v && (v === 'FAIL' ? s.itBtnFail : s.itBtnActive))

  const renderSlot = (v, i, si, openFn, refValue) => {
    const dev = checkDeviation(v, refValue)
    return (
      <div key={i}
        className={cx(s.slot, v !== null && (dev ? s.slotWarn : s.slotFilled))}
        tabIndex={0}
        ref={el => slotRefs.current[si] = el}
        onClick={openFn}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); openFn() } }}>
        {v !== null ? v : `#${i + 1}`}
      </div>
    )
  }

  // ── 현재 평균 + 편차 ──
  const rAvg = avg(rVals)
  const lAvg = avg(lVals)
  const rDev = checkDeviation(rAvg, spec?.r)
  const lDev = checkDeviation(lAvg, spec?.l)

  return (
    <div className={s.page}>
      <div className={s.card}>
        <FaradayLogo size="md" />
        <p className={s.title}>{testPhase === 2 ? 'OQ Test 2 — K_T 측정' : testPhase === 1 ? 'OQ Test 1 — R/L/I.T.' : 'OQ 검사 입력'}</p>
        <p className={s.sub}>Φ{phi}{motorType ? ` · ${motorType}` : ''} · {lotOqNo}</p>
        {noMotorType && (
          <p style={{ color: 'var(--color-danger)', fontSize: 'var(--font-sm)', margin: '4px 0 0' }}>
            모터 종류 미지정 — R/L 기준값 없이 진행됩니다
          </p>
        )}

        {/* ═══ 테스트 1 섹션 (testPhase !== 2) ═══ */}
        {testPhase !== 2 && <>
        {/* Wire type */}
        <div className={s.section}>
          <span className={s.label}>Wire type</span>
          <div className={s.row}>
            <button className={btnClass(wire === 'copper')} onClick={() => setWire('copper')}>Copper</button>
            <button className={btnClass(wire === 'silver')} onClick={() => setWire('silver')}>Silver</button>
          </div>
        </div>

        {/* Appearance */}
        <div className={s.section}>
          <span className={s.label}>Appearance</span>
          <div className={s.row}>
            <button className={btnClass(appearance === 'OK')} onClick={() => setAppearance('OK')}>OK</button>
            <button className={btnClass(appearance === 'NG', true)} onClick={() => setAppearance('NG')}>NG</button>
          </div>
        </div>

        {/* Dimensions */}
        <div className={s.section}>
          <span className={s.label}>Dimensions</span>
          {DIM_KEYS.map((key, i) => (
            <div key={key} className={s.dimGrid}>
              <span className={s.dimLabel}>{DIM_LABELS[i]}</span>
              {DIM_DISABLED[i] ? (
                <span className={s.dimDisabled}>-</span>
              ) : (
                DIM_OPTIONS.map(opt => (
                  <button key={opt}
                    className={btnClass(dims[key] === opt, opt === 'NG')}
                    onClick={() => setDims(d => ({ ...d, [key]: opt }))}>
                    {opt}
                  </button>
                ))
              )}
            </div>
          ))}
        </div>

        {/* I.T. 절연 */}
        <div className={s.section}>
          <span className={s.label}>I.T. (절연)</span>
          <div className={s.itRow}>
            {IT_OPTIONS.map(v => (
              <button key={v} className={itBtnClass(v)} onClick={() => setIt(v)}>
                {v === 'FAIL' ? 'FAIL' : `${v}V`}
              </button>
            ))}
          </div>
        </div>

        {/* R: 3회 측정 + 기준치 + 경고 */}
        <div className={s.section}>
          <div className={s.avgCard}>
            <div className={s.avgLabel}>
              <span>
                R (Ω) — 3회 측정
                {spec && <span className={s.refValue}>기준: {spec.r}</span>}
              </span>
              {rAvg !== null && (
                <span>
                  <span className={s.avgResult}>평균: {rAvg}</span>
                  {spec && rVals.filter(v => checkDeviation(v, spec.r) !== null).length > 0 && (
                    <span className={s.warning}>⚠ 기준 초과 {rVals.filter(v => checkDeviation(v, spec.r) !== null).length}건</span>
                  )}
                </span>
              )}
            </div>
            <div className={s.avgSlots}>
              {rVals.map((v, i) => renderSlot(v, i, i,
                () => openSlot('r', i, rVals, setRVals, 'R', 'Ω', i),
                spec?.r
              ))}
            </div>
          </div>
        </div>

        {/* L: 3회 측정 + 기준치 + 경고 */}
        <div className={s.section}>
          <div className={s.avgCard}>
            <div className={s.avgLabel}>
              <span>
                L ({lUnit}) — 3회 측정
                {spec && <span className={s.refValue}>기준: {spec.l}</span>}
              </span>
              {lAvg !== null && (
                <span>
                  <span className={s.avgResult}>평균: {lAvg}</span>
                  {spec && lVals.filter(v => checkDeviation(v, spec.l) !== null).length > 0 && (
                    <span className={s.warning}>⚠ 기준 초과 {lVals.filter(v => checkDeviation(v, spec.l) !== null).length}건</span>
                  )}
                </span>
              )}
            </div>
            <div className={s.avgSlots}>
              {lVals.map((v, i) => renderSlot(v, i, 3 + i,
                () => openSlot('l', i, lVals, setLVals, 'L', lUnit, 3 + i),
                spec?.l
              ))}
            </div>
          </div>
        </div>
        </>}

        {/* ═══ 테스트 2 섹션 (testPhase !== 1) ═══ */}
        {testPhase !== 1 && <>
        {/* K_T 5포인트 측정 */}
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
              <span className={s.ktCol} style={{ flex: 0.4 }}>#</span>
              <span className={s.ktCol}>Freq</span>
              <span className={s.ktCol}>Peak1</span>
              <span className={s.ktCol}>Peak2</span>
              <span className={s.ktCol}>RMS</span>
            </div>
            {ktRows.map((row, i) => (
              <div key={i} className={s.ktRow}>
                <span className={s.ktCol} style={{ flex: 0.4, color: '#8a93a8' }}>{i + 1}</span>
                {['freq', 'peak1', 'peak2', 'rms'].map((field, fi) => {
                  const labels = { freq: 'Freq', peak1: 'Peak1', peak2: 'Peak2', rms: 'RMS' }
                  const units = { freq: 'Hz', peak1: 'V', peak2: 'V', rms: 'V' }
                  const tabIdx = i * 4 + fi + 100 // K_T 셀 전용 탭 인덱스
                  return (
                    <div key={field}
                      className={cx(s.ktCell, row[field] !== null && s.ktCellFilled)}
                      tabIndex={tabIdx}
                      onClick={() => openKtCell(i, field, labels[field], units[field])}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openKtCell(i, field, labels[field], units[field])
                        }
                      }}>
                      {row[field] !== null ? row[field] : '-'}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          {/* 계산 결과 */}
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
                </div>
              )}
            </div>
          )}
        </div>

        </>}

        {error && <p className={s.error}>{error}</p>}

        <button className={s.submit} onClick={handleSubmit}>
          {testPhase === 1 ? '테스트 1 저장' : testPhase === 2 ? '테스트 2 완료' : '검사 완료'}
        </button>
        <button className={s.cancel} onClick={onCancel}>취소</button>
      </div>

      {numPad && (
        <NumPad
          label={numPad.label}
          unit={numPad.unit}
          onConfirm={numPad.onConfirm}
          onCancel={() => setNumPad(null)}
        />
      )}
    </div>
  )
}