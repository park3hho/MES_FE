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
import {
  getInspectionData, submitInspection, printStLabel,
  createQcInspection, repairLotWithLabels,
} from '@/api'
import InspectionForm from './InspectionForm'
import { FaradayLogo } from './FaradayLogo'
import { FormSkeleton } from './Skeleton'
import { JUDGMENT, JUDGMENT_COLORS } from '@/constants/etcConst'
import { QC_TYPE, HANDLE_METHOD, RESPONSIBLE } from '@/constants/qcConst'
import { emitToast } from '@/contexts/ToastContext'
// OQ FAIL 후속 wizard (2026-06-05) — OQPage 와 동일 패턴.
// 기존 LotManagePage 유도(되돌리기/폐기 3-버튼) 를 흡수해 IQ/IPQ 와 동일한 NG 시퀀스로 통합.
import {
  NgFollowupWizard, REPAIR_LABEL_TO_CODE, getActualRepairDest, TODAY,
} from '@/pages/process/manage/qcInspectShared'
// FAIL 버튼 스타일은 OQPage와 동일 — module.css 재사용
import sOQ from '@/pages/process/shipping/OQPage.module.css'

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
  const [initialData, setInitialData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [doneInfo, setDoneInfo] = useState(null)
  const [error, setError] = useState(null)
  // OQ FAIL 후속 wizard 상태 (2026-06-05) — OQPage 와 동일.
  const [ngSaving, setNgSaving] = useState(false)
  const [ngDone, setNgDone] = useState(null)   // { repair_lot_no?, nc_no?, handle_method? }

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

  // OQ FAIL 후속 wizard 핸들러 (2026-06-05) — OQPage.handleOqFailSubmit 와 동일 로직.
  //   1) QcInspection(type=OQ, defect_qty=1) 생성 — 재작업이면 BE 가 NCR 자동격리 우회.
  //   2) handle_method=재작업 + 문제공정 있으면 즉시 repair_lot + 라벨 출력.
  //   3) 그 외(조건부출하/반품/폐기/미정) → BE 가 NCR 자동 생성.
  const handleOqFailSubmit = async (ngForm) => {
    const lotSoNo = initialData?.lot_so_no
    if (!lotSoNo) {
      emitToast('SO LOT 정보가 없어 처리할 수 없습니다.', 'error')
      return
    }
    setNgSaving(true)
    try {
      const body = {
        inspection_type: QC_TYPE.OQ,
        inspection_date: TODAY(),
        process_category: '공정',
        product_type: '반제품',
        inspection_target: '고정자',
        // ★ 게이트 흐름: prev → qc_no → lot_no(post) (2026-06-05 수정)
        // SO LOT 은 검사 대상이므로 lot_no_prev 에 넣어야 함. 기존엔 lot_no=lotSoNo 로
        // 잘못 보내서 post 자리에 SO LOT 이 표시되는 버그.
        lot_no_prev: lotSoNo,
        // qc_no = OQ 번호 — BE 가 inspector 빈값 시 여기서 worker 코드 추출.
        qc_no: initialData?.lot_oq_no || '',
        // lot_no(post) 는 재공정 결과 LOT — repairLotWithLabels 호출 후에야 알 수 있어서 빈값.
        //   list_ 응답의 oq_repair_map 이 Inventory.repair_from 으로 동적 매칭.
        lot_no: '',
        size: initialData?.phi || '',
        unit: 'ea',
        inspection_qty: 1,
        good_qty: 0,
        defect_qty: 1,
        defect_detail: ngForm.defect_detail || '',
        responsible: ngForm.responsible || '',
        responsible_qty: ngForm.responsible_qty === '' ? null : parseFloat(ngForm.responsible_qty),
        handle_method: ngForm.handle_method || '',
        remark: ngForm.remark || '',
        inspector: '',
      }
      const res = await createQcInspection(body)
      const ins = res.inspection

      let repairLotNo = ''
      if (ngForm.handle_method === HANDLE_METHOD.REWORK && ngForm.problem_process) {
        const dest = getActualRepairDest(ngForm.problem_process)
        if (dest) {
          try {
            const r = await repairLotWithLabels(lotSoNo, dest, {
              reason: ngForm.defect_detail || 'OQ FAIL',
              category: REPAIR_LABEL_TO_CODE[(ngForm.defect_detail || '').split('|')[0]] || 'etc',
              problemCode: ngForm.problem_process,   // 세부 방식(WM/BM/SM..) → 재공정 LOT suffix (2026-06-16)
            })
            repairLotNo = r.repair_lot || r.repair_lot_no || ''
          } catch (e) {
            emitToast(`재공정 처리 실패: ${e.message}`, 'error')
          }
        }
      }

      setNgDone({
        nc_no: ins?.nc_no || '',
        repair_lot_no: repairLotNo || ins?.repair_lot_no || '',
        handle_method: ngForm.handle_method,
      })
      emitToast(
        repairLotNo ? `재공정 LOT 발급: ${repairLotNo}` :
        ins?.nc_no ? 'NCR 발급됨 — 부적합품 관리에서 처분' :
        '저장되었습니다',
        repairLotNo ? 'success' : 'warning',
      )
    } catch (e) {
      emitToast(e.message || '저장 실패', 'error')
    } finally {
      setNgSaving(false)
    }
  }

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
      <div className="page-flat">
        <FormSkeleton />
      </div>
    )
  }

  // ── 에러 ──
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

  // ── 완료 ──
  if (done) {
    const j = doneInfo?.judgment || JUDGMENT.PENDING
    const color = JUDGMENT_COLORS[j] || JUDGMENT_COLORS.PENDING
    const meta = RESULT_META[j] || RESULT_META[JUDGMENT.PENDING]
    return (
      <motion.div className={`page-flat ${sOQ.resultOverlay}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <motion.div className={sOQ.resultCard}
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}>
          <FaradayLogo size="md" />
          <p className={sOQ.resultLabel} style={{ color, margin: '24px 0 6px' }}>{meta.title}</p>
          <p className={sOQ.resultDesc}>{meta.desc}</p>
          {doneInfo?.serial_no && (
            <p className={sOQ.resultMeta}>ST: {doneInfo.serial_no}</p>
          )}
          {doneInfo?.lot_oq_no && (
            <p className={sOQ.resultMetaSm}>{doneInfo.lot_oq_no}</p>
          )}

          {/* FAIL 판정 시 NgFollowupWizard (2026-06-05) — OQPage 와 동일 통합.
              기존 LotManagePage 유도(3-버튼) 흡수, IQ/IPQ 와 동일 NG 시퀀스 (불량내용 → 귀책 → 처리방법 → 문제공정 → 비고). */}
          {j === JUDGMENT.FAIL && initialData?.lot_so_no && !ngDone && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              style={{ width: '100%', marginTop: 16 }}>
              <NgFollowupWizard
                lotNo={initialData.lot_so_no}
                detectedProcess="SO"
                lotChain={initialData?.lot_chain}
                defectQty={1}
                responsibleOptions={[RESPONSIBLE.SELF, RESPONSIBLE.SUPPLIER, RESPONSIBLE.OUTSOURCE]}
                onSubmit={handleOqFailSubmit}
                onCancel={onBack}
                saving={ngSaving}
                submitLabel="저장 + 처리"
              />
            </motion.div>
          )}
          {/* FAIL + wizard 완료 후 결과 (재공정 LOT 또는 NCR 번호) */}
          {j === JUDGMENT.FAIL && ngDone && (
            <motion.div className={sOQ.failActions}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}>
              {ngDone.repair_lot_no && (
                <div style={{ padding: '12px 14px', background: '#eff6ff', borderRadius: 10, marginBottom: 10, fontWeight: 600 }}>
                  🔧 재공정 LOT: {ngDone.repair_lot_no}
                </div>
              )}
              {ngDone.nc_no && (
                <div style={{ padding: '12px 14px', background: '#fef3c7', borderRadius: 10, marginBottom: 10, fontWeight: 600 }}>
                  ⚠ NCR 발급: {ngDone.nc_no} — 부적합품 관리에서 처분
                </div>
              )}
              <button type="button" className={sOQ.failBtnClose} onClick={onBack}>
                닫기
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
      lotSoNo={initialData?.lot_so_no || ''}
      initialData={initialData}
      onSubmit={handleSubmit}
      onCancel={onBack}
      submitting={submitting}
    />
  )
}
