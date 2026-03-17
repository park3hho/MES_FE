import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import { CountModal } from '../../components/CountModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { useDate } from '../../utils/useDate'
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
      await printLot(lotNo, producedQty.length, {  // print_count = 개체 수
        selected_Process: 'MP',
        lot_chain: lotChain,
        prev_lot_no: scanList[0]?.lot_no || null,
        consumed_quantity: scanList[0]?.quantity || 0,
        quantity: producedQty,                      // [{ seq, weight }] 배열
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
          showList={false}           // 목록 모드 끔
          maxItems={1}
          onScan={async (val) => {
            const r = await scanLot('MP', val)
            setScanList([{ lot_no: r.lot_no, quantity: r.quantity, created_at: r.created_at }])
            setLotChain(r.lot_chain)
            setStep('selector')      // 스캔 즉시 다음 단계로
            return r
          }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={MP_STEPS} autoValues={{ seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={scanList} preProcess={RM.unit}   // 스캔된 LOT 수량 단위 — RM은 kg
        />
      )}
      {step === 'produced_count' && (
        <CountModal
          lotNo={`${lotNo}-00`}
          mode="mp"
          unit={MP.unit}
          unit_type={MP.unit_type}
          onSelect={(items) => {
            setProducedQty(items)   // [{ seq, weight }] 배열 저장
            setStep('confirm')
          }}
          onCancel={handleReset}
        />
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${lotNo}-00`}
          printCount={producedQty.length}                               // 개체 수
          totalWeight={                                                  // 표시용 총 무게
            Math.round(producedQty.reduce((s, i) => s + i.weight, 0) * 1000) / 1000
          }
          consumedQty={scanList[0]?.quantity || 0}
          consumedUnit={RM.unit}
          producedUnit={MP.unit}
          producedCount={producedQty.length}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm}
          onCancel={handleReset}
        />
      )}
    </>
  )
}