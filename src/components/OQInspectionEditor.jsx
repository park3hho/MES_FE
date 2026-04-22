// src/components/OQInspectionEditor.jsx
// OQ 검사 편집 전용 컴포넌트 — InspectionList에서 수정 클릭 시 진입
// 호출: App.jsx → editLotSoNo 있을 때 OQPage 대신 렌더
//
// OQPage와의 차이:
// - QR 스캔/작업자 선택 단계 없음 (이미 lot_no 알고 진입)
// - 완료/취소 시 무조건 onBack() → InspectionList로 복귀
// - 신규 OQ 번호 발급 로직 없음 (기존 건 수정 전용)

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { getInspectionData, submitInspection, printStLabel } from '@/api'
import InspectionForm from './InspectionForm'
import { FaradayLogo } from './FaradayLogo'
import { FormSkeleton } from './Skeleton'
import { JUDGMENT, JUDGMENT_COLORS } from '@/constants/etcConst'
// FAIL 버튼 스타일은 OQPage와 동일 (2026-04-22) — module.css 재사용
import sOQ from '@/pages/adm/shipping/OQPage.module.css'

// 판정별 결과 오버레이 구성 — OQPage와 동일 규칙
const RESULT_META = {
  [JUDGMENT.OK]:      { title: '합격',           desc: 'ST 시리얼 발급 · 라벨 출력 완료' },
  [JUDGMENT.FAIL]:    { title: '불합격',         desc: '공정 되돌리기 또는 폐기 선택 필요' },
  [JUDGMENT.PENDING]: { title: '임시 저장 완료', desc: '나머지 항목을 이어서 입력해 주세요' },
  [JUDGMENT.RECHECK]: { title: '재검사 대기',    desc: '측정 환경/장비 점검 후 다시 검사' },
  [JUDGMENT.PROBE]:   { title: '조사 중',        desc: '이상치 원인 파악 후 판정을 다시 내려주세요' },
}

const DONE_REDIRECT_MS = 1200
const ERROR_AUTO_CLEAR_MS = 1800

export default function OQInspectionEditor({ lotNo, onLogout, onBack }) {
  const navigate = useNavigate()
  const [initialData, setInitialData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [doneInfo, setDoneInfo] = useState(null)
  const [error, setError] = useState(null)

  // 초기 로드
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const existing = await getInspectionData(lotNo)
        if (cancelled) return
        if (existing && existing.id) {
          setInitialData(existing)
        } else {
          setError(`검사 데이터를 찾을 수 없습니다. (${lotNo})`)
        }
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
    const t = setTimeout(() => {
      setError(null)
      onBack?.()
    }, ERROR_AUTO_CLEAR_MS)
    return () => clearTimeout(t)
  }, [error, onBack])

  // 완료 후 자동 복귀 — FAIL 시 비활성 (사용자가 되돌리기/폐기 선택 대기, 2026-04-22)
  useEffect(() => {
    if (!done) return
    if (doneInfo?.judgment === JUDGMENT.FAIL) return
    const t = setTimeout(() => onBack?.(), DONE_REDIRECT_MS)
    return () => clearTimeout(t)
  }, [done, doneInfo, onBack])

  const handleSubmit = async (data) => {
    setSubmitting(true)
    try {
      const inspResult = await submitInspection({
        ...data,
        id: initialData.id,   // ← 가장 확실한 upsert 키
        lot_oq_no: initialData.lot_oq_no || '',
        lot_so_no: initialData.lot_so_no || '',
      })

      // ST 라벨 출력 (OK + serial 채번된 경우만)
      if (inspResult.serial_no && inspResult.judgment === JUDGMENT.OK) {
        try {
          await printStLabel(inspResult.serial_no, inspResult.lot_oq_no || initialData.lot_oq_no)
        } catch { /* ST 출력 실패해도 저장은 성공 */ }
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

  // ── 로딩 ──
  if (loading) {
    return (
      <div className="page">
        <div className="card" style={{ padding: 24 }}>
          <FormSkeleton />
        </div>
      </div>
    )
  }

  // ── 에러 ──
  if (error) {
    return (
      <motion.div className="page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-error)' }}>오류</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 8 }}>{error}</p>
        </div>
      </motion.div>
    )
  }

  // ── 완료 ──
  if (done) {
    const j = doneInfo?.judgment || JUDGMENT.PENDING
    const color = JUDGMENT_COLORS[j] || JUDGMENT_COLORS.PENDING
    const meta = RESULT_META[j] || RESULT_META[JUDGMENT.PENDING]
    return (
      <motion.div className="page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <motion.div className="card" style={{ textAlign: 'center', padding: 40 }}
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}>
          <FaradayLogo size="md" />
          <p style={{ fontSize: 20, fontWeight: 700, color, margin: '24px 0 6px' }}>{meta.title}</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-sub, var(--color-gray))', margin: '0 0 10px', lineHeight: 1.5 }}>
            {meta.desc}
          </p>
          {doneInfo?.serial_no && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>ST: {doneInfo.serial_no}</p>
          )}
          {doneInfo?.lot_oq_no && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {doneInfo.lot_oq_no}
            </p>
          )}

          {/* FAIL 판정 시 되돌리기/폐기 선택 — OQPage와 동일 패턴 (2026-04-22)
              initialData.lot_so_no = SM 번호를 LotManagePage로 전달 */}
          {j === JUDGMENT.FAIL && initialData?.lot_so_no && (
            <motion.div
              className={sOQ.failActions}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <button
                type="button"
                className={`${sOQ.failBtn} ${sOQ.failBtnRepair}`}
                onClick={() => navigate('/admin/manage', { state: { mode: 'repair', lotNo: initialData.lot_so_no } })}
              >
                🔧 공정 되돌리기
              </button>
              <button
                type="button"
                className={`${sOQ.failBtn} ${sOQ.failBtnDiscard}`}
                onClick={() => navigate('/admin/manage', { state: { mode: 'discard', lotNo: initialData.lot_so_no } })}
              >
                🗑 폐기 처리
              </button>
              <button
                type="button"
                className={sOQ.failBtnClose}
                onClick={onBack}
              >
                나중에 처리 (닫기)
              </button>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    )
  }

  // ── 검사 폼 ──
  return (
    <InspectionForm
      phi={initialData?.phi || ''}
      motorType={initialData?.motor_type || ''}
      lotOqNo={initialData?.lot_oq_no || '(편집)'}
      testPhase={0}
      initialData={initialData}
      onSubmit={handleSubmit}
      onCancel={onBack}
      submitting={submitting}
    />
  )
}
