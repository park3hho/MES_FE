import { useState, useEffect } from 'react'
import { printLot } from '../api'
import MaterialSelector from '../components/MaterialSelector'
import { CountModal } from '../components/CountModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { useDate } from '../utils/useDate'

// LOT: {shape}{vendor}{thickness}{width}-{순서}
const steps = [
  { key: 'shape',     label: '가공형태',       options: ['SR', 'ST'] },
  { key: 'vendor',    label: '가공업체 / 설비', options: ['01', '02', '03'] },
  { key: 'thickness', label: '재료 두께',       options: null },
  { key: 'width',     label: '재료 폭',         options: null },
  { key: 'seq',       label: '순서',           auto: true },
]

export default function MPPage({ onLogout }) {
  const date = useDate()
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

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${sel.shape}${sel.vendor}${sel.thickness}${sel.width}-`)
    setStep('count')
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
        <MaterialSelector
          steps={steps}
          autoValues={{ process: 'MP', date, seq: '-??' }}
          onSubmit={handleMaterialSubmit}
          onLogout={onLogout}
        />
      )}
      {step === 'count' && (
        <CountModal lotNo={`${lotNo}??`} onSelect={handleCountSelect} onCancel={handleReset} />
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${lotNo}-??`}
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
