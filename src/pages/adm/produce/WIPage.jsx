import { useState } from 'react'
import { printLot, scanLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import { WI_STEPS } from '@/constants/processConst'
import { FaradayLogo } from '@/components/FaradayLogo'

export default function WIPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [overrideDate, setOverrideDate] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const effectiveDate = overrideDate || date

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`WI${sel.worker}${effectiveDate}`)
    setStep('date_pick')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, quantity, {
        selected_process: 'WI', lot_chain: lotChain, prev_lot_no: prevLotNo,
        override_date: overrideDate || undefined, ...selections,
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const handleReset = () => {
    setLotNo(null); setSelections(null); setQuantity(null); setOverrideDate(null)
    setPrinting(false); setDone(false); setError(null)
    setLotChain(null); setPrevLotNo(null); setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'qr' && (
        <QRScanner key={step} processLabel="WI, 권선"
          onScan={async (val) => {
            const r = await scanLot('WI', val)
            setPrevLotNo(r.prev_lot_no); setLotChain(r.lot_chain); setQuantity(r.quantity)
            setStep('selector')
          }}
          onLogout={onLogout} onBack={onBack} />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={WI_STEPS} autoValues={{ date: effectiveDate, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity } : null} />
      )}
      {step === 'date_pick' && (
        <div className="page">
          <div className="card" style={{ textAlign: 'center' }}>
            <FaradayLogo size="md" />
            <p style={{ fontWeight: 700, fontSize: 18, margin: '12px 0 4px' }}>작업일 선택</p>
            <p style={{ color: 'var(--color-gray)', fontSize: 13, marginBottom: 20 }}>
              밀린 작업이면 실제 작업 날짜를 선택하세요
            </p>
            <input type="date" defaultValue={toInputDate(effectiveDate)}
              onChange={(e) => {
                const yy = toYYMMDD(e.target.value)
                setOverrideDate(yy === date ? null : yy)
                if (selections) setLotNo(`WI${selections.worker}${yy || date}`)
              }}
              style={{ width: '100%', padding: '14px', fontSize: 18, fontWeight: 700, borderRadius: 10, border: '1.5px solid var(--color-border-dark)', textAlign: 'center', marginBottom: 16 }}
            />
            <p style={{ fontSize: 13, color: 'var(--color-gray)', marginBottom: 20 }}>LOT: {lotNo}-00</p>
            <button className="btn-primary btn-lg btn-full" onClick={() => setStep('confirm')}>다음 → 확인</button>
            <button className="btn-text" style={{ marginTop: 8 }} onClick={() => setStep('selector')}>← 이전으로</button>
          </div>
        </div>
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={quantity}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}
