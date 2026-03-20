import { useState, useEffect } from 'react'

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '15vh', zIndex: 999 },
  sheet: { background: '#fff', borderRadius: 16, width: '90%', maxWidth: 360, padding: '20px 16px 24px' },
  label: { fontSize: 14, fontWeight: 600, color: '#1a2f6e', textAlign: 'center', marginBottom: 4 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  btn: { padding: '24px 0', fontSize: 32, fontWeight: 700, borderRadius: 12, border: 'none', background: '#f0f1f5', color: '#1a1a2e', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  display: { fontSize: 36, fontWeight: 700, textAlign: 'center', padding: '12px 0', color: '#1a1a2e', minHeight: 56, letterSpacing: 2 },  btnDel: { background: '#fce4ec', color: '#c0392b' },
  confirmRow: { marginTop: 8 },
  confirmBtn: { width: '100%', padding: 14, fontSize: 17, fontWeight: 700, borderRadius: 10, border: 'none', background: '#1a2f6e', color: '#fff', cursor: 'pointer' },
}

export default function NumPad({ label, unit, onConfirm, onCancel }) {
  const [val, setVal] = useState('')

  const tap = (ch) => {
    if (ch === '.' && val.includes('.')) return
    // 소수점 3자리 초과 차단
    const dotIdx = val.indexOf('.')
    if (dotIdx !== -1 && ch !== '.' && val.length - dotIdx > 3) return
    setVal(v => v + ch)
  }
  const del = () => setVal(v => v.slice(0, -1))

  const confirm = () => {
    if (!val) return
    onConfirm(val)
    setVal('')
  }

    useEffect(() => {
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.width = '100%'
    return () => {
        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
        }
    }, [])

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