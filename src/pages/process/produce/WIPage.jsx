import { useState } from 'react'
import { printLot, scanLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import { WI_STEPS, autoWorkerCode } from '@/constants/processConst'
export default function WIPage({ user, onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  // Core QR 로 스캔했으면 그 번호 (스캔 응답 core_no) — 발급 요청에 그대로 실어 BE 가 라벨을 생략한다 (본딩 제외, 2026-09-12)
  const [scanCore, setScanCore] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [overrideDate, setOverrideDate] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const effectiveDate = overrideDate || date

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${sel.shape}${sel.worker}${effectiveDate}`)
    setStep('date_pick')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      // Core 로 스캔했으면 Core 번호를 싣는다 — BE 가 LOT 으로 바꿔 끼우고 라벨은 안 찍는다 (코어엔 Core 라벨이 붙어 있다)
      await printLot(lotNo, quantity, {
        selected_process: 'WI', lot_chain: lotChain, prev_lot_no: scanCore || prevLotNo,
        override_date: overrideDate || undefined, ...selections,
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const handleReset = () => {
    setLotNo(null); setSelections(null); setQuantity(null); setOverrideDate(null)
    setPrinting(false); setDone(false); setError(null)
    setLotChain(null); setPrevLotNo(null); setScanCore(null); setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'qr' && (
        <QRScanner key={step} processLabel="WI, 권선"
          onScan={async (val) => {
            const r = await scanLot('WI', val)
            setPrevLotNo(r.prev_lot_no); setLotChain(r.lot_chain); setQuantity(r.quantity)
            setScanCore(r.core_no || null)
            setStep('selector')
          }}
          onLogout={onLogout} onBack={onBack} />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={WI_STEPS} autoValues={{ date: effectiveDate, seq: '00', worker: autoWorkerCode(user) }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity } : null} />
      )}
      {step === 'date_pick' && (
        <div className="page-flat" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ padding: '12px var(--space-lg)' }}>
            <button onClick={() => setStep('selector')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-dark)', display: 'flex', alignItems: 'center' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </div>
          <div className="process-content-inner">
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-dark)', marginBottom: 8 }}>작업일을 선택해 주세요</h1>
            <p style={{ color: 'var(--color-text-sub)', fontSize: 14, marginBottom: 28 }}>
              밀린 작업이면 실제 작업 날짜를 선택하세요
            </p>
            <input type="date" defaultValue={toInputDate(effectiveDate)}
              onChange={(e) => {
                const yy = toYYMMDD(e.target.value)
                setOverrideDate(yy === date ? null : yy)
                if (selections) setLotNo(`${selections.shape}${selections.worker}${yy || date}`)
              }}
              style={{ width: '100%', padding: 18, fontSize: 18, fontWeight: 700, borderRadius: 12, border: '1.5px solid var(--color-border)', textAlign: 'center', marginBottom: 12, boxSizing: 'border-box', background: 'var(--color-bg)' }}
            />
            <p style={{ fontSize: 13, color: 'var(--color-gray)', marginBottom: 28, textAlign: 'center' }}>LOT: {lotNo}-00</p>
            <button className="btn-primary btn-lg btn-full" onClick={() => setStep('confirm')}>다음</button>
          </div>
        </div>
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={quantity}
          printing={printing} done={done} error={error}
          doneMessage={scanCore ? '기록 완료 · 라벨 없음 (Core 라벨 그대로)' : undefined}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}
