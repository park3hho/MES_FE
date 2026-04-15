import { useState } from 'react'
import { scanLot, submitTest2, printStLabel } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import QRScanner from '@/components/QRScanner'
import InspectionForm from '@/components/InspectionForm'

export default function OQTest2Page({ onLogout, onBack }) {
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [phi, setPhi] = useState('')
  const [motorType, setMotorType] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const handleScan = async (val) => {
    const r = await scanLot('OQ', val)
    setPrevLotNo(r.prev_lot_no)
    setPhi(r.spec || '')
    setMotorType(r.motor_type || '')
    setStep('kt_input')
  }

  const handleKtSubmit = async (data) => {
    try {
      const result = await submitTest2({ ...data, lot_so_no: prevLotNo })

      // 테스트 양쪽 완료(phase=3) → ST 라벨 출력
      if (result.serial_no) {
        await printStLabel(result.serial_no, result.lot_oq_no)
      }

      if (result.judgment === 'FAIL') {
        setError(`검사 불합격 (FAIL) — ${result.serial_no || prevLotNo}`)
      } else {
        setDone(true)
      }
    } catch (e) {
      setError(e.message)
    }
  }

  const handleReset = () => {
    setPrevLotNo(null); setPhi(''); setMotorType('')
    setDone(false); setError(null); setStep('qr')
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
    </>
  )
}
