import { useState } from 'react'
import { printLot, scanLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import { EC_STEPS, EC_MEASUREMENTS } from '@/constants/processConst'
export default function ECPage({ onLogout, onBack }) {
  const date = useDate()
  const [lotChain, setLotChain] = useState(null)
  const [scanList, setScanList] = useState([])
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [overrideDate, setOverrideDate] = useState(null)
  const [heights, setHeights] = useState({})   // { bo_lot_no: { max_height, min_height } } — EC 측정값
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const effectiveDate = overrideDate || date

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`EC${sel.vendor}${effectiveDate}`)
    setStep('date_pick')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      // 측정값(EAV) — 코어(BO LOT)별 최고/최저 높이. 입력값 있는 항목만 전송 (측정값만 기록, 미입력 허용).
      const measurements = {}
      scanList.forEach((item) => {
        const arr = EC_MEASUREMENTS
          .map((m) => {
            const raw = heights[item.lot_no]?.[m.metric]
            return raw !== undefined && raw !== '' ? { metric: m.metric, value: Number(raw) } : null
          })
          .filter(Boolean)
        if (arr.length) measurements[item.lot_no] = arr
      })
      await printLot(lotNo, 1, {
        selected_process: 'EC',
        lot_chain: lotChain,
        override_date: overrideDate || undefined,
        consumed_list: scanList.map(item => ({ lot_no: item.lot_no, quantity: item.quantity })),
        measurements,
        ...selections,
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const handleReset = () => {
    setScanList([]); setLotChain(null); setLotNo(null); setSelections(null); setHeights({})
    setOverrideDate(null); setPrinting(false); setDone(false); setError(null); setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'qr' && (
        <QRScanner
          key={step}
          processLabel="EC, 전착도장"
          showList={true}
          nextLabel="완료 → 다음"
          onScan={async (val) => {
            const r = await scanLot('EC', val)
            return r
          }}
          onScanList={(list, chain) => {
            setScanList(list); setLotChain(chain); setStep('selector')
          }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'selector' && (
        <MaterialSelector steps={EC_STEPS} autoValues={{ date: effectiveDate, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={scanList} />
      )}
      {step === 'date_pick' && (
        <div className="page-flat" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ padding: '12px var(--space-lg)' }}>
            <button onClick={() => setStep('selector')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-dark)', display: 'flex', alignItems: 'center' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </div>
          <div className="process-content-inner">
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-dark)', marginBottom: 8 }}>입고일을 선택해 주세요</h1>
            <p style={{ color: 'var(--color-text-sub)', fontSize: 14, marginBottom: 28 }}>
              밀린 작업이면 실제 입고 날짜를 선택하세요
            </p>
            <input type="date" defaultValue={toInputDate(effectiveDate)}
              onChange={(e) => {
                const yy = toYYMMDD(e.target.value)
                setOverrideDate(yy === date ? null : yy)
                if (selections) setLotNo(`EC${selections.vendor}${yy || date}`)
              }}
              style={{ width: '100%', padding: 18, fontSize: 18, fontWeight: 700, borderRadius: 12, border: '1.5px solid var(--color-border)', textAlign: 'center', marginBottom: 12, boxSizing: 'border-box', background: 'var(--color-bg)' }}
            />
            <p style={{ fontSize: 13, color: 'var(--color-gray)', marginBottom: 28, textAlign: 'center' }}>LOT: {lotNo}-00</p>
            <button className="btn-primary btn-lg btn-full" onClick={() => setStep('measure')}>다음</button>
          </div>
        </div>
      )}
      {step === 'measure' && (
        <div className="page-flat" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ padding: '12px var(--space-lg)' }}>
            <button onClick={() => setStep('date_pick')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-dark)', display: 'flex', alignItems: 'center' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </div>
          <div className="process-content-inner">
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-dark)', marginBottom: 8 }}>코어 높이를 입력해 주세요</h1>
            <p style={{ color: 'var(--color-text-sub)', fontSize: 14, marginBottom: 24 }}>
              전착도장 후 각 코어의 최고/최저 높이 (mm) · 미입력 시 빈값으로 기록
            </p>
            {scanList.map((item, idx) => (
              <div key={item.lot_no} style={{ marginBottom: 18, paddingBottom: 18, borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-dark)', marginBottom: 10 }}>
                  {idx + 1}. {item.lot_no}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {EC_MEASUREMENTS.map((m) => (
                    <div key={m.metric} style={{ flex: 1 }}>
                      <label className="form-label">{m.label} ({m.unit})</label>
                      <input
                        className="form-input"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="0.00"
                        value={heights[item.lot_no]?.[m.metric] ?? ''}
                        onChange={(e) => setHeights((prev) => ({
                          ...prev,
                          [item.lot_no]: { ...prev[item.lot_no], [m.metric]: e.target.value },
                        }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button className="btn-primary btn-lg btn-full" onClick={() => setStep('confirm')}>다음</button>
          </div>
        </div>
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={scanList.length}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}
