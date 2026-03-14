// components/ScanListPanel.jsx
// N:1 공정 (BO, BX, OB)에서 QR 스캔 리스트 + 수량 입력 컴포넌트

export default function ScanListPanel({ scanList, editingQty, onQtyChange, onRemove, onNext, nextLabel = '완료 → 다음' }) {
  if (scanList.length === 0) return null

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={{ ...s.col, flex: 0.5 }}>번호</span>
        <span style={{ ...s.col, flex: 3 }}>LOT</span>
        <span style={{ ...s.col, flex: 2 }}>수량</span>
        <span style={{ ...s.col, flex: 0.5 }}></span>
      </div>

      {scanList.map((item, idx) => {
        const inputVal = editingQty[item.lot_no] ?? String(item.quantity)
        const inputNum = parseInt(inputVal) || 0
        const isOver = inputNum > item.maxQty

        return (
          <div key={item.lot_no} style={s.row}>
            <span style={{ ...s.col, flex: 0.5 }}>{idx + 1}</span>
            <span style={{ ...s.col, flex: 3, fontSize: 10, wordBreak: 'break-all' }}>{item.lot_no}</span>
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                style={{ ...s.qtyInput, borderColor: isOver ? '#e05555' : '#d8dce8' }}
                type="number"
                min={0}
                max={item.maxQty}
                value={inputVal}
                onChange={e => onQtyChange(item.lot_no, e.target.value)}
              />
              <span style={{ fontSize: 10, color: isOver ? '#e05555' : '#8a93a8', whiteSpace: 'nowrap' }}>
                / {item.maxQty}
              </span>
            </div>
            <button
              style={{ ...s.col, flex: 0.5, background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
              onClick={() => onRemove(item.lot_no)}
            >✕</button>
          </div>
        )
      })}

      <button
        style={{ ...s.nextBtn, opacity: scanList.some(i => (parseInt(editingQty[i.lot_no]) || 0) > i.maxQty) ? 0.4 : 1 }}
        disabled={scanList.some(i => (parseInt(editingQty[i.lot_no]) || 0) > i.maxQty)}
        onClick={onNext}
      >
        {nextLabel}
      </button>
    </div>
  )
}

const s = {
  wrap: { width: '100%', borderTop: '1px solid #e0e4ef', paddingTop: 12, marginTop: 4 },
  header: { display: 'flex', gap: 6, marginBottom: 6 },
  col: { flex: 1, fontSize: 11, fontWeight: 600, color: '#8a93a8', textAlign: 'center' },
  row: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #f0f2f7' },
  qtyInput: { width: 48, padding: '4px 6px', border: '1.5px solid', borderRadius: 6, fontSize: 13, fontWeight: 600, textAlign: 'center', outline: 'none' },
  nextBtn: { width: '100%', marginTop: 12, padding: '12px', background: '#1a2f6e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
}