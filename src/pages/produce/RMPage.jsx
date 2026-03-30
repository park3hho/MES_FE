import { useState } from 'react'
import { printLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { CountModal } from '@/components/CountModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { RM_STEPS, PROCESS_INPUT } from '@/constants/processConst'

export default function RMPage({ onLogout, onBack }) {
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('selector')

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${sel.vendor}-${sel.material}-${sel.thickness}`)
    setStep('count')
  }

  const handleCountSelect = (qty) => {
    setQuantity(qty)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, 1, { selected_process: 'RM', quantity, ...selections })
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setLotNo(null); setSelections(null); setQuantity(null)
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
        <CountModal lotNo={lotNo} onSelect={handleCountSelect} onCancel={handleReset} unit={PROCESS_INPUT['RM'].unit} unit_type={PROCESS_INPUT["RM"].unit_type} />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={lotNo} printCount={quantity}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset}
          unit_type={PROCESS_INPUT["RM"].unit_type}
          unit={PROCESS_INPUT["RM"].unit}
        />
      )}
    </>
  )
}
