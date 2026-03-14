import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { useDate } from '../../utils/useDate'

const steps = [
  { key: 'shape', label: '가공형태', options: [{ label: 'BM: EXIA', value: 'BM' }, { label: 'BA: 본딩 자동화', value: 'BA' }]},
  { key: 'worker', label: '작업자코드', options: null, hint: '작업자 번호표 참조' },
  { key: 'date', label: '작업일', auto: true },
  { key: 'seq', label: '순서', auto: true },
]

export default function BOPage({ onLogout, onBack }) {
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
    setLotNo(`${sel.shape}${sel.worker}${date}`)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    // 수량 초과 검사
    const overItem = scanList.find(item => item.quantity > item.maxQty)
    if (overItem) {
      setError(`재고 초과: ${overItem.lot_no} (요청 ${overItem.quantity}개 / 재고 ${overItem.maxQty}개)`)
      return
    }
    setPrinting(true)
    try {
      await printLot(lotNo, 1, {
        selected_Process: 'BO',
        lot_chain: lotChain,
        quantity: 1,
        consumed_list: scanList.map(item => ({ lot_no: item.lot_no, quantity: item.quantity })),
        ...selections
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
          processLabel="BO, 본딩"
          showList={true}
          nextLabel="완료 → 다음"
          onScan={async (val) => {
            const r = await scanLot('BO', val)
            return r  // lot_chain, quantity 반환
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
          scannedLot={scanList} />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={1}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}