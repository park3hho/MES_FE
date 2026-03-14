import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { useDate } from '../../utils/useDate'

const steps = [
  { key: 'vendor', label: '가공업체', options: [{ label: '01 : 주연전착도장', value: '01' }, { label: '02 : 선명하이테크', value: '02' }]},
  { key: 'date', label: '입고일', auto: true },
  { key: 'seq', label: '순서', auto: true },
]

export default function ECPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  useEffect(() => { if (!error) return; const t = setTimeout(() => handleReset(), 1500); return () => clearTimeout(t) }, [error])
  useEffect(() => { if (!done) return; const t = setTimeout(() => handleReset(), 1200); return () => clearTimeout(t) }, [done])

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`EC${sel.vendor}${date}`)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, quantity, { selected_Process: 'EC', lot_chain: lotChain, prev_lot_no: prevLotNo, ...selections })
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setLotNo(null); setSelections(null); setQuantity(null)
    setPrinting(false); setDone(false); setError(null)
    setLotChain(null); setPrevLotNo(null); setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner processLabel="EC, 전착도장"
          onScan={async (val) => { const r = await scanLot('EC', val); setPrevLotNo(r.prev_lot_no); setLotChain(r.lot_chain); setQuantity(r.quantity); setStep('selector') }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={steps} autoValues={{ date, seq: '00' }} onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity } : null} />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={quantity} printing={printing} done={done} error={error} onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}