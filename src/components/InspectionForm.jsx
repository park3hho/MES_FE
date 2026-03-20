import { useState } from 'react'
import { FaradayLogo } from './FaradayLogo'
import NumPad from './NumPad'

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
  // 3회 측정 카드
  avgCard: { background: '#f8f9fb', borderRadius: 10, padding: '10px 12px', marginBottom: 8 },
  avgLabel: { fontSize: 13, fontWeight: 600, color: '#3d3d4e', marginBottom: 6, display: 'flex', justifyContent: 'space-between' },
  avgResult: { fontSize: 13, color: '#1a9e75', fontWeight: 700 },
  avgSlots: { display: 'flex', gap: 6 },
  avgSlot: (filled) => ({
    flex: 1, padding: '10px 0', borderRadius: 8, textAlign: 'center', fontSize: 15, fontWeight: 600, cursor: 'pointer',
    background: filled ? '#e8ecf6' : '#fff', color: filled ? '#1a2f6e' : '#ccc',
    border: `1.5px ${filled ? 'solid #1a2f6e' : 'dashed #d0d5e8'}`,
  }),
  // 절연 버튼
  itRow: { display: 'flex', gap: 8 },
  itBtn: (active) => ({
    flex: 1, padding: '12px 0', borderRadius: 8, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer',
    background: active ? '#1a2f6e' : '#f0f1f5', color: active ? '#fff' : '#6b7585',
  }),
  // 차원 그리드
  dimGrid: { display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 4 },
  dimLabel: { fontSize: 13, color: '#6b7585', fontWeight: 600 },
  // K_T 표시
  ktSlot: (filled) => ({
    width: '100%', padding: '10px 0', borderRadius: 8, textAlign: 'center', fontSize: 15, fontWeight: 600, cursor: 'pointer',
    background: filled ? '#e8ecf6' : '#fff', color: filled ? '#1a2f6e' : '#ccc',
    border: `1.5px ${filled ? 'solid #1a2f6e' : 'dashed #d0d5e8'}`,
  }),
  submit: { width: '100%', padding: 14, borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700, background: '#1a2f6e', color: '#fff', cursor: 'pointer', marginTop: 8 },
  cancel: { width: '100%', padding: 10, background: 'none', border: 'none', fontSize: 14, color: '#8a93a8', cursor: 'pointer', marginTop: 4 },
}

const DIM_KEYS = ['dim_a', 'dim_b', 'dim_c', 'dim_d']
const DIM_LABELS = ['A', 'B', 'C', 'D']
const DIM_OPTIONS = ['OK', 'NG', '-']
const IT_OPTIONS = [125, 250, 500]

// 3회 측정 평균 계산
function avg(arr) {
  const nums = arr.filter(v => v !== null)
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1000) / 1000
}

export default function InspectionForm({ phi, lotOqNo, onSubmit, onCancel }) {
  const [wire, setWire] = useState('')
  const [appearance, setAppearance] = useState('OK')
  const [dims, setDims] = useState({ dim_a: '-', dim_b: '-', dim_c: '-', dim_d: '-' })

  // R, L: 3회 측정
  const [rVals, setRVals] = useState([null, null, null])
  const [lVals, setLVals] = useState([null, null, null])
  const [it, setIt] = useState(null)
  const [kt, setKt] = useState(null)

  // 키패드 상태: { target, label, unit, callback }
  const [numPad, setNumPad] = useState(null)

  const [error, setError] = useState(null)
  const lUnit = phi === '20' ? 'mH' : 'µH'

  // 3회 측정 슬롯 탭 → 키패드 열기
  const openSlot = (target, idx, vals, setVals, label, unit) => {
    setNumPad({
      label: `${label} #${idx + 1}`,
      unit,
      onConfirm: (v) => {
        const next = [...vals]
        next[idx] = parseFloat(v)
        setVals(next)
        setNumPad(null)
      },
    })
  }

  const handleSubmit = () => {
    if (!wire) return setError('Wire type을 선택하세요')
    const rAvg = avg(rVals)
    const lAvg = avg(lVals)
    if (rAvg === null) return setError('저항(R) 1회 이상 입력하세요')
    if (lAvg === null) return setError('인덕턴스(L) 1회 이상 입력하세요')
    if (it === null) return setError('절연(I.T.)을 선택하세요')

    onSubmit({
      lot_oq_no: lotOqNo,
      phi,
      wire_type: wire,
      appearance,
      ...dims,
      resistance: rAvg,
      inductance: lAvg,
      insulation: it,
      back_emf: kt,
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

        {/* Dimensions */}
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

        {/* R: 3회 측정 */}
        <div style={S.section}>
          <div style={S.avgCard}>
            <div style={S.avgLabel}>
              <span>R (Ω) — 3회 측정</span>
              {avg(rVals) !== null && <span style={S.avgResult}>평균: {avg(rVals)}</span>}
            </div>
            <div style={S.avgSlots}>
              {rVals.map((v, i) => (
                <div key={i} style={S.avgSlot(v !== null)}
                  onClick={() => openSlot('r', i, rVals, setRVals, 'R', 'Ω')}>
                  {v !== null ? v : `#${i + 1}`}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* L: 3회 측정 */}
        <div style={S.section}>
          <div style={S.avgCard}>
            <div style={S.avgLabel}>
              <span>L ({lUnit}) — 3회 측정</span>
              {avg(lVals) !== null && <span style={S.avgResult}>평균: {avg(lVals)}</span>}
            </div>
            <div style={S.avgSlots}>
              {lVals.map((v, i) => (
                <div key={i} style={S.avgSlot(v !== null)}
                  onClick={() => openSlot('l', i, lVals, setLVals, 'L', lUnit)}>
                  {v !== null ? v : `#${i + 1}`}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* I.T.: 125/250/500 버튼 */}
        <div style={S.section}>
          <span style={S.label}>I.T. (절연)</span>
          <div style={S.itRow}>
            {IT_OPTIONS.map(v => (
              <button key={v} style={S.itBtn(it === v)} onClick={() => setIt(v)}>
                {v}V
              </button>
            ))}
          </div>
        </div>

        {/* K_T: 선택 입력 */}
        <div style={S.section}>
          <span style={S.label}>K_T (Nm/A) — 선택</span>
          <div style={S.ktSlot(kt !== null)}
            onClick={() => setNumPad({
              label: 'K_T', unit: 'Nm/A',
              onConfirm: (v) => { setKt(parseFloat(v)); setNumPad(null) },
            })}>
            {kt !== null ? kt : '탭하여 입력'}
          </div>
        </div>

        {error && <p style={{ color: '#c0392b', fontSize: 13, textAlign: 'center' }}>{error}</p>}

        <button style={S.submit} onClick={handleSubmit}>검사 완료</button>
        <button style={S.cancel} onClick={onCancel}>취소</button>
      </div>

      {/* 키패드 오버레이 */}
      {numPad && (
        <NumPad
          label={numPad.label}
          unit={numPad.unit}
          onConfirm={numPad.onConfirm}
          onCancel={() => setNumPad(null)}
        />
      )}
    </div>
  )
}