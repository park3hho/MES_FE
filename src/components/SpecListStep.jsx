// src/components/SpecListStep/index.jsx
// EA 공정 파이별 산출물 입력 — 상태 자체 관리, onConfirm(eaList)으로 결과만 전달

import { useState } from 'react'
import { FaradayLogo } from './FaradayLogo'
import { PHI_COLORS } from '../../constants/styleConst'

export default function SpecListStep({ onConfirm, onBack }) {
  const [eaList, setEaList] = useState([])
  const [error, setError] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)

  const handleAddSpec = (spec) => {
    setEaList(prev => [...prev, { id: Date.now(), spec, quantity: 88 }])
  }

  const handleQtyChange = (id, val) => {
    const num = parseInt(val)
    if (isNaN(num) || num < 0) return
    setEaList(prev => prev.map(item => item.id === id ? { ...item, quantity: num } : item))
  }

  const handleRemove = (id) => {
    setEaList(prev => prev.filter(item => item.id !== id))
  }

  const handleConfirm = async () => {
    if (eaList.length === 0) { setError('산출물을 1개 이상 추가하세요.'); return }
    setPrinting(true)
    try {
      await onConfirm(eaList.map(item => ({ spec: item.spec, quantity: item.quantity })))
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

        {/* 파이 선택 버튼 */}
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

        {/* 산출물 리스트 */}
        {eaList.length > 0 && (
          <div style={s.listWrap}>
            <div style={s.listHeader}>
              <span style={{ ...s.col, flex: 0.5 }}>번호</span>
              <span style={{ ...s.col, flex: 2 }}>파이</span>
              <span style={{ ...s.col, flex: 2 }}>수량</span>
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
                    type="number" min={1}
                    value={item.quantity}
                    onChange={e => handleQtyChange(item.id, e.target.value)}
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