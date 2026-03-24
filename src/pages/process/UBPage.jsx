// src/pages/process/UBPage.jsx
// ★ [Phase1] UB 소포장 페이지 — BXPage에서 이관
// 호출: App.jsx → process === 'UB' 선택 시 렌더
// 역할: OQ QR 여러 개 스캔 → ST QR(제품별) + UB QR(박스) 동시 발행
import { useState, useEffect } from 'react'
import { printLot, scanLot } from '@/api'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'

export default function UBPage({ onLogout, onBack }) {
  const date = useDate()
  const lotNo = `UB-${date}` // ★ BX→UB
  const [lotChain, setLotChain] = useState(null)
  const [scanList, setScanList] = useState([])
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => handleReset(), 1500)
    return () => clearTimeout(t)
  }, [error])

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => handleReset(), 1200)
    return () => clearTimeout(t)
  }, [done])

  // ── 포장 확정: 백엔드에 ST+UB 출력 요청 ──
  const handleConfirm = async () => {
    const overItem = scanList.find((item) => item.quantity > item.maxQty)
    if (overItem) {
      setError(`재고 초과: ${overItem.lot_no}`)
      return
    }
    setPrinting(true)
    try {
      const result = await printLot(lotNo, 1, {
        selected_Process: 'UB', // ★ BX→UB
        lot_chain: lotChain,
        quantity: 1,
        consumed_list: scanList.map((item) => ({
          lot_no: item.lot_no,
          quantity: item.quantity,
        })),
      })
      if (result.st_serial_nos?.length) {
        console.log('ST QR 출력:', result.st_serial_nos)
      }
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setScanList([])
    setLotChain(null)
    setPrinting(false)
    setDone(false)
    setError(null)
    setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner
          key={step}
          processLabel="UB, 소포장" /* ★ BX→UB */
          showList={true}
          nextLabel="완료 → 소포장"
          onScan={async (val) => {
            const r = await scanLot('UB', val) /* ★ BX→UB */
            return r
          }}
          onScanList={(list, chain) => {
            setScanList(list)
            setLotChain(chain)
            setStep('confirm')
          }}
          onLogout={onLogout}
          onBack={onBack}
        />
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${lotNo}-00`}
          printCount={scanList.length} /* ST 라벨 수 = 스캔된 제품 수 */
          printing={printing}
          done={done}
          error={error}
          onConfirm={handleConfirm}
          onCancel={handleReset}
        />
      )}
    </>
  )
}
