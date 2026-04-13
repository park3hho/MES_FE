import { useState, useEffect } from 'react'
import { printLot, scanLot, submitInspection, printStLabel, getInspectionData } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import InspectionForm from '@/components/InspectionForm'
import { useDate } from '@/utils/useDate'
import { OQ_STEPS } from '@/constants/processConst'

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
  const [initialData, setInitialData] = useState(null)
  const [isEdit, setIsEdit] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [doneInfo, setDoneInfo] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  // SO/OQ 스캔 → 기존 데이터 먼저 확인, 없으면 신규
  const handleScan = async (val) => {
    // 1. 기존 검사 데이터 조회 (SO든 OQ든)
    try {
      const existing = await getInspectionData(val)
      if (existing && existing.id) {
        setPrevLotNo(existing.lot_so_no || val)
        setInitialData(existing)
        setActualOqNo(existing.lot_oq_no || null)
        setIsEdit(true)
        setPhi(existing.phi || '')
        setMotorType(existing.motor_type || '')
        setStep('inspect')
        return
      }
    } catch { /* 기존 데이터 없음 */ }

    // 2. 신규: scanLot으로 SO 유효성 검증 + phi/motor 가져오기
    const r = await scanLot('OQ', val)
    setPrevLotNo(r.prev_lot_no)
    setLotChain(r.lot_chain)
    setQuantity(r.quantity)
    setPhi(r.spec || '')
    setMotorType(r.motor_type || '')
    setIsEdit(false)
    setInitialData(null)
    setActualOqNo(null)
    setStep('selector')
  }

  // 작업자 코드 → 바로 검사 폼 (OQ 번호는 저장 시 발급)
  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`OQ${sel.worker}${date}`)
    setStep('inspect')
  }

  // 검사 저장 (저장/ST출력 공통)
  const handleInspectionSubmit = async (data) => {
    setPrinting(true)
    try {
      let oqNo = actualOqNo

      // OQ 번호 없으면 첫 저장 시 발급 + 라벨 출력
      if (!oqNo && selections) {
        const result = await printLot(lotNo, 1, {
          selected_process: 'OQ',
          lot_chain: lotChain,
          prev_lot_no: prevLotNo,
          ...selections,
        })
        oqNo = result.lot_nums?.[0] || lotNo
        setActualOqNo(oqNo)
      }

      const inspResult = await submitInspection({
        ...data,
        lot_oq_no: oqNo || '',
        lot_so_no: prevLotNo,
      })

      // OQ 번호 업데이트 (BE에서 생성된 경우)
      if (inspResult.lot_oq_no) setActualOqNo(inspResult.lot_oq_no)

      // ST 라벨 출력 (OK + serial 채번된 경우만)
      if (inspResult.serial_no && inspResult.judgment === 'OK') {
        try {
          await printStLabel(inspResult.serial_no, oqNo || inspResult.lot_oq_no)
        } catch { /* ST 출력 실패해도 저장은 성공 */ }
      }

      setDoneInfo({
        judgment: inspResult.judgment || data.judgment || 'PENDING',
        serial_no: inspResult.serial_no || '',
      })
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
    setSelections(null); setInitialData(null); setIsEdit(false)
    setPrinting(false); setDone(false); setDoneInfo(null); setError(null); setStep('qr')
    if (onEditDone) onEditDone()
  }

  useAutoReset(error, done, handleReset)

  // InspectionList에서 수정 버튼 → editLotSoNo로 바로 데이터 로드
  useEffect(() => {
    if (!editLotSoNo) return
    ;(async () => {
      try {
        const existing = await getInspectionData(editLotSoNo)
        if (existing && existing.id) {
          setPrevLotNo(existing.lot_so_no || editLotSoNo)
          setInitialData(existing)
          setActualOqNo(existing.lot_oq_no || null)
          setPhi(existing.phi || '')
          setMotorType(existing.motor_type || '')
          setIsEdit(true)
          setStep('inspect')
        }
      } catch { /* 무시 */ }
    })()
  }, [editLotSoNo])

  return (
    <>
      {step === 'qr' && (
        <QRScanner key={step} processLabel="OQ, 출하검사"
          onScan={handleScan} onLogout={onLogout} onBack={onBack} />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={OQ_STEPS} autoValues={{ date, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity } : null} />
      )}
      {step === 'inspect' && !done && !error && (
        <InspectionForm
          phi={phi}
          motorType={motorType}
          lotOqNo={actualOqNo || '(저장 시 발급)'}
          testPhase={0}
          initialData={isEdit ? initialData : null}
          onSubmit={handleInspectionSubmit}
          onCancel={editLotSoNo ? onBack : handleReset}
        />
      )}

      {done && (() => {
        const j = doneInfo?.judgment || 'PENDING'
        const isFail = j === 'FAIL'
        const isPending = j === 'PENDING'
        const color = isFail ? '#c0392b' : isPending ? '#e67e22' : '#27ae60'
        const label = isFail ? '불합격' : isPending ? '임시 저장 완료' : (isEdit ? '수정 완료' : '저장 완료')
        return (
          <div className="page">
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ fontSize: 40, margin: 0 }}>{isFail ? '✕' : isPending ? '⏳' : '✓'}</p>
              <p style={{ fontSize: 18, fontWeight: 700, color, margin: '12px 0 0' }}>{label}</p>
              {doneInfo?.serial_no && (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>ST: {doneInfo.serial_no}</p>
              )}
              {actualOqNo && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{actualOqNo}</p>
              )}
            </div>
          </div>
        )
      })()}

      {error && (
        <div className="page">
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#c0392b' }}>오류</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 8 }}>{error}</p>
          </div>
        </div>
      )}
    </>
  )
}
