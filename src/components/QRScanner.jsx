import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './QRScanner.module.css'

// ─── 스캔 리스트 패널 ───
function ScanListPanel({ scanList, editingQty, onQtyChange, onRemove, onNext, nextLabel = '완료 → 다음', unit, unit_type, visible }) {
  if (scanList.length === 0) return null
  const hasOver  = scanList.some(i => (parseFloat(editingQty[i.lot_no]) || 0) > i.maxQty)
  const hasZero  = scanList.some(i => (parseFloat(editingQty[i.lot_no]) || 0) <= 0)
  const hasError = hasOver || hasZero

  return (
    /* 첫 스캔 시 fade-in + slide-up */
    <div
      className={s.listWrap}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
      }}
    >
      <div className={s.listHeader}>
        <span className={s.col} style={{ flex: 0.5 }}>번호</span>
        <span className={s.col} style={{ flex: 3 }}>LOT</span>
        <span className={s.col} style={{ flex: 2 }}>{unit_type}</span>
        <span className={s.col} style={{ flex: 0.5 }}></span>
      </div>
      {scanList.map((item, idx) => {
        const inputVal = editingQty[item.lot_no] ?? String(item.quantity)
        const numVal   = parseFloat(inputVal) || 0
        const isBad    = numVal > item.maxQty || numVal <= 0
        return (
          <div key={item.lot_no} className={s.listRow}>
            <span className={s.col} style={{ flex: 0.5 }}>{idx + 1}</span>
            <span className={`${s.col} ${s.colLot}`} style={{ flex: 3 }}>{item.lot_no}</span>
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                className={s.qtyInput}
                style={{ borderColor: isBad ? '#e05555' : '#d8dce8' }}
                type="number" min={0} max={item.maxQty}
                value={inputVal}
                onChange={e => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) onQtyChange(item.lot_no, v) }}
                onKeyDown={e => { if (e.key === 'Enter') onNext() }}
              />
              <span className={s.qtyUnit} style={{ color: isBad ? '#e05555' : '#8a93a8' }}>
                / {item.maxQty} {unit}
              </span>
            </div>
            <button className={`${s.col} ${s.removeBtn}`} style={{ flex: 0.5 }} onClick={() => onRemove(item.lot_no)}>✕</button>
          </div>
        )
      })}
      <button className={s.nextBtn} disabled={hasError} onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  )
}

// ─── QR 카메라 ───
function QRCamera({ onScan, onError, continuous = false }) {
  const html5QrRef = useRef(null)
  const scannedRef = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
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
        catch (e) { scannedRef.current = false; onError(e.message || 'QR 인식 실패') }
      },
      () => {}
    )
      .then(() => {
        setReady(true)
        // 라이브러리가 주입한 video 스타일 강제 override
        const video = document.querySelector('#qr-reader video')
        if (video) {
          video.style.width = '100%'
          video.style.height = '100%'
          video.style.objectFit = 'cover'
        }
      })
      .catch((err) => {
        const isDenied = err?.name === 'NotAllowedError' || String(err).includes('Permission')
        onError(isDenied ? '__denied__' : '카메라를 시작할 수 없습니다.')
      })

    return () => {
      const qrToStop = html5QrRef.current
      if (!qrToStop) return
      html5QrRef.current = null

      const cleanup = () => {
        document.querySelectorAll('#qr-reader video').forEach(v => {
          v.srcObject?.getTracks().forEach(t => t.stop())
          v.srcObject = null
        })
        const el = document.getElementById('qr-reader')
        if (el) el.innerHTML = ''
      }

      try {
        const state = qrToStop.getState()
        if (state === 1 || state === 2) {
          qrToStop.stop().catch(() => {}).finally(cleanup)
        } else {
          cleanup()
        }
      } catch { cleanup() }
    }
  }, [])

  return (
    <>
      <div
        id="qr-reader"
        style={{
          width: '100%', height: '100%',
          opacity: ready ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />
      <div
        className={s.overlay}
        style={{
          zIndex: 2,
          opacity: ready ? 0 : 1,
          transition: 'opacity 0.3s ease',
          pointerEvents: ready ? 'none' : 'auto',
        }}
      >
        <div className={s.scanLine} />
        <p className={s.overlayText}>카메라 준비 중...</p>
        <div className={s.loadingDots}>
          <span className={s.dot} />
          <span className={s.dot} />
          <span className={s.dot} />
        </div>
      </div>
    </>
  )
}

// ─── 메인 컴포넌트 ───
export default function QRScanner({ processLabel, onScan, onScanList, showList = false, maxItems = null, defaultQty = null, nextLabel = '완료 → 다음', onLogout, onBack, unit, unit_type }) {
  const [manualInput, setManualInput] = useState('')
  const [scanError,   setScanError]   = useState(null)
  const [cameraKey,   setCameraKey]   = useState(0)
  const [scanList,    setScanList]    = useState([])
  const scanListRef = useRef([])
  const [toast,       setToast]       = useState(null)
  const [editingQty,  setEditingQty]  = useState({})
  const [lotChain,    setLotChain]    = useState(null)
  const [scanned,     setScanned]     = useState(false)  // 첫 스캔 여부 — 뷰파인더 축소 트리거

  const handleRetry = () => { setScanError(null); setCameraKey(k => k + 1) }
  const handleSingleScan = async (val) => { setScanError(null); await onScan(val) }

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
    setScanned(true)  // 첫 스캔 완료 → 뷰파인더 축소 + 리스트 fade-in
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
    setScanList(prev => prev.map(item => item.lot_no === lot_no ? { ...item, quantity: parseFloat(val) || 0 } : item))
  }

  const handleRemove = (lot_no) => {
    setScanList(prev => { const next = prev.filter(item => item.lot_no !== lot_no); scanListRef.current = next; return next })
    setEditingQty(prev => { const n = { ...prev }; delete n[lot_no]; return n })
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <FaradayLogo size="md" />
          <p className={s.processLabel}>{processLabel}</p>
        </div>

        <p className={s.sectionTitle}>QR 입력</p>

        {/* aspect-ratio로 정사각형 고정, 스캔 후 maxWidth 축소 애니메이션 */}
        <div
          className={s.viewfinderWrap}
          style={{
            maxWidth: showList && scanned ? 220 : '100%',
            transition: 'max-width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <QRCamera key={cameraKey} continuous={showList} onScan={showList ? handleListScan : handleSingleScan} onError={setScanError} />
          {scanError && (
            <div className={`${s.overlay} ${s.overlayError}`}>
              {scanError === '__denied__' ? (
                <>
                  <div className={s.overlayTextError}>
                    카메라 권한이 거부되었습니다.{'\n'}
                    주소창 🔒 → 카메라 → 허용 후 새로고침 해주세요.
                  </div>
                  <button className={s.retryBtn} onClick={() => window.location.reload()}>새로고침</button>
                </>
              ) : (
                <>
                  <div className={s.overlayTextError}>✕ {scanError}</div>
                  <button className={s.retryBtn} onClick={handleRetry}>다시 시도</button>
                </>
              )}
            </div>
          )}
          <div className={`${s.corner} ${s.cornerTL}`} />
          <div className={`${s.corner} ${s.cornerTR}`} />
          <div className={`${s.corner} ${s.cornerBL}`} />
          <div className={`${s.corner} ${s.cornerBR}`} />
        </div>

        <div className={s.manualRow}>
          <input
            className={s.input}
            type="text" placeholder="직접 입력 (ETC)"
            value={manualInput}
            onChange={e => setManualInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleManualSubmit() } }}
          />
          <button className={s.confirmBtn} onClick={handleManualSubmit} disabled={!manualInput.trim()}>확인</button>
        </div>

        {toast && <div className={s.toast}>⚠ {toast}</div>}

        {showList && (
          <ScanListPanel
            scanList={scanList} editingQty={editingQty}
            onQtyChange={handleQtyChange} onRemove={handleRemove}
            onNext={() => onScanList(scanList, lotChain)} nextLabel={nextLabel}
            unit={unit} unit_type={unit_type}
            visible={scanned}
          />
        )}

        <button
          className={s.textBtn}
          onClick={() => { setScanError(null); onBack ? onBack() : onLogout?.() }}
        >
          {onBack ? '이전으로' : '로그아웃'}
        </button>
      </div>
    </div>
  )
}