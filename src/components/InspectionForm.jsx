// src/components/InspectionForm.jsx
// ★ OQ 검사 입력 폼
// 호출: OQPage.jsx → step='inspect'
// 기능: Wire/Appearance/Dimension/R(3회)/L(3회)/I.T./K_T → judgment 자동 판정
// 구조: 이 파일은 state/logic 관리, 섹션 JSX는 ./InspectionForm/ 하위 컴포넌트에 위임

import { useState, useRef } from 'react'
import NumPad from './NumPad'
import PageHeader from './common/PageHeader'
import s from './InspectionForm.module.css'
import {
  calcKT, JUDGMENT, JUDGMENT_COLORS as JUDGMENT_COLOR_MAP,
  OQ_THRESHOLD_DEFAULTS,
} from '@/constants/etcConst'
import { useModels } from '@/hooks/useModels'
import { isOutOfSpec } from '@/utils/inspectionCheck'
import MotorTypeSection from './InspectionForm/MotorTypeSection'
import Test1Section from './InspectionForm/Test1Section'
import KtSection from './InspectionForm/KtSection'
import LotHistoryModal from './InspectionForm/LotHistoryModal'

// 3회 측정 평균
function avg(arr) {
  const nums = arr.filter((v) => v !== null)
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1000) / 1000
}

export default function InspectionForm({
  phi,
  motorType,
  lotOqNo,
  lotSoNo,           // SO(SM) 번호 — subtitle 에 같이 표시 (2026-04-24)
  initialData = null,
  onSubmit,
  onCancel,
}) {
  // OQ 검사 입력 (전체 통합 — 2026-04-24: testPhase 분리 삭제)
  const d = initialData || {}
  const [wire, setWire] = useState(d.wire_type || '')
  const [appearance, setAppearance] = useState(d.appearance || 'OK')
  // 통전 테스트 (단선/단락) — 다른 OK/NG 토글들과 동일한 default 'OK' 패턴 (2026-04-29)
  const [continuity, setContinuity] = useState(d.continuity || 'OK')
  // 역기전력 측정기 — tds(연구소, 기본) / osc(QC팀 오실로스코프) (2026-05-07)
  // K_T raw 값에 측정기별 미세 오차 있어 어느 기기로 측정했는지 행 단위 기록
  const [bemfDevice, setBemfDevice] = useState(d.bemf_device || 'tds')
  const [dims, setDims] = useState({
    dim_a: d.dim_a || '-',
    dim_b: d.dim_b || 'OK',
    dim_c: d.dim_c || '-',
    dim_d: d.dim_d || 'OK',
  })
  const [rVals, setRVals] = useState([d.r1 ?? null, d.r2 ?? null, d.r3 ?? null])
  const [lVals, setLVals] = useState([d.l1 ?? null, d.l2 ?? null, d.l3 ?? null])
  // insulation 0 = I.T. FAIL 센티넬 (저장 시 'FAIL'→0 변환) — 편집 진입 시 'FAIL' 로 복원
  const [it, setIt] = useState(d.insulation === 0 ? 'FAIL' : (d.insulation ?? null))
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
  // LOT 이력 팝업 (2026-04-24) — subtitle 옆 (i) 버튼으로 트리거
  const [historyOpen, setHistoryOpen] = useState(false)
  const [error] = useState(null)
  // 저장 확인 다이얼로그 — 같은 위치 실수 더블탭 방지
  const [pendingSubmit, setPendingSubmit] = useState(null)
  // NumPad 닫힌 직후 ghost click 으로 저장이 실수로 눌리는 것 방지 (ms 타임스탬프)
  const numPadClosedAtRef = useRef(0)

  // motor_type → spec 실시간 반영
  // PHI_SPECS.max / OQ_SPEC → DB ModelRegistry 로 이관 (2026-04-24 PR-8/9)
  // DB 매핑: polePairs→pole_pairs, r→r_ref, l→l_ref, lUnit→l_unit, ktRef→kt_ref
  // 기존 OQ_SPEC null == "기준 없음" → DB 에서는 pole_pairs=0 / r_ref=null / kt_ref=null 로 표현
  // Test1Section 이 spec.r / spec.l 을 직접 참조하므로 legacy shape 로 normalize 하여 전달
  const { findModel } = useModels()
  const model = motor ? findModel(phi, motor) : null
  const rRef = model?.r_ref ?? null
  const lRef = model?.l_ref ?? null
  const polePairsNum = model?.pole_pairs ?? 0
  const ktRefVal = model?.kt_ref ?? null
  // 검사 임계값 (2026-06-02 재구조화: 상하한 대칭 4단계) — model 에 없으면 DEFAULTS fallback.
  const t = { ...OQ_THRESHOLD_DEFAULTS, ...(model || {}) }
  // R / L / Kt 각 항목 × 방향(low/high) × 단계(warn/fail) = 12 변수
  const rLowWarnPct  = t.r_low_warn_pct,  rLowFailPct  = t.r_low_fail_pct
  const rHighWarnPct = t.r_high_warn_pct, rHighFailPct = t.r_high_fail_pct
  const lLowWarnPct  = t.l_low_warn_pct,  lLowFailPct  = t.l_low_fail_pct
  const lHighWarnPct = t.l_high_warn_pct, lHighFailPct = t.l_high_fail_pct
  const ktLowWarnPct  = t.kt_low_warn_pct,  ktLowFailPct  = t.kt_low_fail_pct
  const ktHighWarnPct = t.kt_high_warn_pct, ktHighFailPct = t.kt_high_fail_pct
  // 기존 "기준 없음" 판정: polePairs===0 || rRef==null → spec 을 null 로 내려 Test1Section 이 기준표시 생략
  const hasSpec = polePairsNum > 0 && rRef != null
  const spec = hasSpec
    ? {
        r: rRef, l: lRef, lUnit: model?.l_unit || 'mH',
        polePairs: polePairsNum, ktRef: ktRefVal,
        // 임계값 4단계로 spec 동봉 — Test1Section/KtSection 에 그대로 전달
        rLowWarnPct, rLowFailPct, rHighWarnPct, rHighFailPct,
        lLowWarnPct, lLowFailPct, lHighWarnPct, lHighFailPct,
      }
    : null
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
        // NumPad 닫힌 시각 기록 — 이후 500ms 이내 저장 클릭 무시 (ghost click 방지)
        numPadClosedAtRef.current = Date.now()
        if (nextField !== null) {
          // 체인: 현재 NumPad 닫고 다음 NumPad 오픈 (1 tick 지연 — ghost click 방지)
          setTimeout(() => openKtCell(nextRow, nextField), 80)
        }
      },
    })
  }

  // K_T 자동 계산
  // 정책: P5(2000 RPM, ktRows[4])만 필수. P1~P4는 선택 — null이면 calcKT가 자동 스킵
  // P5 4컬럼이 모두 채워지면 계산/판정 대상이 됨
  const ktP5 = ktRows[4]
  const ktP5Filled =
    ktP5 && ktP5.freq !== null && ktP5.peak1 !== null && ktP5.peak2 !== null && ktP5.rms !== null
  const polePairs = spec?.polePairs || null
  const ktCalc =
    ktP5Filled && polePairs
      ? calcKT(
          ktRows.map((r) => r.freq),
          ktRows.map((r) => r.rms),
          ktRows.map((r) => r.peak1),
          ktRows.map((r) => r.peak2),
          polePairs,
        )
      : { keRms: null, kePeak: null, ktRms: null, ktPeak: null }
  const ktRef = spec?.ktRef || null
  // K_T 편차 % (음수 = 미달, 양수 = 초과). null = 계산 불가
  const ktDeviationPct =
    ktRef && ktCalc.ktRms !== null ? ((ktCalc.ktRms - ktRef) / ktRef) * 100 : null
  // K_T 판정 (2026-06-02 재구조화: 상하한 대칭 4단계).
  //   ktLowFailPct  : 미달 N% 초과 → FAIL  (0 = 비활성)
  //   ktLowWarnPct  : 미달 N% 시작 경고  (0 = 비활성)
  //   ktHighFailPct : 초과 N% 초과 → FAIL  (0 = 비활성)
  //   ktHighWarnPct : 초과 N% 시작 경고  (0 = 비활성)
  const ktFail =
    ktDeviationPct !== null && ktLowFailPct > 0 && ktDeviationPct < -ktLowFailPct
  const ktOver =
    ktDeviationPct !== null && ktHighFailPct > 0 && ktDeviationPct > ktHighFailPct
  const ktWarning =
    ktDeviationPct !== null &&
    (
      // 하한 경고 영역 (-ktLowWarnPct ~ -ktLowFailPct)
      (ktLowWarnPct > 0 && ktDeviationPct < -ktLowWarnPct &&
        (ktLowFailPct <= 0 || ktDeviationPct >= -ktLowFailPct))
      // 상한 경고 영역 (+ktHighWarnPct ~ +ktHighFailPct)
      || (ktHighWarnPct > 0 && ktDeviationPct > ktHighWarnPct &&
        (ktHighFailPct <= 0 || ktDeviationPct <= ktHighFailPct))
    )

  // ── 저장 (예상 판정 미리보기: 전부 입력 → OK/FAIL, 미완성 → PENDING) ──
  // 판정 권한은 BE 단독 (2026-05-23) — 아래 judgment 는 확인 다이얼로그 표시용 미리보기일 뿐.
  // 최종 판정은 서버가 재계산. BE oq_inspection_service._compute_judgment 와 규칙 동기 필수.
  const handleSave = () => {
    // NumPad 닫히자마자 발생하는 ghost click 차단 (500ms 가드)
    if (Date.now() - numPadClosedAtRef.current < 500) return
    const rAvg = avg(rVals)
    const lAvg = avg(lVals)
    const allFilled = wire && rAvg !== null && lAvg !== null && it !== null && ktP5Filled

    // PROBE(수동 "조사 중" 상태)는 BE 가 재저장 시에도 보존 — 미리보기도 동일하게 표시
    let judgment
    if (d.judgment === JUDGMENT.PROBE) {
      judgment = JUDGMENT.PROBE
    } else if (!allFilled) {
      judgment = JUDGMENT.PENDING
    } else {
      const appFail = appearance === 'NG'
      const continuityFail = continuity === 'NG'
      const dimFail = Object.values(dims).some((v) => v === 'NG')
      const itFail = it === JUDGMENT.FAIL
      // R/L 각 항목 — 하한 FAIL OR 상한 FAIL (2026-06-02 대칭 재사용 패턴 제거)
      const rFail = !!spec && rVals.some((v) =>
        isOutOfSpec(v, spec.r, { lowFailPct: spec.rLowFailPct, highFailPct: spec.rHighFailPct }))
      const lFail = !!spec && lVals.some((v) =>
        isOutOfSpec(v, spec.l, { lowFailPct: spec.lLowFailPct, highFailPct: spec.lHighFailPct }))
      if (appFail || continuityFail || dimFail || itFail || rFail || lFail || ktFail || ktOver) {
        judgment = JUDGMENT.FAIL
      } else if (dims.dim_c === '-') {
        // Height(dim_c) 미측정 — OK 불가, ST(FP) 시리얼 미발급 (2026-05-23)
        judgment = JUDGMENT.PENDING
      } else {
        judgment = JUDGMENT.OK
      }
    }

    // 확인 다이얼로그용 payload 생성 → 실제 onSubmit은 사용자가 확인 버튼 누를 때 호출
    const payload = {
      phi,
      motor_type: motor || '',
      wire_type: wire || '',
      appearance,
      continuity,
      bemf_device: bemfDevice,
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
      // 자동 산출 결과 보존 — 사용자가 다이얼로그에서 다른 판정으로 바꿔도 옵션 셋이 안 줄어들게.
      // BE 전송 시엔 handleConfirmSubmit 에서 제외 (2026-05-26).
      _autoJudgment: judgment,
    }
    // 바로 제출하지 않고 확인 단계로 — 같은 위치 더블탭 방지 (오입력 방지)
    setPendingSubmit(payload)
  }

  // 확인 다이얼로그 '확인' 버튼 → 실제 제출
  // 판정은 BE 가 측정값으로 단독 산출 — FE 는 입력값만 전송 (2026-05-23)
  const handleConfirmSubmit = () => {
    if (!pendingSubmit) return
    // 내부 보존 필드(_autoJudgment) 는 BE 로 안 보냄
    const { _autoJudgment, ...payload } = pendingSubmit
    onSubmit(payload)
    setPendingSubmit(null)
  }

  const handleCancelConfirm = () => {
    setPendingSubmit(null)
  }

  // ── 현재 평균 ──
  const rAvg = avg(rVals)
  const lAvg = avg(lVals)

  const titleText = 'OQ 검사 입력'
  // Φ20 · inner · {SO번호} · {OQ번호}  — SO 번호 같이 노출 (2026-04-24)
  // SO LOT 번호가 이미 "SM..." 또는 "SA..." 로 시작하므로 "SM " prefix 붙이면 "SM SM..." 중복
  const subtitleParts = [
    `Φ${phi}`,
    motorType || null,
    lotSoNo || null,
    lotOqNo || null,
  ].filter(Boolean)

  // LOT 이력 (i) 아이콘 — SO 번호 있을 때만 노출. 클릭 시 간단 팝업
  // 각 part 를 inline-block + nowrap 으로 감싸서 LOT 번호가 중간에서 잘리지 않고
  // 항목 단위로만 줄바꿈되게 (2026-04-24 모바일 대응)
  const subtitleNode = (
    <>
      {subtitleParts.map((part, i) => (
        <span
          key={i}
          style={{ display: 'inline-block', whiteSpace: 'nowrap' }}
        >
          {i > 0 && <span style={{ margin: '0 6px', color: 'var(--color-gray-light)' }}>·</span>}
          {part}
        </span>
      ))}
      {lotSoNo && (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          aria-label="LOT 이력 보기"
          title="LOT 이력 보기"
          style={{
            marginLeft: 6,
            width: 18,
            height: 18,
            padding: 0,
            border: 'none',
            borderRadius: '50%',
            background: 'var(--color-primary)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            lineHeight: '18px',
            cursor: 'pointer',
            verticalAlign: 'middle',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          i
        </button>
      )}
    </>
  )

  return (
    <div className={`page-flat ${s.pageFlat}`}>
      <PageHeader
        title={titleText}
        subtitle={subtitleNode}
        onBack={onCancel}
      />

      {/* LOT 이력 간단 팝업 (2026-04-24) — SO 번호 기준 체인/수리/상태 요약 */}
      <LotHistoryModal
        lotSoNo={lotSoNo}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      <MotorTypeSection motor={motor} setMotor={setMotor} noMotorType={noMotorType} />

        <Test1Section
          wire={wire} setWire={setWire}
          appearance={appearance} setAppearance={setAppearance}
          continuity={continuity} setContinuity={setContinuity}
          dims={dims} setDims={setDims}
          it={it} setIt={setIt}
          rVals={rVals} setRVals={setRVals}
          lVals={lVals} setLVals={setLVals}
          rAvg={rAvg} lAvg={lAvg}
          spec={spec} lUnit={lUnit}
          openSlot={openSlot} slotRefs={slotRefs}
        />

        <KtSection
            ktRows={ktRows}
            openKtCell={openKtCell}
            ktP5Filled={ktP5Filled}
            ktCalc={ktCalc}
            ktRef={ktRef}
            ktFail={ktFail}
            ktWarning={ktWarning}
            ktDeviationPct={ktDeviationPct}
            polePairs={polePairs}
            ktLowWarnPct={ktLowWarnPct}
            ktLowFailPct={ktLowFailPct}
            ktHighWarnPct={ktHighWarnPct}
            ktHighFailPct={ktHighFailPct}
            bemfDevice={bemfDevice}
            setBemfDevice={setBemfDevice}
          />

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

      {/* 저장 확인 다이얼로그 — 같은 위치 더블탭 오입력 방지 (모달 중앙 배치)
          판정은 BE 가 측정값으로 단독 산출 — FE 는 예상 판정만 표시 (2026-05-23) */}
      {pendingSubmit && (() => {
        const j = pendingSubmit.judgment
        const descMap = {
          [JUDGMENT.OK]:      '합격 예상 — 서버 판정이 OK 면 ST 번호 발급 + 라벨이 출력됩니다.',
          [JUDGMENT.PENDING]: '미완료 — 입력이 남아 있어요. 임시 저장 후 이어서 작성할 수 있어요.',
          [JUDGMENT.FAIL]:    '불합격 예상 — 이 모터는 출하 대상에서 제외됩니다.',
          [JUDGMENT.PROBE]:   '조사 중 — 원인 파악이 필요한 검사로 저장됩니다.',
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
                예상 판정: <b style={{ color: JUDGMENT_COLOR_MAP[j] }}>{j}</b>
              </p>
              <p className={s.confirmDesc}>{descMap[j]}</p>
              {/* 판정 변경 (2026-05-26 사용자 요청) — default 는 자동 산출 그대로.
                    · PENDING 자동 산출 → [PENDING · FAIL · PROBE] 3택
                    · FAIL  자동 산출 → [FAIL · PROBE] 2택
                    · PROBE 자동 산출 → [FAIL · PROBE] 2택  (이전 PROBE 보존도 가능)
                    · OK 는 ST 발급 자동 흐름이라 변경 불가 (셀렉터 미노출). */}
              {pendingSubmit._autoJudgment !== JUDGMENT.OK && (() => {
                const auto = pendingSubmit._autoJudgment
                const opts = auto === JUDGMENT.PENDING
                  ? [JUDGMENT.PENDING, JUDGMENT.FAIL, JUDGMENT.PROBE]
                  : [JUDGMENT.FAIL, JUDGMENT.PROBE]
                return (
                  <div className={s.confirmJudgPick}>
                    <span className={s.confirmJudgLabel}>저장 판정</span>
                    <div className={s.confirmJudgBtns}>
                      {opts.map((o) => (
                        <button
                          key={o}
                          type="button"
                          className={`${s.confirmJudgBtn} ${j === o ? s.confirmJudgBtnActive : ''}`}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            setPendingSubmit((p) => ({ ...p, judgment: o }))
                          }}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })()}
              <p className={s.confirmDesc}>
                ※ 최종 판정은 서버가 측정값과 모델 기준으로 결정합니다.
              </p>

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
