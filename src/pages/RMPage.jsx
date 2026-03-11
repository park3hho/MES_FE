import { useState, useEffect } from 'react'
import { printLot } from '../api'
import MaterialSelector from '../components/MaterialSelector'
import { CountModal } from '../components/CountModal'
import { ConfirmModal } from '../components/ConfirmModal'

const steps = [
  { key: 'vendor',    label: '원자재 업체', options: ['VA', 'XY', 'PO'] },
  { key: 'material',  label: '재료명',      options: ['CO', 'SI'] },
  { key: 'thickness', label: '재료 두께',   options: null },
]

export default function RMPage({ onLogout, onBack }) {
  const [lotNo, setLotNo] = useState(null)
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

  const handleMaterialSubmit = (sel) => {
    const lot = `${sel.vendor}-${sel.material}-${sel.thickness}`
    setLotNo(lot)
    setStep('count')
  }

  const handleCountSelect = (count) => {
    setPrintCount(count)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, printCount, { selections: 'RM', ...sel })
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setLotNo(null)
    setPrintCount(null)
    setPrinting(false)
    setDone(false)
    setError(null)
    setStep('selector')
  }

  return (
    <>
      {step === 'selector' && (
        <MaterialSelector 
          steps={steps} 
          onSubmit={handleMaterialSubmit} 
          onLogout={onLogout} 
          onBack={onBack}
          />
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