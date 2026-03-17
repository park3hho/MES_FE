import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import { CountModal } from '../../components/CountModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { useDate } from '../../utils/useDate'
import { MP_STEPS } from '../../constants/processConst'
import { PROCESS_INPUT } from '../../constants/processConst'

export default function MPPage({ onLogout, onBack }) {
  const date = useDate()
  const [lotChain, setLotChain] = useState(null)
  const [scanList, setScanList] = useState([])   // 1개 고정 [{ lot_no, quantity, maxQty }]
  const [producedQty, setProducedQty] = useState(null)
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
    setLotNo(`${sel.shape}${sel.vendor}${sel.width}`)
    setStep('produced_count')
  }

  const handleProducedSelect = (qty) => {
    setProducedQty(qty)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, 1, {
        selected_Process: 'MP',
        lot_chain: lotChain,
        prev_lot_no: scanList[0]?.lot_no || null,
        consumed_quantity: scanList[0]?.quantity || 0,
        print_count: producedQty,
        ...selections,
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const handleReset = () => {
    setScanList([]); setLotChain(null)
    setProducedQty(null); setLotNo(null); setSelections(null)
    setPrinting(false); setDone(false); setError(null); setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner
          key={step}
          processLabel="MP, 자재준비"
          showList={true}
          maxItems={1}
          defaultQty={1}
          unit={PROCESS_INPUT('MP').unit}
          nextLabel="완료 → 다음"
          onScan={async (val) => {
            const r = await scanLot('MP', val)
            return r
          }}
          onScanList={(list, chain) => {
            setScanList(list)
            setLotChain(chain)
            setStep('selector')
          }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={MP_STEPS} autoValues={{ seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={scanList}
        />
      )}
      {step === 'produced_count' && (
        <CountModal
          lotNo={`${lotNo}-00`}
          label="생산량 입력 (ST/SR 몇 개 만들었나요?)"
          onSelect={handleProducedSelect}
          onCancel={handleReset}
        />
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${lotNo}-00`}
          printCount={producedQty}
          consumedQty={scanList[0]?.quantity || 0}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset}
          unit_type={'RM'}
        />
      )}
    </>
  )
}