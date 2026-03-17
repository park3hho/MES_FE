
// src/pages/process/EAPage.jsx
import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import QRScanner from '../../components/QRScanner'
import SpecListStep from '../../components/SpecListStep'
import { useDate } from '../../utils/useDate'
import { EA_STEPS } from '../../constants/processConst'

export default function EAPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [selections, setSelections] = useState(null)
  const [step, setStep] = useState('qr')

  const handleReset = () => {
    setPrevLotNo(null); setLotChain(null); setQuantity(null); setSelections(null)
    setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner
          key={step}
          processLabel="EA, 낱장가공"
          onScan={async (val) => {
            const r = await scanLot('EA', val)
            setPrevLotNo(r.prev_lot_no)
            setLotChain(r.lot_chain)
            setQuantity(r.quantity)
            setStep('selector')
          }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={EA_STEPS} autoValues={{ date, seq: '00' }}
          onSubmit={(sel) => { setSelections(sel); setStep('spec_list') }}
          onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity } : null}
        />
      )}
      {step === 'spec_list' && (
        <SpecListStep
          onConfirm={async (eaList) => {
            const lotNo = `${selections.shape}${selections.vendor}${date}`
            await printLot(lotNo, 1, {
              selected_Process: 'EA',
              lot_chain: lotChain,
              prev_lot_no: prevLotNo,
              consumed_quantity: quantity,  // 1 → 스캔된 MP 무게로 교체
              ea_list: eaList,
              ...selections,
            })
          }}
          onBack={() => setStep('selector')}
          onDone={handleReset}
        />
      )}
    </>
  )
}