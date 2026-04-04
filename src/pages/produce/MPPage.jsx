import { useState } from 'react'
import { printLot, scanLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector/index'
import { CountModal } from '@/components/CountModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { MP_STEPS } from '@/constants/processConst'

export default function MPPage({ onLogout, onBack }) {
  const date = useDate()
  const [lotChain, setLotChain] = useState(null)
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [printCount, setPrintCount] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${sel.shape}${sel.vendor}${sel.width}`)
    setStep('count')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, printCount, {
        selected_process: 'MP',
        lot_chain: lotChain,
        prev_lot_no: prevLotNo,
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
    setLotChain(null); setPrevLotNo(null); setPrintCount(null)
    setLotNo(null); setSelections(null)
    setPrinting(false); setDone(false); setError(null)
    setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'qr' && (
        <QRScanner
          processLabel="MP, 자재준비"
          onScan={async (val) => {
            const r = await scanLot('MP', val)
            setPrevLotNo(r.prev_lot_no)
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
          scannedLot={prevLotNo ? { lot_no: prevLotNo } : null}
        />
      )}
      {step === 'count' && (
        <CountModal lotNo={`${lotNo}-00`} label="프린트 매수를 입력하세요"
          onSelect={(n) => { setPrintCount(n); setStep('confirm') }}
          onCancel={handleReset} unit="장" unit_type="매수" />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={printCount}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}
