// src/components/InspectionForm.jsx
// ★ OQ 검사 입력 폼
// 호출: OQPage.jsx → step='inspect' 에서 렌더링
// 기능: Wire/Appearance/Dimension/R(3회)/L(3회)/I.T./K_T 입력 → judgment 자동 판정

import { useState, useRef } from 'react'
import { FaradayLogo } from './FaradayLogo'
import NumPad from './NumPad'
import s from './InspectionForm.module.css'

// ── 상수 ──
const DIM_KEYS = ['dim_a', 'dim_b', 'dim_c', 'dim_d']
const DIM_LABELS = ['A', 'B', 'C', 'D']
const DIM_OPTIONS = ['OK', 'NG', '-']
const IT_OPTIONS = [125, 250, 500, 1000, 'FAIL']

// 3회 측정 평균 계산
function avg(arr) {
  const nums = arr.filter(v => v !== null)
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1000) / 1000
}

// 클래스 조합 헬퍼
const cx = (...classes) => classes.filter(Boolean).join(' ')


export default function InspectionForm({ phi, lotOqNo, onSubmit, onCancel }) {
  const [wire, setWire] = useState('')
  const [appearance, setAppearance] = useState('OK')
  const [dims, setDims] = useState({ dim_a: 'OK', dim_b: 'OK', dim_c: 'OK', dim_d: 'OK' })
  const [rVals, setRVals] = useState([null, null, null])
  const [lVals, setLVals] = useState([null, null, null])
  const [it, setIt] = useState(null)
  const [kt, setKt] = useState(null)
  const [numPad, setNumPad] = useState(null)
  const [error, setError] = useState(null)

  const lUnit = phi === '20' ? 'mH' : 'µH'
  // ★ Tab 순서 슬롯 ref — R(0,1,2) L(3,4,5) KT(6)
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

  // ── K_T 키패드 (마지막 슬롯) ──
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
    const judgment = (appFail || dimFail || itFail) ? 'FAIL' : 'OK'

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

  // ── 슬롯 공통 렌더 ──
  const renderSlot = (v, i, si, openFn) => (
    <div key={i}
      className={cx(s.slot, v !== null && s.slotFilled)}
      tabIndex={0}
      ref={el => slotRefs.current[si] = el}
      onClick={openFn}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); openFn() } }}>
      {v !== null ? v : `#${i + 1}`}
    </div>
  )

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
              {DIM_OPTIONS.map(opt => (
                <button key={opt}
                  className={btnClass(dims[key] === opt, opt === 'NG')}
                  onClick={() => setDims(d => ({ ...d, [key]: opt }))}>
                  {opt}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* R: 3회 측정 */}
        <div className={s.section}>
          <div className={s.avgCard}>
            <div className={s.avgLabel}>
              <span>R (Ω) — 3회 측정</span>
              {avg(rVals) !== null && <span className={s.avgResult}>평균: {avg(rVals)}</span>}
            </div>
            <div className={s.avgSlots}>
              {rVals.map((v, i) => renderSlot(v, i, i,
                () => openSlot('r', i, rVals, setRVals, 'R', 'Ω', i)
              ))}
            </div>
          </div>
        </div>

        {/* L: 3회 측정 */}
        <div className={s.section}>
          <div className={s.avgCard}>
            <div className={s.avgLabel}>
              <span>L ({lUnit}) — 3회 측정</span>
              {avg(lVals) !== null && <span className={s.avgResult}>평균: {avg(lVals)}</span>}
            </div>
            <div className={s.avgSlots}>
              {lVals.map((v, i) => renderSlot(v, i, 3 + i,
                () => openSlot('l', i, lVals, setLVals, 'L', lUnit, 3 + i)
              ))}
            </div>
          </div>
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