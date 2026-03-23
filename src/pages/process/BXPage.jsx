// src/pages/process/BXPage.jsx (전체 교체)
import { useState, useEffect } from 'react'
import { printLot, scanLot } from '@/api'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'


export default function BXPage({ onLogout, onBack }) {
  const date = useDate()
  const lotNo = `BX-${date}`
  const [lotChain, setLotChain] = useState(null)
  const [scanList, setScanList] = useState([])
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  useEffect(() => { if (!error) return; const t = setTimeout(() => handleReset(), 1500); return () => clearTimeout(t) }, [error])
  useEffect(() => { if (!done) return; const t = setTimeout(() => handleReset(), 1200); return () => clearTimeout(t) }, [done])

  const handleConfirm = async () => {
    const overItem = scanList.find(item => item.quantity > item.maxQty)
    if (overItem) {
      setError(`재고 초과: ${overItem.lot_no} (요청 ${overItem.quantity}개 / 재고 ${overItem.maxQty}개)`)
      return
    }
    setPrinting(true)
    try {
      // ★ 백엔드에서 ST QR + BX QR 동시 출력
      const result = await printLot(lotNo, 1, {
        selected_Process: 'BX',
        lot_chain: lotChain,
        quantity: 1,
        consumed_list: scanList.map(item => ({ lot_no: item.lot_no, quantity: item.quantity })),
      })

      // ST serial 번호가 응답에 포함됨
      if (result.st_serial_nos?.length) {
        console.log('ST QR 출력:', result.st_serial_nos)
      }

      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const handleReset = () => {
    setScanList([]); setLotChain(null)
    setPrinting(false); setDone(false); setError(null); setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner
          key={step}
          processLabel="BX, 포장"
          showList={true}
          nextLabel="완료 → 포장"
          onScan={async (val) => {
            const r = await scanLot('BX', val)
            return r
          }}
          onScanList={(list, chain) => {
            setScanList(list)
            setLotChain(chain)
            setStep('confirm')
          }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'confirm' && (
        // ★ printCount: ST 라벨(제품 수) + BX 라벨(1) = 총 출력 매수 표시
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={scanList.length + 1}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}