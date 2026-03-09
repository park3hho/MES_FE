import { useState } from 'react'
import { StepIndicator } from './StepIndicator'
import { OptionButtons } from './OptionButtons'
import { TextInput } from './TextInput'
import { FaradayLogo } from '../FaradayLogo'

const steps = [
  { key: 'vendor', label: '원자재 업체', options: ['VA', 'XY', 'PO'] },
  { key: 'material', label: '재료명', options: ['CO', 'SI'] },
  { key: 'thickness', label: '재료 두께', options: null },
  { key: 'width', label: '재료 폭', options: null },
]

export default function MaterialSelector({ steps, onSubmit, onLogout }) {
  const [step, setStep] = useState(0)
  const [selections, setSelections] = useState({})
  const [inputValue, setInputValue] = useState('')
  const [etc, setEtc] = useState('')

  const current = steps[step]

  const handleSelect = (option) => {
    const next = { ...selections, [current.key]: option }
    setSelections(next)
    if (step < steps.length - 1) {
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
    if (step < steps.length - 1) {
      setStep(step + 1)
    } else {
      onSubmit({ ...selections, [current.key]: inputValue })  // 이걸로 교체
    }
  }

  const handleBack = () => {
    const prev = step - 1
    const key = steps[prev].key
    setSelections((s) => { const c = { ...s }; delete c[key]; return c })
    setStep(prev)
  }

  return (
    <div style={styles.container}>
      

      <div style={styles.card}>
        <div style={{ marginBottom: 50, marginTop: 20 }}>
          <FaradayLogo size="md" />
        </div>
        <StepIndicator steps={steps} currentStep={step} selections={selections} />
        <h2 style={styles.cardTitle}>{current.label}</h2>

        {current.options ? (
          <OptionButtons
            options={current.options}
            onSelect={handleSelect}
            etc={etc}
            onEtcChange={setEtc}
            onEtcSubmit={handleEtc}
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
          <button style={styles.backBtn} onClick={onLogout}>
            로그아웃
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
    width: 480,  height: 480, // 추가 - OptionButtons 있을 때 높이에 맞게 조정
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
