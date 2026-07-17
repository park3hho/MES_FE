// pages/process/produce/RBOPage.jsx
// 로터 본딩 (2026-06-12, Phase 2 / 2026-07-17 배치화) —
//   ① 회전자 Item(모델) 선택 → ② 요크 QR 여러 개 스캔 → ③ 방식/작업자 → ④ N개 1:1 일괄 발급.
//   자석은 스캔하지 않음 (2026-07-16) — 선택한 회전자 BOM 의 자석 Item 을 개봉(in_use) 박스에서 자동 차감.
//   BOM 게이트: 스캔 요크·자석이 그 회전자 BOM 구성품이어야 함 (BOM 미셋업이면 Φ+극성 폴백).
//   BE 프로토콜: selected_process='BO' + line='rotor' + consumed_list(요크 N개) → 회전자 N개.
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAutoReset } from '@/hooks/useAutoReset'
import { printLot, getRotorLineItems } from '@/api'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import { ConfirmModal } from '@/components/ConfirmModal'
import PageHeader from '@/components/common/PageHeader'
import { useDate } from '@/utils/useDate'
import { RBO_STEPS } from '@/constants/processConst'

const STEP_ORDER = ['rotor', 'scan', 'selector', 'confirm']

const pageVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir * -40 }),
}

export default function RBOPage({ onLogout, onBack }) {
  const date = useDate()
  const [rotorItem, setRotorItem] = useState(null)    // 선택한 회전자 Item (BOM 앵커, 먼저 선택)
  const [yokeLots, setYokeLots] = useState([])        // 스캔한 요크(REA) LOT 목록 (1:1 → 회전자 N개)
  const [selections, setSelections] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('rotor')
  const [direction, setDirection] = useState(1)

  const goTo = (next) => {
    const cur = STEP_ORDER.indexOf(step)
    setDirection(STEP_ORDER.indexOf(next) > cur ? 1 : -1)
    setStep(next)
  }

  const handleReset = () => {
    setRotorItem(null); setYokeLots([]); setSelections(null)
    setPrinting(false); setDone(false); setError(null)
    setDirection(1); setStep('rotor')
  }
  useAutoReset(error, done, handleReset)

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      // 자석 스캔 없음 — BE 가 선택 회전자 BOM 기준으로 개봉(in_use) 자석 자동 차감.
      // 요크 N개 → 회전자 N개 1:1. consumed_list 로 요크 목록 전달.
      await printLot(`${selections.shape}${selections.worker}${date}`, 1, {
        selected_process: 'BO',
        line: 'rotor',
        consumed_list: yokeLots.map((lot) => ({ lot_no: lot, quantity: 1 })),
        rotor_item_id: rotorItem?.item_id ?? null,
        ...selections,
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const rotorLabel = rotorItem ? `${rotorItem.name} (Φ${rotorItem.phi} ${rotorItem.motor_type})` : 'BOM 검증 없이 진행'

  return (
    <AnimatePresence mode="wait" custom={direction}>
      {step === 'rotor' && (
        <motion.div key="rotor" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <RotorPickStep
            onPick={(r) => { setRotorItem(r); goTo('scan') }}
            onBack={onBack}
          />
        </motion.div>
      )}

      {step === 'scan' && (
        <QRScanner
          key="scan"
          processLabel="로터본딩 · 요크 스캔"
          showList={true}
          defaultQty={1}
          unit="개"
          unit_type="개수"
          nextLabel="완료 → 다음"
          banner={
            <p style={{ color: 'var(--color-text-sub)', margin: 0 }}>
              회전자 <strong>{rotorLabel}</strong> — 만들 요크를 모두 스캔하세요
            </p>
          }
          // 요크는 사전 검증 없이 목록에 담고, 발급 시 BE 가 BOM·체인 게이트로 일괄 검증
          onScan={async () => ({ quantity: 1, lot_chain: null, created_at: null })}
          onScanList={(list) => {
            setYokeLots(list.map((i) => i.lot_no))
            goTo('selector')
          }}
          onLogout={onLogout}
          onBack={() => goTo('rotor')}
        />
      )}

      {step === 'selector' && (
        <motion.div key="selector" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <MaterialSelector
            steps={RBO_STEPS}
            autoValues={{ date, seq: '00' }}
            onSubmit={(sel) => { setSelections({ ...sel, shape: 'BM' }); goTo('confirm') }}
            onLogout={onLogout}
            onBack={() => goTo('scan')}
          />
        </motion.div>
      )}

      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${selections.shape}${selections.worker}${date}-00`}
          printCount={yokeLots.length}
          producedUnit="개"
          extraInfo={`회전자 ${rotorLabel} · 요크 ${yokeLots.length}개 → 회전자 ${yokeLots.length}개 · 자석 BOM 자동 차감`}
          printing={printing}
          done={done}
          error={error}
          onConfirm={handleConfirm}
          onCancel={() => goTo('selector')}
        />
      )}
    </AnimatePresence>
  )
}


// 회전자 Item 선택 — Rotor 분류 + RotorSpec 등록된 Item (BOM 앵커). 미선택 시 Φ+극성 폴백 (2026-07-16)
function RotorPickStep({ onPick, onBack }) {
  const [rotors, setRotors] = useState([])
  useEffect(() => {
    getRotorLineItems('rotor').then(setRotors).catch(() => setRotors([]))
  }, [])

  return (
    <div className="page-flat">
      <PageHeader title="회전자 품목을 선택해 주세요" subtitle="이 BOM 기준으로 요크·자석이 검증돼요" onBack={onBack} />
      <div className="process-content-inner">
        {rotors.length === 0 && (
          <p style={{ color: 'var(--color-text-sub)' }}>
            등록된 회전자 품목이 없습니다 — 품목관리에서 Rotor 분류로 회전자 Item + BOM 을 등록하세요.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {rotors.map((r) => (
            <button key={r.item_id} type="button" className="btn-secondary btn-md" onClick={() => onPick(r)}>
              {r.name} (Φ{r.phi} {r.motor_type})
            </button>
          ))}
          {/* BOM 미셋업 전환기 — 선택 없이 진행 시 Φ+극성 폴백 (BOM 검증 없음) */}
          <button type="button" className="btn-ghost btn-md" onClick={() => onPick(null)}>
            선택 안 함 (BOM 검증 없이 진행)
          </button>
        </div>
      </div>
    </div>
  )
}
