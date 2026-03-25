import { motion, AnimatePresence } from 'framer-motion'

import s from './QRScanner.module.css'

// ════════════════════════════════════════════
// 스캔 리스트 패널 — LOT 목록 + 수량 편집 + 완료 버튼
// ════════════════════════════════════════════

// scanList — [{ lot_no, quantity, maxQty }], editingQty — { lot_no: 입력값 }
// onQtyChange(lot_no, val), onRemove(lot_no), onNext() — 완료 콜백
// visible — 첫 스캔 후 fade-in 트리거
export default function ScanListPanel({
  scanList,
  editingQty,
  onQtyChange,
  onRemove,
  onNext,
  nextLabel = '완료 → 다음',
  unit,
  unit_type,
  visible,
}) {
  if (scanList.length === 0) return null

  const hasOver = scanList.some((i) => (parseFloat(editingQty[i.lot_no]) || 0) > i.maxQty)
  const hasZero = scanList.some((i) => (parseFloat(editingQty[i.lot_no]) || 0) <= 0)
  const hasError = hasOver || hasZero

  return (
    <div
      className={s.listWrap}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
      }}
    >
      {/* ── 헤더 ── */}
      <div className={s.listHeader}>
        <span className={s.col} style={{ flex: 0.5 }}>
          번호
        </span>
        <span className={s.col} style={{ flex: 3 }}>
          LOT
        </span>
        <span className={s.col} style={{ flex: 2 }}>
          {unit_type}
        </span>
        <span className={s.col} style={{ flex: 0.5 }}></span>
      </div>

      {/* ── 리스트 아이템 (추가/삭제 애니메이션) ── */}
      <AnimatePresence>
        {scanList.map((item, idx) => {
          const inputVal = editingQty[item.lot_no] ?? String(item.quantity)
          const numVal = parseFloat(inputVal) || 0
          const isBad = numVal > item.maxQty || numVal <= 0

          return (
            <motion.div
              key={item.lot_no}
              className={s.listRow}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className={s.col} style={{ flex: 0.5 }}>
                {idx + 1}
              </span>
              <span className={`${s.col} ${s.colLot}`} style={{ flex: 3 }}>
                {item.lot_no}
              </span>
              <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  className={s.qtyInput}
                  style={{ borderColor: isBad ? '#e05555' : '#d8dce8' }}
                  type="number"
                  min={0}
                  max={item.maxQty}
                  value={inputVal}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '' || parseFloat(v) >= 0) onQtyChange(item.lot_no, v)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onNext()
                  }}
                />
                <span className={s.qtyUnit} style={{ color: isBad ? '#e05555' : '#8a93a8' }}>
                  / {item.maxQty} {unit}
                </span>
              </div>
              <button
                className={`${s.col} ${s.removeBtn}`}
                style={{ flex: 0.5 }}
                onClick={() => onRemove(item.lot_no)}
              >
                ✕
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* ── 완료 버튼 ── */}
      <button className={s.nextBtn} disabled={hasError} onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  )
}
