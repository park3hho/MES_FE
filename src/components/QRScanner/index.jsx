import { useState, useRef } from 'react'

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
  processLabel,          // string: 공정 한글명 (상단 표시)
  onScan,                // function(val): 단건 스캔 콜백
  onScanList,            // function(list, chain): 리스트 완료 콜백
  showList = false,      // boolean: 다중 스캔 목록 모드 활성화
  maxItems = null,       // number: 목록 최대 개수 (리스트 모드)
  defaultQty = null,     // number: 항목별 기본 수량
  nextLabel = '완료 → 다음', // string: 완료 버튼 라벨
  onLogout,              // function(): 로그아웃 콜백
  onBack,                // function(): 뒤로가기 콜백
  unit,                  // string: 단위 ('kg', '매', '개')
  unit_type,             // string: 단위 타입 ('중량', '매수', '개수')
  compact = false,       // boolean: 축소 모드 (BoxManager 등에서 사용)
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
      {/* 헤더 — 밝은 톤, 뒤로 버튼 + 브랜드 블루 타이틀 */}
      <header className={s.header}>
        <button type="button" className={s.backBtn} onClick={handleBack} aria-label="뒤로가기">
          ←
        </button>
        <h1 className={s.processLabel}>{processLabel}</h1>
      </header>

      {/* 본문 — 카메라가 80% 차지 */}
      <div className={s.body}>
        <div className={`${s.viewfinderWrap} ${showList && scanned ? s.viewfinderShrunk : ''}`}>
          <QRCamera
            key={cameraKey}
            continuous={showList}
            onScan={showList ? handleListScan : handleSingleScan}
            onError={setScanError}
          />
          {/* 중앙 스캔 박스 (밖은 반투명 마스크) */}
          <div className={s.scanBox}>
            <span className={`${s.corner} ${s.cornerTL}`} />
            <span className={`${s.corner} ${s.cornerTR}`} />
            <span className={`${s.corner} ${s.cornerBL}`} />
            <span className={`${s.corner} ${s.cornerBR}`} />
            <span className={s.scanLine} />
          </div>
          {/* 가이드 텍스트 */}
          <p className={s.guideText}>QR 코드를 프레임 안에 맞춰주세요</p>
          {errorOverlay}
        </div>

        {/* 리스트 모드: 스캔 패널 */}
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
      </div>

      {/* Footer — 하단 고정 수기 입력 바 */}
      <footer className={s.footer}>
        {toast && <div className={s.toast}>⚠ {toast}</div>}
        {scanError && !scanError.startsWith('__') && (
          <div className={s.manualError}>✕ {scanError}</div>
        )}
        <div className={s.manualRow}>
          <input
            className={s.input}
            type="text"
            placeholder="LOT 번호 직접 입력"
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
      </footer>
    </div>
  )
}
