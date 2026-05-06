// OQ Test 1: Wire / Appearance / Dimensions / I.T. / R / L 섹션
import s from '../InspectionForm.module.css'
import {
  DIM_KEYS,
  DIM_LABELS,
  DIM_DISABLED,
  DIM_OPTIONS,
  IT_OPTIONS,
} from '@/constants/etcConst'

const cx = (...classes) => classes.filter(Boolean).join(' ')

// 하한 N% 미달 체크 — failPct 초과 미달 시 미달 % (양수) 반환, 통과면 null.
// failPct 0 이거나 refValue 없으면 검사 비활성. (2026-05-06 모델별 동적)
function checkDeviation(value, refValue, failPct) {
  if (value === null || !refValue || !failPct) return null
  const pct = ((value - refValue) / refValue) * 100
  return pct < -failPct ? Math.round(Math.abs(pct) * 10) / 10 : null
}

// 상한 +15% 체크 (의심값 — 측정 실수 가능성)
function checkOverLimit(value, refValue) {
  if (value === null || !refValue) return null
  const pct = ((value - refValue) / refValue) * 100
  return pct > 15 ? Math.round(pct * 10) / 10 : null
}

export default function Test1Section({
  wire,
  setWire,
  appearance,
  setAppearance,
  continuity,
  setContinuity,
  dims,
  setDims,
  it,
  setIt,
  rVals,
  setRVals,
  lVals,
  setLVals,
  rAvg,
  lAvg,
  spec,
  lUnit,
  openSlot,
  slotRefs,
}) {
  const btnClass = (active, isRed = false) =>
    cx(s.btn, active && (isRed ? s.btnActiveRed : s.btnActive))

  const itBtnClass = (v) =>
    cx(s.itBtn, it === v && (v === 'FAIL' ? s.itBtnFail : s.itBtnActive))

  const renderSlot = (v, i, si, openFn, refValue, failPct) => {
    const under = checkDeviation(v, refValue, failPct)
    const over = checkOverLimit(v, refValue)
    const abnormal = under || over
    return (
      <div
        key={i}
        className={cx(s.slot, v !== null && (abnormal ? s.slotWarn : s.slotFilled))}
        tabIndex={0}
        ref={(el) => (slotRefs.current[si] = el)}
        onClick={openFn}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            openFn()
          }
        }}
        title={
          under ? `기준 대비 ${under}% 미달` :
          over ? `기준 대비 ${over}% 초과 (의심 값)` : ''
        }
      >
        {v !== null ? v : `#${i + 1}`}
      </div>
    )
  }

  return (
    <>
      {/* Wire type */}
      <div className={s.section}>
        <span className={s.label}>Wire type</span>
        <div className={s.row}>
          <button className={btnClass(wire === 'copper')} onClick={() => setWire('copper')}>
            Copper
          </button>
          <button className={btnClass(wire === 'silver')} onClick={() => setWire('silver')}>
            Silver
          </button>
        </div>
      </div>

      {/* Appearance */}
      <div className={s.section}>
        <span className={s.label}>Appearance</span>
        <div className={s.row}>
          <button
            className={btnClass(appearance === 'OK')}
            onClick={() => setAppearance('OK')}
          >
            OK
          </button>
          <button
            className={btnClass(appearance === 'NG', true)}
            onClick={() => setAppearance('NG')}
          >
            NG
          </button>
        </div>
      </div>

      {/* Continuity (통전) — 단선/단락 검사 (2026-04-29 추가) */}
      <div className={s.section}>
        <span className={s.label}>통전 (단선/단락)</span>
        <div className={s.row}>
          <button
            className={btnClass(continuity === 'OK')}
            onClick={() => setContinuity('OK')}
          >
            OK
          </button>
          <button
            className={btnClass(continuity === 'NG', true)}
            onClick={() => setContinuity('NG')}
          >
            NG
          </button>
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
              DIM_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={btnClass(dims[key] === opt, opt === 'NG')}
                  onClick={() => setDims((d) => ({ ...d, [key]: opt }))}
                >
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
          {IT_OPTIONS.map((v) => (
            <button key={v} className={itBtnClass(v)} onClick={() => setIt(v)}>
              {v === 'FAIL' ? 'FAIL' : `${v}V`}
            </button>
          ))}
        </div>
      </div>

      {/* R: 3회 측정 */}
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
                {spec && (() => {
                  const underCnt = rVals.filter((v) => checkDeviation(v, spec.r, spec.rFailPct) !== null).length
                  const overCnt  = rVals.filter((v) => checkOverLimit(v, spec.r) !== null).length
                  return (
                    <>
                      {underCnt > 0 && <span className={s.warning}>⚠ {spec.rFailPct}% 초과 미달 {underCnt}건</span>}
                      {overCnt > 0 && <span className={s.warning}>⚠ 15% 초과 {overCnt}건</span>}
                    </>
                  )
                })()}
              </span>
            )}
          </div>
          <div className={s.avgSlots}>
            {rVals.map((v, i) =>
              renderSlot(
                v,
                i,
                i,
                () => openSlot('r', i, rVals, setRVals, 'R', 'Ω', i),
                spec?.r,
                spec?.rFailPct,
              ),
            )}
          </div>
        </div>
      </div>

      {/* L: 3회 측정 */}
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
                {spec && (() => {
                  const underCnt = lVals.filter((v) => checkDeviation(v, spec.l, spec.lFailPct) !== null).length
                  const overCnt  = lVals.filter((v) => checkOverLimit(v, spec.l) !== null).length
                  return (
                    <>
                      {underCnt > 0 && <span className={s.warning}>⚠ {spec.lFailPct}% 초과 미달 {underCnt}건</span>}
                      {overCnt > 0 && <span className={s.warning}>⚠ 15% 초과 {overCnt}건</span>}
                    </>
                  )
                })()}
              </span>
            )}
          </div>
          <div className={s.avgSlots}>
            {lVals.map((v, i) =>
              renderSlot(
                v,
                i,
                3 + i,
                () => openSlot('l', i, lVals, setLVals, 'L', lUnit, 3 + i),
                spec?.l,
                spec?.lFailPct,
              ),
            )}
          </div>
        </div>
      </div>
    </>
  )
}
