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
  const [lotChain, setLotChain] = useState(null)
  const [scanList, setScanList] = useState([])
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
    const overItem = scanList.find(item => item.quantity > item.maxQty)
    if (overItem) {
      setError(`재고 초과: ${overItem.lot_no} (요청 ${overItem.quantity}개 / 재고 ${overItem.maxQty}개)`)
      return
    }
    setPrinting(true)
    try {
      await printLot(lotNo, 1, {
        selected_Process: 'EC',
        lot_chain: lotChain,
        consumed_list: scanList.map(item => ({ lot_no: item.lot_no, quantity: item.quantity })),
        ...selections,
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const handleReset = () => {
    setScanList([]); setLotChain(null); setLotNo(null); setSelections(null)
    setPrinting(false); setDone(false); setError(null); setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner
          key={step}
          processLabel="EC, 전착도장"
          showList={true}
          nextLabel="완료 → 다음"
          onScan={async (val) => {
            const r = await scanLot('EC', val)
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
        <MaterialSelector steps={steps} autoValues={{ date, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={scanList}
        />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={scanList.length}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset}
        />
      )}
    </>
  )
}