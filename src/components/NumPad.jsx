import { useState } from 'react'

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 999 },
  sheet: { background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 420, padding: '16px 12px 24px' },
  label: { fontSize: 14, fontWeight: 600, color: '#1a2f6e', textAlign: 'center', marginBottom: 4 },
  display: { fontSize: 28, fontWeight: 700, textAlign: 'center', padding: '8px 0', color: '#1a1a2e', minHeight: 44, letterSpacing: 1 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  btn: { padding: '16px 0', fontSize: 22, fontWeight: 600, borderRadius: 10, border: 'none', background: '#f0f1f5', color: '#1a1a2e', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  btnDel: { background: '#fce4ec', color: '#c0392b' },
  confirmRow: { marginTop: 8 },
  confirmBtn: { width: '100%', padding: 14, fontSize: 17, fontWeight: 700, borderRadius: 10, border: 'none', background: '#1a2f6e', color: '#fff', cursor: 'pointer' },
}

export default function NumPad({ label, unit, onConfirm, onCancel }) {
  const [val, setVal] = useState('')

  const tap = (ch) => {
    if (ch === '.' && val.includes('.')) return
    setVal(v => v + ch)
  }
  const del = () => setVal(v => v.slice(0, -1))

  const confirm = () => {
    if (!val) return
    onConfirm(val)
    setVal('')
  }

  return (
    <div style={S.overlay} onClick={onCancel}>
      <div style={S.sheet} onClick={e => e.stopPropagation()}>
        <p style={S.label}>{label} {unit && `(${unit})`}</p>
        <p style={S.display}>{val || '0'}</p>

        <div style={S.grid}>
          {['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(ch => (
            <button key={ch} style={{ ...S.btn, ...(ch === '⌫' ? S.btnDel : {}) }}
              onClick={() => ch === '⌫' ? del() : tap(ch)}>
              {ch}
            </button>
          ))}
        </div>

        <div style={S.confirmRow}>
          <button style={S.confirmBtn} onClick={confirm}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}