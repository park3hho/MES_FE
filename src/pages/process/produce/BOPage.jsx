import { useState, useRef } from 'react'
import { printLot, scanLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import { PROCESS_INPUT, BO_STEPS, PHI_SPECS } from '@/constants/processConst'
export default function BOPage({ onLogout, onBack }) {
  const date = useDate()
  const [lotChain, setLotChain] = useState(null)
  const [scanList, setScanList] = useState([])
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [overrideDate, setOverrideDate] = useState(null) // YYMMDD or null
  const [boCount, setBoCount] = useState(1) // BO 출력 수량 (1~4)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const lockedSpecRef = useRef(null)
  const lockedMotorRef = useRef(null)
  const SPEC_LABELS = Object.fromEntries(Object.entries(PHI_SPECS).map(([spec, { label }]) => [spec, label]))

  const effectiveDate = overrideDate || date

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${sel.shape}${sel.worker}${effectiveDate}`)
    setStep('bo_count')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, boCount, {
        selected_process: 'BO',
        lot_chain: lotChain,
        quantity: 1,
        override_date: overrideDate || undefined,
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
    setScanList([]); setLotChain(null); setLotNo(null); setSelections(null)
    setOverrideDate(null); setBoCount(1); setPrinting(false); setDone(false); setError(null)
    setStep('qr'); lockedSpecRef.current = null; lockedMotorRef.current = null
  }

  useAutoReset(error, done, handleReset)

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
            const spec = r.spec || ''
            const motor = r.motor_type || ''
            if (spec) {
              if (!lockedSpecRef.current) {
                lockedSpecRef.current = spec
                lockedMotorRef.current = motor
              } else {
                const specMismatch = lockedSpecRef.current !== spec
                const motorMismatch = lockedMotorRef.current && motor && lockedMotorRef.current !== motor
                if (specMismatch || motorMismatch) {
                  const lockedLabel = `${SPEC_LABELS[lockedSpecRef.current] || lockedSpecRef.current}${lockedMotorRef.current ? ` ${lockedMotorRef.current}` : ''}`
                  const incomingLabel = `${SPEC_LABELS[spec] || spec}${motor ? ` ${motor}` : ''}`
                  throw new Error(`규격 불일치: 현재 ${lockedLabel} 작업 중입니다. (스캔: ${incomingLabel})`)
                }
              }
            }
            return r
          }}
          onScanList={(list, chain) => {
            setScanList(list); setLotChain(chain); setStep('selector')
          }}
          onLogout={onLogout}
          onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector
          steps={BO_STEPS}
          autoValues={{ date: effectiveDate, seq: '00' }}
          onSubmit={handleMaterialSubmit}
          onLogout={onLogout}
          onBack={() => setStep('qr')}
          scannedLot={scanList}
        />
      )}
      {step === 'bo_count' && (
        <div className="page-flat" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ padding: '12px var(--space-lg)' }}>
            <button onClick={() => setStep('selector')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-dark)', display: 'flex', alignItems: 'center' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </div>
          <div style={{ flex: 1, padding: '20px var(--space-xl) 0', maxWidth: 480, width: '100%', margin: '0 auto' }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-dark)', marginBottom: 8 }}>출력 수량을 입력해 주세요</h1>
            <p style={{ color: 'var(--color-text-sub)', fontSize: 14, marginBottom: 28 }}>
              HT 1개에서 나오는 BO 제품 수를 입력하세요
            </p>
            <input
              type="number"
              min="1"
              value={boCount === '' ? '' : boCount}
              onChange={(e) => {
                const v = e.target.value
                if (v === '') { setBoCount(''); return }
                const n = parseInt(v)
                if (!isNaN(n) && n >= 0) setBoCount(n)
              }}
              onBlur={(e) => {
                const n = parseInt(e.target.value)
                if (isNaN(n) || n < 1) setBoCount(1)
              }}
              style={{
                width: 120, padding: 18, fontSize: 24, fontWeight: 700,
                borderRadius: 12, border: '1.5px solid var(--color-border)',
                textAlign: 'center', margin: '0 auto 28px', display: 'block',
                background: 'var(--color-bg)',
              }}
            />
            <button
              className="btn-primary btn-lg btn-full"
              disabled={boCount === '' || boCount < 1}
              onClick={() => setStep('date_pick')}
            >
              다음
            </button>
          </div>
        </div>
      )}
      {step === 'date_pick' && (
        <div className="page-flat" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ padding: '12px var(--space-lg)' }}>
            <button onClick={() => setStep('bo_count')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-dark)', display: 'flex', alignItems: 'center' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </div>
          <div style={{ flex: 1, padding: '20px var(--space-xl) 0', maxWidth: 480, width: '100%', margin: '0 auto' }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-dark)', marginBottom: 8 }}>작업일을 선택해 주세요</h1>
            <p style={{ color: 'var(--color-text-sub)', fontSize: 14, marginBottom: 28 }}>
              밀린 작업이면 실제 작업 날짜를 선택하세요
            </p>
            <input
              type="date"
              defaultValue={toInputDate(effectiveDate)}
              onChange={(e) => {
                const yy = toYYMMDD(e.target.value)
                setOverrideDate(yy === date ? null : yy)
                if (selections) {
                  setLotNo(`${selections.shape}${selections.worker}${yy || date}`)
                }
              }}
              style={{
                width: '100%', padding: 18, fontSize: 18, fontWeight: 700,
                borderRadius: 12, border: '1.5px solid var(--color-border)',
                textAlign: 'center', marginBottom: 12, boxSizing: 'border-box',
                background: 'var(--color-bg)',
              }}
            />
            <p style={{ fontSize: 13, color: 'var(--color-gray)', marginBottom: 28, textAlign: 'center' }}>
              LOT: {lotNo}-00
            </p>
            <button className="btn-primary btn-lg btn-full" onClick={() => setStep('confirm')}>
              다음
            </button>
          </div>
        </div>
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${lotNo}-00`}
          printCount={boCount}
          extraInfo={boCount > 1 ? `${boCount}개 라벨 동시 출력` : undefined}
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
