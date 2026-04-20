// src/components/InspectionForm.jsx
// ★ OQ 검사 입력 폼
// 호출: OQPage.jsx → step='inspect'
// 기능: Wire/Appearance/Dimension/R(3회)/L(3회)/I.T./K_T → judgment 자동 판정
// 구조: 이 파일은 state/logic 관리, 섹션 JSX는 ./InspectionForm/ 하위 컴포넌트에 위임

import { useState, useRef } from 'react'
import NumPad from './NumPad'
import PageHeader from './common/PageHeader'
import s from './InspectionForm.module.css'
import { OQ_SPEC, calcKT, JUDGMENT, JUDGMENT_COLORS as JUDGMENT_COLOR_MAP } from '@/constants/etcConst'
import MotorTypeSection from './InspectionForm/MotorTypeSection'
import Test1Section from './InspectionForm/Test1Section'
import KtSection from './InspectionForm/KtSection'

// 3회 측정 평균
function avg(arr) {
  const nums = arr.filter((v) => v !== null)
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1000) / 1000
}

// 하한 -5% 체크 — FAIL 판정 대상
function checkDeviation(value, refValue) {
  if (value === null || !refValue) return null
  const pct = ((value - refValue) / refValue) * 100
  return pct < -5 ? Math.round(Math.abs(pct) * 10) / 10 : null
}

export default function InspectionForm({
  phi,
  motorType,
  lotOqNo,
  testPhase = 0,
  initialData = null,
  onSubmit,
  onCancel,
}) {
  // testPhase: 0 = 전체(하위호환), 1 = R/L/I.T.만, 2 = K_T만
  const d = initialData || {}
  const [wire, setWire] = useState(d.wire_type || '')
  const [appearance, setAppearance] = useState(d.appearance || 'OK')
  const [dims, setDims] = useState({
    dim_a: d.dim_a || '-',
    dim_b: d.dim_b || 'OK',
    dim_c: d.dim_c || '-',
    dim_d: d.dim_d || 'OK',
  })
  const [rVals, setRVals] = useState([d.r1 ?? null, d.r2 ?? null, d.r3 ?? null])
  const [lVals, setLVals] = useState([d.l1 ?? null, d.l2 ?? null, d.l3 ?? null])
  const [it, setIt] = useState(d.insulation ?? null)
  const [ktRows, setKtRows] = useState([
    { freq: d.kt_freq_1 ?? null, peak1: d.kt_peak1_1 ?? null, peak2: d.kt_peak2_1 ?? null, rms: d.kt_rms_1 ?? null },
    { freq: d.kt_freq_2 ?? null, peak1: d.kt_peak1_2 ?? null, peak2: d.kt_peak2_2 ?? null, rms: d.kt_rms_2 ?? null },
    { freq: d.kt_freq_3 ?? null, peak1: d.kt_peak1_3 ?? null, peak2: d.kt_peak2_3 ?? null, rms: d.kt_rms_3 ?? null },
    { freq: d.kt_freq_4 ?? null, peak1: d.kt_peak1_4 ?? null, peak2: d.kt_peak2_4 ?? null, rms: d.kt_rms_4 ?? null },
    { freq: d.kt_freq_5 ?? null, peak1: d.kt_peak1_5 ?? null, peak2: d.kt_peak2_5 ?? null, rms: d.kt_rms_5 ?? null },
  ])
  const [numPad, setNumPad] = useState(null)
  const [motor, setMotor] = useState(d.motor_type || motorType || '')
  const [remark, setRemark] = useState(d.remark || '')
  const [error] = useState(null)
  // 저장 확인 다이얼로그 — 같은 위치 실수 더블탭 방지
  const [pendingSubmit, setPendingSubmit] = useState(null)
  // 판정 수동 오버라이드 (null = 자동 판정 사용, OK는 자동 전용이라 선택 불가)
  const [overrideJudgment, setOverrideJudgment] = useState(null)

  // motor_type → spec 실시간 반영
  const spec = motor ? (OQ_SPEC[`${phi}_${motor}`] ?? null) : null
  const noMotorType = !motor
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

  // K_T 5포인트 셀 입력 — 체인 오픈: 하나 입력하면 다음 셀 NumPad 자동 연결
  // 순서: (row 0 freq) → (row 0 peak1) → (row 0 peak2) → (row 0 rms)
  //     → (row 1 freq) → ... → (row 4 rms) → 종료
  const KT_FIELDS = ['freq', 'peak1', 'peak2', 'rms']
  const KT_LABELS = { freq: 'Freq', peak1: 'Peak1', peak2: 'Peak2', rms: 'RMS' }
  const KT_UNITS = { freq: 'Hz', peak1: 'V', peak2: 'V', rms: 'V' }

  const openKtCell = (rowIdx, field, _label, _unit) => {
    const label = KT_LABELS[field]
    const unit = KT_UNITS[field]
    setNumPad({
      label: `#${rowIdx + 1} ${label}`,
      unit,
      onConfirm: (v) => {
        setKtRows((prev) =>
          prev.map((row, i) => (i === rowIdx ? { ...row, [field]: parseFloat(v) } : row)),
        )
        // 다음 셀 위치 계산
        const fi = KT_FIELDS.indexOf(field)
        let nextRow = rowIdx
        let nextField = null
        if (fi < 3) {
          nextField = KT_FIELDS[fi + 1]      // 같은 row, 다음 field
        } else if (rowIdx < 4) {
          nextRow = rowIdx + 1
          nextField = KT_FIELDS[0]           // 다음 row, freq부터
        }
        setNumPad(null)
        if (nextField !== null) {
          // 체인: 현재 NumPad 닫고 다음 NumPad 오픈 (1 tick 지연 — ghost click 방지)
          setTimeout(() => openKtCell(nextRow, nextField), 80)
        }
      },
    })
  }

  // K_T 자동 계산
  const ktComplete = ktRows.every(
    (r) => r.freq !== null && r.peak1 !== null && r.peak2 !== null && r.rms !== null,
  )
  const polePairs = spec?.polePairs || null
  const ktCalc =
    ktComplete && polePairs
      ? calcKT(
          ktRows.map((r) => r.freq),
          ktRows.map((r) => r.rms),
          ktRows.map((r) => r.peak1),
          ktRows.map((r) => r.peak2),
          polePairs,
        )
      : { keRms: null, kePeak: null, ktRms: null, ktPeak: null }
  const ktRef = spec?.ktRef || null
  const ktFail = ktRef && ktCalc.ktRms !== null && ((ktCalc.ktRms - ktRef) / ktRef) * 100 < -5

  // ── 저장 (자동 판정: 전부 입력 → OK/FAIL, 미완성 → PENDING) ──
  // 단, 기존 상태가 RECHECK/PROBE(유저가 수동 설정한 특별 상태)면 유지
  const handleSave = () => {
    const rAvg = avg(rVals)
    const lAvg = avg(lVals)
    const allFilled = wire && rAvg !== null && lAvg !== null && it !== null && ktComplete

    // 수동 토글로 설정한 상태(RECHECK/PROBE)만 보존
    // FAIL은 수치 기반 자동 판정이므로 수정 시 재계산되어야 함 (FAIL → 값 수정 → OK 가능해야 함)
    const preserveStates = [JUDGMENT.RECHECK, JUDGMENT.PROBE]
    let judgment
    if (preserveStates.includes(d.judgment)) {
      judgment = d.judgment
    } else if (allFilled) {
      const appFail = appearance === 'NG'
      const dimFail = Object.values(dims).some((v) => v === 'NG')
      const itFail = it === JUDGMENT.FAIL
      const rFail = spec && rVals.some((v) => checkDeviation(v, spec.r) !== null)
      const lFail = spec && lVals.some((v) => checkDeviation(v, spec.l) !== null)
      judgment = appFail || dimFail || itFail || rFail || lFail || ktFail ? JUDGMENT.FAIL : JUDGMENT.OK
    } else {
      judgment = JUDGMENT.PENDING
    }

    // 확인 다이얼로그용 payload 생성 → 실제 onSubmit은 사용자가 확인 버튼 누를 때 호출
    const payload = {
      phi,
      motor_type: motor || '',
      wire_type: wire || '',
      appearance,
      ...dims,
      r1: rVals[0], r2: rVals[1], r3: rVals[2],
      l1: lVals[0], l2: lVals[1], l3: lVals[2],
      resistance: rAvg,
      inductance: lAvg,
      insulation: it === 'FAIL' ? 0 : it,
      kt_freq_1: ktRows[0].freq, kt_freq_2: ktRows[1].freq, kt_freq_3: ktRows[2].freq,
      kt_freq_4: ktRows[3].freq, kt_freq_5: ktRows[4].freq,
      kt_peak1_1: ktRows[0].peak1, kt_peak1_2: ktRows[1].peak1, kt_peak1_3: ktRows[2].peak1,
      kt_peak1_4: ktRows[3].peak1, kt_peak1_5: ktRows[4].peak1,
      kt_peak2_1: ktRows[0].peak2, kt_peak2_2: ktRows[1].peak2, kt_peak2_3: ktRows[2].peak2,
      kt_peak2_4: ktRows[3].peak2, kt_peak2_5: ktRows[4].peak2,
      kt_rms_1: ktRows[0].rms, kt_rms_2: ktRows[1].rms, kt_rms_3: ktRows[2].rms,
      kt_rms_4: ktRows[3].rms, kt_rms_5: ktRows[4].rms,
      k_e_rms: ktCalc.keRms,
      k_e_peak: ktCalc.kePeak,
      k_t_rms: ktCalc.ktRms,
      k_t_peak: ktCalc.ktPeak,
      judgment,
      remark: remark.trim(),
    }
    // 바로 제출하지 않고 확인 단계로 — 같은 위치 더블탭 방지 (오입력 방지)
    setPendingSubmit(payload)
  }

  // 확인 다이얼로그 '확인' 버튼 → 실제 제출 (override 적용)
  const handleConfirmSubmit = () => {
    if (pendingSubmit) {
      const final = overrideJudgment
        ? { ...pendingSubmit, judgment: overrideJudgment }
        : pendingSubmit
      onSubmit(final)
      setPendingSubmit(null)
      setOverrideJudgment(null)
    }
  }

  const handleCancelConfirm = () => {
    setPendingSubmit(null)
    setOverrideJudgment(null)
  }

  // ── 현재 평균 ──
  const rAvg = avg(rVals)
  const lAvg = avg(lVals)

  const titleText =
    testPhase === 2
      ? 'OQ Test 2 — K_T 측정'
      : testPhase === 1
        ? 'OQ Test 1 — R/L/I.T.'
        : 'OQ 검사 입력'
  const subtitleText = `Φ${phi}${motorType ? ` · ${motorType}` : ''} · ${lotOqNo}`

  return (
    <div className={`page-flat ${s.pageFlat}`}>
      <PageHeader
        title={titleText}
        subtitle={subtitleText}
        onBack={onCancel}
      />

      <MotorTypeSection motor={motor} setMotor={setMotor} noMotorType={noMotorType} />

        {testPhase !== 2 && (
          <Test1Section
            wire={wire} setWire={setWire}
            appearance={appearance} setAppearance={setAppearance}
            dims={dims} setDims={setDims}
            it={it} setIt={setIt}
            rVals={rVals} setRVals={setRVals}
            lVals={lVals} setLVals={setLVals}
            rAvg={rAvg} lAvg={lAvg}
            spec={spec} lUnit={lUnit}
            openSlot={openSlot} slotRefs={slotRefs}
          />
        )}

        {testPhase !== 1 && (
          <KtSection
            ktRows={ktRows}
            openKtCell={openKtCell}
            ktComplete={ktComplete}
            ktCalc={ktCalc}
            ktRef={ktRef}
            ktFail={ktFail}
            polePairs={polePairs}
          />
        )}

        {/* 비고 (선택) — 특이사항이 있을 때만 입력 */}
        <div className={s.remarkBox}>
          <label className={s.remarkLabel}>비고 (선택)</label>
          <textarea
            className={s.remarkInput}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="특이사항이 있으면 입력 (최대 200자)"
            maxLength={200}
            rows={2}
          />
        </div>

        {error && <p className={s.error}>{error}</p>}

      {/* 하단 sticky 저장 CTA */}
      <div className="sticky-cta">
        <div className="sticky-cta-inner">
          <button className={s.submit} onClick={handleSave}>
            저장
          </button>
        </div>
      </div>

      {numPad && (
        <NumPad
          label={numPad.label}
          unit={numPad.unit}
          onConfirm={numPad.onConfirm}
          onCancel={() => setNumPad(null)}
        />
      )}

      {/* 저장 확인 다이얼로그 — 같은 위치 더블탭 오입력 방지
          (확인 버튼이 저장 버튼과 다른 위치에 렌더되도록 모달 중앙 배치)
          + 판정 수동 오버라이드 (OK 외 상태로 변경 가능) */}
      {pendingSubmit && (() => {
        const autoJ = pendingSubmit.judgment
        const finalJ = overrideJudgment || autoJ
        const isAutoOK = autoJ === JUDGMENT.OK
        // 수동 선택 가능 판정 — OK는 자동 전용이라 제외
        const manualOptions = [
          { key: JUDGMENT.PENDING, label: 'PENDING' },
          { key: JUDGMENT.RECHECK, label: 'RECHECK' },
          { key: JUDGMENT.PROBE,   label: 'PROBE' },
          { key: JUDGMENT.FAIL,    label: 'FAIL' },
        ]
        const descMap = {
          [JUDGMENT.OK]:      'ST 번호 발급 + 라벨 출력',
          [JUDGMENT.PENDING]: 'Pending (임시 저장)',
          [JUDGMENT.RECHECK]: 'Recheck (재검사 대기)',
          [JUDGMENT.PROBE]:   'Probe (문제 조사 중)',
          [JUDGMENT.FAIL]:    'Fail (불합격)',
        }
        return (
          <div
            className={s.confirmOverlay}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) handleCancelConfirm()
            }}
          >
            <div
              className={s.confirmDialog}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <p className={s.confirmTitle}>이 내용으로 저장할까요?</p>
              <p className={s.confirmSub}>
                판정: <b>{finalJ}</b> — {descMap[finalJ]}
              </p>

              {/* 수동 판정 변경 (OK는 자동 전용이라 선택 불가) */}
              <div className={s.judgmentPicker}>
                <span className={s.judgmentPickerLabel}>
                  {isAutoOK ? '수동으로 변경 (OK는 자동 전용):' : '판정 변경 (선택):'}
                </span>
                <div className={s.judgmentChips}>
                  {!isAutoOK && (
                    <button
                      type="button"
                      className={`${s.jChip} ${overrideJudgment === null ? s.jChipOn : ''}`}
                      onPointerDown={(e) => { e.preventDefault(); setOverrideJudgment(null) }}
                    >
                      자동 ({autoJ})
                    </button>
                  )}
                  {manualOptions.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      className={`${s.jChip} ${overrideJudgment === opt.key ? s.jChipOn : ''}`}
                      style={overrideJudgment === opt.key ? { background: JUDGMENT_COLOR_MAP[opt.key], borderColor: JUDGMENT_COLOR_MAP[opt.key] } : undefined}
                      onPointerDown={(e) => { e.preventDefault(); setOverrideJudgment(opt.key) }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={s.confirmBtnRow}>
                <button
                  type="button"
                  className={s.confirmCancel}
                  onPointerDown={(e) => { e.preventDefault(); handleCancelConfirm() }}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={s.confirmOk}
                  onPointerDown={(e) => { e.preventDefault(); handleConfirmSubmit() }}
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
