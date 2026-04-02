// src/components/InspectionForm.jsx
// ★ OQ 검사 입력 폼
// 호출: OQPage.jsx → step='inspect'
// 기능: Wire/Appearance/Dimension/R(3회)/L(3회)/I.T./K_T → judgment 자동 판정

import { useState, useRef } from 'react'
import { FaradayLogo } from './FaradayLogo'
import NumPad from './NumPad'
import s from './InspectionForm.module.css'
import { DIM_KEYS, DIM_LABELS, DIM_DISABLED, DIM_OPTIONS, IT_OPTIONS, OQ_SPEC } from '@/constants/etcConst'

// 3회 측정 평균
function avg(arr) {
  const nums = arr.filter(v => v !== null)
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1000) / 1000
}

// ±5% 벗어남 체크 — 기준값 대비 오차율(%) 반환, 이내면 null
function checkDeviation(value, refValue) {
  if (value === null || !refValue) return null
  const pct = Math.abs((value - refValue) / refValue) * 100
  return pct > 5 ? Math.round(pct * 10) / 10 : null
}

// 클래스 조합 헬퍼
const cx = (...classes) => classes.filter(Boolean).join(' ')


export default function InspectionForm({ phi, lotOqNo, onSubmit, onCancel }) {
  const [wire, setWire] = useState('')
  const [appearance, setAppearance] = useState('OK')
  const [dims, setDims] = useState({ dim_a: '-', dim_b: 'OK', dim_c: '-', dim_d: 'OK' })
  const [rVals, setRVals] = useState([null, null, null])
  const [lVals, setLVals] = useState([null, null, null])
  const [it, setIt] = useState(null)
  const [kt, setKt] = useState(null)
  const [numPad, setNumPad] = useState(null)
  const [error, setError] = useState(null)

  const lUnit = phi === '20' ? 'mH' : 'µH'
  const spec = OQ_SPEC[phi]
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

  const openKt = () => {
    setNumPad({
      label: 'K_T', unit: 'Nm/A',
      onConfirm: (v) => { setKt(parseFloat(v)); setNumPad(null) },
    })
  }

  // ── 검사 완료 → 자동 판정 ──
  const handleSubmit = () => {
    if (!wire) return setError('Wire type을 선택하세요')
    const rAvg = avg(rVals)
    const lAvg = avg(lVals)
    if (rAvg === null) return setError('저항(R) 1회 이상 입력하세요')
    if (lAvg === null) return setError('인덕턴스(L) 1회 이상 입력하세요')
    if (it === null) return setError('절연(I.T.)을 선택하세요')

    const appFail = appearance === 'NG'
    const dimFail = Object.values(dims).some(v => v === 'NG')
    const itFail = it === 'FAIL'
    // ★ R/L 기준값 대비 5% 초과 → FAIL
    // ★ 개별 측정값 하나라도 5% 벗어나면 FAIL
    const rFail = spec && rVals.some(v => checkDeviation(v, spec.r) !== null)
    const lFail = spec && lVals.some(v => checkDeviation(v, spec.l) !== null)
    const judgment = (appFail || dimFail || itFail || rFail || lFail) ? 'FAIL' : 'OK'

    onSubmit({
      lot_oq_no: lotOqNo, phi, wire_type: wire, appearance, ...dims,
      r1: rVals[0], r2: rVals[1], r3: rVals[2],
      l1: lVals[0], l2: lVals[1], l3: lVals[2],
      resistance: rAvg, inductance: lAvg,
      insulation: it === 'FAIL' ? 0 : it,
      back_emf: kt, judgment,
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
        <p className={s.title}>OQ 검사 입력</p>
        <p className={s.sub}>Φ{phi} · {lotOqNo}</p>

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

        {/* K_T */}
        <div className={s.section}>
          <span className={s.label}>K_T (Nm/A) — 선택</span>
          <div className={cx(s.ktSlot, kt !== null && s.ktSlotFilled)}
            tabIndex={0}
            ref={el => slotRefs.current[6] = el}
            onClick={openKt}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); openKt() } }}>
            {kt !== null ? kt : '탭하여 입력'}
          </div>
        </div>

        {error && <p className={s.error}>{error}</p>}

        <button className={s.submit} onClick={handleSubmit}>검사 완료</button>
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