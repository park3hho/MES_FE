// pages/process/produce/RMPage.jsx
// RM 원자재 — 강판 / 동선·은선 갈래 (2026-06-01)
//   강판: 기존 흐름 (MaterialSelector RM_STEPS → ConfirmModal)
//   동선/은선: 재질·직경·절연·입고일 입력 → WIRE LOT 발급 + QR 라벨 (BE 채번)
import { useState } from 'react'
import { printLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import PageHeader from '@/components/common/PageHeader'
import {
  RM_STEPS, RM_KINDS,
  WIRE_MATERIALS, WIRE_DIAMETERS, WIRE_INSULATIONS, wireDiameterToCode,
} from '@/constants/processConst'
import s from './RMPage.module.css'


export default function RMPage({ onLogout, onBack }) {
  const [kind, setKind] = useState(null)   // null=갈래선택, 'steel', 'wire'

  // ── 갈래 선택 화면 ──
  if (!kind) {
    return (
      <div className="page-flat">
        <div className={s.wrap}>
          <PageHeader title="원자재 입고" subtitle="어떤 원자재인가요?" onBack={onBack} />
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

  if (kind === 'steel') {
    return <SteelFlow onLogout={onLogout} onBack={() => setKind(null)} />
  }
  return <WireFlow onBack={() => setKind(null)} />
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
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
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
// 동선/은선 — 재질·직경·절연·입고일 → WIRE LOT 발급
// ════════════════════════════════════════════
function WireFlow({ onBack }) {
  const today = new Date().toISOString().slice(0, 10)
  const [material, setMaterial] = useState('CU')
  const [diameter, setDiameter] = useState('0.50')
  const [insulation, setInsulation] = useState('PEW')
  const [date, setDate] = useState(today)

  const [printing, setPrinting] = useState(false)
  const [doneLot, setDoneLot] = useState(null)
  const [error, setError] = useState(null)

  const yymmdd = date.slice(2).replace(/-/g, '')          // 2026-06-01 → 260601
  const diamCode = wireDiameterToCode(diameter)            // 0.50 → 050
  const valid = material && diamCode && insulation && yymmdd.length === 6
  const preview = valid
    ? `WIRE-${material}-${diamCode}-${insulation}-${yymmdd}-NN`
    : '입력을 완료하세요'

  const onIssue = async () => {
    if (!valid) { setError('재질 / 직경 / 절연 / 입고일을 모두 입력하세요.'); return }
    setPrinting(true); setError(null)
    try {
      // lot_num 은 BE 가 wire_* 로 재채번 — FE 값은 미리보기 표시용
      const res = await printLot(preview, 1, {
        selected_process: 'RM',
        rm_kind: 'wire',
        wire_material: material,
        wire_diameter: diamCode,
        wire_insulation: insulation,
        received_date: yymmdd,
      })
      setDoneLot(res.lot_nums?.[0] || preview)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const onReset = () => {
    setDoneLot(null); setError(null); setPrinting(false)
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
              <button className="btn-primary btn-md" onClick={onReset}>같은 종류 또 발급</button>
              <button className="btn-secondary btn-md" onClick={onBack}>원자재 종류 다시 선택</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-flat">
      <div className={s.wrap}>
        <PageHeader title="동선 / 은선 입고" subtitle="LOT 발급 + QR 라벨" onBack={onBack} />

        {/* 재질 */}
        <div className={s.field}>
          <div className={s.fieldLabel}>재질</div>
          <div className={s.optRow}>
            {WIRE_MATERIALS.map((m) => (
              <button key={m.value} type="button"
                className={`${s.optBtn} ${material === m.value ? s.optBtnOn : ''}`}
                onClick={() => setMaterial(m.value)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* 직경 — 버튼 + 직접입력 */}
        <div className={s.field}>
          <div className={s.fieldLabel}>직경 (mm)</div>
          <div className={s.optRow}>
            {WIRE_DIAMETERS.map((d) => (
              <button key={d} type="button"
                className={`${s.optBtn} ${diameter === d ? s.optBtnOn : ''}`}
                onClick={() => setDiameter(d)}>
                {d}
              </button>
            ))}
          </div>
          <input type="number" min="0" step="0.01" className={s.directInput}
            placeholder="직접 입력 (예: 0.45)" value={diameter}
            onChange={(e) => setDiameter(e.target.value)} />
        </div>

        {/* 절연 — 버튼 + 직접입력 */}
        <div className={s.field}>
          <div className={s.fieldLabel}>절연 종류</div>
          <div className={s.optRow}>
            {WIRE_INSULATIONS.map((ins) => (
              <button key={ins} type="button"
                className={`${s.optBtn} ${insulation === ins ? s.optBtnOn : ''}`}
                onClick={() => setInsulation(ins)}>
                {ins}
              </button>
            ))}
          </div>
          <input type="text" className={s.directInput}
            placeholder="직접 입력 (예: ESW)" value={insulation}
            onChange={(e) => setInsulation(e.target.value.toUpperCase())} />
        </div>

        {/* 입고일 */}
        <div className={s.field}>
          <div className={s.fieldLabel}>입고일</div>
          <input type="date" className={s.directInput} value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>

        {/* LOT 미리보기 */}
        <div className={s.preview}>
          <div className={s.previewLabel}>LOT 미리보기</div>
          <div className={s.previewCode}>{preview}</div>
          <div className={s.previewNote}>NN = 발급 순번 (자동 채번)</div>
        </div>

        {error && <div className={s.err}>{error}</div>}

        <div className={s.actions}>
          <button className="btn-primary btn-md" onClick={onIssue} disabled={printing || !valid}>
            {printing ? '발급 중…' : '라벨 발급'}
          </button>
        </div>
      </div>
    </div>
  )
}
