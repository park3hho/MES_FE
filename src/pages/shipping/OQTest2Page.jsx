import { useState } from 'react'
import { printLot, scanLot, submitTest2, printStLabel } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import InspectionForm from '@/components/InspectionForm'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useDate } from '@/utils/useDate'
import { OQ_STEPS } from '@/constants/processConst'

export default function OQTest2Page({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [phi, setPhi] = useState('')
  const [motorType, setMotorType] = useState('')
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [ktData, setKtData] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const handleScan = async (val) => {
    const r = await scanLot('OQ', val)
    setPrevLotNo(r.prev_lot_no)
    setLotChain(r.lot_chain)
    setQuantity(r.quantity)
    setPhi(r.spec || '')
    setMotorType(r.motor_type || '')
    setStep('kt_input')
  }

  const handleKtSubmit = (data) => {
    setKtData(data)
    setStep('selector')
  }

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`OQ${sel.worker}${date}`)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      // OQ LOT 프린트
      const result = await printLot(lotNo, quantity, {
        selected_process: 'OQ',
        lot_chain: lotChain,
        prev_lot_no: prevLotNo,
        ...selections,
      })

      const actualLotNo = result.lot_nums?.[0] || lotNo

      // 테스트 2 저장 (K_T + OQ LOT 연결)
      const test2Result = await submitTest2({
        ...ktData,
        lot_so_no: prevLotNo,
        lot_oq_no: actualLotNo,
      })

      // ST 라벨 출력
      if (test2Result.serial_no) {
        await printStLabel(test2Result.serial_no, actualLotNo)
      }

      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setPrevLotNo(null); setLotChain(null); setQuantity(null)
    setPhi(''); setMotorType(''); setLotNo(null); setSelections(null)
    setKtData(null); setPrinting(false); setDone(false); setError(null)
    setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'qr' && (
        <QRScanner key={step} processLabel="OQ Test 2 — K_T (Back EMF)"
          onScan={handleScan} onLogout={onLogout} onBack={onBack} />
      )}
      {step === 'kt_input' && (
        <InspectionForm
          phi={phi}
          motorType={motorType}
          lotOqNo={`${prevLotNo} (Test 2)`}
          testPhase={2}
          onSubmit={handleKtSubmit}
          onCancel={handleReset}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={OQ_STEPS} autoValues={{ date, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('kt_input')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity } : null} />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={quantity}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}
