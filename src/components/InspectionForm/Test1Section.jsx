// OQ Test 1: Wire / Appearance / Dimensions / I.T. / R / L 섹션
import s from '../InspectionForm.module.css'
import {
  DIM_KEYS,
  DIM_LABELS,
  DIM_DISABLED,
  DIM_OPTIONS,
  IT_OPTIONS,
} from '@/constants/etcConst'
import { checkDeviation, checkOverLimit } from '@/utils/inspectionCheck'

const cx = (...classes) => classes.filter(Boolean).join(' ')

export default function Test1Section({
  wire,
  setWire,
  appearance,
  setAppearance,
  continuity,
  setContinuity,
  dims,
  setDims,
  dimCValue,
  setDimCValue,
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
  itMinVoltage,
  openSlot,
  slotRefs,
}) {
  const btnClass = (active, isRed = false) =>
    cx(s.btn, active && (isRed ? s.btnActiveRed : s.btnActive))

  const itBtnClass = (v) =>
    cx(s.itBtn, it === v && (v === 'FAIL' ? s.itBtnFail : s.itBtnActive))

  // 2026-06-02: lowFailPct/highFailPct 별도 지정 (대칭 재사용 패턴 제거).
  const renderSlot = (v, i, si, openFn, refValue, lowFailPct, highFailPct) => {
    const under = checkDeviation(v, refValue, lowFailPct)
    const over  = checkOverLimit(v, refValue, highFailPct)
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
          under ? `기준 대비 ${under}% 미달 (FAIL)` :
          over ? `기준 대비 ${over}% 초과 (FAIL)` : ''
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

      {/* 높이(dim_c) 실측 수치 — 필수 (미기입 시 OK 판정 불가, 2026-06-23) */}
      <div className={s.section}>
        <span className={s.label}>높이 실측 (mm) <span style={{ color: 'var(--color-danger)' }}>* 필수</span></span>
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          className="form-input"
          value={dimCValue ?? ''}
          onChange={(e) => setDimCValue(e.target.value === '' ? null : parseFloat(e.target.value))}
          placeholder="예: 12.34 (필수 — 미입력 시 OK 불가)"
        />
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
        {/* 절연 최소전압 경고 (2026-07-14) — 모델 it_min_voltage 미만 선택 시. 경고만, 판정엔 미반영. */}
        {typeof it === 'number' && itMinVoltage > 0 && it < itMinVoltage && (
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: '#c0392b' }}>
            ⚠ 이 모델은 절연 시험 최소 {itMinVoltage}V 권장 — 현재 {it}V
          </div>
        )}
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
                  // 2026-06-02: 상하한 별도 임계 (대칭 재사용 제거)
                  const underVals = rVals.map((v) => checkDeviation(v, spec.r, spec.rLowFailPct)).filter((x) => x !== null)
                  const overVals  = rVals.map((v) => checkOverLimit(v, spec.r, spec.rHighFailPct)).filter((x) => x !== null)
                  const underMax = underVals.length ? Math.max(...underVals) : 0
                  const overMax  = overVals.length  ? Math.max(...overVals)  : 0
                  return (
                    <>
                      {underVals.length > 0 && <span className={s.warning}>⚠ 기준 대비 -{underMax}% 미달 ({underVals.length}건, 허용 -{spec.rLowFailPct}%, FAIL)</span>}
                      {overVals.length  > 0 && <span className={s.warning}>⚠ 기준 대비 +{overMax}% 초과 ({overVals.length}건, 허용 +{spec.rHighFailPct}%, FAIL)</span>}
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
                spec?.rLowFailPct,
                spec?.rHighFailPct,
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
                  const underVals = lVals.map((v) => checkDeviation(v, spec.l, spec.lLowFailPct)).filter((x) => x !== null)
                  const overVals  = lVals.map((v) => checkOverLimit(v, spec.l, spec.lHighFailPct)).filter((x) => x !== null)
                  const underMax = underVals.length ? Math.max(...underVals) : 0
                  const overMax  = overVals.length  ? Math.max(...overVals)  : 0
                  return (
                    <>
                      {underVals.length > 0 && <span className={s.warning}>⚠ 기준 대비 -{underMax}% 미달 ({underVals.length}건, 허용 -{spec.lLowFailPct}%, FAIL)</span>}
                      {overVals.length  > 0 && <span className={s.warning}>⚠ 기준 대비 +{overMax}% 초과 ({overVals.length}건, 허용 +{spec.lHighFailPct}%, FAIL)</span>}
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
                spec?.lLowFailPct,
                spec?.lHighFailPct,
              ),
            )}
          </div>
        </div>
      </div>
    </>
  )
}
