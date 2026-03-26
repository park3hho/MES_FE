import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { StepIndicator } from './StepIndicator'
import { OptionButtons } from './OptionButtons'
import { TextInput } from './TextInput'
import { FaradayLogo } from '../FaradayLogo'
import LotTimeline from '../LotTimeline'
import { traceLot } from '@/api'
import s from './index.module.css'

export default function MaterialSelector({
  steps,
  onSubmit,
  onLogout,
  onBack,
  autoValues = {},
  scannedLot = null,
  preProcess,
}) {
  const inputSteps = steps.filter((step) => !step.auto)

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1) // 1: 앞으로, -1: 뒤로
  const [selections, setSelections] = useState({})
  const [inputValue, setInputValue] = useState('')
  const [etc, setEtc] = useState('')
  const [traceMap, setTraceMap] = useState({})

  const current = inputSteps[step]

  const handleSelect = (option) => {
    const next = { ...selections, [current.key]: option }
    setSelections(next)
    if (step < inputSteps.length - 1) {
      setDirection(1)
      setStep(step + 1)
    } else {
      onSubmit(next)
    }
  }

  const handleEtc = () => {
    if (!etc.trim()) return
    handleSelect(etc)
    setEtc('')
  }

  const handleInput = () => {
    if (!inputValue.trim()) return
    const next = { ...selections, [current.key]: inputValue }
    setSelections(next)
    setInputValue('')
    if (step < inputSteps.length - 1) {
      setDirection(1)
      setStep(step + 1)
    } else {
      onSubmit({ ...selections, [current.key]: inputValue })
    }
  }

  const handleBack = () => {
    const prev = step - 1
    const key = inputSteps[prev].key
    setSelections((prev) => {
      const c = { ...prev }
      delete c[key]
      return c
    })
    setDirection(-1)
    setStep(prev)
  }

  const handleTraceToggle = async (lotNo) => {
    const existing = traceMap[lotNo]
    if (existing?.open) {
      setTraceMap((prev) => ({ ...prev, [lotNo]: { ...prev[lotNo], open: false } }))
      return
    }
    if (existing?.data) {
      setTraceMap((prev) => ({ ...prev, [lotNo]: { ...prev[lotNo], open: true } }))
      return
    }
    setTraceMap((prev) => ({ ...prev, [lotNo]: { open: false, data: null, loading: true } }))
    try {
      const data = await traceLot(lotNo)
      setTraceMap((prev) => ({ ...prev, [lotNo]: { open: true, data, loading: false } }))
    } catch (e) {
      console.warn('이력 조회 실패:', e.message)
      setTraceMap((prev) => ({ ...prev, [lotNo]: { open: false, data: null, loading: false } }))
    }
  }

  const currentStepIndex = steps.findIndex((step) => step.key === current?.key)

  const lotList = scannedLot ? (Array.isArray(scannedLot) ? scannedLot : [scannedLot]) : []

  // 스텝 전환 애니메이션 variants
  const variants = {
    enter: (dir) => ({ opacity: 0, x: dir * 24 }),
    center: { opacity: 1, x: 0 },
    exit: (dir) => ({ opacity: 0, x: dir * -24 }),
  }

  return (
    <div className={s.container}>
      <div className={s.card}>
        <div className={s.logoWrap}>
          <FaradayLogo size="md" />
        </div>
        <StepIndicator
          steps={steps}
          currentStep={currentStepIndex}
          selections={selections}
          autoValues={autoValues}
        />

        {/* 스텝 내용 — step 바뀔 때 슬라이드 전환 */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className={s.cardTitle}>{current?.label}</h2>
            {current?.hint && <p className={s.hint}>{current.hint}</p>}
            {current?.options ? (
              <OptionButtons
                options={current.options}
                onSelect={handleSelect}
                etc={etc}
                onEtcChange={setEtc}
                onEtcSubmit={handleEtc}
                size={current.size ?? 'md'}
              />
            ) : (
              <div style={{ minHeight: 60 }}>
                <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleInput} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {step > 0 ? (
          <button className={s.backBtn} onClick={handleBack}>
            이전으로
          </button>
        ) : (
          <button className={s.backBtn} onClick={onBack ?? onLogout}>
            {onBack ? '이전으로' : '로그아웃'}
          </button>
        )}

        {lotList.length > 0 && (
          <div className={s.scannedWrap}>
            <p className={s.scannedTitle}>스캔된 이전 공정 LOT</p>
            {lotList.map((item, idx) => {
              const trace = traceMap[item.lot_no] || {}
              return (
                <div key={item.lot_no}>
                  <div className={s.scannedRow}>
                    {lotList.length > 1 && <span className={s.scannedIdx}>{idx + 1}</span>}
                    <span className={s.scannedLotNo}>{item.lot_no}</span>
                    {item.created_at && (
                      <span className={s.scannedTime}>
                        {new Date(item.created_at).toLocaleString('ko-KR', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                    {preProcess !== 'kg' && (
                      <span className={s.scannedQty}>{lotList.length}건</span>
                    )}
                    <button className={s.infoBtn} onClick={() => handleTraceToggle(item.lot_no)}>
                      {trace.loading ? '...' : trace.open ? '✕' : 'ⓘ'}
                    </button>
                  </div>
                  <div
                    className={s.traceWrap}
                    style={{ maxHeight: trace.open ? 600 : 0, opacity: trace.open ? 1 : 0 }}
                  >
                    {trace.data && (
                      <LotTimeline
                        timeline={trace.data.timeline}
                        searchedLotNo={trace.data.lot_no}
                        animated={trace.open}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
