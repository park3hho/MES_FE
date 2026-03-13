import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import { CountModal } from '../../components/CountModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { useDate } from '../../utils/useDate'

const steps = [
  { key: 'shape', label: '가공형태', options: [
    { label: 'SR : 스트립(슬리팅후)', value: 'SR' },
    { label: 'ST : 스택(샤링 후)', value: 'ST' },
  ]},
  { key: 'vendor', label: '가공업체/설비', size: 'sm', options: [
    { label: '01 : 샤링기', value: '01' },
    { label: '02 : 정철스리팅', value: '02' },
    { label: '03 : 동양스리팅', value: '03' },
  ]},
  { key: 'thickness', label: '재료 두께', options: null, hint: '예: 35 → 0.35T' },
  { key: 'width', label: '재료 폭', options: null, hint: '예: 020 → 20mm' },
  { key: 'seq', label: '순서', auto: true },
]

export default function MPPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotNo, setLotNo] = useState(null)
  const [printCount, setPrintCount] = useState(null)
  const [selections, setSelections] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')
  const [lotChain, setLotChain] = useState(null)

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

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${sel.shape}${sel.vendor}${sel.thickness}${sel.width}`)
    setStep('count')
  }

  const handleCountSelect = (count) => {
    setPrintCount(count)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, printCount, { selected_Process: 'MP', lot_chain: lotChain, ...selections })
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setLotNo(null)
    setSelections(null)
    setPrintCount(null)
    setPrinting(false)
    setDone(false)
    setError(null)
    setLotChain(null)  // 추가
    setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner
          processLabel="MP, 자재준비"
          onScan={async (val) => { // 바로 넘어감
            try {
              const result = await scanLot('MP', val)
              setPrevLotNo(result.prev_lot_no)
              setLotChain(result.lot_chain)
              setStep('selector')
            } catch (e) {
              setError(e.message)
            }
          }}
          onLogout={onLogout}
          onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector
          steps={steps}
          autoValues={{ seq: '00' }}
          onSubmit={handleMaterialSubmit}
          onLogout={onLogout}
          onBack={() => setStep('qr')}
        />
      )}
      {step === 'count' && (
        <CountModal lotNo={`${lotNo}-00`} onSelect={handleCountSelect} onCancel={handleReset} />
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${lotNo}-00`}
          printCount={printCount}
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
