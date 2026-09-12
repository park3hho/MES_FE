import { useState } from 'react'
import { printLot, scanLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import {
  COATING_METHOD_STEPS, EC_STEPS, VD_STEPS, EC_MEASUREMENTS, COATING_INHOUSE_VENDORS,
} from '@/constants/processConst'

// CT 코팅 (2026-09-12 공정코드 EC→CT 개명) — 방식(EC 전착도장 / VD 증착) → 업체 → 날짜 → 측정 → 발급.
//   LOT 접두사 = 방식코드(EC/VD) — 공정코드 CT 는 LOT 번호에 안 들어간다. 파일명 ECPage 는 역사적 이름.
// Core 번호 형식 — BE core_service._CORE_NO_RE · TracePage 와 같은 규칙 (2026-09-12).
//   목록 모드 스캐너는 원래 스캔값을 싣는다 → Core QR 로 찍은 코어는 BE 가 라벨을 생략한다(본딩 제외). 완료 문구만 여기서 맞춘다.
const CORE_NO_RE = /^CORE-\d{6}-\d{4}$/i

// 완료 문구 — Core 로 찍은 코어는 라벨이 안 나온다 (BE core_scan_silent). 섞여 있으면 몇 건인지 알려 준다.
function coatDoneMessage(list) {
  const n = list.filter((it) => CORE_NO_RE.test(String(it.lot_no || '').trim())).length
  if (!n) return undefined
  return n === list.length ? '기록 완료 · 라벨 없음 (Core 라벨 그대로)' : `인쇄 완료 · ${n}건은 라벨 없음 (Core)`
}

export default function ECPage({ onLogout, onBack }) {
  const date = useDate()
  const [lotChain, setLotChain] = useState(null)
  const [scanList, setScanList] = useState([])
  const [shape, setShape] = useState(null)     // 코팅 방식 'EC' | 'VD' (LOT 접두사)
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [overrideDate, setOverrideDate] = useState(null)
  const [heights, setHeights] = useState({})   // { bo_lot_no: { max_height, min_height } } — 코팅 측정값
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const effectiveDate = overrideDate || date
  // 자체 코팅(05)은 입고가 아니라 사내 작업 — 날짜 문구만 '작업일' 로 (BE 자동기록도 IPQ·자체)
  const dateWord = COATING_INHOUSE_VENDORS.includes(selections?.vendor) ? '작업' : '입고'

  const handleMethodSubmit = (sel) => {
    setShape(String(sel.shape || '').trim().toUpperCase())
    setStep('selector')
  }

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${shape}${sel.vendor}${effectiveDate}`)
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
        selected_process: 'CT',
        lot_chain: lotChain,
        override_date: overrideDate || undefined,
        consumed_list: scanList.map(item => ({ lot_no: item.lot_no, quantity: item.quantity })),
        measurements,
        ...selections,
        shape,   // 코팅 방식 — BE 가 LOT 접두사로 사용 (EC/VD)
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const handleReset = () => {
    setScanList([]); setLotChain(null); setShape(null); setLotNo(null); setSelections(null); setHeights({})
    setOverrideDate(null); setPrinting(false); setDone(false); setError(null); setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'qr' && (
        <QRScanner
          key={step}
          processLabel="CT, 코팅"
          showList={true}
          nextLabel="완료 → 다음"
          onScan={async (val) => {
            const r = await scanLot('CT', val)
            return r
          }}
          onScanList={(list, chain) => {
            setScanList(list); setLotChain(chain); setStep('method')
          }}
          onLogout={onLogout} onBack={onBack}
        />
      )}
      {step === 'method' && (
        <MaterialSelector key="method" steps={COATING_METHOD_STEPS}
          onSubmit={handleMethodSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={scanList} />
      )}
      {step === 'selector' && (
        <MaterialSelector key={`vendor-${shape}`} steps={shape === 'VD' ? VD_STEPS : EC_STEPS}
          autoValues={{ date: effectiveDate, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('method')}
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
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-dark)', marginBottom: 8 }}>{dateWord}일을 선택해 주세요</h1>
            <p style={{ color: 'var(--color-text-sub)', fontSize: 14, marginBottom: 28 }}>
              밀린 작업이면 실제 {dateWord} 날짜를 선택하세요
            </p>
            <input type="date" defaultValue={toInputDate(effectiveDate)}
              onChange={(e) => {
                const yy = toYYMMDD(e.target.value)
                setOverrideDate(yy === date ? null : yy)
                if (selections) setLotNo(`${shape}${selections.vendor}${yy || date}`)
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
              코팅 후 각 코어의 최고/최저 높이 (mm) · 미입력 시 빈값으로 기록
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
          doneMessage={coatDoneMessage(scanList)}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}
