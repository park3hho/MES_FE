import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LotTimeline from '../LotTimeline'
import SkeletonLotTimeline from '../SkeletonLotTimeline'
import { traceLot } from '@/api'
import s from './index.module.css'

export default function MaterialSelector({
  steps,              // Array<{key,label,options|null,hint?,auto?,size?}>: 단계 정의 목록
  onSubmit,           // function(selections): 최종 선택 제출 콜백
  onLogout,           // function(): 로그아웃 콜백
  onBack,             // function(): 뒤로가기 콜백
  autoValues = {},    // object: auto:true 단계에 자동 채울 값 맵
  scannedLot = null,  // string: 이전 스캔 LOT 번호 (타임라인 표시용)
  preProcess,         // string: 이전 공정 코드 (타임라인 표시용)
}) {
  const inputSteps = steps.filter((step) => !step.auto)

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [selections, setSelections] = useState({})
  const [inputValue, setInputValue] = useState('')
  const [etc, setEtc] = useState('')
  const [traceMap, setTraceMap] = useState({})

  const current = inputSteps[step]

  const handleSelect = (option) => {
    const next = { ...selections, [current.key]: option }
    setSelections(next)
    if (step < inputSteps.length - 1) {
      setDirection(1)
      setStep(step + 1)
    } else {
      onSubmit(next)
    }
  }

  const handleEtc = () => {
    if (!etc.trim()) return
    handleSelect(etc)
    setEtc('')
  }

  const handleInput = () => {
    if (!inputValue.trim()) return
    const next = { ...selections, [current.key]: inputValue }
    setSelections(next)
    setInputValue('')
    if (step < inputSteps.length - 1) {
      setDirection(1)
      setStep(step + 1)
    } else {
      onSubmit({ ...selections, [current.key]: inputValue })
    }
  }

  const handleBack = () => {
    if (step === 0) {
      // 첫 단계에서 뒤로 → 이전 화면
      if (onBack) onBack()
      else if (onLogout) onLogout()
      return
    }
    const prev = step - 1
    const key = inputSteps[prev].key
    setSelections((prev) => {
      const c = { ...prev }
      delete c[key]
      return c
    })
    setDirection(-1)
    setStep(prev)
  }

  const handleTraceToggle = async (lotNo) => {
    const existing = traceMap[lotNo]
    if (existing?.open) {
      setTraceMap((prev) => ({ ...prev, [lotNo]: { ...prev[lotNo], open: false } }))
      return
    }
    if (existing?.data) {
      setTraceMap((prev) => ({ ...prev, [lotNo]: { ...prev[lotNo], open: true } }))
      return
    }
    setTraceMap((prev) => ({ ...prev, [lotNo]: { open: false, data: null, loading: true } }))
    try {
      const data = await traceLot(lotNo)
      setTraceMap((prev) => ({ ...prev, [lotNo]: { open: true, data, loading: false } }))
    } catch (e) {
      console.warn('이력 조회 실패:', e.message)
      setTraceMap((prev) => ({ ...prev, [lotNo]: { open: false, data: null, loading: false } }))
    }
  }

  const lotList = scannedLot ? (Array.isArray(scannedLot) ? scannedLot : [scannedLot]) : []

  // 스텝 전환 애니메이션
  const variants = {
    enter: (dir) => ({ opacity: 0, x: dir * 30 }),
    center: { opacity: 1, x: 0 },
    exit: (dir) => ({ opacity: 0, x: dir * -30 }),
  }

  return (
    <div className={s.page}>
      {/* ── 상단 바: 뒤로가기 + 단계 표시 ── */}
      <div className={s.topBar}>
        <button className={s.backBtn} onClick={handleBack} aria-label="뒤로가기">
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className={s.stepDots}>
          {inputSteps.map((_, i) => (
            <span key={i} className={`${s.dot} ${i === step ? s.dotActive : i < step ? s.dotDone : ''}`} />
          ))}
        </div>
        <div className={s.stepCount}>{step + 1}/{inputSteps.length}</div>
      </div>

      {/* ── 질문 영역 ── */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className={s.content}
        >
          <h1 className={s.question}>{current?.label}</h1>
          {current?.hint && <p className={s.hint}>{current.hint}</p>}

          {/* 선택형: 7개 이하 리스트 / 8개 이상 2열 그리드 */}
          {current?.options ? (
            <>
              <div className={current.options.length >= 8 ? s.optionGrid : s.optionList}>
                {current.options.map((opt) => {
                  const label = typeof opt === 'object' ? opt.label : opt
                  const value = typeof opt === 'object' ? opt.value : opt
                  return (
                    <button
                      key={value}
                      className={current.options.length >= 8 ? s.gridItem : s.optionItem}
                      onClick={() => handleSelect(value)}
                    >
                      <span className={current.options.length >= 8 ? s.gridLabel : s.optionLabel}>{label}</span>
                      {current.options.length < 8 && (
                        <svg className={s.chevron} width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 4l6 6-6 6" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* 직접 입력 — 그리드 밖 */}
              <div className={s.etcWrap}>
                <input
                  type="text"
                  placeholder="직접 입력"
                  value={etc}
                  onChange={e => setEtc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEtc()}
                  className={s.etcInput}
                />
                {etc.trim() && (
                  <button className={s.etcSubmit} onClick={handleEtc}>확인</button>
                )}
              </div>
            </>
          ) : (
            /* 텍스트 입력형 */
            <div className={s.inputWrap}>
              <input
                type="text"
                placeholder="값을 입력하세요"
                value={inputValue}
                onChange={e => setInputValue(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleInput()}
                className={s.textInput}
                autoCapitalize="characters"
                autoFocus
              />
              <button
                className={s.submitBtn}
                onClick={handleInput}
                disabled={!inputValue.trim()}
              >
                다음
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── 스캔된 LOT 정보 (하단) ── */}
      {lotList.length > 0 && (
        <div className={s.scannedSection}>
          <p className={s.scannedLabel}>이전 공정</p>
          {lotList.map((item, idx) => {
            const trace = traceMap[item.lot_no] || {}
            return (
              <div key={item.lot_no}>
                <div className={s.scannedRow}>
                  <span className={s.scannedLotNo}>{item.lot_no}</span>
                  {item.created_at && (
                    <span className={s.scannedTime}>
                      {new Date(item.created_at).toLocaleString('ko-KR', {
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  )}
                  <button className={s.infoBtn} onClick={() => handleTraceToggle(item.lot_no)}>
                    {trace.loading ? '...' : trace.open ? '✕' : 'ⓘ'}
                  </button>
                </div>
                <div className={s.traceWrap} style={{ maxHeight: trace.open ? 600 : 0, opacity: trace.open ? 1 : 0 }}>
                  {trace.loading && <SkeletonLotTimeline />}
                  {!trace.loading && trace.data && (
                    <LotTimeline timeline={trace.data.timeline} searchedLotNo={trace.data.lot_no} animated={trace.open} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
