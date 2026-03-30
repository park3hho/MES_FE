import { useState, useRef } from 'react'
import { printLot, scanLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { PROCESS_INPUT, BO_STEPS, PHI_SPECS } from '@/constants/processConst'

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

  // ★ 첫 스캔의 파이 스펙 기억
  const lockedSpecRef = useRef(null)
  const SPEC_LABELS = Object.fromEntries(Object.entries(PHI_SPECS).map(([spec, { label }]) => [spec, label]))

  useAutoReset(error, done, handleReset)

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${sel.shape}${sel.worker}${date}`)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    const overItem = scanList.find((item) => item.quantity > item.maxQty)
    if (overItem) {
      setError(
        `재고 초과: ${overItem.lot_no} (요청 ${overItem.quantity}개 / 재고 ${overItem.maxQty}개)`,
      )
      return
    }
    setPrinting(true)
    try {
      await printLot(lotNo, 1, {
        selected_process: 'BO',
        lot_chain: lotChain,
        quantity: 1,
        consumed_list: scanList.map((item) => ({ lot_no: item.lot_no, quantity: item.quantity })),
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
    setLotNo(null)
    setSelections(null)
    setPrinting(false)
    setDone(false)
    setError(null)
    setStep('qr')
    lockedSpecRef.current = null
  }

  return (
    <>
      {step === 'qr' && (
        <QRScanner
          key={step}
          processLabel="BO, 본딩"
          showList={true}
          nextLabel="완료 → 다음"
          unit_type={PROCESS_INPUT['BO'].unit_type}
          unit={PROCESS_INPUT['BO'].unit}
          onScan={async (val) => {
            const r = await scanLot('BO', val)

            // ★ 파이 검증: 첫 스캔의 spec을 기준으로 고정
            const spec = r.spec || ''
            if (spec) {
              if (!lockedSpecRef.current) {
                // 첫 스캔 → spec 고정
                lockedSpecRef.current = spec
              } else if (lockedSpecRef.current !== spec) {
                // 다른 파이 → 거부
                const locked = SPEC_LABELS[lockedSpecRef.current] || lockedSpecRef.current
                const incoming = SPEC_LABELS[spec] || spec
                throw new Error(`파이 불일치: 현재 ${locked} 작업 중입니다. (스캔: ${incoming})`)
              }
            }

            return r
          }}
          onScanList={(list, chain) => {
            setScanList(list)
            setLotChain(chain)
            setStep('selector')
          }}
          onLogout={onLogout}
          onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector
          steps={BO_STEPS}
          autoValues={{ date, seq: '00' }}
          onSubmit={handleMaterialSubmit}
          onLogout={onLogout}
          onBack={() => setStep('qr')}
          scannedLot={scanList}
        />
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${lotNo}-00`}
          printCount={1}
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
