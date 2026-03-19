import { useState } from 'react'
import { StepIndicator } from './StepIndicator'
import { OptionButtons } from './OptionButtons'
import { TextInput } from './TextInput'
import { FaradayLogo } from '../FaradayLogo'
import LotTimeline from '../LotTimeline'
import { traceLot } from '@/api'
import s from './index.module.css'

export default function MaterialSelector({ steps, onSubmit, onLogout, onBack, autoValues = {}, scannedLot = null, preProcess }) {
  const inputSteps = steps.filter(step => !step.auto)  // s → step으로 변경

  const [step, setStep] = useState(0)
  const [selections, setSelections] = useState({})
  const [inputValue, setInputValue] = useState('')
  const [etc, setEtc] = useState('')
  const [traceMap, setTraceMap] = useState({})

  const current = inputSteps[step]

  const handleSelect = (option) => {
    const next = { ...selections, [current.key]: option }
    setSelections(next)
    if (step < inputSteps.length - 1) {
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
      setStep(step + 1)
    } else {
      onSubmit({ ...selections, [current.key]: inputValue })
    }
  }

  const handleBack = () => {
    const prev = step - 1
    const key = inputSteps[prev].key
    setSelections((prev) => { const c = { ...prev }; delete c[key]; return c })  // s → prev로 변경
    setStep(prev)
  }

  const handleTraceToggle = async (lotNo) => {
    const existing = traceMap[lotNo]

    if (existing?.open) {
      setTraceMap(prev => ({ ...prev, [lotNo]: { ...prev[lotNo], open: false } }))
      return
    }

    if (existing?.data) {
      setTraceMap(prev => ({ ...prev, [lotNo]: { ...prev[lotNo], open: true } }))
      return
    }

    setTraceMap(prev => ({ ...prev, [lotNo]: { open: false, data: null, loading: true } }))
    try {
      const data = await traceLot(lotNo)
      setTraceMap(prev => ({ ...prev, [lotNo]: { open: true, data, loading: false } }))
    } catch (e) {
      console.warn('이력 조회 실패:', e.message)
      setTraceMap(prev => ({ ...prev, [lotNo]: { open: false, data: null, loading: false } }))
    }
  }

  const currentStepIndex = steps.findIndex(step => step.key === current?.key)  // s → step으로 변경

  // 배열이면 그대로, 단일이면 배열로
  const lotList = scannedLot
    ? (Array.isArray(scannedLot) ? scannedLot : [scannedLot])
    : []

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
        <h2 className={s.cardTitle}>{current?.label}</h2>
        {current?.hint && (
          <p className={s.hint}>{current.hint}</p>
        )}
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
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleInput}
            />
          </div>
        )}
        {step > 0 ? (
          <button className={s.backBtn} onClick={handleBack}>이전으로</button>
        ) : (
          <button className={s.backBtn} onClick={onBack ?? onLogout}>
            {onBack ? '이전으로' : '로그아웃'}
          </button>
        )}

        {/* 스캔된 이전 LOT 정보 */}
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
                        {new Date(item.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {/* kg 단위면 수량 숨김 */}
                    {preProcess !== 'kg' && (
                      <span className={s.scannedQty}>{lotList.length}건</span>
                    )}
                    <button
                      className={s.infoBtn}
                      onClick={() => handleTraceToggle(item.lot_no)}
                    >
                      {trace.loading ? '...' : trace.open ? '✕' : 'ⓘ'}
                    </button>
                  </div>

                  {/* 펼쳐지는 타임라인 — maxHeight/opacity만 인라인 유지 */}
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