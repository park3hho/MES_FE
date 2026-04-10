import { useState } from 'react'
import { printLot, scanLot, submitTest1 } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import InspectionForm from '@/components/InspectionForm'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useDate } from '@/utils/useDate'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import { OQ_STEPS } from '@/constants/processConst'
import { FaradayLogo } from '@/components/FaradayLogo'

export default function OQTest1Page({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [phi, setPhi] = useState('')
  const [motorType, setMotorType] = useState('')
  const [lotNo, setLotNo] = useState(null)
  const [actualOqNo, setActualOqNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [overrideDate, setOverrideDate] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const effectiveDate = overrideDate || date

  // 1) SO 스캔
  const handleScan = async (val) => {
    const r = await scanLot('OQ', val)
    setPrevLotNo(r.prev_lot_no)
    setLotChain(r.lot_chain)
    setQuantity(r.quantity)
    setPhi(r.spec || '')
    setMotorType(r.motor_type || '')
    setStep('selector')
  }

  // 2) 작업자 코드 입력 → OQ LOT 생성 + 라벨 출력
  const handleMaterialSubmit = async (sel) => {
    setSelections(sel)
    setLotNo(`OQ${sel.worker}${effectiveDate}`)
    setStep('date_pick')
  }

  // 3) 날짜 확인 → OQ LOT 프린트 → 검사 입력으로
  const handleDateConfirm = async () => {
    setPrinting(true)
    try {
      const result = await printLot(lotNo, 1, {
        selected_process: 'OQ',
        lot_chain: lotChain,
        prev_lot_no: prevLotNo,
        override_date: overrideDate || undefined,
        ...selections,
      })
      const oqNo = result.lot_nums?.[0] || lotNo
      setActualOqNo(oqNo)
      setStep('inspect')
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  // 4) 검사 데이터 저장
  const handleInspectionSubmit = async (data) => {
    try {
      const result = await submitTest1({ ...data, lot_so_no: prevLotNo, lot_oq_no: actualOqNo })
      if (result.judgment === 'FAIL') {
        setError(`검사 불합격 (FAIL) — ${actualOqNo}`)
      } else {
        setDone(true)
      }
    } catch (e) {
      setError(e.message)
    }
  }

  const handleReset = () => {
    setPrevLotNo(null); setLotChain(null); setQuantity(null)
    setPhi(''); setMotorType(''); setLotNo(null); setActualOqNo(null)
    setSelections(null); setOverrideDate(null)
    setPrinting(false); setDone(false); setError(null); setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'qr' && (
        <QRScanner key={step} processLabel="OQ Test 1 — R/L/I.T."
          onScan={handleScan} onLogout={onLogout} onBack={onBack} />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={OQ_STEPS} autoValues={{ date: effectiveDate, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity } : null} />
      )}
      {step === 'date_pick' && (
        <div className="page">
          <div className="card" style={{ textAlign: 'center' }}>
            <FaradayLogo size="md" />
            <p style={{ fontWeight: 700, fontSize: 18, margin: '12px 0 4px' }}>작업일 선택</p>
            <p style={{ color: 'var(--color-gray)', fontSize: 13, marginBottom: 20 }}>
              날짜 확인 후 OQ 라벨이 출력됩니다
            </p>
            <input type="date" defaultValue={toInputDate(effectiveDate)}
              onChange={(e) => {
                const yy = toYYMMDD(e.target.value)
                setOverrideDate(yy === date ? null : yy)
                if (selections) setLotNo(`OQ${selections.worker}${yy || date}`)
              }}
              style={{ width: '100%', padding: '14px', fontSize: 18, fontWeight: 700, borderRadius: 10, border: '1.5px solid var(--color-border-dark)', textAlign: 'center', marginBottom: 16 }}
            />
            <p style={{ fontSize: 13, color: 'var(--color-gray)', marginBottom: 20 }}>LOT: {lotNo}-00</p>
            <button className="btn-primary btn-lg btn-full" disabled={printing}
              onClick={handleDateConfirm}>
              {printing ? '출력 중...' : 'OQ 라벨 출력 → 검사 시작'}
            </button>
            <button className="btn-text" style={{ marginTop: 8 }} onClick={() => setStep('selector')}>
              ← 이전으로
            </button>
          </div>
        </div>
      )}
      {step === 'inspect' && (
        <InspectionForm
          phi={phi}
          motorType={motorType}
          lotOqNo={actualOqNo}
          testPhase={1}
          onSubmit={handleInspectionSubmit}
          onCancel={handleReset}
        />
      )}
    </>
  )
}
