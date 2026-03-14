import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import { CountModal } from '../../components/CountModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { useDate } from '../../utils/useDate'

const steps = [
  { key: 'shape', label: '가공형태', options: [
    { label: 'ST : 스택(샤링 후)', value: 'ST' },
    { label: 'SR : 스트립(슬리팅후)', value: 'SR' },
  ]},
  { key: 'vendor', label: '가공업체/설비', size: 'sm', options: [
    { label: '01 : 샤링기', value: '01' },
    { label: '02 : 정철스리팅', value: '02' },
    { label: '03 : 동양스리팅', value: '03' },
  ]},
  { key: 'width', label: '재료 폭', options: null, hint: '예: 020 → 20mm' },
  { key: 'seq', label: '순서', auto: true },
]

export default function MPPage({ onLogout, onBack }) {
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
    setLotNo(`${sel.shape}${sel.vendor}${sel.width}`)
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
        selected_Process: 'MP',
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
        <QRScanner processLabel="MP, 자재준비"
          onScan={async (val) => {
            const r = await scanLot('MP', val)
            setPrevLotNo(r.prev_lot_no)
            setLotChain(r.lot_chain)
            setStep('selector')
          }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={steps} autoValues={{ seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
        />
      )}
      {step === 'consumed_count' && (
        <CountModal
          lotNo={`${lotNo}-00`}
          label="소비량 입력 (원자재 몇 개 소모했나요? 남아있을 시 0)"
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
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={quantity}
          consumedQty={consumedQty}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset}
        />
      )}
    </>
  )
}