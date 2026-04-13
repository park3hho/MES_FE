import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
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
  const [doneInfo, setDoneInfo] = useState(null) // { judgment, serial_no }
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const effectiveDate = overrideDate || date

  // 1) SO 스캔 → 기존 데이터 먼저 확인 (consumed된 SO도 수정 가능)
  const handleScan = async (val) => {
    // 기존 검사 데이터 먼저 조회 (SO가 consumed여도 수정 가능)
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

      // ST 라벨 출력 (OK + serial 채번된 경우만)
      if (inspResult.serial_no && inspResult.judgment === 'OK') {
        try {
          await printStLabel(inspResult.serial_no, actualOqNo || inspResult.lot_oq_no)
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
    setSelections(null); setOverrideDate(null); setInitialData(null); setIsEdit(false)
    setPrinting(false); setDone(false); setDoneInfo(null); setError(null); setStep('qr')
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
      {step === 'inspect' && !done && (
        <InspectionForm
          phi={phi}
          motorType={motorType}
          lotOqNo={actualOqNo || ''}
          testPhase={0}
          initialData={isEdit ? initialData : null}
          onSubmit={handleInspectionSubmit}
          onCancel={handleReset}
        />
      )}

      {/* 저장 완료 피드백 */}
      {done && (() => {
        const j = doneInfo?.judgment || 'PENDING'
        const isFail = j === 'FAIL'
        const isPending = j === 'PENDING'
        const color = isFail ? '#c0392b' : isPending ? '#e67e22' : '#27ae60'
        const bgColor = isFail ? '#fdedec' : isPending ? '#fef9e7' : '#eafaf1'
        const label = isFail ? '불합격' : isPending ? '임시 저장 완료' : (isEdit ? '수정 완료' : '저장 완료')
        return (
          <motion.div className="page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div className="card" style={{ textAlign: 'center', padding: 40 }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <FaradayLogo size="md" />
              <motion.div style={{ margin: '24px 0' }}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
                  <motion.circle cx="24" cy="24" r="22" stroke={color} strokeWidth="2.5" fill={bgColor}
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay: 0.1 }} />
                  {isFail ? (
                    <>
                      <motion.path d="M16 16L32 32" stroke={color} strokeWidth="3" strokeLinecap="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                        transition={{ duration: 0.3, delay: 0.3 }} />
                      <motion.path d="M32 16L16 32" stroke={color} strokeWidth="3" strokeLinecap="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                        transition={{ duration: 0.3, delay: 0.4 }} />
                    </>
                  ) : (
                    <motion.path d="M14 24.5L20.5 31L34 17" stroke={color} strokeWidth="3"
                      strokeLinecap="round" strokeLinejoin="round" fill="none"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      transition={{ duration: 0.4, delay: 0.25 }} />
                  )}
                </svg>
              </motion.div>
              <motion.p style={{ fontSize: 18, fontWeight: 700, color, margin: 0 }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.45 }}
              >{label}</motion.p>
              {doneInfo?.serial_no && (
                <motion.p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >ST: {doneInfo.serial_no}</motion.p>
              )}
              {actualOqNo && (
                <motion.p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: 0.65 }}
                >{actualOqNo}</motion.p>
              )}
            </motion.div>
          </motion.div>
        )
      })()}

      {/* 에러 피드백 */}
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
