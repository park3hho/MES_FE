import { useState } from 'react'
import { StepIndicator } from './StepIndicator'
import { OptionButtons } from './OptionButtons'
import { TextInput } from './TextInput'
import { FaradayLogo } from '../FaradayLogo'
import LotTimeline from '../LotTimeline'
import { traceLot } from '../../api'

const isMobile = window.innerWidth <= 480

export default function MaterialSelector({ steps, onSubmit, onLogout, onBack, autoValues = {}, scannedLot = null, preUnit }) {
  const inputSteps = steps.filter(s => !s.auto)

  const [step, setStep] = useState(0)
  const [selections, setSelections] = useState({})
  const [inputValue, setInputValue] = useState('')
  const [etc, setEtc] = useState('')
  const [traceMap, setTraceMap] = useState({})      // { lot_no: { open, data, loading } }

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

  const handleTraceToggle = async (lotNo) => {
    const existing = traceMap[lotNo]

    // 이미 열려있으면 닫기
    if (existing?.open) {
      setTraceMap(prev => ({ ...prev, [lotNo]: { ...prev[lotNo], open: false } }))
      return
    }

    // 데이터 있으면 바로 열기
    if (existing?.data) {
      setTraceMap(prev => ({ ...prev, [lotNo]: { ...prev[lotNo], open: true } }))
      return
    }

    // 새로 조회
    setTraceMap(prev => ({ ...prev, [lotNo]: { open: false, data: null, loading: true } }))
    try {
      const data = await traceLot(lotNo)
      setTraceMap(prev => ({ ...prev, [lotNo]: { open: true, data, loading: false } }))
    } catch (e) {
      console.warn('이력 조회 실패:', e.message)
      setTraceMap(prev => ({ ...prev, [lotNo]: { open: false, data: null, loading: false } }))
    }
  }

  const currentStepIndex = steps.findIndex(s => s.key === current?.key)

  // 표시할 LOT 목록 (배열이면 그대로, 단일이면 배열로)
  const lotList = scannedLot
    ? (Array.isArray(scannedLot) ? scannedLot : [scannedLot])
    : []

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
        {current?.hint && (
          <p style={{ fontSize: 12, color: '#8a93a8', marginBottom: 8 }}>{current.hint}</p>
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
          <button style={styles.backBtn} onClick={handleBack}>이전으로</button>
        ) : (
          <button style={styles.backBtn} onClick={onBack ?? onLogout}>
            {onBack ? '이전으로' : '로그아웃'}
          </button>
        )}

        {/* 스캔된 이전 LOT 정보 표시 */}
        {lotList.length > 0 && (
          <div style={styles.scannedWrap}>
            <p style={styles.scannedTitle}>스캔된 이전 공정 LOT</p>
            {lotList.map((item, idx) => {
              const trace = traceMap[item.lot_no] || {}
              return (
                <div key={item.lot_no}>
                  <div style={styles.scannedRow}>
                    {lotList.length > 1 && <span style={styles.scannedIdx}>{idx + 1}</span>}
                    <span style={styles.scannedLotNo}>{item.lot_no}</span>
                    {item.created_at && (
                      <span style={styles.scannedTime}>
                        {new Date(item.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <span style={styles.scannedQty}>{item.quantity}{preUnit}</span>
                    <button
                      style={styles.infoBtn}
                      onClick={() => handleTraceToggle(item.lot_no)}
                    >
                      {trace.loading ? '...' : trace.open ? '✕' : 'ⓘ'}
                    </button>
                  </div>

                  {/* 펼쳐지는 타임라인 (슬라이드 애니메이션) */}
                  <div style={{
                    ...styles.traceWrap,
                    maxHeight: trace.open ? 600 : 0,
                    opacity: trace.open ? 1 : 0,
                    overflow: 'hidden',
                    transition: 'max-height 0.4s ease, opacity 0.3s ease',
                  }}>
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

const styles = {
  container: {
    minHeight: '100vh', background: '#f4f6fb',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    paddingTop: 40, paddingBottom: 40, paddingLeft: 16, paddingRight: 16,
  },
  card: {
    background: '#fff', borderRadius: 14, padding: '32px 36px',
    width: isMobile ? '100%' : 480, minHeight: 480,
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
    textDecoration: 'underline', display: 'block', margin: '16px auto 0',
  },
  scannedWrap: {
    marginTop: 20, borderTop: '1px solid #e0e4ef', paddingTop: 12,
  },
  scannedTitle: {
    fontSize: 11, fontWeight: 600, color: '#8a93a8',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
  },
  scannedRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 0', borderBottom: '1px solid #f0f2f7',
  },
  scannedIdx: {
    fontSize: 11, color: '#adb4c2', width: 16, textAlign: 'center',
  },
  scannedLotNo: {
    flex: 1, fontSize: 12, fontWeight: 600, color: '#1a2540',
  },
  scannedQty: {
    fontSize: 12, fontWeight: 700, color: '#1a2f6e',
  },
  scannedTime: {
    fontSize: 10, color: '#adb4c2',
  },
  infoBtn: {
    width: 24, height: 24, borderRadius: '50%',
    background: '#f0f3fb', border: '1px solid #e0e4ef',
    color: '#1a2f6e', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  traceWrap: {
    padding: '12px 0 4px 24px',
    borderLeft: '2px solid #f0f2f7',
    marginLeft: 8,
    marginBottom: 8,
  },
}