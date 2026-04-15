import { useState } from 'react'
import { printLot, scanLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { IQ_STEPS } from '@/constants/processConst'

export default function IQPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`IQ${sel.worker}${date}`)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, 1, { selected_process: 'IQ', prev_lot_no: prevLotNo, ...selections })
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setLotNo(null); setSelections(null)
    setPrinting(false); setDone(false); setError(null)
    setPrevLotNo(null); setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'qr' && (
        <QRScanner key={step}
          processLabel="IQ, 수입검사"
          onScan={async (val) => { setPrevLotNo(val); setStep('selector') }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={IQ_STEPS} autoValues={{ date, seq: '00' }} onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity: 1 } : null} />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={1} printing={printing} done={done} error={error} onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}
