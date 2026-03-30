import { useState } from 'react'
import { printLot, scanLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
// 수정 코드 ↓
import MaterialSelector from '@/components/MaterialSelector/index'
import { CountModal } from '@/components/CountModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { MP_STEPS, PROCESS_INPUT } from '@/constants/processConst'

// MP 공정 단위, 이전 공정(RM) 단위
const MP = PROCESS_INPUT['MP']
const RM = PROCESS_INPUT['RM']

export default function MPPage({ onLogout, onBack }) {
  const date = useDate()
  const [lotChain, setLotChain] = useState(null)
  const [scanList, setScanList] = useState([])
  const [producedQty, setProducedQty] = useState(null)
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

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
    const totalWeight = Math.round(producedQty.reduce((s, i) => s + i.weight, 0) * 1000) / 1000
    try {
      await printLot(lotNo, producedQty.length, {
        selected_process: 'MP',
        lot_chain: lotChain,
        prev_lot_no: scanList[0]?.lot_no || null,
        consumed_quantity: totalWeight, // ← RM 무게 아닌 생산 총합
        quantity: producedQty,
        ...selections,
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
    setProducedQty(null)
    setLotNo(null)
    setSelections(null)
    setPrinting(false)
    setDone(false)
    setError(null)
    setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'qr' && (
        <QRScanner
          showList={false} // 목록 모드 끔
          maxItems={1}
          onScan={async (val) => {
            const r = await scanLot('MP', val)
            console.log(r) // 키 확인용
            setScanList([
              {
                lot_no: r.lot_no ?? r.prev_lot_no ?? val, // 응답 키 맞게 수정
                quantity: r.quantity,
                created_at: r.created_at,
              },
            ])
            setLotChain(r.lot_chain)
            setStep('selector')
            return r
          }}
          onLogout={onLogout}
          onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector
          steps={MP_STEPS}
          autoValues={{ seq: '00' }}
          onSubmit={handleMaterialSubmit}
          onLogout={onLogout}
          onBack={() => setStep('qr')}
          scannedLot={scanList}
          preProcess={RM.unit} // 스캔된 LOT 수량 단위 — RM은 kg
        />
      )}
      {step === 'produced_count' && (
        <CountModal
          lotNo={`${lotNo}-00`}
          mode="mp"
          unit={MP.unit}
          unit_type={MP.unit_type}
          maxWeight={scanList[0]?.quantity || null}
          rmLotNo={scanList[0]?.lot_no || ''}
          onSelect={(items) => {
            setProducedQty(items)
            setStep('confirm')
          }}
          onCancel={handleReset}
        />
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${lotNo}-00`}
          printCount={producedQty.length}
          items={producedQty} // ← 추가
          totalWeight={Math.round(producedQty.reduce((s, i) => s + i.weight, 0) * 1000) / 1000}
          consumedQty={scanList[0]?.quantity || 0}
          consumedUnit={RM.unit}
          producedUnit={MP.unit}
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
