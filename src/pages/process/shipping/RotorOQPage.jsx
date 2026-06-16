// src/pages/process/shipping/RotorOQPage.jsx
// ★ 회전자(RT) OQ 검사 — BO 본딩 스캔 → 내경/외경 지그 → 합격 시 RT 발급 (2026-06-16)
// 고정자 OQPage 의 회전자 대칭(단순판): OQPage 가 line='rotor' 선택 시 위임.
//   · BO 메타(phi/motor)는 getInspectionData(boLot,'rotor') 가 본딩 체인에서 제공.
//   · OQ 번호는 BE(save_rotor_inspection)가 worker 로 자동 채번.
//   · 합격(OK) 시 BE 가 RT 시리얼 발급 → FE 가 reprintRotorLabel 로 라벨 출력.
import { useState } from 'react'
import { motion } from 'framer-motion'
import { submitInspection, getInspectionData, reprintRotorLabel } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import RotorInspectionForm from '@/components/RotorInspectionForm'
import { useDate } from '@/utils/useDate'
import { OQ_STEPS } from '@/constants/processConst'
import { JUDGMENT, JUDGMENT_COLORS } from '@/constants/etcConst'
import s from './OQPage.module.css'

const RESULT_META = {
  [JUDGMENT.OK]:      { title: '합격',           desc: 'RT 시리얼 발급 · 라벨 출력 완료' },
  [JUDGMENT.FAIL]:    { title: '불합격',         desc: '이 회전자는 출하 대상에서 제외됩니다' },
  [JUDGMENT.PENDING]: { title: '임시 저장 완료', desc: '내경/외경을 마저 입력해 주세요' },
}

export default function RotorOQPage({ onLogout, onBack }) {
  const date = useDate()
  const [boLotNo, setBoLotNo] = useState(null)
  const [phi, setPhi] = useState('')
  const [motorType, setMotorType] = useState('')
  const [actualOqNo, setActualOqNo] = useState(null)
  const [worker, setWorker] = useState(null)
  const [initialData, setInitialData] = useState(null)
  const [isEdit, setIsEdit] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [doneInfo, setDoneInfo] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  // BO 스캔 — 기존 검사 있으면 편집, 없으면 메타(phi/motor) 받아 신규 진입
  const handleScan = async (val) => {
    if (val.toUpperCase().startsWith('OQ')) {
      throw new Error('BO LOT(본딩)만 스캔 가능합니다. OQ 편집은 검사 목록에서 수정을 눌러주세요.')
    }
    let existing = null
    try {
      existing = await getInspectionData(val, 'rotor')
    } catch (e) {
      throw new Error(`검사 데이터 조회 실패: ${e.message}`)
    }
    // BE: 검사 있으면 id 포함, 신규는 메타(phi/motor)+is_new, 잘못된 BO 는 null
    if (!existing || (!existing.phi && !existing.id)) {
      throw new Error('유효한 회전자 본딩(BO) LOT 이 아닙니다.')
    }
    setBoLotNo(existing.lot_bo_no || val)
    setPhi(existing.phi || '')
    setMotorType(existing.motor_type || '')
    if (existing.id) {
      setInitialData(existing)
      setActualOqNo(existing.lot_oq_no || null)
      setIsEdit(true)
      setStep('inspect')
    } else {
      setInitialData(null)
      setActualOqNo(null)
      setIsEdit(false)
      setStep('selector')
    }
  }

  // 작업자 선택 → OQ 번호는 저장 시 BE 채번
  const handleMaterialSubmit = (sel) => {
    setWorker(sel.worker)
    setStep('inspect')
  }

  const handleInspectionSubmit = async (data) => {
    setPrinting(true)
    try {
      const inspResult = await submitInspection({
        ...data,
        line: 'rotor',
        lot_bo_no: boLotNo,
        lot_oq_no: actualOqNo || '',
        worker: worker || '',
      })
      if (inspResult.lot_oq_no) setActualOqNo(inspResult.lot_oq_no)
      // RT 라벨 출력 (OK + serial 발급된 경우만)
      if (inspResult.serial_no && inspResult.judgment === 'OK') {
        try {
          await reprintRotorLabel(inspResult.serial_no)
        } catch { /* RT 라벨 실패해도 저장은 성공 */ }
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
    setBoLotNo(null); setPhi(''); setMotorType(''); setActualOqNo(null); setWorker(null)
    setInitialData(null); setIsEdit(false)
    setPrinting(false); setDone(false); setDoneInfo(null); setError(null); setStep('qr')
  }
  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'qr' && (
        <QRScanner key={step} processLabel="회전자 OQ — 본딩(BO) LOT 스캔"
          onScan={handleScan} onLogout={onLogout} onBack={onBack} />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={OQ_STEPS} autoValues={{ date, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={boLotNo ? { lot_no: boLotNo } : null} />
      )}
      {step === 'inspect' && !done && !error && (
        <RotorInspectionForm
          phi={phi}
          motorType={motorType}
          lotOqNo={actualOqNo || '(저장 시 발급)'}
          lotBoNo={boLotNo}
          initialData={isEdit ? initialData : null}
          onSubmit={handleInspectionSubmit}
          onCancel={handleReset}
        />
      )}

      {done && (() => {
        const j = doneInfo?.judgment || JUDGMENT.PENDING
        const color = JUDGMENT_COLORS[j] || JUDGMENT_COLORS.PENDING
        const meta = RESULT_META[j] || RESULT_META[JUDGMENT.PENDING]
        return (
          <motion.div className={`page-flat ${s.resultOverlay}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <motion.div className={s.resultCard}
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35 }}>
              <motion.p className={s.resultLabel} style={{ color }}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                {meta.title}
              </motion.p>
              <motion.p className={s.resultDesc}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                {meta.desc}
              </motion.p>
              {doneInfo?.serial_no && (
                <motion.p className={s.resultMeta}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                  RT: {doneInfo.serial_no}
                </motion.p>
              )}
              {actualOqNo && (
                <motion.p className={s.resultMetaSm}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
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
