// src/pages/process/MBPage.jsx
// ★ [Phase2] MB 대포장 페이지
// 호출: App.jsx → process === 'MB' 선택 시 렌더
// 역할: UB QR 여러 개 스캔 → MB QR 1개 발행 (ST 출력 없음)
import { useState, useEffect } from 'react'
import { printLot, scanLot } from '@/api'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'

export default function MBPage({ onLogout, onBack }) {
  const date = useDate()
  const lotNo = `MB-${date}`
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

  // ── 대포장 확정: MB QR만 출력 ──
  const handleConfirm = async () => {
    const overItem = scanList.find((item) => item.quantity > item.maxQty)
    if (overItem) {
      setError(`재고 초과: ${overItem.lot_no}`)
      return
    }
    setPrinting(true)
    try {
      await printLot(lotNo, 1, {
        selected_Process: 'MB',
        lot_chain: lotChain,
        quantity: 1,
        consumed_list: scanList.map((item) => ({
          lot_no: item.lot_no,
          quantity: item.quantity,
        })),
      })
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
          processLabel="MB, 대포장"
          showList={true}
          nextLabel="완료 → 대포장"
          onScan={async (val) => {
            // ★ UB QR을 스캔 — PREV_SNBT_MAP이 MB→UB로 자동 매핑
            const r = await scanLot('MB', val)
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
          printCount={1} /* MB 라벨 1매만 출력 */
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
