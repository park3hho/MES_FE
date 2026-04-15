import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAutoReset } from '@/hooks/useAutoReset'
import { printLot, scanLot } from '@/api'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import SpecListStep from '@/components/SpecListStep'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useDate } from '@/utils/useDate'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import { EA_STEPS } from '@/constants/processConst'
import { FaradayLogo } from '@/components/FaradayLogo'

const STEP_ORDER = ['qr', 'selector', 'spec_list', 'date_pick', 'confirm']

const pageVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir * -40 }),
}


export default function EAPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [selections, setSelections] = useState(null)
  const [eaList, setEaList] = useState(null)
  const [overrideDate, setOverrideDate] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')
  const [direction, setDirection] = useState(1)

  const goTo = (next) => {
    const cur = STEP_ORDER.indexOf(step)
    const nxt = STEP_ORDER.indexOf(next)
    setDirection(nxt > cur ? 1 : -1)
    setStep(next)
  }

  const handleReset = () => {
    setPrevLotNo(null)
    setLotChain(null)
    setSelections(null)
    setEaList(null)
    setOverrideDate(null)
    setPrinting(false)
    setDone(false)
    setError(null)
    setDirection(1)
    setStep('qr')
  }

  const effectiveDate = overrideDate || date

  useAutoReset(error, done, handleReset)

  const totalBundles = eaList?.reduce((sum, item) => sum + item.quantity, 0) || 0

  const handleConfirm = async () => {
    const lotNo = `${selections.shape}${selections.vendor}${effectiveDate}`
    setPrinting(true)
    try {
      await printLot(lotNo, 1, {
        selected_process: 'EA',
        lot_chain: lotChain,
        prev_lot_no: prevLotNo,
        ea_list: eaList,
        override_date: overrideDate || undefined,
        ...selections,
      })
      setDone(true)
    } catch (e) {
      console.error('[EAPage] handleConfirm:', e)
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <AnimatePresence mode="wait" custom={direction}>
      {step === 'qr' && (
        <QRScanner
          processLabel="EA, 낱장가공"
          onScan={async (val) => {
            const r = await scanLot('EA', val)
            setPrevLotNo(r.prev_lot_no)
            setLotChain(r.lot_chain)
            goTo('selector')
          }}
          onLogout={onLogout}
          onBack={onBack}
        />
      )}

      {step === 'selector' && (
        <motion.div
          key="selector"
          className="motion-wrap"
          custom={direction}
          variants={pageVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <MaterialSelector
            steps={EA_STEPS}
            autoValues={{ date: effectiveDate, seq: '00' }}
            onSubmit={(sel) => {
              setSelections(sel)
              goTo('spec_list')
            }}
            onLogout={onLogout}
            onBack={() => goTo('qr')}
            scannedLot={prevLotNo ? { lot_no: prevLotNo } : null}
          />
        </motion.div>
      )}

      {step === 'spec_list' && (
        <motion.div
          key="spec_list"
          className="motion-wrap"
          custom={direction}
          variants={pageVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <SpecListStep
            onConfirm={(list) => {
              setEaList(list)
              goTo('date_pick')
            }}
            onBack={() => goTo('selector')}
          />
        </motion.div>
      )}

      {step === 'date_pick' && (
        <div className="page">
          <div className="card" style={{ textAlign: 'center' }}>
            <FaradayLogo size="md" />
            <p style={{ fontWeight: 700, fontSize: 18, margin: '12px 0 4px' }}>작업일 선택</p>
            <p style={{ color: 'var(--color-gray)', fontSize: 13, marginBottom: 20 }}>
              밀린 작업이면 실제 작업 날짜를 선택하세요
            </p>
            <input
              type="date"
              defaultValue={toInputDate(effectiveDate)}
              onChange={(e) => {
                const yy = toYYMMDD(e.target.value)
                setOverrideDate(yy === date ? null : yy)
              }}
              style={{
                width: '100%', padding: '14px', fontSize: 18, fontWeight: 700,
                borderRadius: 10, border: '1.5px solid var(--color-border-dark)',
                textAlign: 'center', marginBottom: 16,
              }}
            />
            <p style={{ fontSize: 13, color: 'var(--color-gray)', marginBottom: 20 }}>
              LOT: {selections?.shape}{selections?.vendor}{effectiveDate}-00
            </p>
            <button className="btn-primary btn-lg btn-full" onClick={() => goTo('confirm')}>
              다음 → 확인
            </button>
            <button className="btn-text" style={{ marginTop: 8 }} onClick={() => goTo('spec_list')}>
              ← 이전으로
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${selections.shape}${selections.vendor}${effectiveDate}-00`}
          printCount={totalBundles}
          producedUnit="묶음"
          extraInfo={eaList?.map(i => `${i.spec}파이 ${i.motor_type} ${i.quantity}묶음`).join(', ')}
          printing={printing}
          done={done}
          error={error}
          onConfirm={handleConfirm}
          onCancel={() => goTo('spec_list')}
        />
      )}
    </AnimatePresence>
  )
}
