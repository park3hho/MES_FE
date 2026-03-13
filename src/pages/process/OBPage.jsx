import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { useDate } from '../../utils/useDate'

export default function OBPage({ onLogout, onBack }) {
  const date = useDate()
  const lotNo = `OB-${date}`
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  useEffect(() => { if (!error) return; const t = setTimeout(() => handleReset(), 1500); return () => clearTimeout(t) }, [error])
  useEffect(() => { if (!done) return; const t = setTimeout(() => handleReset(), 1200); return () => clearTimeout(t) }, [done])

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, 1, {
        selected_Process: 'OB',
        lot_chain: lotChain,
        prev_lot_no: prevLotNo,
        quantity,
      })
      setDone(true)
    } catch (e) { setError(e.message) }
    finally { setPrinting(false) }
  }

  const handleReset = () => {
    setQuantity(null); setPrinting(false); setDone(false); setError(null)
    setLotChain(null); setPrevLotNo(null); setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner processLabel="OB, 출하"
          onScan={async (val) => {
            try {
              const r = await scanLot('OB', val)
              setPrevLotNo(r.prev_lot_no)
              setLotChain(r.lot_chain)
              setQuantity(r.quantity)
              setStep('confirm')
            } catch (e) { setError(e.message) }
          }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={quantity}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset}
        />
      )}
    </>
  )
}
