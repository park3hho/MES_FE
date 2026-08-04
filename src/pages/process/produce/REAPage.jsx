// pages/process/produce/REAPage.jsx
// 로터 요크가공 (2026-06-12, Phase 2) — Plate(PI) RM 스캔 → 가공방식/설비 → 로터 모델·묶음 → 발급.
//   BE 프로토콜: selected_process='EA' + line='rotor' (파라미터 라인 분기, 2026-06-12 결정).
//   LOT 은 EA 풀 공유 (라벨 ROTOR 표기, 재고는 rotor_inventory). 'REA' 는 FE 라우팅 키일 뿐.
//   EAPage 패턴 — 로터 모델 선택은 SpecListStep(ST 전용) 대신 인라인 RotorSpecStep (rt/both 모델만).
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAutoReset } from '@/hooks/useAutoReset'
import { printLot, getRotorLineItems, getPoYokes } from '@/api'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import { ConfirmModal } from '@/components/ConfirmModal'
import PoPickStep from '@/components/PoPickStep'
import DatePickStep from '@/components/DatePickStep'
import { useDate } from '@/utils/useDate'
import { REA_STEPS, MOTOR_LABEL } from '@/constants/processConst'
import PageHeader from '@/components/common/PageHeader'

// 'po' = 생산오더 선택(SO별 요크 버전 확정) → 요크 선택을 그 PO 요크로 스코프. PO 없이 진행도 허용. (2026-07-28)
// 'date_pick' = 작업일 선택 (2026-07-28) — MaterialSelector 가 auto step(date)을 렌더링하지 않아
//   REA_STEPS 에 date 가 있어도 화면에 안 떴음. 밀린 작업을 실제 작업일로 발급하려면 필요.
const STEP_ORDER = ['po', 'qr', 'selector', 'spec', 'date_pick', 'confirm']

// 요크는 프레스 가공 없이 와이어방전(ED) 하나뿐 → 방식 고정 주입 (2026-06-15)
const ROTOR_YOKE_SHAPE = 'ED'

const pageVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir * -40 }),
}

export default function REAPage({ onLogout, onBack }) {
  const date = useDate()
  const [po, setPo] = useState(null)                 // 선택한 생산오더 (요크 버전 확정). null = PO 없이
  const [poYokes, setPoYokes] = useState(null)       // PO 요크 후보 [{item_id,name,...}] — 요크 선택 스코프
  const [prevLotNo, setPrevLotNo] = useState(null)   // Plate RM LOT
  const [selections, setSelections] = useState(null)
  const [eaList, setEaList] = useState(null)         // [{spec, quantity, motor_type}]
  const [overrideDate, setOverrideDate] = useState(null)   // 작업일 수동 지정 (null = 오늘)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('po')
  const [direction, setDirection] = useState(1)

  const goTo = (next) => {
    const cur = STEP_ORDER.indexOf(step)
    setDirection(STEP_ORDER.indexOf(next) > cur ? 1 : -1)
    setStep(next)
  }

  const handleReset = () => {
    setPo(null); setPoYokes(null)
    setPrevLotNo(null); setSelections(null); setEaList(null)
    setOverrideDate(null)
    setPrinting(false); setDone(false); setError(null)
    setDirection(1); setStep('po')
  }
  useAutoReset(error, done, handleReset)

  // 선택한 작업일 우선 — LOT 채번·라벨·미리보기 전부 이 값을 써야 한다 (date 직접 참조 금지)
  const effectiveDate = overrideDate || date

  const totalBundles = eaList?.reduce((s, i) => s + i.quantity, 0) || 0

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(`${ROTOR_YOKE_SHAPE}${selections.vendor}${effectiveDate}`, 1, {
        selected_process: 'EA',
        line: 'rotor',
        prev_lot_no: prevLotNo,
        work_date: effectiveDate,   // 실제 작업일(YYMMDD) — RotorSnbtEA.work_date 로 구조화 보존 (2026-08-05)
        ea_list: eaList,
        po_id: po?.id ?? null,   // PO 요크 게이트 — 선택 요크가 그 PO 버전인지 서버 검증 (2026-07-28)
        ...selections,
        shape: ROTOR_YOKE_SHAPE,   // 방식 step 제거 — ED 고정 (요크는 프레스 안 함)
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  return (
    <AnimatePresence mode="wait" custom={direction}>
      {step === 'po' && (
        <motion.div key="po" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <PoPickStep
            subtitle="PO 선택 시 그 오더의 요크 버전으로 선택이 좁혀져요 (SO별 버전 정합)"
            skipLabel="PO 없이 진행 (요크 직접 선택)"
            onPick={async (p) => {
              setPo(p)
              try { setPoYokes(await getPoYokes(p.id)) } catch { setPoYokes([]) }
              goTo('qr')
            }}
            onSkip={() => { setPo(null); setPoYokes(null); goTo('qr') }}
            onBack={onBack}
          />
        </motion.div>
      )}

      {step === 'qr' && (
        <QRScanner
          processLabel="REA, 로터 요크가공"
          onScan={(val) => { setPrevLotNo(val); goTo('selector') }}
          onLogout={onLogout}
          onBack={() => goTo('po')}
        />
      )}

      {step === 'selector' && (
        <motion.div key="selector" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <MaterialSelector
            steps={REA_STEPS}
            autoValues={{ date: effectiveDate, seq: '00' }}
            onSubmit={(sel) => { setSelections(sel); goTo('spec') }}
            onLogout={onLogout}
            onBack={() => goTo('qr')}
            scannedLot={prevLotNo ? { lot_no: prevLotNo } : null}
          />
        </motion.div>
      )}

      {step === 'spec' && (
        <motion.div key="spec" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <RotorSpecStep
            allowedYokes={poYokes}
            poNo={po?.po_no || null}
            onConfirm={(list) => { setEaList(list); goTo('date_pick') }}
            onBack={() => goTo('selector')}
          />
        </motion.div>
      )}

      {step === 'date_pick' && (
        <motion.div key="date_pick" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <DatePickStep
            today={date}
            value={effectiveDate}
            onPick={setOverrideDate}
            lotPreview={`${ROTOR_YOKE_SHAPE}${selections?.vendor || ''}${effectiveDate}-00`}
            onNext={() => goTo('confirm')}
            onBack={() => goTo('spec')}
          />
        </motion.div>
      )}

      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${ROTOR_YOKE_SHAPE}${selections.vendor}${effectiveDate}-00`}
          printCount={totalBundles}
          producedUnit="개"
          extraInfo={eaList?.map((i) => `Φ${i.spec} ${MOTOR_LABEL[i.motor_type] || i.motor_type} ${i.quantity}개`).join(', ')}
          printing={printing}
          done={done}
          error={error}
          onConfirm={handleConfirm}
          onCancel={() => goTo('date_pick')}
        />
      )}
    </AnimatePresence>
  )
}


// 요크 Item 선택 — Yoke 분류 + YokeSpec 등록된 Item (BOM 앵커). 모델 대신 Item 기준 (2026-07-16)
//   allowedYokes(비어있지 않으면) = 선택 PO 의 요크 버전으로 스코프 / null·[] 이면 전체 (2026-07-28)
function RotorSpecStep({ allowedYokes, poNo, onConfirm, onBack }) {
  const [allYokes, setAllYokes] = useState([])
  const [list, setList] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    getRotorLineItems('yoke').then(setAllYokes).catch(() => setAllYokes([]))
  }, [])

  const scoped = Array.isArray(allowedYokes) && allowedYokes.length > 0
  const yokes = scoped ? allowedYokes : allYokes   // PO 있으면 그 요크 버전만, 없으면 전체

  const addYoke = (y) =>
    setList((p) => [...p, {
      id: `${y.item_id}-${Date.now()}`, spec: y.phi, motor_type: y.motor_type,
      quantity: 1, label: `${y.name} (Φ${y.phi} ${y.motor_type})`, yoke_item_id: y.item_id,
    }])
  const setQty = (id, v) => {
    if (v !== '' && !/^\d+$/.test(v)) return
    setList((p) => p.map((i) => (i.id === id ? { ...i, quantity: v } : i)))
  }
  const remove = (id) => setList((p) => p.filter((i) => i.id !== id))

  const handleNext = () => {
    if (list.length === 0) { setError('요크 품목을 1개 이상 추가하세요.'); return }
    if (list.some((i) => i.quantity === '' || parseInt(i.quantity, 10) <= 0)) {
      setError('수량을 입력하세요.'); return
    }
    onConfirm(list.map((i) => ({
      spec: i.spec, quantity: parseInt(i.quantity, 10), motor_type: i.motor_type, yoke_item_id: i.yoke_item_id,
    })))
  }

  return (
    <div className="page-flat">
      <PageHeader title="요크 품목을 선택해 주세요"
        subtitle={scoped ? `생산오더 ${poNo || ''} 의 요크 버전만 표시돼요` : '품목관리에 등록된 요크(BOM) 기준으로 검증돼요'}
        onBack={onBack} />

      <div className="process-content-inner">
        {yokes.length === 0 && (
          <p style={{ color: 'var(--color-text-sub)' }}>
            {scoped
              ? '이 생산오더의 동결 BOM에 요크 구성품이 없습니다 — BOM에 요크를 등록하거나 “PO 없이”로 진행하세요.'
              : '등록된 요크 품목이 없습니다 — 품목관리에서 Yoke 분류로 요크 Item + 스펙(파이/모터)을 등록하세요.'}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {yokes.map((y) => (
            <button key={y.item_id} type="button" className="btn-secondary btn-md" onClick={() => addYoke(y)}>
              {y.name} (Φ{y.phi} {y.motor_type}) ＋
            </button>
          ))}
        </div>

        {list.map((i) => (
          <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ flex: 1, fontWeight: 600 }}>{i.label}</span>
            <input type="number" min={1} value={i.quantity} inputMode="numeric"
              onChange={(e) => setQty(i.id, e.target.value)}
              style={{ width: 90, padding: 10, borderRadius: 8, border: '1.5px solid var(--color-border)', textAlign: 'center' }} />
            <span style={{ color: 'var(--color-text-sub)' }}>개</span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => remove(i.id)}>✕</button>
          </div>
        ))}

        {error && <p style={{ color: 'var(--color-danger, #d23f3f)', fontWeight: 600 }}>{error}</p>}

        <button className="btn-primary btn-lg btn-full" style={{ marginTop: 16 }}
          disabled={list.length === 0} onClick={handleNext}>
          다음
        </button>
      </div>
    </div>
  )
}
