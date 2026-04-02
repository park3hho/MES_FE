import { useState } from 'react'
import { printLot, scanLot, submitInspection, printStLabel } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import InspectionForm from '@/components/InspectionForm'
import { useDate } from '@/utils/useDate'
import { OQ_STEPS } from '@/constants/processConst'

export default function OQPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [phi, setPhi] = useState('')
  const [motorType, setMotorType] = useState('')
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [inspectionData, setInspectionData] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  // 1) QR 스캔 → phi + motor_type 추출
  const handleScan = async (val) => {
    const r = await scanLot('OQ', val)
    setPrevLotNo(r.prev_lot_no)
    setLotChain(r.lot_chain)
    setQuantity(r.quantity)
    setPhi(r.spec || '')
    setMotorType(r.motor_type || '')
    setStep('selector')
  }

  // 2) 작업자 입력 완료
  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`OQ${sel.worker}${date}`)
    setStep('inspect')  // ← 검사 입력으로 이동
  }

  // 3) 검사 데이터 입력 완료
  const handleInspectionSubmit = (data) => {
    setInspectionData(data)
    setStep('confirm')
  }

  // 4) 최종 확인 → 프린트 + 검사 저장
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

      // 검사 데이터 저장 (실제 채번된 LOT 번호 사용)
      const actualLotNo = result.lot_nums?.[0] || lotNo
      const inspResult = await submitInspection({ ...inspectionData, lot_oq_no: actualLotNo })

      // ST 시리얼 라벨 출력
      await printStLabel(inspResult.serial_no, actualLotNo)

      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setLotNo(null); setSelections(null); setQuantity(null); setPhi(''); setMotorType('')
    setInspectionData(null); setPrinting(false); setDone(false); setError(null)
    setLotChain(null); setPrevLotNo(null); setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  return (
    <>
      {/* 1) QR 스캔 */}
      {step === 'qr' && (
        <QRScanner key={step} processLabel="OQ, 출하검사"
          onScan={handleScan} onLogout={onLogout} onBack={onBack} />
      )}

      {/* 2) 작업자 코드 */}
      {step === 'selector' && (
        <MaterialSelector steps={OQ_STEPS} autoValues={{ date, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity } : null} />
      )}

      {/* 3) 🆕 검사 데이터 입력 */}
      {step === 'inspect' && (
        <InspectionForm
          phi={phi}
          motorType={motorType}
          lotOqNo={`${lotNo}-00`}
          onSubmit={handleInspectionSubmit}
          onCancel={() => setStep('selector')}
        />
      )}

      {/* 4) 확인 → 프린트 + 검사 저장 */}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={quantity}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}