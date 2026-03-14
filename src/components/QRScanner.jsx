import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { FaradayLogo } from './FaradayLogo'
import ScanListPanel from './ScanListPanel'

// QRCamera: key로 리마운트해서 카메라 재시작
function QRCamera({ onScan, onError, continuous = false }) {
  const html5QrRef = useRef(null)
  const scannedRef = useRef(false)

  useEffect(() => {
    const qr = new Html5Qrcode('qr-reader')
    html5QrRef.current = qr

    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      async (decodedText) => {
        if (!continuous) {
          // 단일 스캔 모드: 한 번 인식 후 카메라 stop
          if (scannedRef.current) return
          scannedRef.current = true
          await qr.stop().catch(() => {})
          html5QrRef.current = null
        }
        try { await onScan(decodedText) }
        catch (e) { 
          scannedRef.current = false  // 단일 모드에서 에러 시 재시도 허용
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
      if (html5QrRef.current) { html5QrRef.current.stop().catch(() => {}); html5QrRef.current = null }
    }
  }, [])

  return <div id="qr-reader" style={{ width: '100%', height: '100%' }} />
}

export default function QRScanner({
  processLabel,
  onScan,           // 단일 스캔 콜백
  onScanList,       // 리스트 완료 콜백 (showList=true일 때)
  showList = false, // true면 N:1 리스트 모드
  nextLabel = '완료 → 다음',
  onLogout,
  onBack,
}) {
  const [manualInput, setManualInput] = useState('')
  const [scanError, setScanError] = useState(null)
  const [cameraKey, setCameraKey] = useState(0)

  // 리스트 모드 state
  const [scanList, setScanList] = useState([])    // [{ lot_no, quantity, maxQty }]
  const [editingQty, setEditingQty] = useState({})
  const [lotChain, setLotChain] = useState(null)

  const handleRetry = () => { setScanError(null); setManualInput(''); setCameraKey(k => k + 1) }

  // 단일 모드 스캔
  const handleSingleScan = async (val) => {
    setScanError(null)
    await onScan(val)  // 에러는 throw되어 QRCamera에서 onError로 전달
  }

  // 리스트 모드 스캔
  const handleListScan = async (val) => {
    if (scanList.find(item => item.lot_no === val)) {
      throw new Error('이미 추가된 LOT입니다.')
    }
    const r = await onScan(val)  // 각 페이지에서 scanLot 호출 후 결과 반환
    if (!lotChain) setLotChain(r.lot_chain)
    const qty = r.quantity || 0
    setScanList(prev => [...prev, { lot_no: val, quantity: qty, maxQty: qty }])
    setEditingQty(prev => ({ ...prev, [val]: String(qty) }))
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

  const handleRemove = (lot_no) => {
    setScanList(prev => prev.filter(item => item.lot_no !== lot_no))
    setEditingQty(prev => { const n = { ...prev }; delete n[lot_no]; return n })
  }

  const handleNext = () => {
    onScanList(scanList, lotChain)
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

        {showList && (
          <ScanListPanel
            scanList={scanList} editingQty={editingQty}
            onQtyChange={handleQtyChange} onRemove={handleRemove}
            onNext={handleNext} nextLabel={nextLabel}
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