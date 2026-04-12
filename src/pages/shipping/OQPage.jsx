import { useState, useEffect } from 'react'
import { printLot, scanLot, submitInspection, printStLabel, getInspectionData } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import InspectionForm from '@/components/InspectionForm'
import { useDate } from '@/utils/useDate'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import { OQ_STEPS } from '@/constants/processConst'
import { FaradayLogo } from '@/components/FaradayLogo'

export default function OQPage({ onLogout, onBack, editLotSoNo = null, onEditDone }) {
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
  const [initialData, setInitialData] = useState(null) // 기존 검사 데이터 (수정 모드)
  const [isEdit, setIsEdit] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const effectiveDate = overrideDate || date

  // 1) SO 스캔 → 기존 데이터 먼저 확인 (consumed된 SO도 수정 가능)
  const handleScan = async (val) => {
    // 기존 검사 데이터 먼저 조회 (SO가 consumed여도 수정 가능)
    try {
      const existing = await getInspectionData(val)
      if (existing && existing.test_phase > 0) {
        setPrevLotNo(val)
        setInitialData(existing)
        setActualOqNo(existing.lot_oq_no || null)
        setIsEdit(true)
        setPhi(existing.phi || '')
        setMotorType(existing.motor_type || '')
        setStep('inspect')
        return
      }
    } catch { /* 기존 데이터 없음 → 신규 진행 */ }

    // 신규: scanLot으로 SO 유효성 검증
    const r = await scanLot('OQ', val)
    setPrevLotNo(r.prev_lot_no)
    setLotChain(r.lot_chain)
    setQuantity(r.quantity)
    setPhi(r.spec || '')
    setMotorType(r.motor_type || '')
    setIsEdit(false)
    setInitialData(null)
    setStep('selector')
  }

  // 2) 작업자 코드
  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`OQ${sel.worker}${effectiveDate}`)
    setStep('date_pick')
  }

  // 3) 날짜 확인 → OQ 라벨 출력 → 검사 입력
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

  // 4) 검사 입력 완료 → 저장 + ST 라벨
  const handleInspectionSubmit = async (data) => {
    setPrinting(true)
    try {
      const inspResult = await submitInspection({
        ...data,
        lot_oq_no: actualOqNo || '',
        lot_so_no: prevLotNo,
      })

      // ST 라벨 출력 (신규 채번된 경우만)
      if (inspResult.serial_no) {
        await printStLabel(inspResult.serial_no, actualOqNo || inspResult.lot_oq_no)
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
    setPhi(''); setMotorType(''); setLotNo(null); setActualOqNo(null)
    setSelections(null); setOverrideDate(null); setInitialData(null); setIsEdit(false)
    setPrinting(false); setDone(false); setError(null); setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  // InspectionList에서 수정 버튼 → editLotSoNo로 바로 데이터 로드
  useEffect(() => {
    if (!editLotSoNo) return
    ;(async () => {
      try {
        const existing = await getInspectionData(editLotSoNo)
        if (existing && existing.test_phase > 0) {
          setPrevLotNo(editLotSoNo)
          setInitialData(existing)
          setActualOqNo(existing.lot_oq_no || null)
          setPhi(existing.phi || '')
          setMotorType(existing.motor_type || '')
          setIsEdit(true)
          setStep('inspect')
        }
      } catch { /* 데이터 없으면 무시 */ }
    })()
  }, [editLotSoNo])

  return (
    <>
      {step === 'qr' && (
        <QRScanner key={step} processLabel="OQ, 출하검사"
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
          lotOqNo={actualOqNo || `(신규)`}
          testPhase={0}
          initialData={isEdit ? initialData : null}
          onSubmit={handleInspectionSubmit}
          onCancel={handleReset}
        />
      )}
    </>
  )
}
