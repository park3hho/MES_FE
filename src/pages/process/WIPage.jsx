import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import { CountModal } from '../../components/CountModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { useDate } from '../../utils/useDate'

const steps = [
  { key: "process", label: "WI", auto: true },
  { key: "worker", label: "작업자 코드", options: null, hint: "작업자번호표 참조" },
  { key: "date", label: "날짜", auto: true },
  { key: "seq", label: "순서", auto: true },
]

export default function WIPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [quantity, setQuantity] = useState(null)   // scan에서 상속
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
    setLotNo(`WI${sel.worker}${date}`)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    
      await printLot(lotNo, 1, {
        selected_Process: 'WI',
        lot_chain: lotChain,
        prev_lot_no: prevLotNo,
        quantity,
        ...selections
      })
      setDone(true)
    finally { setPrinting(false) }
  }

  const handleReset = () => {
    setLotNo(null); setSelections(null); setQuantity(null)
    setPrinting(false); setDone(false); setError(null)
    setLotChain(null); setPrevLotNo(null); setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner processLabel="WI, 권선"
          onScan={async (val) => {
            
              const r = await scanLot('WI', val)
              setPrevLotNo(r.prev_lot_no)
              setLotChain(r.lot_chain)
              setQuantity(r.quantity)
              setStep('selector')
          }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={steps} autoValues={{ process: "WI", date, seq: "00" }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
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
