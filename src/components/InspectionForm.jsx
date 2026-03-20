import { useState } from 'react'
import { FaradayLogo } from './FaradayLogo'

const S = {
  page: { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7', padding: 16 },
  card: { background: '#fff', borderRadius: 16, padding: '24px 20px', width: '100%', maxWidth: 420, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  title: { fontSize: 18, fontWeight: 700, color: '#1a2f6e', textAlign: 'center', margin: '12px 0 4px' },
  sub: { fontSize: 13, color: '#8a93a8', textAlign: 'center', marginBottom: 16 },
  section: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: 600, color: '#3d3d4e', marginBottom: 6, display: 'block' },
  row: { display: 'flex', gap: 8, marginBottom: 8 },
  btn: (active, color = '#1a2f6e') => ({
    flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    background: active ? color : '#f0f1f5', color: active ? '#fff' : '#6b7585',
  }),
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d0d5e8', fontSize: 15, boxSizing: 'border-box' },
  inputRow: { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' },
  inputLabel: { fontSize: 13, color: '#6b7585', minWidth: 32, textAlign: 'right' },
  inputUnit: { fontSize: 12, color: '#8a93a8', minWidth: 28 },
  submit: { width: '100%', padding: 14, borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700, background: '#1a2f6e', color: '#fff', cursor: 'pointer', marginTop: 8 },
  cancel: { width: '100%', padding: 10, background: 'none', border: 'none', fontSize: 14, color: '#8a93a8', cursor: 'pointer', marginTop: 4 },
  dimGrid: { display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 4 },
  dimLabel: { fontSize: 13, color: '#6b7585', fontWeight: 600 },
}

const DIM_KEYS = ['dim_a', 'dim_b', 'dim_c', 'dim_d']
const DIM_LABELS = ['A', 'B', 'C', 'D']
const DIM_OPTIONS = ['OK', 'NG', '-']

export default function InspectionForm({ phi, lotOqNo, onSubmit, onCancel }) {
  const [wire, setWire] = useState('')
  const [appearance, setAppearance] = useState('OK')
  const [dims, setDims] = useState({ dim_a: '-', dim_b: '-', dim_c: '-', dim_d: '-' })
  const [r, setR] = useState('')
  const [l, setL] = useState('')
  const [it, setIt] = useState('')
  const [kt, setKt] = useState('')
  const [error, setError] = useState(null)

  // 파이별 단위
  const lUnit = phi === '20' ? 'mH' : 'µH'

  const handleSubmit = () => {
    if (!wire) return setError('Wire type을 선택하세요')
    if (!r) return setError('저항(R)을 입력하세요')
    if (!l) return setError('인덕턴스(L)를 입력하세요')
    if (!it) return setError('절연(I.T.)을 입력하세요')

    onSubmit({
      lot_oq_no: lotOqNo,
      phi,
      wire_type: wire,
      appearance,
      ...dims,
      resistance: parseFloat(r),
      inductance: parseFloat(l),
      insulation: parseFloat(it),
      back_emf: kt ? parseFloat(kt) : null,
      judgment: 'OK',
    })
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <FaradayLogo size="md" />
        <p style={S.title}>OQ 검사 입력</p>
        <p style={S.sub}>Φ{phi} · {lotOqNo}</p>

        {/* Wire type */}
        <div style={S.section}>
          <span style={S.label}>Wire type</span>
          <div style={S.row}>
            <button style={S.btn(wire === 'copper')} onClick={() => setWire('copper')}>Copper</button>
            <button style={S.btn(wire === 'silver')} onClick={() => setWire('silver')}>Silver</button>
          </div>
        </div>

        {/* Appearance */}
        <div style={S.section}>
          <span style={S.label}>Appearance</span>
          <div style={S.row}>
            <button style={S.btn(appearance === 'OK')} onClick={() => setAppearance('OK')}>OK</button>
            <button style={S.btn(appearance === 'NG', '#c0392b')} onClick={() => setAppearance('NG')}>NG</button>
          </div>
        </div>

        {/* Dimensions A~D */}
        <div style={S.section}>
          <span style={S.label}>Dimensions</span>
          {DIM_KEYS.map((key, i) => (
            <div key={key} style={S.dimGrid}>
              <span style={S.dimLabel}>{DIM_LABELS[i]}</span>
              {DIM_OPTIONS.map(opt => (
                <button key={opt} style={S.btn(dims[key] === opt, opt === 'NG' ? '#c0392b' : '#1a2f6e')}
                  onClick={() => setDims(d => ({ ...d, [key]: opt }))}>{opt}</button>
              ))}
            </div>
          ))}
        </div>

        {/* 전기 성능 입력 */}
        <div style={S.section}>
          <span style={S.label}>Electrical</span>
          {[
            { key: 'R', val: r, set: setR, unit: 'Ω' },
            { key: 'L', val: l, set: setL, unit: lUnit },
            { key: 'I.T.', val: it, set: setIt, unit: 'Ω' },
            { key: 'K_T', val: kt, set: setKt, unit: 'Nm/A' },
          ].map(({ key, val, set, unit }) => (
            <div key={key} style={S.inputRow}>
              <span style={S.inputLabel}>{key}</span>
              <input style={S.input} type="number" step="any" placeholder={key === 'K_T' ? '선택' : '필수'}
                value={val} onChange={e => set(e.target.value)} />
              <span style={S.inputUnit}>{unit}</span>
            </div>
          ))}
        </div>

        {error && <p style={{ color: '#c0392b', fontSize: 13, textAlign: 'center' }}>{error}</p>}

        <button style={S.submit} onClick={handleSubmit}>검사 완료</button>
        <button style={S.cancel} onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}