import { useState, useEffect } from 'react'
import { printLot } from '../api'
import MaterialSelector from '../components/MaterialSelector'
import { CountModal } from '../components/CountModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { fetchSequence } from '../utils/sequence'

// LOT: IQ{worker}{YYMMDD}-{순서}
// 예시: IQ01260216-03
const steps = [
  { key: 'worker', label: '작업자 코드', options: null },
]

export default function IQPage({ onLogout }) {
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [printCount, setPrintCount] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('selector')

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => handleReset(), 1500)
    return () => clearTimeout(t)
  }, [error])

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => handleReset(), 1200)
    return () => clearTimeout(t)
  }, [done])

  const handleMaterialSubmit = async (selections) => {
    try {
      const seq = await fetchSequence('IQ')
      const lot = `IQ${selections.worker}${seq.date}-${seq.order}`
      setSelections(selections)
      setLotNo(lot)
      setStep('count')
    } catch (e) {
      setError(e.message)
    }
  }

  const handleCountSelect = (count) => {
    setPrintCount(count)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, printCount, selections)
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setLotNo(null)
    setSelections(null)
    setPrintCount(null)
    setPrinting(false)
    setDone(false)
    setError(null)
    setStep('selector')
  }

  return (
    <>
      {step === 'selector' && (
        <MaterialSelector steps={steps} onSubmit={handleMaterialSubmit} onLogout={onLogout} />
      )}
      {step === 'count' && (
        <CountModal lotNo={lotNo} onSelect={handleCountSelect} onCancel={handleReset} />
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={lotNo}
          printCount={printCount}
          printing={printing}
          done={done}
          error={error}
          onConfirm={handleConfirm}
          onCancel={handleReset}
        />
      )}
    </>
  )
}
