import { useState, useEffect } from 'react'
import { printLot, scanLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import { ConfirmModal } from '../../components/ConfirmModal'
import QRScanner from '../../components/QRScanner'
import { FaradayLogo } from '../../components/FaradayLogo'
import { useDate } from '../../utils/useDate'

const SPEC_OPTIONS = [
  { spec: '87', color: '#FF69B4' },  // 핑크
  { spec: '70', color: '#FFB07C' },  // 피치
  { spec: '45', color: '#F0D000' },  // 노랑
  { spec: '20', color: '#77DD77' },  // 연두
]

const steps = [
  { key: 'shape', label: '가공방식', options: [
    { label: 'ED : 와이어방전', value: 'ED' },
    { label: 'PR : 프레스', value: 'PR' },
  ]},
  { key: 'vendor', label: '설비', size: 'sm',
    hint: '01~07: 와이어머신 / 61: 제이와이테크놀러지 / 62: 와이솔루션 / 63: 부광정기 / 64: 엠토',
    options: ['01','02','03','04','05','06','07','XX','61','62','63','64']
  },
  { key: 'date', label: '날짜', auto: true },
  { key: 'seq', label: '순서', auto: true },
]

export default function EAPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [quantity, setQuantity] = useState(null)    // 스캔된 재고 수량
  const [selections, setSelections] = useState(null)
  const [eaList, setEaList] = useState([])   // [{ id, spec, quantity }]
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  useEffect(() => { if (!error) return; const t = setTimeout(() => handleReset(), 1500); return () => clearTimeout(t) }, [error])
  useEffect(() => { if (!done) return; const t = setTimeout(() => handleReset(), 1200); return () => clearTimeout(t) }, [done])

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setStep('spec_list')
  }

  const handleAddSpec = (spec) => {
    setEaList(prev => [...prev, { id: Date.now(), spec, quantity: 88 }])
  }

  const handleQtyChange = (id, val) => {
    const num = parseInt(val)
    if (isNaN(num) || num < 0) return
    setEaList(prev => prev.map(item => item.id === id ? { ...item, quantity: num } : item))
  }

  const handleRemove = (id) => {
    setEaList(prev => prev.filter(item => item.id !== id))
  }

  const handleConfirm = async () => {
    if (eaList.length === 0) { setError('산출물을 1개 이상 추가하세요.'); return }
    setPrinting(true)
    try {
      const lotNo = `${selections.shape}${selections.vendor}${date}`
      await printLot(lotNo, 1, {
        selected_Process: 'EA',
        lot_chain: lotChain,
        prev_lot_no: prevLotNo,
        consumed_quantity: 1,
        ea_list: eaList.map(item => ({ spec: item.spec, quantity: item.quantity })),
        ...selections,
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const handleReset = () => {
    setPrevLotNo(null); setLotChain(null); setQuantity(null); setSelections(null)
    setEaList([]); setPrinting(false); setDone(false); setError(null); setStep('qr')
  }

  return (
    <>
      {/* ── QR 스캔: 단일 스캔 → 바로 selector (EC 패턴) ── */}
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

      {/* ── 설비 선택 ── */}
      {step === 'selector' && (
        <MaterialSelector steps={steps} autoValues={{ date, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity } : null}
        />
      )}

      {/* ── 파이별 산출물 입력 ── */}
      {step === 'spec_list' && (
        <div style={s.page}>
          <div style={s.card}>
            <div style={s.header}>
              <FaradayLogo size="md" />
              <p style={s.processLabel}>EA, 낱장가공 - 산출물 입력</p>
            </div>

            {/* 파이 버튼 */}
            <p style={s.sectionTitle}>파이 선택</p>
            <div style={s.specBtns}>
              {SPEC_OPTIONS.map(({ spec, color }) => (
                <button key={spec} style={{ ...s.specBtn, position: 'relative', overflow: 'hidden' }} onClick={() => handleAddSpec(spec)}>
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 3, background: color, borderRadius: '0 8px 0 0' }} />
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 3, height: 10, background: color, borderRadius: '0 8px 0 0' }} />
                  {spec}파이
                </button>
              ))}
            </div>

            {/* 산출물 리스트 */}
            {eaList.length > 0 && (
              <div style={s.listWrap}>
                <div style={s.listHeader}>
                  <span style={{ ...s.col, flex: 0.5 }}>번호</span>
                  <span style={{ ...s.col, flex: 2 }}>파이</span>
                  <span style={{ ...s.col, flex: 2 }}>수량</span>
                  <span style={{ ...s.col, flex: 0.5 }}></span>
                </div>
                {eaList.map((item, idx) => {
                  const itemColor = SPEC_OPTIONS.find(o => o.spec === item.spec)?.color || '#ccc'
                  return (
                    <div key={item.id} style={s.listRow}>
                      <span style={{ ...s.col, flex: 0.5 }}>{idx + 1}</span>
                      <span style={{ ...s.col, flex: 2, fontWeight: 700, color: '#1a2f6e', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: itemColor, flexShrink: 0 }} />
                        {item.spec}파이
                      </span>
                      <input
                        style={s.qtyInput}
                        type="number" min={1}
                        value={item.quantity}
                        onChange={e => handleQtyChange(item.id, e.target.value)}
                      />
                      <button style={{ ...s.col, flex: 0.5, background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                        onClick={() => handleRemove(item.id)}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}

            {error && (
              <div style={{ color: '#c0392b', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{error}</div>
            )}

            <button
              style={{ ...s.confirmBtn, opacity: eaList.length > 0 ? 1 : 0.4, marginTop: 16 }}
              disabled={eaList.length === 0 || printing}
              onClick={handleConfirm}
            >
              {printing ? '처리 중...' : done ? '✓ 완료' : '확인 및 출력'}
            </button>
            <button style={s.textBtn} onClick={() => setStep('selector')}>이전으로</button>
          </div>
        </div>
      )}
    </>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f4f6fb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' },
  card: { background: '#fff', borderRadius: 14, padding: '28px 32px 24px', width: '100%', maxWidth: 480, boxShadow: '0 4px 24px rgba(26,47,110,0.09)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20, gap: 6 },
  processLabel: { fontSize: 14, fontWeight: 600, color: '#1a2540', margin: 0 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#6b7585', alignSelf: 'flex-start', marginBottom: 8 },
  specBtns: { width: '100%', display: 'flex', gap: 8, marginBottom: 16 },
  specBtn: { flex: 1, padding: '12px 0', background: '#1a2f6e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  listWrap: { width: '100%', borderTop: '1px solid #e0e4ef', paddingTop: 12 },
  listHeader: { display: 'flex', gap: 6, marginBottom: 6 },
  col: { flex: 1, fontSize: 11, fontWeight: 600, color: '#8a93a8', textAlign: 'center' },
  listRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #f0f2f7' },
  qtyInput: { flex: 2, padding: '4px 6px', border: '1.5px solid #d8dce8', borderRadius: 6, fontSize: 13, fontWeight: 600, textAlign: 'center', outline: 'none' },
  confirmBtn: { width: '100%', padding: '14px', background: '#1a2f6e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  textBtn: { background: 'none', border: 'none', fontSize: 13, color: '#8a93a8', cursor: 'pointer', textDecoration: 'underline', marginTop: 12 },
}