import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import { CountModal } from '../../components/CountModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { useDate } from '../../utils/useDate'

export default function OBPage({ onLogout, onBack }) {
  const date = useDate()
  const lotNo = `OB-${date}`
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [consumedQty, setConsumedQty] = useState(null)
  const [producedQty, setProducedQty] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  useEffect(() => { if (!error) return; const t = setTimeout(() => handleReset(), 1500); return () => clearTimeout(t) }, [error])
  useEffect(() => { if (!done) return; const t = setTimeout(() => handleReset(), 1200); return () => clearTimeout(t) }, [done])

  const handleConsumedSelect = (qty) => {
    setConsumedQty(qty)
    setStep('produced_count')
  }

  const handleProducedSelect = (qty) => {
    setProducedQty(qty)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
    
      await printLot(lotNo, producedQty, {
        selected_Process: 'OB',
        lot_chain: lotChain,
        prev_lot_no: prevLotNo,
        consumed_quantity: consumedQty,
      })
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setConsumedQty(null); setProducedQty(null)
    setPrinting(false); setDone(false); setError(null)
    setLotChain(null); setPrevLotNo(null); setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner processLabel="OB, 출하"
          onScan={async (val) => {
            
              const r = await scanLot('OB', val)
              setPrevLotNo(r.prev_lot_no)
              setLotChain(r.lot_chain)
              setStep('consumed_count')
          }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'consumed_count' && (
        <CountModal
          lotNo={`${lotNo}-00`}
          label="소비량 입력 (이전 공정에서 몇 개 가져왔나요?)"
          onSelect={handleConsumedSelect}
          onCancel={handleReset}
        />
      )}
      {step === 'produced_count' && (
        <CountModal
          lotNo={`${lotNo}-00`}
          label="생산량 입력 (이번 공정에서 몇 개 만들었나요?)"
          onSelect={handleProducedSelect}
          onCancel={handleReset}
        />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={producedQty}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset}
        />
      )}
    </>
  )
}
