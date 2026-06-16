// src/components/RotorOqInspectionEditor.jsx
// 회전자(RT) OQ 검사 편집 — InspectionList 회전자 행 "수정" 진입 (2026-06-16)
// 고정자 OQInspectionEditor 대칭: QR 스캔/작업자 단계 없이 lot 으로 바로 편집.
//   호출: App.jsx ProcessRoute → ?edit=...&line=rotor 일 때 렌더.
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { getInspectionData, submitInspection, reprintRotorLabel } from '@/api'
import RotorInspectionForm from './RotorInspectionForm'
import { FormSkeleton } from './Skeleton'
import { JUDGMENT, JUDGMENT_COLORS } from '@/constants/etcConst'
import sOQ from '@/pages/process/shipping/OQPage.module.css'

const RESULT_META = {
  [JUDGMENT.OK]:      { title: '합격',           desc: 'RT 시리얼 발급 · 라벨 출력 완료' },
  [JUDGMENT.FAIL]:    { title: '불합격',         desc: '이 회전자는 출하 대상에서 제외됩니다' },
  [JUDGMENT.PENDING]: { title: '임시 저장 완료', desc: '내경/외경을 마저 입력해 주세요' },
}
const DONE_REDIRECT_MS = 1200
const ERROR_AUTO_CLEAR_MS = 1800

export default function RotorOqInspectionEditor({ lotNo, onLogout, onBack }) {
  const [initialData, setInitialData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [doneInfo, setDoneInfo] = useState(null)
  const [error, setError] = useState(null)

  // 초기 로드 — BO 또는 OQ LOT 으로 기존 검사 조회 (회전자)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const existing = await getInspectionData(lotNo, 'rotor')
        if (cancelled) return
        if (existing && existing.id) setInitialData(existing)
        else setError(`검사 데이터를 찾을 수 없습니다. (${lotNo})`)
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [lotNo])

  // 에러 자동 해제 + 복귀
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => { setError(null); onBack?.() }, ERROR_AUTO_CLEAR_MS)
    return () => clearTimeout(t)
  }, [error, onBack])

  // 완료 후 자동 복귀
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => onBack?.(), DONE_REDIRECT_MS)
    return () => clearTimeout(t)
  }, [done, onBack])

  const handleSubmit = async (data) => {
    setSubmitting(true)
    try {
      const inspResult = await submitInspection({
        ...data,
        id: initialData.id,             // ← 가장 확실한 upsert 키
        line: 'rotor',
        lot_bo_no: initialData.lot_bo_no || '',
        lot_oq_no: initialData.lot_oq_no || '',
      })
      // RT 라벨 출력 (OK + serial 채번된 경우만)
      if (inspResult.serial_no && inspResult.judgment === JUDGMENT.OK) {
        try { await reprintRotorLabel(inspResult.serial_no) } catch { /* 라벨 실패해도 저장 성공 */ }
      }
      setDoneInfo({
        judgment: inspResult.judgment || data.judgment || JUDGMENT.PENDING,
        serial_no: inspResult.serial_no || '',
        lot_oq_no: inspResult.lot_oq_no || initialData.lot_oq_no || '',
      })
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="page-flat"><FormSkeleton /></div>
  }

  if (error) {
    return (
      <motion.div className={`page-flat ${sOQ.resultOverlay}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className={sOQ.resultCard}>
          <p className={sOQ.errorTitle}>오류</p>
          <p className={sOQ.resultMeta}>{error}</p>
        </div>
      </motion.div>
    )
  }

  if (done) {
    const j = doneInfo?.judgment || JUDGMENT.PENDING
    const color = JUDGMENT_COLORS[j] || JUDGMENT_COLORS.PENDING
    const meta = RESULT_META[j] || RESULT_META[JUDGMENT.PENDING]
    return (
      <motion.div className={`page-flat ${sOQ.resultOverlay}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <motion.div className={sOQ.resultCard}
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35 }}>
          <p className={sOQ.resultLabel} style={{ color, margin: '24px 0 6px' }}>{meta.title}</p>
          <p className={sOQ.resultDesc}>{meta.desc}</p>
          {doneInfo?.serial_no && <p className={sOQ.resultMeta}>RT: {doneInfo.serial_no}</p>}
          {doneInfo?.lot_oq_no && <p className={sOQ.resultMetaSm}>{doneInfo.lot_oq_no}</p>}
        </motion.div>
      </motion.div>
    )
  }

  return (
    <RotorInspectionForm
      phi={initialData?.phi || ''}
      motorType={initialData?.motor_type || ''}
      lotOqNo={initialData?.lot_oq_no || '(편집)'}
      lotBoNo={initialData?.lot_bo_no || ''}
      initialData={initialData}
      onSubmit={handleSubmit}
      onCancel={onBack}
    />
  )
}
