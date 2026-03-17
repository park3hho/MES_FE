import { useState } from 'react'
import { FaradayLogo } from './FaradayLogo'
import { isMobile } from '@/constants/styleConst'

// MP 모드: 개체별 무게 입력 후 리스트 누적
function MPWeightInput({ lotPrefix, unit, onDone, onCancel, maxWeight }) {
  const [value, setValue] = useState('')
  const [items, setItems] = useState([])
  const [overError, setOverError] = useState(false)

  const totalWeight = items.reduce((s, i) => s + i.weight, 0)

  const handleAdd = () => {
    const w = parseFloat(value)
    if (isNaN(w) || w <= 0) return

    // 누적 무게 초과 시 차단
    if (maxWeight != null && totalWeight + w > maxWeight) {
      setOverError(true)
      return
    }
    setOverError(false)
    setItems(prev => [...prev, { seq: prev.length + 1, weight: w }])
    setValue('')
  }

  const handleRemove = (seq) => {
    setItems(prev => prev.filter(i => i.seq !== seq).map((i, idx) => ({ ...i, seq: idx + 1 })))
  }

  return (
    <div>
      {/* 무게 입력 행 */}
      <p style={countStyles.label}>개체 무게 입력</p>
      <div style={countStyles.inputRow}>
        <input
          style={countStyles.input}
          type="number" min={0} step="0.001"
          value={value}
          onChange={e => { setValue(e.target.value); setOverError(false) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          placeholder="무게 입력"
          autoFocus
        />
        <span style={countStyles.unit}>{unit}</span>
        <button
          style={{ ...countStyles.primaryBtn, padding: '10px 16px', fontSize: 14, opacity: value && parseFloat(value) > 0 ? 1 : 0.5 }}
          onClick={handleAdd}
          disabled={!value || parseFloat(value) <= 0}
        >추가</button>
      </div>

      {/* 초과 에러 메시지 */}
      {overError && (
        <p style={{ fontSize: 11, color: '#e05555', marginTop: 6 }}>
          RM 무게({maxWeight}kg) 초과 — 입력 불가
        </p>
      )}

      {/* 누적 리스트 */}
      {items.length > 0 && (
        <div style={mp.listWrap}>
          <div style={mp.listHeader}>
            <span style={mp.col}>번호</span>
            <span style={{ ...mp.col, flex: 2 }}>LOT</span>
            <span style={mp.col}>무게</span>
            <span style={mp.col}></span>
          </div>
          {items.map(item => (
            <div key={item.seq} style={mp.listRow}>
              <span style={mp.col}>{item.seq}</span>
              <span style={{ ...mp.col, flex: 2, fontSize: 10 }}>
                {lotPrefix}-{String(item.seq).padStart(2, '0')}
              </span>
              <span style={{ ...mp.col, fontWeight: 700, color: '#1a2540' }}>
                {item.weight}{unit}
              </span>
              <button style={mp.removeBtn} onClick={() => handleRemove(item.seq)}>✕</button>
            </div>
          ))}

          {/* 총합 / RM 무게 대비 */}
          <div style={mp.summary}>
            <span style={mp.summaryText}>총 {items.length}개</span>
            <span style={{ ...mp.summaryText, color: totalWeight > maxWeight * 0.95 ? '#e05555' : '#1a2f6e' }}>
              {Math.round(totalWeight * 1000) / 1000} / {maxWeight}{unit}
            </span>
          </div>
        </div>
      )}

      {/* 하단 버튼 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button style={{ ...countStyles.secondaryBtn, flex: 1 }} onClick={onCancel}>취소</button>
        <button
          style={{ ...countStyles.primaryBtn, flex: 1, opacity: items.length > 0 ? 1 : 0.5 }}
          onClick={() => onDone(items)}
          disabled={items.length === 0}
        >완료</button>
      </div>
    </div>
  )
}

export function CountModal({ lotNo, label = '수량 입력', onSelect, onCancel, cancelLabel = '취소', readOnly = false, defaultValue = null, unit, unit_type, mode = 'default' }) {
  const [value, setValue] = useState(defaultValue ? String(defaultValue) : '')

  const handleSubmit = () => {
    const num = unit_type === '중량' ? parseFloat(value) : parseInt(value)
    if (isNaN(num) || num < 0) return
    onSelect(num)
  }

  return (
    <div style={countStyles.overlay}>
      <div style={countStyles.modal}>
        <div style={{ marginBottom: isMobile ? 16 : 24 }}>
          <FaradayLogo size="md" />
        </div>
        <div style={countStyles.lotDisplay}>
          <span style={countStyles.lotLabel}>LOT No</span>
          <span style={countStyles.lotValue}>{lotNo}</span>
        </div>

        {/* MP 모드: 개체별 무게 입력 / 기본 모드: 단일 입력 */}
        {mode === 'mp' ? (
          <MPWeightInput lotPrefix={lotNo} unit={unit} onDone={onSelect} onCancel={onCancel} />
        ) : (
          <>
            <p style={countStyles.label}>{label}</p>
            <div style={countStyles.inputRow}>
              <input
                style={{ ...countStyles.input, background: readOnly ? '#f4f6fb' : '#fff' }}
                type="number" min={1}
                value={value}
                onChange={e => { if (!readOnly) { const v = e.target.value; if (v === '' || parseInt(v) >= 0) setValue(v) } }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
                placeholder={`${unit_type} 입력`}
                readOnly={readOnly}
                autoFocus
              />
              <span style={countStyles.unit}>{unit}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: isMobile ? 16 : 28 }}>
              <button style={{ ...countStyles.secondaryBtn, flex: 1 }} onClick={onCancel}>{cancelLabel}</button>
              <button
                style={{ ...countStyles.primaryBtn, flex: 1, opacity: (value !== '' && parseFloat(value) >= 0) ? 1 : 0.5 }}
                onClick={handleSubmit}
                disabled={value === '' || parseFloat(value) < 0}
              >확인</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// MP 전용 스타일
const mp = {
  listWrap: { marginTop: 16, borderTop: '1px solid #e0e4ef', paddingTop: 10 },
  listHeader: { display: 'flex', gap: 6, marginBottom: 6 },
  listRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid #f0f2f7' },
  col: { flex: 1, fontSize: 11, fontWeight: 600, color: '#8a93a8', textAlign: 'center' },
  removeBtn: { background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  summary: { display: 'flex', justifyContent: 'space-between', padding: '8px 4px', marginTop: 4 },
  summaryText: { fontSize: 12, fontWeight: 700, color: '#1a2f6e' },
}

const countStyles = { /* 기존 스타일 그대로 유지 */
  overlay: { position: 'fixed', inset: 0, background: 'rgba(10,18,40,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(3px)', padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: isMobile ? '28px 24px' : '56px 60px', width: '100%', maxWidth: 700, boxShadow: '0 20px 60px rgba(26,47,110,0.22)' },
  lotDisplay: { background: '#f4f6fb', border: '1px solid #e0e4ef', borderRadius: 8, padding: isMobile ? '10px 14px' : '16px 20px', textAlign: 'center', marginBottom: isMobile ? 16 : 24 },
  lotLabel: { display: 'block', fontSize: 11, color: '#8a93a8', fontWeight: 500, letterSpacing: '0.1em', marginBottom: 4, textTransform: 'uppercase' },
  lotValue: { display: 'block', fontSize: isMobile ? 16 : 36, fontWeight: 700, color: '#1a2540', letterSpacing: '0.08em' },
  label: { fontSize: isMobile ? 12 : 13, fontWeight: 600, color: '#6b7585', marginBottom: 8 },
  inputRow: { display: 'flex', alignItems: 'center', gap: 8 },
  input: { flex: 1, padding: isMobile ? '10px 12px' : '14px 16px', border: '1.5px solid #d8dce8', borderRadius: 8, fontSize: isMobile ? 16 : 20, fontWeight: 600, color: '#1a2540', outline: 'none', textAlign: 'center' },
  unit: { fontSize: isMobile ? 13 : 16, fontWeight: 600, color: '#6b7585' },
  primaryBtn: { padding: isMobile ? '12px' : '20px', background: '#1a2f6e', color: '#fff', border: 'none', borderRadius: 7, fontSize: isMobile ? 14 : 20, fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: isMobile ? '12px' : '20px', background: '#fff', color: '#1a2f6e', border: '1.5px solid #1a2f6e', borderRadius: 7, fontSize: isMobile ? 14 : 20, fontWeight: 600, cursor: 'pointer' },
}