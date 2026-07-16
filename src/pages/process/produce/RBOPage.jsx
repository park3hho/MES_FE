// pages/process/produce/RBOPage.jsx
// 로터 본딩 (2026-06-12, Phase 2) — REA(요크) 스캔 → 방식/작업자 → 발급.
//   자석은 스캔하지 않음 (2026-07-16) — 개봉(in_use) 자석 박스에서 극성(N/S/AZ)별 자동 차감.
//   개수는 모델 극쌍수 기반 자동(N=pp, S=pp, AZ=pp×2). BE 가 Warehouse 자석 수량 차감 + 체인 기록.
//   BE 프로토콜: selected_process='BO' + line='rotor' (파라미터 라인 분기). 'RBO' 는 FE 라우팅 키일 뿐.
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAutoReset } from '@/hooks/useAutoReset'
import { printLot } from '@/api'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useDate } from '@/utils/useDate'
import { RBO_STEPS } from '@/constants/processConst'

const STEP_ORDER = ['qr_ea', 'selector', 'confirm']

const pageVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir * -40 }),
}

export default function RBOPage({ onLogout, onBack }) {
  const date = useDate()
  const [eaLotNo, setEaLotNo] = useState(null)        // REA(요크) LOT
  const [selections, setSelections] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr_ea')
  const [direction, setDirection] = useState(1)

  const goTo = (next) => {
    const cur = STEP_ORDER.indexOf(step)
    setDirection(STEP_ORDER.indexOf(next) > cur ? 1 : -1)
    setStep(next)
  }

  const handleReset = () => {
    setEaLotNo(null); setSelections(null)
    setPrinting(false); setDone(false); setError(null)
    setDirection(1); setStep('qr_ea')
  }
  useAutoReset(error, done, handleReset)

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      // 자석 스캔 없음 — BE 가 개봉(in_use) 자석 박스에서 극성별 자동 차감
      await printLot(`${selections.shape}${selections.worker}${date}`, 1, {
        selected_process: 'BO',
        line: 'rotor',
        prev_lot_no: eaLotNo,
        ...selections,
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  return (
    <AnimatePresence mode="wait" custom={direction}>
      {step === 'qr_ea' && (
        <QRScanner
          key="qr_ea"
          processLabel="로터본딩 · 요크 스캔 (자석 자동 차감)"
          onScan={(val) => { setEaLotNo(val); goTo('selector') }}
          onLogout={onLogout}
          onBack={onBack}
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
            onBack={() => goTo('qr_ea')}
            scannedLot={eaLotNo ? { lot_no: eaLotNo } : null}
          />
        </motion.div>
      )}

      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${selections.shape}${selections.worker}${date}-00`}
          printCount={1}
          extraInfo={`요크 ${eaLotNo} · 자석 개봉박스에서 극성별 자동 차감`}
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
