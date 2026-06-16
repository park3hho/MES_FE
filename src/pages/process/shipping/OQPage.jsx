import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  printLot, scanLot, submitInspection, printStLabel, getInspectionData,
  createQcInspection, repairLotWithLabels,
} from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import InspectionForm from '@/components/InspectionForm'
import RotorOQPage from './RotorOQPage'
import { useDate } from '@/utils/useDate'
import { OQ_STEPS } from '@/constants/processConst'
import { JUDGMENT, JUDGMENT_COLORS, JUDGMENT_LABELS } from '@/constants/etcConst'
import { QC_TYPE, QC_JUDGMENT, HANDLE_METHOD, RESPONSIBLE } from '@/constants/qcConst'
import { emitToast } from '@/contexts/ToastContext'
import {
  NgFollowupWizard, REPAIR_LABEL_TO_CODE, getActualRepairDest, TODAY,
} from '@/pages/process/manage/qcInspectShared'
import s from './OQPage.module.css'

// 판정별 결과 오버레이 구성 — 색상/제목/설명 중앙화
// color + bg: JUDGMENT_COLORS의 hex에 alpha 섞은 연한 배경은 CSS 변수 대신 hex 직접 사용
const RESULT_META = {
  [JUDGMENT.OK]:      { title: '합격',           desc: 'ST 시리얼 발급 · 라벨 출력 완료',      bg: '#eafaf1' },
  [JUDGMENT.FAIL]:    { title: '불합격',         desc: '공정 되돌리기 또는 폐기 선택 필요',    bg: '#fdedec' },
  [JUDGMENT.PENDING]: { title: '임시 저장 완료', desc: '나머지 항목을 이어서 입력해 주세요',   bg: '#fef9e7' },
  [JUDGMENT.RECHECK]: { title: '재검사 대기',    desc: '측정 환경/장비 점검 후 다시 검사',     bg: '#ebf3fb' },
  [JUDGMENT.PROBE]:   { title: '조사 중',        desc: '이상치 원인 파악 후 판정을 다시 내려주세요', bg: '#f5eaf8' },
}

// 상태별 SVG 아이콘 path (circle 배경 + 중앙 심볼)
const renderJudgmentSymbol = (judgment, color) => {
  const common = { stroke: color, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }
  if (judgment === JUDGMENT.OK) {
    return <motion.path d="M14 24.5L20.5 31L34 17" {...common}
      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.25 }} />
  }
  if (judgment === JUDGMENT.FAIL) {
    return (
      <>
        <motion.path d="M16 16L32 32" {...common}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.3 }} />
        <motion.path d="M32 16L16 32" {...common}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.4 }} />
      </>
    )
  }
  if (judgment === JUDGMENT.PENDING) {
    return <motion.path d="M24 14V28M24 33V34" {...common}
      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.25 }} />
  }
  if (judgment === JUDGMENT.RECHECK) {
    // 순환 화살표 (재검사) — arc + arrow
    return (
      <>
        <motion.path d="M33 19 A10 10 0 1 0 33 29" {...common}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.2 }} />
        <motion.path d="M33 14V20H27" {...common}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.45 }} />
      </>
    )
  }
  if (judgment === JUDGMENT.PROBE) {
    // 돋보기 (조사)
    return (
      <>
        <motion.circle cx="21" cy="21" r="7" {...common}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.2 }} />
        <motion.path d="M26 26L33 33" {...common}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, delay: 0.45 }} />
      </>
    )
  }
  return null
}

export default function OQPage({ onLogout, onBack }) {
  const navigate = useNavigate()
  const date = useDate()
  // 라인 선택 (2026-06-16) — null=ST/RT 선택 전 / 'stator'(고정자) / 'rotor'(회전자)
  const [line, setLine] = useState(null)
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

  // SO 스캔 전용 — OQ 번호 스캔은 차단 (편집은 InspectionList "수정" 경로로만)
  const handleScan = async (val) => {
    // OQ 번호 차단 — 신규/편집 모두 SO LOT 으로만 진입
    if (val.toUpperCase().startsWith('OQ')) {
      throw new Error('SO LOT(SM/SA...)만 스캔 가능합니다. OQ 편집은 검사 목록에서 수정을 눌러주세요.')
    }

    // 1. 기존 검사 데이터 조회 — id 또는 judgment 있으면 무조건 편집 모드 진입
    //    (FAIL/OK/PENDING/RECHECK/PROBE 등 어떤 상태든 이미 검사 이력 있음 → 다시 볼 수 있어야 함)
    //    이전엔 id 만 체크했는데 BE 가 빈 dict({"test_phase":0}) 반환 시 fall-through 되면서
    //    scanLot('OQ', val) 이 호출돼 FAIL LOT 에 대해 404 ("이미 소진된 LOT") throw 되며
    //    화면이 그냥 QR 로 복귀하던 버그 (2026-04-27 수정)
    let existing = null
    try {
      existing = await getInspectionData(val)
    } catch (e) {
      // 진짜 네트워크/서버 에러만 명시적으로 throw — QRScanner 가 토스트 표시
      throw new Error(`검사 데이터 조회 실패: ${e.message}`)
    }

    if (existing && (existing.id || existing.judgment)) {
      setPrevLotNo(existing.lot_so_no || val)
      setInitialData(existing)
      setActualOqNo(existing.lot_oq_no || null)
      setIsEdit(true)
      setPhi(existing.phi || '')
      setMotorType(existing.motor_type || '')
      setStep('inspect')
      return
    }

    // 2. 검사 이력 없음 → 신규 흐름 (scanLot 으로 phi/motor 가져오기 + selector)
    //    이 경로는 SO Inventory 가 in_stock 인 정상 LOT 만 통과
    let r
    try {
      r = await scanLot('OQ', val)
    } catch (e) {
      // 신규 진입 거부 — BE 메시지 그대로 노출 ("이미 소진된 LOT" / "유효하지 않은 LOT" 등)
      throw new Error(e.message || 'OQ 진입 실패')
    }
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
    setNgSaving(false); setNgDone(null)
  }

  // ── OQ FAIL 후속 wizard 핸들러 (2026-06-01) ──
  // FAIL 시 IQ/IPQ 와 동일한 NG 후속 단계 노출:
  //   불량내용 → 귀책 → 귀책수량 → 처리방법 → [재작업이면] 문제공정 → 비고
  //   완료 시 QcInspection(type=OQ, defect_qty=1) 생성 + 처리방법별 분기:
  //     재작업 → repairLotWithLabels(prevLotNo, dest=problem_process 직전 공정)
  //     그 외(조건부출하/반품/폐기/미정) → BE 가 NCR 자동 생성 (createQcInspection 안에서)
  const [ngSaving, setNgSaving] = useState(false)
  const [ngDone, setNgDone] = useState(null)   // { repair_lot_no?, nc_no? } 결과 표시용

  const handleOqFailSubmit = async (ngForm) => {
    if (!prevLotNo) {
      emitToast('SO LOT 정보가 없어 처리할 수 없습니다.', 'error')
      return
    }
    setNgSaving(true)
    try {
      // 1) QcInspection 생성 (type=OQ, 단품이라 defect_qty=1)
      //    재작업이면 BE 가 NCR 자동격리를 우회함 (qc_inspection_service.create 의 handle_method 가드)
      const body = {
        inspection_type: QC_TYPE.OQ,
        inspection_date: TODAY(),
        process_category: '공정',
        product_type: '반제품',
        inspection_target: '고정자',
        // ★ 게이트 흐름: prev → qc_no → lot_no(post) (2026-06-05 수정)
        // prevLotNo (SO LOT) 는 검사 대상이므로 lot_no_prev 에 넣어야 함.
        // 기존엔 lot_no=prevLotNo 로 잘못 보내서 post 자리에 SO LOT 이 표시되는 버그.
        lot_no_prev: prevLotNo,
        // qc_no = OQ 번호 — BE 가 inspector 빈값 시 여기서 worker 코드 추출.
        qc_no: actualOqNo || '',
        // lot_no(post) 는 재공정 결과 LOT — repairLotWithLabels 호출 후 알 수 있어서 빈값.
        //   list_ 응답의 oq_repair_map 이 Inventory.repair_from 으로 동적 매칭.
        lot_no: '',
        size: phi,
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

      // 2) 재작업이면 즉시 repair_lot — IPQ wizard 와 동일 패턴
      let repairLotNo = ''
      if (ngForm.handle_method === HANDLE_METHOD.REWORK && ngForm.problem_process) {
        const dest = getActualRepairDest(ngForm.problem_process)
        if (dest) {
          try {
            const r = await repairLotWithLabels(prevLotNo, dest, {
              reason: ngForm.defect_detail || 'OQ FAIL',
              category: REPAIR_LABEL_TO_CODE[(ngForm.defect_detail || '').split('|')[0]] || 'etc',
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
        ins?.nc_no ? `NCR 발급됨 — 부적합품 관리에서 처분` :
        '저장되었습니다',
        repairLotNo ? 'success' : 'warning',
      )
    } catch (e) {
      emitToast(e.message || '저장 실패', 'error')
    } finally {
      setNgSaving(false)
    }
  }

  // FAIL 판정 시 자동 리셋 비활성화 — 사용자가 되돌리기/폐기 선택 대기 (2026-04-22)
  const isFail = doneInfo?.judgment === JUDGMENT.FAIL
  useAutoReset(error, done && !isFail, handleReset)

  // ── 라인 분기 (2026-06-16) — OQ 버튼 진입 시 ST(고정자)/RT(회전자) 선택 ──
  // hooks 뒤 early return (hooks 순서 보존). rotor 면 RotorOQPage 에 위임.
  if (!line) {
    return (
      <div className={`page-flat ${s.lineSelect}`}>
        <h2 className={s.lineSelectTitle}>OQ 출하검사</h2>
        <p className={s.lineSelectDesc}>검사 라인을 선택하세요</p>
        <button className="btn-primary btn-lg btn-full" onClick={() => setLine('stator')}>
          고정자 (ST)
        </button>
        <button className="btn-primary btn-lg btn-full" onClick={() => setLine('rotor')}>
          회전자 (RT)
        </button>
        <button className="btn-text" onClick={onBack}>이전으로</button>
      </div>
    )
  }
  if (line === 'rotor') {
    return <RotorOQPage onLogout={onLogout} onBack={() => setLine(null)} />
  }

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
          lotSoNo={prevLotNo}
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
              transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}>
              <motion.div className={s.resultIcon}
                initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.15, ease: [0.34, 1.56, 0.64, 1] }}>
                <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
                  <motion.circle cx="24" cy="24" r="22" stroke={color} strokeWidth="2.5" fill={meta.bg}
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.1 }} />
                  {renderJudgmentSymbol(j, color)}
                </svg>
              </motion.div>
              <motion.p className={s.resultLabel} style={{ color }}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.45 }}>
                {meta.title}
              </motion.p>
              <motion.p className={s.resultDesc}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
                {meta.desc}
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
              {/* FAIL 판정 시 NgFollowupWizard (2026-06-01).
                  기존 단순 3-버튼 (되돌리기/폐기/나중에) 을 IQ/IPQ 와 동일한 NG 후속 wizard 로 교체.
                  처리방법별 분기는 handleOqFailSubmit 내부에서:
                    재작업 → repair_lot + 라벨, 그 외 → NCR 자동격리. */}
              {j === JUDGMENT.FAIL && prevLotNo && !ngDone && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55 }}
                  style={{ width: '100%', marginTop: 16 }}>
                  <NgFollowupWizard
                    lotNo={prevLotNo}
                    detectedProcess="SO"                          // OQ 직전 = SO. 재작업 시 SO 이전 공정으로 되돌릴 수 있음.
                    lotChain={lotChain}                           // 재작업 공정 세부 방식(WI/WM·BM/BA·SM/SA) 자동 판별 (2026-06-16)
                    defectQty={1}                                  // OQ 는 단품
                    responsibleOptions={[RESPONSIBLE.SELF, RESPONSIBLE.SUPPLIER, RESPONSIBLE.OUTSOURCE]}
                    onSubmit={handleOqFailSubmit}
                    onCancel={handleReset}
                    saving={ngSaving}
                    submitLabel="저장 + 처리"
                  />
                </motion.div>
              )}
              {/* FAIL + wizard 완료 후 결과 표시 (재공정 LOT 또는 NCR 번호) */}
              {j === JUDGMENT.FAIL && ngDone && (
                <motion.div className={s.failActions}
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
                  <button type="button" className={s.failBtnClose} onClick={handleReset}>
                    닫기
                  </button>
                </motion.div>
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
