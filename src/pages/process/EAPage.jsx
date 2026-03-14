import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import { CountModal } from '../../components/CountModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { useDate } from '../../utils/useDate'

const steps = [
  { key: 'shape', label: '가공형태', options: ['ED', 'PR'] },
  { key: 'vendor', label: '설비', size: 'sm',
    hint: '01~07: 와이어머신 / 61: 제이와이테크놀러지 / 62: 와이솔루션 / 63: 부광정기 / 64: 엠토',
    options: ['01','02','03','04','05','06','07','XX','61','62','63','64']
  },
  { key: 'date', label: '날짜', auto: true },
  { key: 'seq', label: '순서', auto: true },
]

export default function EAPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [lotNo, setLotNo] = useState(null)
  const [consumedQty, setConsumedQty] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [selections, setSelections] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  useEffect(() => { if (!error) return; const t = setTimeout(() => handleReset(), 1500); return () => clearTimeout(t) }, [error])
  useEffect(() => { if (!done) return; const t = setTimeout(() => handleReset(), 1200); return () => clearTimeout(t) }, [done])

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${sel.shape}${sel.vendor}${date}`)
    setStep('consumed_count')
  }

  const handleConsumedSelect = (qty) => {
    setConsumedQty(qty)
    setStep('produced_count')
  }

  const handleProducedSelect = (qty) => {
    setQuantity(qty)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, quantity, {
        selected_Process: 'EA',
        lot_chain: lotChain,
        prev_lot_no: prevLotNo,
        consumed_quantity: consumedQty,
        ...selections
      })
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setLotNo(null); setSelections(null)
    setConsumedQty(null); setQuantity(null)
    setPrinting(false); setDone(false); setError(null)
    setLotChain(null); setPrevLotNo(null); setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner processLabel="EA, 낱장가공"
          onScan={async (val) => {
            const r = await scanLot('EA', val)
            setPrevLotNo(r.prev_lot_no)
            setLotChain(r.lot_chain)
            setStep('selector')
          }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={steps} autoValues={{ date, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity: null } : null}
        />
      )}
      {step === 'consumed_count' && (
        <CountModal
          lotNo={`${lotNo}-00`}
          label="소비량 입력 (스택 몇 개 소모했나요? 미소모 시 0)"
          onSelect={handleConsumedSelect}
          onCancel={handleReset}
        />
      )}
      {step === 'produced_count' && (
        <CountModal
          lotNo={`${lotNo}-00`}
          label="생산량 입력 (이번 공정에서 몇 장 만들었나요?)"
          onSelect={handleProducedSelect}
          onCancel={handleReset}
        />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={quantity}
          consumedQty={consumedQty}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset}
        />
      )}
    </>
  )
}