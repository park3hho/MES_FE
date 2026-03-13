import { useState, useEffect } from 'react'
import { printLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import { CountModal } from '../../components/CountModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { useDate } from '../../utils/useDate'

// LOT: BX-{YYMMDD}-{순서}
const steps = [
  { key: 'process', label: 'BX', auto: true },
  { key: 'worker', label: '작업자 코드', options: null, hint: '작업자번호표 참조' },
  { key: 'date', label: '날짜', auto: true },
  { key: 'seq', label: '순서', auto: true },
]

export default function BXPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotNo, setLotNo] = useState(null)
  const [printCount, setPrintCount] = useState(null)
  const [selections, setSelections] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

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
    setLotNo(`BX-${date}`)
    setStep('count')
  }

  const handleCountSelect = (count) => {
    setPrintCount(count)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, printCount, { selected_Process: 'BX', ...selections })
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
    setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner
          processLabel="BX, 포장"
          onScan={(val) => { setPrevLotNo(val); setStep('selector') }}
          onLogout={onLogout}
          onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector
          steps={steps}
          autoValues={{ process: 'BX', date, seq: '00' }}
          onSubmit={handleMaterialSubmit}
          onLogout={onLogout}
          onBack={() => setStep('qr')}
        />
      )}
      {step === 'count' && (
        <CountModal lotNo={`${lotNo}-00`} onSelect={handleCountSelect} onCancel={handleReset} />
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${lotNo}-00`}
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
