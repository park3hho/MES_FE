import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { FaradayLogo } from './FaradayLogo'

function ScanListPanel({ scanList, editingQty, onQtyChange, onRemove, onNext, nextLabel = '완료 → 다음' }) {
  if (scanList.length === 0) return null
  const hasOver = scanList.some(i => (parseInt(editingQty[i.lot_no]) || 0) > i.maxQty)
  const hasZero = scanList.some(i => (parseInt(editingQty[i.lot_no]) || 0) <= 0)
  const hasError = hasOver || hasZero

  return (
    <div style={p.wrap}>
      <div style={p.header}>
        <span style={{ ...p.col, flex: 0.5 }}>번호</span>
        <span style={{ ...p.col, flex: 3 }}>LOT</span>
        <span style={{ ...p.col, flex: 2 }}>수량</span>
        <span style={{ ...p.col, flex: 0.5 }}></span>
      </div>
      {scanList.map((item, idx) => {
        const inputVal = editingQty[item.lot_no] ?? String(item.quantity)
        const numVal = parseInt(inputVal) || 0
        const isBad = numVal > item.maxQty || numVal <= 0
        return (
          <div key={item.lot_no} style={p.row}>
            <span style={{ ...p.col, flex: 0.5 }}>{idx + 1}</span>
            <span style={{ ...p.col, flex: 3, fontSize: 10, wordBreak: 'break-all' }}>{item.lot_no}</span>
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                style={{ ...p.qtyInput, borderColor: isBad ? '#e05555' : '#d8dce8' }}
                type="number" min={1} max={item.maxQty}
                value={inputVal}
                onChange={e => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) onQtyChange(item.lot_no, v) }}
              />
              <span style={{ fontSize: 10, color: isBad ? '#e05555' : '#8a93a8', whiteSpace: 'nowrap' }}>
                / {item.maxQty}
              </span>
            </div>
            <button style={{ ...p.col, flex: 0.5, background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
              onClick={() => onRemove(item.lot_no)}>✕</button>
          </div>
        )
      })}
      <button style={{ ...p.nextBtn, opacity: hasError ? 0.4 : 1 }} disabled={hasError} onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  )
}

const p = {
  wrap: { width: '100%', borderTop: '1px solid #e0e4ef', paddingTop: 12, marginTop: 4 },
  header: { display: 'flex', gap: 6, marginBottom: 6 },
  col: { flex: 1, fontSize: 11, fontWeight: 600, color: '#8a93a8', textAlign: 'center' },
  row: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #f0f2f7' },
  qtyInput: { width: 48, padding: '4px 6px', border: '1.5px solid', borderRadius: 6, fontSize: 13, fontWeight: 600, textAlign: 'center', outline: 'none' },
  nextBtn: { width: '100%', marginTop: 12, padding: '12px', background: '#1a2f6e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
}

function QRCamera({ onScan, onError, continuous = false }) {
  const html5QrRef = useRef(null)
  const scannedRef = useRef(false)

  useEffect(() => {
    // 이전 인스턴스 잔재 정리
    const el = document.getElementById('qr-reader')
    if (el) el.innerHTML = ''

    const qr = new Html5Qrcode('qr-reader')
    html5QrRef.current = qr

    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      async (decodedText) => {
        if (!continuous) {
          if (scannedRef.current) return
          scannedRef.current = true
          await qr.stop().catch(() => {})
          html5QrRef.current = null
        }
        try { await onScan(decodedText) }
        catch (e) {
          scannedRef.current = false
          onError(e.message || 'QR 인식 실패')
        }
      },
      () => {}
    )
    .then(() => {
      const video = document.querySelector('#qr-reader video')
      if (video) { video.style.width = '100%'; video.style.height = '100%'; video.style.objectFit = 'cover' }
    })
    .catch(() => onError('카메라를 시작할 수 없습니다.'))

    return () => {
      if (html5QrRef.current) {
        const qrToStop = html5QrRef.current
        html5QrRef.current = null
        qrToStop.stop().catch(() => {})
      }
    }
  }, [])

  return <div id="qr-reader" style={{ width: '100%', height: '100%' }} />
}

export default function QRScanner({
  processLabel,
  onScan,
  onScanList,
  showList = false,
  maxItems = null,
  defaultQty = null,
  nextLabel = '완료 → 다음',
  onLogout,
  onBack,
}) {
  const [manualInput, setManualInput] = useState('')
  const [scanError, setScanError] = useState(null)
  const [cameraKey, setCameraKey] = useState(0)
  const [scanList, setScanList] = useState([])
  const scanListRef = useRef([])
  const [toast, setToast] = useState(null)
  const [editingQty, setEditingQty] = useState({})
  const [lotChain, setLotChain] = useState(null)

  const handleRetry = () => { setScanError(null); setManualInput(''); setCameraKey(k => k + 1) }

  const handleSingleScan = async (val) => {
    setScanError(null)
    await onScan(val)
  }

  const handleListScan = async (val) => {
    if (maxItems && scanListRef.current.length >= maxItems) { setToast(`최대 ${maxItems}개까지만 추가할 수 있습니다.`); setTimeout(() => setToast(null), 1500); return }
    if (scanListRef.current.find(item => item.lot_no === val)) { setToast('이미 추가된 LOT입니다.'); setTimeout(() => setToast(null), 1500); return }
    const r = await onScan(val)
    if (!lotChain) setLotChain(r.lot_chain)
    const qty = r.quantity || 0
    const initQty = defaultQty !== null ? defaultQty : qty
    setScanList(prev => { const next = [...prev, { lot_no: val, quantity: initQty, maxQty: qty, created_at: r.created_at || null }]; scanListRef.current = next; return next })
    setEditingQty(prev => ({ ...prev, [val]: String(initQty) }))
    setScanError(null)
  }

  const handleManualSubmit = async () => {
    const val = manualInput.trim()
    if (!val) return
    try {
      if (showList) await handleListScan(val)
      else await handleSingleScan(val)
      setManualInput('')
    } catch (e) { setScanError(e.message) }
  }

  const handleQtyChange = (lot_no, val) => {
    setEditingQty(prev => ({ ...prev, [lot_no]: val }))
    setScanList(prev => prev.map(item =>
      item.lot_no === lot_no ? { ...item, quantity: parseInt(val) || 0 } : item
    ))
  }

  // ★ 수정: scanListRef도 함께 동기화
  const handleRemove = (lot_no) => {
    setScanList(prev => {
      const next = prev.filter(item => item.lot_no !== lot_no)
      scanListRef.current = next
      return next
    })
    setEditingQty(prev => { const n = { ...prev }; delete n[lot_no]; return n })
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <FaradayLogo size="md" />
          <p style={s.processLabel}>{processLabel}</p>
        </div>

        <p style={s.sectionTitle}>QR 입력</p>
        <div style={{ ...s.viewfinderWrap, height: showList ? 200 : 300 }}>
          <QRCamera
            key={cameraKey}
            continuous={showList}
            onScan={showList ? handleListScan : handleSingleScan}
            onError={setScanError}
          />
          {scanError && (
            <div style={{ ...s.overlay, background: 'rgba(200,40,40,0.88)', flexDirection: 'column', gap: 14 }}>
              <div style={{ ...s.overlayText, color: '#fff', fontWeight: 700 }}>✕ {scanError}</div>
              <button style={s.retryBtn} onClick={handleRetry}>다시 시도</button>
            </div>
          )}
          <div style={{ ...s.corner, top: 12, left: 12, borderTop: '3px solid #1a2f6e', borderLeft: '3px solid #1a2f6e' }} />
          <div style={{ ...s.corner, top: 12, right: 12, borderTop: '3px solid #1a2f6e', borderRight: '3px solid #1a2f6e' }} />
          <div style={{ ...s.corner, bottom: 12, left: 12, borderBottom: '3px solid #1a2f6e', borderLeft: '3px solid #1a2f6e' }} />
          <div style={{ ...s.corner, bottom: 12, right: 12, borderBottom: '3px solid #1a2f6e', borderRight: '3px solid #1a2f6e' }} />
        </div>

        <div style={s.manualRow}>
          <input style={s.input} type="text" placeholder="직접 입력 (ETC)"
            value={manualInput} onChange={e => setManualInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleManualSubmit() } }}
          />
          <button style={{ ...s.confirmBtn, opacity: manualInput.trim() ? 1 : 0.5 }}
            onClick={handleManualSubmit} disabled={!manualInput.trim()}>확인</button>
        </div>

        {toast && (
          <div style={{ width: '100%', padding: '8px 12px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#856404', textAlign: 'center', marginBottom: 8 }}>
            ⚠ {toast}
          </div>
        )}
        {showList && (
          <ScanListPanel
            scanList={scanList} editingQty={editingQty}
            onQtyChange={handleQtyChange} onRemove={handleRemove}
            onNext={() => onScanList(scanList, lotChain)} nextLabel={nextLabel}
          />
        )}

        <button style={s.textBtn} onClick={onBack ?? onLogout}>
          {onBack ? '이전으로' : '로그아웃'}
        </button>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f4f6fb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' },
  card: { background: '#fff', borderRadius: 14, padding: '28px 32px 24px', width: '100%', maxWidth: 480, boxShadow: '0 4px 24px rgba(26,47,110,0.09)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20, gap: 6 },
  processLabel: { fontSize: 14, fontWeight: 600, color: '#1a2540', margin: 0 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#6b7585', alignSelf: 'flex-start', marginBottom: 10 },
  viewfinderWrap: { position: 'relative', width: '100%', background: '#e8eaf0', borderRadius: 12, overflow: 'hidden', marginBottom: 20 },
  overlay: { position: 'absolute', inset: 0, background: '#e8eaf0', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  overlayText: { fontSize: 13, color: '#8a93a8' },
  retryBtn: { padding: '8px 20px', background: '#fff', color: '#c82828', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  corner: { position: 'absolute', width: 20, height: 20, pointerEvents: 'none' },
  manualRow: { width: '100%', display: 'flex', gap: 8, marginBottom: 16 },
  input: { flex: 1, padding: '10px 12px', border: '1px solid #d8dce8', borderRadius: 8, fontSize: 13, color: '#1a2540', background: '#fafbfd', outline: 'none' },
  confirmBtn: { padding: '10px 18px', background: '#4b5c8a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  textBtn: { background: 'none', border: 'none', fontSize: 13, color: '#8a93a8', cursor: 'pointer', textDecoration: 'underline', marginTop: 4 },
}