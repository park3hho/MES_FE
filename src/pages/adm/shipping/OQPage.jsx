import { useState } from 'react'
import { motion } from 'framer-motion'
import { printLot, scanLot, submitInspection, printStLabel, getInspectionData } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import InspectionForm from '@/components/InspectionForm'
import { useDate } from '@/utils/useDate'
import { OQ_STEPS } from '@/constants/processConst'
import s from './OQPage.module.css'

export default function OQPage({ onLogout, onBack }) {
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
    // 1. 기존 검사 데이터 조회 (SO든 OQ든 둘 다 BE에서 lot_oq_no 우선 → lot_so_no fallback)
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
    } catch (e) {
      // 404(기존 데이터 없음) 외 에러는 사용자에게 알림 — 네트워크/500 등을 조용히 삼켜 신규 흐름 진입 방지
      const msg = (e?.message || '').toLowerCase()
      const isNotFound = msg.includes('404') || msg.includes('찾') || msg.includes('없')
      if (!isNotFound) {
        setError(e.message || '검사 데이터 조회 실패')
        return
      }
      // fallthrough — 기존 데이터 없음 → 아래 신규 흐름
    }

    // 2. OQ 번호 스캔인데 inspection 없음 — 검사 폼으로 직행 (레거시 OQ 라벨 or 데이터 유실 케이스)
    //    phi/motor는 폼의 MotorTypeSection에서 사용자가 선택, 저장 시 lot_oq_no 기준 upsert
    if (val.toUpperCase().startsWith('OQ')) {
      setPrevLotNo('')
      setLotChain(null)
      setQuantity(1)
      setActualOqNo(val)   // 이미 발급된 OQ 번호 사용, 첫 저장 시 재발급 안 함
      setIsEdit(false)
      setInitialData(null)
      setPhi('')
      setMotorType('')
      setStep('inspect')
      return
    }

    // 3. SO 번호 → scanLot으로 유효성 검증 + phi/motor 가져오기 + selector 단계
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
  }

  useAutoReset(error, done, handleReset)

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
          onCancel={handleReset}
        />
      )}

      {done && (() => {
        const j = doneInfo?.judgment || 'PENDING'
        const isFail = j === 'FAIL'
        const isPending = j === 'PENDING'
        // 색상은 동적 판정값 기반 → 인라인 유지 (규약 허용)
        const color = isFail ? '#c0392b' : isPending ? '#e67e22' : '#27ae60'
        const bgColor = isFail ? '#fdedec' : isPending ? '#fef9e7' : '#eafaf1'
        const label = isFail ? '불합격' : isPending ? '임시 저장 완료' : '검사 통과'
        return (
          <motion.div className={`page-flat ${s.resultOverlay}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <motion.div className={s.resultCard}
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}>
              <motion.div className={s.resultIcon}
                initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.15, ease: [0.34, 1.56, 0.64, 1] }}>
                <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
                  <motion.circle cx="24" cy="24" r="22" stroke={color} strokeWidth="2.5" fill={bgColor}
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.1 }} />
                  {isFail ? (
                    <>
                      <motion.path d="M16 16L32 32" stroke={color} strokeWidth="3" strokeLinecap="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.3 }} />
                      <motion.path d="M32 16L16 32" stroke={color} strokeWidth="3" strokeLinecap="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.4 }} />
                    </>
                  ) : isPending ? (
                    <motion.path d="M24 14V28M24 33V34" stroke={color} strokeWidth="3" strokeLinecap="round"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.25 }} />
                  ) : (
                    <motion.path d="M14 24.5L20.5 31L34 17" stroke={color} strokeWidth="3"
                      strokeLinecap="round" strokeLinejoin="round" fill="none"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.25 }} />
                  )}
                </svg>
              </motion.div>
              <motion.p className={s.resultLabel} style={{ color }}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.45 }}>
                {label}
              </motion.p>
              {doneInfo?.serial_no && (
                <motion.p className={s.resultMeta}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                  ST: {doneInfo.serial_no}
                </motion.p>
              )}
              {actualOqNo && (
                <motion.p className={s.resultMetaSm}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
                  {actualOqNo}
                </motion.p>
              )}
            </motion.div>
          </motion.div>
        )
      })()}

      {error && (
        <motion.div className={`page-flat ${s.resultOverlay}`}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={s.resultCard}>
            <p className={s.errorTitle}>오류</p>
            <p className={s.resultMeta}>{error}</p>
          </div>
        </motion.div>
      )}
    </>
  )
}
