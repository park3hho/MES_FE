import { useState, useRef } from 'react'

import { FaradayLogo } from '@/components/FaradayLogo'

import QRCamera from './QRCamera'
import ScanListPanel from './ScanListPanel'
import s from './QRScanner.module.css'

// ════════════════════════════════════════════
// QR 스캐너 — 단건/리스트/compact 3가지 모드
// ════════════════════════════════════════════

// processLabel — 상단 공정명, onScan(val) — 단건 스캔 콜백
// onScanList(list, chain) — 리스트 완료 콜백, showList — 리스트 모드 여부
// compact — 축소 모드 (BoxManager 등에서 사용)
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
  unit,
  unit_type,
  compact = false,
}) {
  const [manualInput, setManualInput] = useState('')
  const [scanError, setScanError] = useState(null)
  const [cameraKey, setCameraKey] = useState(0)
  const [scanList, setScanList] = useState([])
  const scanListRef = useRef([])
  const [toast, setToast] = useState(null)
  const [editingQty, setEditingQty] = useState({})
  const [lotChain, setLotChain] = useState(null)
  const [scanned, setScanned] = useState(false)

  // ────────────────────────────────────────────
  // 스캔 핸들러
  // ────────────────────────────────────────────

  const handleRetry = () => {
    setScanError(null)
    setCameraKey((k) => k + 1)
  }

  // 단건 스캔 — QR 인식 즉시 부모에게 전달
  const handleSingleScan = async (val) => {
    setScanError(null)
    try {
      await onScan(val)
    } catch (e) {
      setScanError(e.message)
    }
  }

  // 리스트 스캔 — 중복/최대 체크 후 scanList에 누적
  const handleListScan = async (val) => {
    if (maxItems && scanListRef.current.length >= maxItems) {
      setToast(`최대 ${maxItems}개까지만 추가할 수 있습니다.`)
      setTimeout(() => setToast(null), 1500)
      return
    }
    if (scanListRef.current.find((item) => item.lot_no === val)) {
      setToast('이미 추가된 LOT입니다.')
      setTimeout(() => setToast(null), 1500)
      return
    }
    try {
      const r = await onScan(val)
      if (!lotChain) setLotChain(r.lot_chain)
      const qty = r.quantity || 0
      const initQty = defaultQty !== null ? defaultQty : qty
      setScanList((prev) => {
        const next = [
          ...prev,
          { lot_no: val, quantity: initQty, maxQty: qty, created_at: r.created_at || null },
        ]
        scanListRef.current = next
        return next
      })
      setEditingQty((prev) => ({ ...prev, [val]: String(initQty) }))
      setScanError(null)
      setScanned(true)
    } catch (e) {
      setScanError(e.message)
    }
  }

  // ────────────────────────────────────────────
  // 수동 입력
  // ────────────────────────────────────────────

  const handleManualSubmit = async () => {
    const val = manualInput.trim()
    if (!val) return
    try {
      if (showList) await handleListScan(val)
      else await handleSingleScan(val)
      setManualInput('')
    } catch (e) {
      setScanError(e.message)
    }
  }

  // ────────────────────────────────────────────
  // 리스트 수량 편집 / 삭제
  // ────────────────────────────────────────────

  const handleQtyChange = (lot_no, val) => {
    setEditingQty((prev) => ({ ...prev, [lot_no]: val }))
    setScanList((prev) =>
      prev.map((item) =>
        item.lot_no === lot_no ? { ...item, quantity: parseFloat(val) || 0 } : item,
      ),
    )
  }

  const handleRemove = (lot_no) => {
    setScanList((prev) => {
      const next = prev.filter((item) => item.lot_no !== lot_no)
      scanListRef.current = next
      return next
    })
    setEditingQty((prev) => {
      const n = { ...prev }
      delete n[lot_no]
      return n
    })
  }

  // ────────────────────────────────────────────
  // 에러 오버레이 — 권한 거부 / 일반 에러 분기
  // ────────────────────────────────────────────

  const errorOverlay = scanError && (
    <div className={`${s.overlay} ${s.overlayError}`}>
      {scanError === '__denied__' ? (
        <>
          <div className={s.overlayTextError}>
            카메라 권한이 거부되었습니다.{'\n'}
            주소창 🔒 → 카메라 → 허용 후 새로고침 해주세요.
          </div>
          <button className={s.retryBtn} onClick={() => window.location.reload()}>
            새로고침
          </button>
        </>
      ) : (
        <>
          <div className={s.overlayTextError}>✕ {scanError}</div>
          <button className={s.retryBtn} onClick={handleRetry}>
            다시 시도
          </button>
        </>
      )}
    </div>
  )

  // 뒤로가기/로그아웃 — 에러 초기화 포함
  const handleBack = () => {
    setScanError(null)
    onBack ? onBack() : onLogout?.()
  }

  // ════════════════════════════════════════════
  // compact 모드 — BoxManager 등 임베드용
  // ════════════════════════════════════════════

  if (compact) {
    return (
      <div className={s.compactWrap}>
        {processLabel && <p className={s.compactLabel}>{processLabel}</p>}

        <div className={s.compactViewfinder}>
          <QRCamera
            key={cameraKey}
            continuous
            onScan={async (val) => {
              try {
                await onScan(val)
              } catch (e) {
                setScanError(e.message)
              }
            }}
            onError={setScanError}
          />
          {errorOverlay}
        </div>

        <div className={s.compactManual}>
          <input
            className={s.input}
            type="text"
            placeholder="직접 입력 (ETC)"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleManualSubmit()
              }
            }}
          />
          <button
            className={s.confirmBtn}
            onClick={handleManualSubmit}
            disabled={!manualInput.trim()}
          >
            확인
          </button>
        </div>

        {scanError && !scanError.startsWith('__') && <div className={s.toast}>⚠ {scanError}</div>}
      </div>
    )
  }

  // ════════════════════════════════════════════
  // 기본 모드 — 풀 페이지
  // ════════════════════════════════════════════

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <FaradayLogo size="md" />
          <p className={s.processLabel}>{processLabel}</p>
        </div>

        <p className={s.sectionTitle}>QR 입력</p>

        {/* 뷰파인더 — 리스트 모드에서 첫 스캔 후 축소 */}
        <div className={s.viewfinderWrap}>
          <QRCamera
            key={cameraKey}
            continuous={showList}
            onScan={showList ? handleListScan : handleSingleScan}
            onError={setScanError}
          />
          {errorOverlay}
        </div>

        <div className={s.manualRow}>
          <input
            className={s.input}
            type="text"
            placeholder="직접 입력 (ETC)"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleManualSubmit()
              }
            }}
          />
          <button
            className={s.confirmBtn}
            onClick={handleManualSubmit}
            disabled={!manualInput.trim()}
          >
            확인
          </button>
        </div>

        {toast && <div className={s.toast}>⚠ {toast}</div>}

        {showList && (
          <ScanListPanel
            scanList={scanList}
            editingQty={editingQty}
            onQtyChange={handleQtyChange}
            onRemove={handleRemove}
            onNext={() => onScanList(scanList, lotChain)}
            nextLabel={nextLabel}
            unit={unit}
            unit_type={unit_type}
            visible={scanned}
          />
        )}

        <button className={s.textBtn} onClick={handleBack}>
          {onBack ? '이전으로' : '로그아웃'}
        </button>
      </div>
    </div>
  )
}
