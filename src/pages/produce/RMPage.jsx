import { useState } from 'react'
import { printLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { CountModal } from '@/components/CountModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { RM_STEPS } from '@/constants/processConst'

export default function RMPage({ onLogout, onBack }) {
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [printCount, setPrintCount] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('selector')

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${sel.vendor}-${sel.material}-${sel.thickness}`)
    setStep('count')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, printCount, { selected_process: 'RM', ...selections })
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setLotNo(null); setSelections(null); setPrintCount(null)
    setPrinting(false); setDone(false); setError(null)
    setStep('selector')
  }

  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'selector' && (
        <MaterialSelector steps={RM_STEPS} onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={onBack} />
      )}
      {step === 'count' && (
        <CountModal lotNo={lotNo} label="프린트 매수를 입력하세요"
          onSelect={(n) => { setPrintCount(n); setStep('confirm') }}
          onCancel={handleReset} unit="장" unit_type="매수" />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={lotNo} printCount={printCount}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}
