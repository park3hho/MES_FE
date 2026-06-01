// pages/process/produce/RMPage.jsx
// RM 원자재 — 강판 / 동선·은선 갈래 (2026-06-01)
//   강판: 기존 흐름 (MaterialSelector RM_STEPS → ConfirmModal)
//   동선/은선: 토스형 wizard (한 화면 한 질문) → WIRE LOT 발급 + QR 라벨 (BE 채번)
//     · 동선(CU): 직경 자유 + 절연 default EIAIW
//     · 은선(AG): 자체제작 — 직경 0.20 고정 · 절연 DIY 고정 → 직경/절연 단계 스킵
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { printLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import {
  WizardShell, Question, BigChoice, PrimaryButton,
} from '@/components/QcWizard'
import {
  RM_STEPS, RM_KINDS,
  WIRE_DIAMETERS, WIRE_INSULATIONS, WIRE_DEFAULTS, wireDiameterToCode,
} from '@/constants/processConst'
import s from './RMPage.module.css'


export default function RMPage({ onLogout, onBack }) {
  const [kind, setKind] = useState(null)   // null=갈래선택, 'steel', 'wire'

  if (!kind) {
    return (
      <div className="page-flat">
        <div className={s.wrap}>
          <h1 className={s.kindTitle}>원자재 입고</h1>
          <p className={s.kindSub}>어떤 원자재인가요?</p>
          <div className={s.kindGrid}>
            {RM_KINDS.map((k) => (
              <button key={k.key} type="button" className={s.kindCard} onClick={() => setKind(k.key)}>
                <span className={s.kindLabel}>{k.label}</span>
                <span className={s.kindDesc}>{k.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (kind === 'steel') return <SteelFlow onLogout={onLogout} onBack={() => setKind(null)} />
  return <WireWizard onBack={() => setKind(null)} />
}


// ════════════════════════════════════════════
// 강판 — 기존 흐름 그대로
// ════════════════════════════════════════════
function SteelFlow({ onLogout, onBack }) {
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('selector')

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${sel.vendor}-${sel.material}-${sel.thickness}`)
    setStep('confirm')
  }
  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, 1, { selected_process: 'RM', rm_kind: 'steel', ...selections })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }
  const handleReset = () => {
    setLotNo(null); setSelections(null)
    setPrinting(false); setDone(false); setError(null)
    setStep('selector')
  }
  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'selector' && (
        <MaterialSelector steps={RM_STEPS} onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={onBack} />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={lotNo} printCount={1}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}


// ════════════════════════════════════════════
// 동선/은선 — 토스형 wizard
// ════════════════════════════════════════════
function WireWizard({ onBack }) {
  const today = new Date().toISOString().slice(0, 10)
  const [stepIdx, setStepIdx] = useState(0)
  const [material, setMaterial] = useState('')          // CU / AG
  const [diameter, setDiameter] = useState('')
  const [insulation, setInsulation] = useState('')
  const [date, setDate] = useState(today)

  const [printing, setPrinting] = useState(false)
  const [doneLot, setDoneLot] = useState(null)
  const [error, setError] = useState(null)

  const isAg = material === 'AG'   // 은선 = 자체제작 (직경0.20·절연DIY 고정)

  // 동적 시퀀스 — 은선은 직경/절연 단계 스킵 (고정값)
  const sequence = useMemo(
    () => (isAg ? ['material', 'date', 'confirm'] : ['material', 'diameter', 'insulation', 'date', 'confirm']),
    [isAg],
  )
  const total = sequence.length
  const key = sequence[stepIdx]

  const yymmdd = date.slice(2).replace(/-/g, '')
  const diamCode = wireDiameterToCode(diameter)
  const valid = material && diamCode && insulation && yymmdd.length === 6
  const preview = valid ? `AW-${material}-${diamCode}-${insulation}-${yymmdd}-NN` : ''

  // 재질 선택 — default 적용 + 진행
  const pickMaterial = (v) => {
    const d = WIRE_DEFAULTS[v]
    setMaterial(v)
    setDiameter(d.diameter)
    setInsulation(d.insulation)
    setStepIdx(1)
  }

  const goNext = () => { if (stepIdx < total - 1) setStepIdx(stepIdx + 1) }
  const goBack = () => { if (stepIdx > 0) setStepIdx(stepIdx - 1); else onBack?.() }

  // 칩 (지나온 답변)
  const CHIP_FMT = {
    material: () => (material === 'CU' ? '동선 (CU)' : material === 'AG' ? '은선 (AG)' : ''),
    diameter: () => diameter,
    insulation: () => insulation,
    date: () => date,
  }
  const chips = sequence.slice(0, stepIdx)
    .map((k, i) => ({ k, i }))
    .filter(({ k }) => CHIP_FMT[k] && CHIP_FMT[k]())
    .map(({ k, i }) => ({
      key: k,
      label: { material: '재질', diameter: '직경', insulation: '절연', date: '입고일' }[k],
      value: String(CHIP_FMT[k]()),
      onClick: () => setStepIdx(i),
    }))

  const onIssue = async () => {
    if (!valid) { setError('입력을 완료하세요.'); return }
    setPrinting(true); setError(null)
    try {
      const res = await printLot(preview, 1, {
        selected_process: 'RM', rm_kind: 'wire',
        wire_material: material, wire_diameter: diamCode,
        wire_insulation: insulation, received_date: yymmdd,
      })
      setDoneLot(res.lot_nums?.[0] || preview)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const onResetAll = () => {
    setDoneLot(null); setError(null); setPrinting(false)
    setMaterial(''); setDiameter(''); setInsulation(''); setDate(today)
    setStepIdx(0)
  }

  // ── 발급 완료 ──
  if (doneLot) {
    return (
      <div className="page-flat">
        <div className={s.wrap}>
          <div className={s.doneWrap}>
            <div className={s.doneIcon}>✓</div>
            <h2 className={s.doneTitle}>라벨 발급 완료</h2>
            <div className={s.doneCode}>{doneLot}</div>
            <div className={s.actions}>
              <button className="btn-primary btn-md" onClick={onResetAll}>새 발급</button>
              <button className="btn-secondary btn-md" onClick={onBack}>원자재 종류 다시 선택</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-flat">
      <WizardShell stepIndex={stepIdx} total={total} onBack={goBack} chips={chips}>
        <AnimatePresence mode="wait">
          <motion.div key={key}
            initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.16 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </WizardShell>
    </div>
  )

  function renderStep() {
    if (key === 'material') {
      return (
        <Question title="어떤 선인가요?" sub="동선 또는 은선을 선택하세요">
          <BigChoice
            value={material}
            onPick={pickMaterial}
            options={[
              { value: 'CU', label: '동선 (CU)', desc: '기본 절연 EIAIW' },
              { value: 'AG', label: '은선 (AG)', desc: '자체제작 · 0.20mm · DIY 고정' },
            ]}
          />
        </Question>
      )
    }

    if (key === 'diameter') {
      return (
        <Question
          title="직경은 몇 mm인가요?"
          sub="자주 쓰는 값 선택 또는 직접 입력"
          footer={<PrimaryButton onClick={goNext} disabled={!diamCode}>다음</PrimaryButton>}
        >
          <div className={s.optRow}>
            {WIRE_DIAMETERS.map((d) => (
              <button key={d} type="button"
                className={`${s.optBtn} ${diameter === d ? s.optBtnOn : ''}`}
                onClick={() => setDiameter(d)}>{d}</button>
            ))}
          </div>
          <input type="number" min="0" step="0.01" className={s.directInput}
            placeholder="직접 입력 (예: 0.45)" value={diameter}
            onChange={(e) => setDiameter(e.target.value)} autoFocus />
        </Question>
      )
    }

    if (key === 'insulation') {
      return (
        <Question
          title="절연 종류는?"
          sub="기본값 EIAIW · 다른 종류면 선택/입력"
          footer={<PrimaryButton onClick={goNext} disabled={!insulation.trim()}>다음</PrimaryButton>}
        >
          <div className={s.optRow}>
            {WIRE_INSULATIONS.map((ins) => (
              <button key={ins} type="button"
                className={`${s.optBtn} ${insulation === ins ? s.optBtnOn : ''}`}
                onClick={() => setInsulation(ins)}>{ins}</button>
            ))}
          </div>
          <input type="text" className={s.directInput}
            placeholder="직접 입력 (예: ESW)" value={insulation}
            onChange={(e) => setInsulation(e.target.value.toUpperCase())} />
        </Question>
      )
    }

    if (key === 'date') {
      return (
        <Question
          title="입고일은 언제인가요?"
          footer={<PrimaryButton onClick={goNext} disabled={yymmdd.length !== 6}>다음</PrimaryButton>}
        >
          <input type="date" className={s.directInput} value={date}
            onChange={(e) => setDate(e.target.value)} autoFocus />
          {isAg && (
            <div className={s.agNote}>
              은선(자체제작) — 직경 <b>0.20mm</b> · 절연 <b>DIY</b> 고정
            </div>
          )}
        </Question>
      )
    }

    // confirm
    return (
      <Question
        title="이대로 발급할까요?"
        footer={<PrimaryButton onClick={onIssue} disabled={printing || !valid}>
          {printing ? '발급 중…' : '라벨 발급'}
        </PrimaryButton>}
      >
        <div className={s.preview}>
          <div className={s.previewLabel}>LOT 미리보기</div>
          <div className={s.previewCode}>{preview || '입력 미완료'}</div>
          <div className={s.previewNote}>NN = 발급 순번 (자동 채번)</div>
        </div>
        {error && <div className={s.err}>{error}</div>}
      </Question>
    )
  }
}
