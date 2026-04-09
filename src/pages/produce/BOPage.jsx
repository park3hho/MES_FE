import { useState, useRef } from 'react'
import { printLot, scanLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import { PROCESS_INPUT, BO_STEPS, PHI_SPECS } from '@/constants/processConst'
import { FaradayLogo } from '@/components/FaradayLogo'

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
        <div className="page">
          <div className="card" style={{ textAlign: 'center' }}>
            <FaradayLogo size="md" />
            <p style={{ fontWeight: 700, fontSize: 18, margin: '12px 0 4px' }}>출력 수량</p>
            <p style={{ color: 'var(--color-gray)', fontSize: 13, marginBottom: 20 }}>
              HT 1개에서 나오는 BO 제품 수를 선택하세요
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  className={`btn-primary btn-lg`}
                  style={{
                    width: 56, height: 56, fontSize: 20,
                    opacity: boCount === n ? 1 : 0.35,
                    background: boCount === n ? undefined : 'var(--color-text-muted)',
                    borderColor: boCount === n ? undefined : 'var(--color-text-muted)',
                  }}
                  onClick={() => setBoCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <button className="btn-primary btn-lg btn-full" onClick={() => setStep('date_pick')}>
              다음 → 날짜 선택
            </button>
            <button className="btn-text" style={{ marginTop: 8 }} onClick={() => setStep('selector')}>
              ← 이전으로
            </button>
          </div>
        </div>
      )}
      {step === 'date_pick' && (
        <div className="page">
          <div className="card" style={{ textAlign: 'center' }}>
            <FaradayLogo size="md" />
            <p style={{ fontWeight: 700, fontSize: 18, margin: '12px 0 4px' }}>작업일 선택</p>
            <p style={{ color: 'var(--color-gray)', fontSize: 13, marginBottom: 20 }}>
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
                width: '100%', padding: '14px', fontSize: 18, fontWeight: 700,
                borderRadius: 10, border: '1.5px solid var(--color-border-dark)',
                textAlign: 'center', marginBottom: 16,
              }}
            />
            <p style={{ fontSize: 13, color: 'var(--color-gray)', marginBottom: 20 }}>
              LOT: {lotNo}-00
            </p>
            <button className="btn-primary btn-lg btn-full" onClick={() => setStep('confirm')}>
              다음 → 확인
            </button>
            <button className="btn-text" style={{ marginTop: 8 }} onClick={() => setStep('selector')}>
              ← 이전으로
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
