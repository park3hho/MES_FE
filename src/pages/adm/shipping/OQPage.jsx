import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { printLot, scanLot, submitInspection, printStLabel, getInspectionData } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import InspectionForm from '@/components/InspectionForm'
import { useDate } from '@/utils/useDate'
import { OQ_STEPS } from '@/constants/processConst'
import { JUDGMENT, JUDGMENT_COLORS, JUDGMENT_LABELS } from '@/constants/etcConst'
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

    // 1. 기존 검사 데이터 조회 — SO 번호로 lot_so_no 매칭
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

    // 2. SO 번호 → scanLot으로 유효성 검증 + phi/motor 가져오기 + selector 단계
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

  // FAIL 판정 시 자동 리셋 비활성화 — 사용자가 되돌리기/폐기 선택 대기 (2026-04-22)
  const isFail = doneInfo?.judgment === JUDGMENT.FAIL
  useAutoReset(error, done && !isFail, handleReset)

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
              {/* FAIL 판정 시 되돌리기/폐기 선택 버튼 (2026-04-22)
                  prevLotNo(SO LOT)을 LotManagePage로 전달하여 즉시 처리 */}
              {j === JUDGMENT.FAIL && prevLotNo && (
                <motion.div className={s.failActions}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.75 }}>
                  <button
                    type="button"
                    className={`${s.failBtn} ${s.failBtnRepair}`}
                    onClick={() => navigate('/admin/manage', { state: { mode: 'repair', lotNo: prevLotNo } })}
                  >
                    🔧 공정 되돌리기
                  </button>
                  <button
                    type="button"
                    className={`${s.failBtn} ${s.failBtnDiscard}`}
                    onClick={() => navigate('/admin/manage', { state: { mode: 'discard', lotNo: prevLotNo } })}
                  >
                    🗑 폐기 처리
                  </button>
                  <button
                    type="button"
                    className={s.failBtnClose}
                    onClick={handleReset}
                  >
                    나중에 처리 (닫기)
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
