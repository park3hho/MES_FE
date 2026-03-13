import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import { CountModal } from '../../components/CountModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { useDate } from '../../utils/useDate'

const steps = [
  { key: "shape", label: "가공형태", options: [{ label: "BM: EXIA", value: "BM" }, { label: "BA: 본딩 자동화", value: "BA" }]},
  { key: "worker", label: "작업자코드", options: null, hint: "작업자 번호표 참조" },
  { key: "date", label: "작업일", auto: true },
  { key: "seq", label: "순서", auto: true },
]

export default function BOPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [consumedQty, setConsumedQty] = useState(null)  // 소비량
  const [producedQty, setProducedQty] = useState(null)  // 생산량
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
    setLotNo(`${sel.shape}${sel.worker}${date}`)
    setStep('consumed_count')  // 소비량 먼저
  }

  const handleConsumedSelect = (qty) => {
    setConsumedQty(qty)
    setStep('produced_count')  // 생산량 다음
  }

  const handleProducedSelect = (qty) => {
    setProducedQty(qty)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
    
      await printLot(lotNo, producedQty, {
        selected_Process: 'BO',
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
    setConsumedQty(null); setProducedQty(null)
    setPrinting(false); setDone(false); setError(null)
    setLotChain(null); setPrevLotNo(null); setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner processLabel="BO, 본딩"
          onScan={async (val) => {
            
              const r = await scanLot('BO', val)
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
