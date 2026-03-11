import { useState } from 'react'
import { StepIndicator } from './StepIndicator'
import { OptionButtons } from './OptionButtons'
import { TextInput } from './TextInput'
import { FaradayLogo } from '../FaradayLogo'

const isMobile = window.innerWidth <= 480

export default function MaterialSelector({ steps, onSubmit, onLogout, onBack, autoValues = {} }) {
  // auto: true 스텝은 입력 받지 않음
  const inputSteps = steps.filter(s => !s.auto)

  const [step, setStep] = useState(0)
  const [selections, setSelections] = useState({})
  const [inputValue, setInputValue] = useState('')
  const [etc, setEtc] = useState('')

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
    setSelections((s) => { const c = { ...s }; delete c[key]; return c })
    setStep(prev)
  }

  // StepIndicator용 currentStep: 전체 steps 기준 인덱스
  const currentStepIndex = steps.findIndex(s => s.key === current?.key)

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ marginBottom: 50, marginTop: 20 }}>
          <FaradayLogo size="md" />
        </div>
        <StepIndicator
          steps={steps}
          currentStep={currentStepIndex}
          selections={selections}
          autoValues={autoValues}
        />
        <h2 style={styles.cardTitle}>{current?.label}</h2>

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
          <div style={{ minHeight: 160 }}>
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleInput}
            />
          </div>
        )}
        {step > 0 ? (
          <button style={styles.backBtn} onClick={handleBack}>
            이전으로
          </button>
        ) : (
          <button style={styles.backBtn} onClick={onBack ?? onLogout}>
            {onBack ? '이전으로' : '로그아웃'}
          </button>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh', background: '#f4f6fb',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: "center", paddingTop: 40, paddingBottom: 40, paddingLeft: 16, paddingRight: 16,
  },
  card: {
    background: '#fff', borderRadius: 14, padding: '32px 36px',
    width: isMobile ? 240: 480, height: 480,
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 4px 24px rgba(26,47,110,0.09)',
  },
  cardTitle: {
    textAlign: 'center', fontSize: 16, fontWeight: 700,
    color: '#1a2540', marginBottom: 24,
  },
  backBtn: {
    marginTop: 16, fontSize: 13, color: '#8a93a8',
    background: 'none', border: 'none', cursor: 'pointer',
    textDecoration: 'underline',
    display: 'block', margin: '16px auto 0',
  },
}
