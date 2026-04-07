import { useState } from 'react'
import { scanLot, submitTest1 } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import QRScanner from '@/components/QRScanner'
import InspectionForm from '@/components/InspectionForm'
import { FaradayLogo } from '@/components/FaradayLogo'

export default function OQTest1Page({ onLogout, onBack }) {
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
    setStep('inspect')
  }

  const handleInspectionSubmit = async (data) => {
    try {
      await submitTest1({ ...data, lot_so_no: prevLotNo })
      setDone(true)
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
        <QRScanner key={step} processLabel="OQ Test 1 — R/L/I.T."
          onScan={handleScan} onLogout={onLogout} onBack={onBack} />
      )}
      {step === 'inspect' && (
        <InspectionForm
          phi={phi}
          motorType={motorType}
          lotOqNo={`${prevLotNo} (Test 1)`}
          testPhase={1}
          onSubmit={handleInspectionSubmit}
          onCancel={handleReset}
        />
      )}
      {done && (
        <div className="page">
          <div className="card" style={{ textAlign: 'center' }}>
            <FaradayLogo size="md" />
            <p style={{ fontSize: 48, margin: '16px 0 8px' }}>✓</p>
            <p style={{ fontWeight: 700, fontSize: 18 }}>테스트 1 저장 완료</p>
            <p style={{ color: 'var(--color-gray)', fontSize: 13, marginTop: 4 }}>
              {prevLotNo} — 테스트 2에서 K_T 측정을 진행하세요
            </p>
          </div>
        </div>
      )}
      {error && (
        <div className="page">
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--color-error)', fontWeight: 700 }}>✕ {error}</p>
          </div>
        </div>
      )}
    </>
  )
}
