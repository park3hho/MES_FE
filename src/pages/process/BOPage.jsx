import { useState, useEffect, useRef } from 'react'
import { printLot, scanLot } from '../../api'
import MaterialSelector from '../../components/MaterialSelector'
import { ConfirmModal } from '../../components/ConfirmModal'
import { FaradayLogo } from '../../components/FaradayLogo'
import { Html5Qrcode } from 'html5-qrcode'
import { useDate } from '../../utils/useDate'

const steps = [
  { key: 'shape', label: '가공형태', options: [{ label: 'BM: EXIA', value: 'BM' }, { label: 'BA: 본딩 자동화', value: 'BA' }]},
  { key: 'worker', label: '작업자코드', options: null, hint: '작업자 번호표 참조' },
  { key: 'date', label: '작업일', auto: true },
  { key: 'seq', label: '순서', auto: true },
]

function QRCameraBO({ onScan, onError }) {
  const html5QrRef = useRef(null)

  useEffect(() => {
    const qr = new Html5Qrcode('qr-reader-bo')
    html5QrRef.current = qr
    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 160, height: 160 } },
      async (decodedText) => {
        try { await onScan(decodedText) }
        catch (e) { onError(e.message || 'QR 인식 실패') }
      },
      () => {}
    )
    .then(() => {
      const video = document.querySelector('#qr-reader-bo video')
      if (video) { video.style.width = '100%'; video.style.height = '100%'; video.style.objectFit = 'cover' }
    })
    .catch(() => onError('카메라를 시작할 수 없습니다.'))

    return () => {
      if (html5QrRef.current) { html5QrRef.current.stop().catch(() => {}); html5QrRef.current = null }
    }
  }, [])

  return <div id="qr-reader-bo" style={{ width: '100%', height: '100%' }} />
}

export default function BOPage({ onLogout, onBack }) {
  const date = useDate()
  const [lotChain, setLotChain] = useState(null)
  const [scanList, setScanList] = useState([])
  const [editingQty, setEditingQty] = useState({})
  const [manualInput, setManualInput] = useState('')
  const [scanError, setScanError] = useState(null)
  const [cameraKey, setCameraKey] = useState(0)
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  useEffect(() => { if (!error) return; const t = setTimeout(() => handleReset(), 1500); return () => clearTimeout(t) }, [error])
  useEffect(() => { if (!done) return; const t = setTimeout(() => handleReset(), 1200); return () => clearTimeout(t) }, [done])

  const handleScan = async (val) => {
    if (scanList.find(item => item.lot_no === val)) return
    const r = await scanLot('BO', val)
    if (!lotChain) setLotChain(r.lot_chain)
    const qty = r.quantity || 0
    setScanList(prev => [...prev, { lot_no: val, quantity: qty }])
    setEditingQty(prev => ({ ...prev, [val]: String(qty) }))
    setScanError(null)
  }

  const handleRetry = () => { setScanError(null); setManualInput(''); setCameraKey(k => k + 1) }

  const handleManualSubmit = async () => {
    const val = manualInput.trim()
    if (!val) return
    try { await handleScan(val); setManualInput('') }
    catch (e) { setScanError(e.message) }
  }

  const handleRemove = (lot_no) => {
    setScanList(prev => prev.filter(item => item.lot_no !== lot_no))
    setEditingQty(prev => { const n = { ...prev }; delete n[lot_no]; return n })
  }

  const handleQtyChange = (lot_no, val) => {
    setEditingQty(prev => ({ ...prev, [lot_no]: val }))
    setScanList(prev => prev.map(item =>
      item.lot_no === lot_no ? { ...item, quantity: parseInt(val) || 0 } : item
    ))
  }

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${sel.shape}${sel.worker}${date}`)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, 1, {
        selected_Process: 'BO',
        lot_chain: lotChain,
        quantity: 1,
        consumed_list: scanList.map(item => ({ lot_no: item.lot_no, quantity: item.quantity })),
        ...selections
      })
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setScanList([]); setEditingQty({}); setLotChain(null)
    setManualInput(''); setScanError(null); setCameraKey(0)
    setLotNo(null); setSelections(null)
    setPrinting(false); setDone(false); setError(null); setStep('qr')
  }

  return (
    <>
      {step === 'qr' && (
        <div style={s.page}>
          <div style={s.card}>
            <div style={s.header}>
              <FaradayLogo size="md" />
              <p style={s.processLabel}>BO, 본딩</p>
            </div>

            <p style={s.sectionTitle}>QR 입력</p>
            <div style={s.viewfinderWrap}>
              <QRCameraBO key={cameraKey} onScan={handleScan} onError={setScanError} />
              {scanError && (
                <div style={{ ...s.overlay, background: 'rgba(200,40,40,0.88)', flexDirection: 'column', gap: 10 }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>✕ {scanError}</span>
                  <button onClick={handleRetry} style={s.retryBtn}>다시 시도</button>
                </div>
              )}
            </div>

            <div style={s.manualRow}>
              <input style={s.input} type="text" placeholder="직접 입력"
                value={manualInput} onChange={e => setManualInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleManualSubmit() } }}
              />
              <button style={{ ...s.confirmBtn, opacity: manualInput.trim() ? 1 : 0.5 }}
                onClick={handleManualSubmit} disabled={!manualInput.trim()}>확인</button>
            </div>

            {scanList.length > 0 && (
              <div style={s.listWrap}>
                <div style={s.listHeader}>
                  <span style={{ ...s.listCol, flex: 0.5 }}>번호</span>
                  <span style={{ ...s.listCol, flex: 3 }}>LOT</span>
                  <span style={s.listCol}>개수</span>
                  <span style={{ ...s.listCol, flex: 0.5 }}></span>
                </div>
                {scanList.map((item, idx) => (
                  <div key={item.lot_no} style={s.listRow}>
                    <span style={{ ...s.listCol, flex: 0.5 }}>{idx + 1}</span>
                    <span style={{ ...s.listCol, flex: 3, fontSize: 11 }}>{item.lot_no}</span>
                    <input style={s.qtyInput} type="number" min={0}
                      value={editingQty[item.lot_no] ?? item.quantity}
                      onChange={e => handleQtyChange(item.lot_no, e.target.value)}
                    />
                    <button style={{ ...s.listCol, flex: 0.5, background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                      onClick={() => handleRemove(item.lot_no)}>✕</button>
                  </div>
                ))}
                <button style={s.nextBtn} onClick={() => setStep('selector')}>
                  완료 → 다음
                </button>
              </div>
            )}

            <button style={s.textBtn} onClick={onBack ?? onLogout}>
              {onBack ? '이전으로' : '로그아웃'}
            </button>
          </div>
        </div>
      )}
      {step === 'selector' && (
        <MaterialSelector steps={steps} autoValues={{ date, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
        />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={1}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset}
        />
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
  viewfinderWrap: { position: 'relative', width: '100%', height: 220, background: '#e8eaf0', borderRadius: 10, overflow: 'hidden', marginBottom: 12 },
  overlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  retryBtn: { padding: '6px 16px', background: '#fff', color: '#c82828', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 12 },
  manualRow: { width: '100%', display: 'flex', gap: 8, marginBottom: 12 },
  input: { flex: 1, padding: '8px 12px', border: '1px solid #d8dce8', borderRadius: 8, fontSize: 13, outline: 'none' },
  confirmBtn: { padding: '8px 14px', background: '#4b5c8a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  listWrap: { width: '100%', borderTop: '1px solid #e0e4ef', paddingTop: 12, marginTop: 4 },
  listHeader: { display: 'flex', gap: 6, marginBottom: 6 },
  listCol: { flex: 1, fontSize: 11, fontWeight: 600, color: '#8a93a8', textAlign: 'center' },
  listRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #f0f2f7' },
  qtyInput: { width: 52, padding: '4px 6px', border: '1px solid #d8dce8', borderRadius: 6, fontSize: 13, fontWeight: 600, textAlign: 'center' },
  nextBtn: { width: '100%', marginTop: 12, padding: '12px', background: '#1a2f6e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  textBtn: { background: 'none', border: 'none', fontSize: 13, color: '#8a93a8', cursor: 'pointer', textDecoration: 'underline', marginTop: 12 },
}