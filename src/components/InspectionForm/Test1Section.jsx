// OQ Test 1: Wire / Appearance / Dimensions / I.T. / R / L 섹션
import { useState } from 'react'
import s from '../InspectionForm.module.css'
import {
  DIM_KEYS,
  DIM_LABELS,
  DIM_DISABLED,
  DIM_OPTIONS,
  IT_OPTIONS,
} from '@/constants/etcConst'
import { checkDeviation, checkOverLimit, heightVerdict } from '@/utils/inspectionCheck'
import { correctR, TEMP_REF_C } from '@/utils/tempCorrection'

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
  dimCRef,
  dimCLowFailPct,
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
  // 높이 기준 안내 (i) 오버레이 토글 (2026-07-28)
  const [heightInfoOpen, setHeightInfoOpen] = useState(false)

  const btnClass = (active, isRed = false) =>
    cx(s.btn, active && (isRed ? s.btnActiveRed : s.btnActive))

  const itBtnClass = (v) =>
    cx(s.itBtn, it === v && (v === 'FAIL' ? s.itBtnFail : s.itBtnActive))

  // 2026-06-02: lowFailPct/highFailPct 별도 지정 (대칭 재사용 패턴 제거).
  const renderSlot = (v, i, si, openFn, refValue, lowFailPct, highFailPct, offset = 0, factor = 1) => {
    // 보정(리드 offset + 온도 factor, R 전용) — 표시는 원본 v, 판정만 보정값으로
    //   (BE _measurement_fail 과 동일, 2026-07-20 / 온도 2026-08-18)
    const vc = correctR(v, offset, factor)
    const under = checkDeviation(vc, refValue, lowFailPct)
    const over  = checkOverLimit(vc, refValue, highFailPct)
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

  // R 평균 표시 — 보정값으로 통일 (엑셀 R Avg 와 동일, 2026-07-22). 3회 슬롯은 측정 원본 유지.
  const rOff = spec?.rOffset || 0
  const rFactor = spec?.tFactor ?? 1
  const rCorrected = rOff > 0 || rFactor !== 1
  const rAvgShown = (rAvg != null && rCorrected)
    ? Math.round(correctR(rAvg, rOff, rFactor) * 1000) / 1000
    : rAvg
  // 온도 보정률 (%) — 표시용. 1.0364 → +3.6%
  const tempPct = rFactor !== 1 ? Math.round((rFactor - 1) * 1000) / 10 : 0

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

      {/* Dimensions — 높이(dim_c)는 '-' 칸에 실측 입력 + OK/NG 자동 판정 (2026-07-28) */}
      <div className={s.section}>
        <span className={s.label}>Dimensions</span>
        {DIM_KEYS.map((key, i) => {
          // 높이: 스펙(dimCRef) 있으면 실측값으로 OK/NG 자동 판정(클릭 불가), 없으면 수동 OK/NG.
          if (key === 'dim_c') {
            const hasHeightSpec = dimCRef != null
            const verdict = hasHeightSpec
              ? heightVerdict(dimCValue, dimCRef, dimCLowFailPct)
              : dims[key]
            const lowLimit = hasHeightSpec && dimCLowFailPct > 0
              ? Math.round(dimCRef * (1 - dimCLowFailPct / 100) * 100) / 100
              : null
            const hintText = hasHeightSpec
              ? `기준 ≤ ${dimCRef}mm${lowLimit != null ? ` · 하한 −${dimCLowFailPct}% (${lowLimit}mm 이상)` : ''} — 실측 입력 시 자동 판정`
              : '높이 기준 미설정 — OK/NG 수동 선택 + 실측 입력(필수)'
            return (
              <div key={key} className={s.dimGrid}>
                <span className={cx(s.dimLabel, s.heightLabelWrap)}>
                  {DIM_LABELS[i]}
                  <button
                    type="button"
                    className={s.heightInfoBtn}
                    onClick={() => setHeightInfoOpen((v) => !v)}
                    aria-label="높이 기준 정보"
                    title={hintText}
                  >
                    i
                  </button>
                  {heightInfoOpen && (
                    <span
                      className={s.heightInfoPop}
                      role="tooltip"
                      onClick={() => setHeightInfoOpen(false)}
                    >
                      {hintText}
                    </span>
                  )}
                </span>
                {hasHeightSpec ? (
                  <>
                    <span className={cx(s.btn, s.btnReadonly, verdict === 'OK' && s.btnActive)}>OK</span>
                    <span className={cx(s.btn, s.btnReadonly, verdict === 'NG' && s.btnActiveRed)}>NG</span>
                  </>
                ) : (
                  <>
                    <button
                      className={btnClass(dims[key] === 'OK', false)}
                      onClick={() => setDims((d) => ({ ...d, [key]: 'OK' }))}
                    >
                      OK
                    </button>
                    <button
                      className={btnClass(dims[key] === 'NG', true)}
                      onClick={() => setDims((d) => ({ ...d, [key]: 'NG' }))}
                    >
                      NG
                    </button>
                  </>
                )}
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  className={s.dimHeightInput}
                  value={dimCValue ?? ''}
                  onChange={(e) => setDimCValue(e.target.value === '' ? null : parseFloat(e.target.value))}
                  placeholder="높이 mm"
                />
              </div>
            )
          }
          return (
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
          )
        })}
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
                <span className={s.avgResult}>평균: {rAvgShown}</span>
                {spec && (() => {
                  // 2026-06-02: 상하한 별도 임계 (대칭 재사용 제거)
                  const rOff = spec.rOffset || 0
                  const f = spec.tFactor ?? 1
                  const underVals = rVals.map((v) => checkDeviation(correctR(v, rOff, f), spec.r, spec.rLowFailPct)).filter((x) => x !== null)
                  const overVals  = rVals.map((v) => checkOverLimit(correctR(v, rOff, f), spec.r, spec.rHighFailPct)).filter((x) => x !== null)
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
                spec?.rOffset || 0,
                spec?.tFactor ?? 1,
              ),
            )}
          </div>
          {/* 보정 표시 — 판정·K_M 은 보정값으로 계산하고 3회 슬롯은 측정 원본을 그대로 보여준다.
              (리드 2026-07-22 / 온도 2026-08-18) */}
          {rCorrected && (
            <p className={s.offsetNote}>
              {rOff > 0 && <>리드 보정 −{rOff} Ω</>}
              {rOff > 0 && rFactor !== 1 && ' · '}
              {rFactor !== 1 && (
                <>
                  온도 보정 {spec.measuredTemp}℃ → {TEMP_REF_C}℃ ({tempPct > 0 ? '+' : ''}{tempPct}%)
                  {spec.tempKept && <> · 측정 당시 온도 유지</>}
                </>
              )}
              {' · '}3회 값은 측정 원본, 평균·판정·K_M은 보정값
            </p>
          )}
          {/* R 이 저장값과 달라졌으면 갱신을 권한다 — 자동으로 바꾸지는 않는다(저장 화면 체크박스) */}
          {spec?.rChanged && spec?.tempKept && (
            <p className={s.offsetNote}>
              ⚠ 선간저항이 이전 값과 다릅니다. 다시 측정한 것이라면 저장할 때
              <b> 온도 갱신</b>을 체크하세요 (지금은 {spec.tempPrev}℃ 기준 유지).
            </p>
          )}
          {/* 온도를 못 구했을 때만 경고 — 보정 없이 판정된다는 사실을 검사자가 알아야 한다 */}
          {spec && (spec.tFactor ?? 1) === 1 && spec.tempReason && (
            <p className={s.offsetNote}>⚠ 온도 보정 미적용 — {spec.tempReason}</p>
          )}
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
