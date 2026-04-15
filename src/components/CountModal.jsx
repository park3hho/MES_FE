import { useState } from 'react'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './CountModal.module.css'

// MP 모드: 개체별 무게 입력 후 리스트 누적
function MPWeightInput({
  lotPrefix,   // string: LOT 접두사
  unit,        // string: 단위 (예: 'kg')
  onDone,      // function(items): 리스트 완료 콜백
  onCancel,    // function(): 취소 콜백
  maxWeight,   // number: 누적 허용 최대 무게 (원자재 잔량)
  rmLotNo,     // string: 원자재 LOT 번호 (표시용)
}) {
  const [value, setValue] = useState('')
  const [items, setItems] = useState([])
  const [overError, setOverError] = useState(false)

  const totalWeight = items.reduce((acc, i) => acc + i.weight, 0)
  const remaining = maxWeight != null ? Math.round((maxWeight - totalWeight) * 1000) / 1000 : null

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
        {remaining != null && (
        <div className={`${s.rmRemaining} ${remaining <= 0 ? s.rmRemainingWarn : ''}`}>
          <span className={s.rmLabel}>
            {rmLotNo} 원자재 잔량
          </span>
          <span className={`${s.rmValue} ${remaining <= 0 ? s.rmValueWarn : ''}`}>
            {remaining} {unit}
          </span>
        </div>
      )}
      <p className={s.label}>생산물 무게 입력</p>
      
      <div className={s.mpInputWrap}>
        <input
          className={s.input}
          type="number" min={0} step="0.001"
          value={value}
          onChange={e => { setValue(e.target.value); setOverError(false) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          placeholder={`무게 입력 (${unit})`}
          autoFocus
        />
        <button className={s.addBtn} onClick={handleAdd}>+ 추가</button>
      </div>


      {overError && (
        <p className={s.overError}>RM 무게({maxWeight}kg) 초과 — 입력 불가</p>
      )}

      {items.length > 0 && (
        <div className={s.mpListWrap}>
          <div className={s.mpListHeader}>
            <span className={s.mpCol}>번호</span>
            <span className={`${s.mpCol} ${s.mpColWide}`}>LOT</span>
            <span className={s.mpCol}>무게</span>
            <span className={s.mpCol}></span>
          </div>
          {items.map(item => (
            <div key={item.seq} className={s.mpListRow}>
              <span className={s.mpCol}>{item.seq}</span>
              <span className={`${s.mpCol} ${s.mpColWide}`}>
                {lotPrefix}-{String(item.seq).padStart(2, '0')}
              </span>
              <span className={`${s.mpCol} ${s.mpColValue}`}>
                {item.weight}{unit}
              </span>
              <button className={s.mpRemoveBtn} onClick={() => handleRemove(item.seq)}>✕</button>
            </div>
          ))}

          <div className={s.mpSummary}>
            <span className={s.mpSummaryText}>총 {items.length}개</span>
            <span className={`${s.mpSummaryText} ${totalWeight > maxWeight * 0.95 ? s.mpSummaryWarn : ''}`}>
              {Math.round(totalWeight * 1000) / 1000} / {maxWeight}{unit}
            </span>
          </div>
        </div>
      )}

      <div className={s.btnRow}>
        <button className={s.secondaryBtn} onClick={onCancel}>취소</button>
        <button
          className={s.primaryBtn}
          onClick={() => onDone(items)}
          disabled={items.length === 0}
        >완료</button>
      </div>
    </div>
  )
}
export function CountModal({
  lotNo,                    // string: LOT 번호 (표시)
  label = '수량 입력',        // string: 입력 레이블
  onSelect,                 // function(num): 확인 콜백
  onCancel,                 // function(): 취소 콜백
  cancelLabel = '취소',      // string: 취소 버튼 라벨
  readOnly = false,         // boolean: 읽기 전용 모드
  defaultValue = null,      // number: 초기값
  unit,                     // string: 단위 ('kg', '매', '개')
  unit_type,                // string: 단위 타입 ('중량', '매수', '개수')
  mode = 'default',         // string: 'default' | 'mp' (MP 중량 리스트 모드)
  maxWeight,                // number: 원자재 최대 허용 무게
  rmLotNo,                  // string: 원자재 LOT 번호
}) {
  const [value, setValue] = useState(defaultValue ? String(defaultValue) : '')
  // ★ 초과 에러 상태
  const [overError, setOverError] = useState(false)

  const handleSubmit = () => {
    const num = unit_type === '중량' ? parseFloat(value) : parseInt(value)
    if (isNaN(num) || num < 0) return
    // ★ maxWeight 초과 시 차단
    if (maxWeight != null && num > maxWeight) {
      setOverError(true)
      return
    }
    onSelect(num)
  }

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <div className={s.logoWrap}>
          <FaradayLogo size="md" />
        </div>
        <div className={s.lotDisplay}>
          <span className={s.lotLabel}>LOT No</span>
          <span className={s.lotValue}>{lotNo}</span>
        </div>

        {mode === 'mp' ? (
          <MPWeightInput lotPrefix={lotNo} unit={unit} onDone={onSelect} onCancel={onCancel} maxWeight={maxWeight} rmLotNo={rmLotNo} />
        ) : (
          <>
            <p className={s.label}>{label}</p>
            <div className={s.inputRow}>
              <input
                className={`${s.input} ${readOnly ? s.inputReadOnly : ''}`}
                type="number" min={1}
                value={value}
                onChange={e => { if (!readOnly) { const v = e.target.value; if (v === '' || parseInt(v) >= 0) setValue(v) } }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
                placeholder={`${unit_type} 입력`}
                readOnly={readOnly}
                autoFocus
              />
              <span className={s.unit}>{unit}</span>
            </div>
            {overError && (
              <p className={s.overError}>원자재 무게({maxWeight}{unit}) 초과 — 입력 불가</p>
            )}
            <div className={s.btnRow}>
              <button className={s.secondaryBtn} onClick={onCancel}>{cancelLabel}</button>
              <button
                className={s.primaryBtn}
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