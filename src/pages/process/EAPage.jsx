import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { printLot, scanLot } from '@/api'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import SpecListStep from '@/components/SpecListStep'
import { CountModal } from '@/components/CountModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useDate } from '@/utils/useDate'
import { EA_STEPS } from '@/constants/processConst'

// 스텝 순서 — 애니메이션 방향 계산용
const STEP_ORDER = ['qr', 'selector', 'spec_list', 'consumed_qty', 'confirm']

// 페이지 전환 variants
const pageVariants = {
  enter:  (dir) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit:   (dir) => ({ opacity: 0, x: dir * -40 }),
}

export default function EAPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo,   setPrevLotNo]   = useState(null)
  const [lotChain,    setLotChain]    = useState(null)
  const [quantity,    setQuantity]    = useState(null)
  const [selections,  setSelections]  = useState(null)
  const [eaList,      setEaList]      = useState(null)   // 파이 산출물 목록
  const [consumedQty, setConsumedQty] = useState(null)   // 소모량 (kg)
  const [printing,    setPrinting]    = useState(false)
  const [done,        setDone]        = useState(false)
  const [error,       setError]       = useState(null)
  const [step,        setStep]        = useState('qr')
  const [direction,   setDirection]   = useState(1)

  const goTo = (next) => {
    const cur = STEP_ORDER.indexOf(step)
    const nxt = STEP_ORDER.indexOf(next)
    setDirection(nxt > cur ? 1 : -1)
    setStep(next)
  }

  const handleReset = () => {
    setPrevLotNo(null); setLotChain(null); setQuantity(null)
    setSelections(null); setEaList(null); setConsumedQty(null)
    setPrinting(false); setDone(false); setError(null)
    setDirection(1); setStep('qr')
  }

  const handleConfirm = async () => {
    const lotNo = `${selections.shape}${selections.vendor}${date}`
    setPrinting(true)
    try {
      await printLot(lotNo, 1, {
        selected_Process: 'EA',
        lot_chain: lotChain,
        prev_lot_no: prevLotNo,
        consumed_quantity: consumedQty,  // 실제 소모량
        ea_list: eaList,
        ...selections,
      })
      setDone(true)
      setTimeout(() => handleReset(), 1200)
    } catch (e) {
      console.error('[EAPage] handleConfirm:', e)
      setError(e.message)
      setTimeout(() => handleReset(), 1500)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <AnimatePresence mode="wait" custom={direction}>
      {step === 'qr' && (
        <motion.div
          key="qr"
          custom={direction}
          variants={pageVariants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <QRScanner
            processLabel="EA, 낱장가공"
            onScan={async (val) => {
              const r = await scanLot('EA', val)
              setPrevLotNo(r.prev_lot_no)
              setLotChain(r.lot_chain)
              setQuantity(r.quantity)
              goTo('selector')
            }}
            onLogout={onLogout} onBack={onBack}
          />
        </motion.div>
      )}

      {step === 'selector' && (
        <motion.div
          key="selector"
          custom={direction}
          variants={pageVariants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <MaterialSelector
            steps={EA_STEPS}
            autoValues={{ date, seq: '00' }}
            onSubmit={(sel) => { setSelections(sel); goTo('spec_list') }}
            onLogout={onLogout}
            onBack={() => goTo('qr')}
            scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity } : null}
          />
        </motion.div>
      )}

      {step === 'spec_list' && (
        <motion.div
          key="spec_list"
          custom={direction}
          variants={pageVariants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <SpecListStep
            onConfirm={(list) => {
              setEaList(list)
              goTo('consumed_qty')
            }}
            onBack={() => goTo('selector')}
          />
        </motion.div>
      )}

      {/* 소모량 입력 — kg 단위 */}
      {step === 'consumed_qty' && (
        <motion.div
          key="consumed_qty"
          custom={direction}
          variants={pageVariants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <CountModal
            lotNo={prevLotNo || '-'}
            label="실제 소모량 입력"
            unit="kg"
            unit_type="중량"
            cancelLabel="이전으로"
            onSelect={(qty) => {
              setConsumedQty(qty)
              goTo('confirm')
            }}
            onCancel={() => goTo('spec_list')}
          />
        </motion.div>
      )}

      {/* 최종 확인 모달 */}
      {step === 'confirm' && (
        <motion.div
          key="confirm"
          custom={direction}
          variants={pageVariants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <ConfirmModal
            lotNo={`${selections.shape}${selections.vendor}${date}-00`}
            printCount={eaList?.length}
            consumedQty={consumedQty}
            consumedUnit="kg"
            producedUnit="묶음"
            printing={printing}
            done={done}
            error={error}
            onConfirm={handleConfirm}
            onCancel={() => goTo('consumed_qty')}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}