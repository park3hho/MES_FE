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
        <div className="page-flat" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ padding: '12px var(--space-lg)' }}>
            <button onClick={() => setStep('selector')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-dark)', display: 'flex', alignItems: 'center' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </div>
          <div style={{ flex: 1, padding: '20px var(--space-xl) 0', maxWidth: 480, width: '100%', margin: '0 auto' }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-dark)', marginBottom: 8 }}>작업일을 선택해 주세요</h1>
            <p style={{ color: 'var(--color-text-sub)', fontSize: 14, marginBottom: 28 }}>
              날짜 확인 후 OQ 라벨이 출력됩니다
            </p>
            <input type="date" defaultValue={toInputDate(effectiveDate)}
              onChange={(e) => {
                const yy = toYYMMDD(e.target.value)
                setOverrideDate(yy === date ? null : yy)
                if (selections) setLotNo(`OQ${selections.worker}${yy || date}`)
              }}
              style={{ width: '100%', padding: 18, fontSize: 18, fontWeight: 700, borderRadius: 12, border: '1.5px solid var(--color-border)', textAlign: 'center', marginBottom: 12, boxSizing: 'border-box', background: 'var(--color-bg)' }}
            />
            <p style={{ fontSize: 13, color: 'var(--color-gray)', marginBottom: 28, textAlign: 'center' }}>LOT: {lotNo}-00</p>
            <button className="btn-primary btn-lg btn-full" disabled={printing}
              onClick={handleDateConfirm}>
              {printing ? '출력 중...' : 'OQ 라벨 출력'}
            </button>
          </div>
        </div>
      )}
      {step === 'inspect' && (
        <InspectionForm
          phi={phi}
          motorType={motorType}
          lotOqNo={actualOqNo}
          lotSoNo={prevLotNo}
          testPhase={1}
          onSubmit={handleInspectionSubmit}
          onCancel={handleReset}
        />
      )}
    </>
  )
}
