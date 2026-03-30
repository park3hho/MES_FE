import { useState } from 'react'
import { printLot, scanLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { HT_STEPS } from '@/constants/processConst'

export default function HTPage({ onLogout, onBack }) {
  const date = useDate()
  const [lotChain, setLotChain] = useState(null)
  const [scanList, setScanList] = useState([])
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  useAutoReset(error, done, handleReset)

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`HT${sel.vendor}${date}`)
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
        selected_process: 'HT',
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
          processLabel="HT, 열처리"
          showList={true}
          nextLabel="완료 → 다음"
          onScan={async (val) => {
            const r = await scanLot('HT', val)
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
        <MaterialSelector steps={HT_STEPS} autoValues={{ date, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={scanList}
        />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`}
          printCount={scanList.reduce((sum, item) => sum + item.quantity, 0)}
          unit="매"
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset}
        />
      )}
    </>
  )
}