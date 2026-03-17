import { useState } from 'react'
import { FaradayLogo } from '@/components/FaradayLogo'
import { PHI_COLORS } from '@/constants/styleConst'

export default function SpecListStep({ onConfirm, onBack, type }) {
  const [eaList, setEaList] = useState([])
  const [error, setError] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)

  const handleAddSpec = (spec) => {
    setEaList(prev => [...prev, { id: Date.now(), spec, quantity: '' }])
  }

  const handleQtyChange = (id, val) => {
    // 소수점 허용 — EA 수량은 무게 기반
    if (val === '' || parseFloat(val) >= 0) {
      setEaList(prev => prev.map(item => item.id === id ? { ...item, quantity: val } : item))
    }
  }

  const handleRemove = (id) => {
    setEaList(prev => prev.filter(item => item.id !== id))
  }

  const handleConfirm = async () => {
    if (eaList.length === 0) { setError('산출물을 1개 이상 추가하세요.'); return }
    const hasEmpty = eaList.some(item => item.quantity === '' || parseFloat(item.quantity) <= 0)
    if (hasEmpty) { setError('수량을 입력하세요.'); return }
    setPrinting(true)
    try {
      await onConfirm(eaList.map(item => ({ spec: item.spec, quantity: parseFloat(item.quantity) })))
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <FaradayLogo size="md" />
          <p style={s.processLabel}>EA, 낱장가공 - 산출물 입력</p>
        </div>

        <p style={s.sectionTitle}>파이 선택</p>
        <div style={s.specBtns}>
          {PHI_COLORS.map(({ spec, color }) => (
            <button
              key={spec}
              style={{ ...s.specBtn, position: 'relative', overflow: 'hidden' }}
              onClick={() => handleAddSpec(spec)}
            >
              <div style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 3, background: color, borderRadius: '0 8px 0 0' }} />
              <div style={{ position: 'absolute', top: 0, right: 0, width: 3, height: 10, background: color, borderRadius: '0 8px 0 0' }} />
              {spec}파이
            </button>
          ))}
        </div>

        {eaList.length > 0 && (
          <div style={s.listWrap}>
            <div style={s.listHeader}>
              <span style={{ ...s.col, flex: 0.5 }}>번호</span>
              <span style={{ ...s.col, flex: 2 }}>파이</span>
              {/* 단위 표시 — EA는 무게(kg) */}
              <span style={{ ...s.col, flex: 2 }}>{type ?? 'kg'}</span>
              <span style={{ ...s.col, flex: 0.5 }}></span>
            </div>
            {eaList.map((item, idx) => {
              const itemColor = PHI_COLORS.find(o => o.spec === item.spec)?.color || '#ccc'
              return (
                <div key={item.id} style={s.listRow}>
                  <span style={{ ...s.col, flex: 0.5 }}>{idx + 1}</span>
                  <span style={{ ...s.col, flex: 2, fontWeight: 700, color: '#1a2f6e', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: itemColor, flexShrink: 0 }} />
                    {item.spec}파이
                  </span>
                  <input
                    style={s.qtyInput}
                    type="number"
                    min={0}
                    step="0.001"   // 소수점 입력 허용
                    value={item.quantity}
                    onChange={e => handleQtyChange(item.id, e.target.value)}
                    placeholder="0.000"
                  />
                  <button
                    style={{ ...s.col, flex: 0.5, background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                    onClick={() => handleRemove(item.id)}
                  >✕</button>
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div style={{ color: '#c0392b', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{error}</div>
        )}

        <button
          style={{ ...s.confirmBtn, opacity: eaList.length > 0 ? 1 : 0.4, marginTop: 16 }}
          disabled={eaList.length === 0 || printing}
          onClick={handleConfirm}
        >
          {printing ? '처리 중...' : done ? '✓ 완료' : '확인 및 출력'}
        </button>
        <button style={s.textBtn} onClick={onBack}>이전으로</button>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f4f6fb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' },
  card: { background: '#fff', borderRadius: 14, padding: '28px 32px 24px', width: '100%', maxWidth: 480, boxShadow: '0 4px 24px rgba(26,47,110,0.09)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20, gap: 6 },
  processLabel: { fontSize: 14, fontWeight: 600, color: '#1a2540', margin: 0 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#6b7585', alignSelf: 'flex-start', marginBottom: 8 },
  specBtns: { width: '100%', display: 'flex', gap: 8, marginBottom: 16 },
  specBtn: { flex: 1, padding: '12px 0', background: '#1a2f6e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  listWrap: { width: '100%', borderTop: '1px solid #e0e4ef', paddingTop: 12 },
  listHeader: { display: 'flex', gap: 6, marginBottom: 6 },
  col: { flex: 1, fontSize: 11, fontWeight: 600, color: '#8a93a8', textAlign: 'center' },
  listRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #f0f2f7' },
  qtyInput: { flex: 2, padding: '4px 6px', border: '1.5px solid #d8dce8', borderRadius: 6, fontSize: 13, fontWeight: 600, textAlign: 'center', outline: 'none' },
  confirmBtn: { width: '100%', padding: '14px', background: '#1a2f6e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  textBtn: { background: 'none', border: 'none', fontSize: 13, color: '#8a93a8', cursor: 'pointer', textDecoration: 'underline', marginTop: 12 },
}