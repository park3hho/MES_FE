// pages/process/produce/REAPage.jsx
// 로터 요크가공 (2026-06-12, Phase 2) — Plate(PI) RM 스캔 → 가공방식/설비 → 로터 모델·묶음 → 발급.
//   BE 프로토콜: selected_process='EA' + line='rotor' (파라미터 라인 분기, 2026-06-12 결정).
//   LOT 은 EA 풀 공유 (라벨 ROTOR 표기, 재고는 rotor_inventory). 'REA' 는 FE 라우팅 키일 뿐.
//   EAPage 패턴 — 로터 모델 선택은 SpecListStep(ST 전용) 대신 인라인 RotorSpecStep (rt/both 모델만).
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAutoReset } from '@/hooks/useAutoReset'
import { printLot } from '@/api'
import { useModels } from '@/hooks/useModels'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useDate } from '@/utils/useDate'
import { REA_STEPS, MOTOR_LABEL } from '@/constants/processConst'
import PageHeader from '@/components/common/PageHeader'

const STEP_ORDER = ['qr', 'selector', 'spec', 'confirm']

const pageVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir * -40 }),
}

export default function REAPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)   // Plate RM LOT
  const [selections, setSelections] = useState(null)
  const [eaList, setEaList] = useState(null)         // [{spec, quantity, motor_type}]
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')
  const [direction, setDirection] = useState(1)

  const goTo = (next) => {
    const cur = STEP_ORDER.indexOf(step)
    setDirection(STEP_ORDER.indexOf(next) > cur ? 1 : -1)
    setStep(next)
  }

  const handleReset = () => {
    setPrevLotNo(null); setSelections(null); setEaList(null)
    setPrinting(false); setDone(false); setError(null)
    setDirection(1); setStep('qr')
  }
  useAutoReset(error, done, handleReset)

  const totalBundles = eaList?.reduce((s, i) => s + i.quantity, 0) || 0

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(`${selections.shape}${selections.vendor}${date}`, 1, {
        selected_process: 'EA',
        line: 'rotor',
        prev_lot_no: prevLotNo,
        ea_list: eaList,
        ...selections,
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  return (
    <AnimatePresence mode="wait" custom={direction}>
      {step === 'qr' && (
        <QRScanner
          processLabel="REA, 로터 요크가공"
          onScan={(val) => { setPrevLotNo(val); goTo('selector') }}
          onLogout={onLogout}
          onBack={onBack}
        />
      )}

      {step === 'selector' && (
        <motion.div key="selector" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <MaterialSelector
            steps={REA_STEPS}
            autoValues={{ date, seq: '00' }}
            onSubmit={(sel) => { setSelections(sel); goTo('spec') }}
            onLogout={onLogout}
            onBack={() => goTo('qr')}
            scannedLot={prevLotNo ? { lot_no: prevLotNo } : null}
          />
        </motion.div>
      )}

      {step === 'spec' && (
        <motion.div key="spec" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <RotorSpecStep
            onConfirm={(list) => { setEaList(list); goTo('confirm') }}
            onBack={() => goTo('selector')}
          />
        </motion.div>
      )}

      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${selections.shape}${selections.vendor}${date}-00`}
          printCount={totalBundles}
          producedUnit="개"
          extraInfo={eaList?.map((i) => `Φ${i.spec} ${MOTOR_LABEL[i.motor_type] || i.motor_type} ${i.quantity}개`).join(', ')}
          printing={printing}
          done={done}
          error={error}
          onConfirm={handleConfirm}
          onCancel={() => goTo('spec')}
        />
      )}
    </AnimatePresence>
  )
}


// 로터 모델 선택 — ModelRegistry rt/both 모델만 (SpecListStep 은 ST 전용이라 별도, 2026-06-12)
function RotorSpecStep({ onConfirm, onBack }) {
  const { models } = useModels()
  const rotorModels = useMemo(
    () => models.filter((m) => m.is_active && (m.rt_st_type === 'rt' || m.rt_st_type === 'both')),
    [models],
  )
  const [list, setList] = useState([])
  const [error, setError] = useState(null)

  const addModel = (m) =>
    setList((p) => [...p, { id: Date.now(), spec: m.phi, motor_type: m.motor_type, quantity: 1, label: m.label }])
  const setQty = (id, v) => {
    if (v !== '' && !/^\d+$/.test(v)) return
    setList((p) => p.map((i) => (i.id === id ? { ...i, quantity: v } : i)))
  }
  const remove = (id) => setList((p) => p.filter((i) => i.id !== id))

  const handleNext = () => {
    if (list.length === 0) { setError('로터 모델을 1개 이상 추가하세요.'); return }
    if (list.some((i) => i.quantity === '' || parseInt(i.quantity, 10) <= 0)) {
      setError('수량을 입력하세요.'); return
    }
    onConfirm(list.map((i) => ({ spec: i.spec, quantity: parseInt(i.quantity, 10), motor_type: i.motor_type })))
  }

  return (
    <div className="page-flat">
      <PageHeader title="로터 모델을 추가해 주세요" subtitle="RT/RT·ST 겸용 모델만 표시돼요" onBack={onBack} />

      <div className="process-content-inner">
        {rotorModels.length === 0 && (
          <p style={{ color: 'var(--color-text-sub)' }}>
            RT 모델이 없습니다 — 제품 모델 관리에서 RT/ST 구분을 RT 로 등록하세요.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {rotorModels.map((m) => (
            <button key={m.id} type="button" className="btn-secondary btn-md"
              style={{ borderColor: m.color_hex }} onClick={() => addModel(m)}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: m.color_hex, marginRight: 6 }} />
              {m.label} ＋
            </button>
          ))}
        </div>

        {list.map((i) => (
          <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ flex: 1, fontWeight: 600 }}>{i.label}</span>
            <input type="number" min={1} value={i.quantity} inputMode="numeric"
              onChange={(e) => setQty(i.id, e.target.value)}
              style={{ width: 90, padding: 10, borderRadius: 8, border: '1.5px solid var(--color-border)', textAlign: 'center' }} />
            <span style={{ color: 'var(--color-text-sub)' }}>개</span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => remove(i.id)}>✕</button>
          </div>
        ))}

        {error && <p style={{ color: 'var(--color-danger, #d23f3f)', fontWeight: 600 }}>{error}</p>}

        <button className="btn-primary btn-lg btn-full" style={{ marginTop: 16 }}
          disabled={list.length === 0} onClick={handleNext}>
          다음
        </button>
      </div>
    </div>
  )
}
