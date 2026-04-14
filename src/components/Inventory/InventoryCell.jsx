import { useState, useEffect, useRef } from 'react'

import { PROCESS_INPUT } from '@/constants/processConst'

import s from './Inventory.module.css'

// ════════════════════════════════════════════
// 재고 셀 — 공정 하나의 재고량 표시
// ════════════════════════════════════════════

// processKey — 'RM', 'EA' 등, qty — 숫자 또는 { weight, qty, unit } 또는 { filled, empty, total }
// selected — 현재 선택 여부, onClick — 셀 클릭 콜백
export default function InventoryCell({ processKey, label, qty, selected, onClick }) {
  const [flash, setFlash] = useState(false)
  const [fading, setFading] = useState(false)
  const prevQty = useRef(qty)

  const qtyKey = typeof qty === 'object' ? (qty?.weight ?? qty?.total ?? qty?.completed) : qty

  // 수량 변경 시 flash 효과 — 2.5초 후 자동 해제
  useEffect(() => {
    if (prevQty.current !== qtyKey && prevQty.current !== null) {
      setFlash(true)
      setFading(false)
      const t1 = setTimeout(() => setFading(true), 100)
      const t2 = setTimeout(() => { setFlash(false); setFading(false) }, 2500)
      prevQty.current = qtyKey
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    prevQty.current = qtyKey
  }, [qtyKey])

  const isKg = typeof qty === 'object' && qty?.unit === 'kg'
  const isBox = typeof qty === 'object' && qty?.total != null && qty?.filled != null
  const isOQ = typeof qty === 'object' && qty?.completed != null
  const isEmpty = isKg ? qty?.weight === 0 : isBox ? qty?.filled === 0 : isOQ ? qty?.total === 0 : qty === 0
  const isLoading = qty === null
  const defaultColor = isEmpty ? '#c0c8d8' : '#1a2540'
  const unit = PROCESS_INPUT[processKey]?.unit || '개'

  const flashColor = flash ? '#F99535' : defaultColor
  const transition = fading ? 'color 2.4s ease' : 'none'

  // ────────────────────────────────────────────
  // 렌더링 — kg / 박스 / 일반 분기
  // ────────────────────────────────────────────

  return (
    <div
      className={s.cell}
      onClick={onClick}
      style={{
        borderColor: selected ? '#F99535' : isEmpty ? '#e0e4ef' : '#1a2f6e',
        background: flash ? '#e8eeff' : selected ? '#fffaf5' : '#fff',
      }}
    >
      <span className={s.processKey}>{processKey}</span>
      <span className={s.processLabel}>{label}</span>

      {isLoading ? (
        <span className={s.qty} style={{ color: defaultColor }}>...</span>
      ) : isKg ? (
        <>
          <span className={s.qty} style={{ color: flashColor, transition }}>
            {qty.weight.toLocaleString()}
          </span>
          <span className={s.unit}>kg</span>
          {processKey !== 'RM' && <span className={s.subQty}>{qty.qty}개</span>}
        </>
      ) : isOQ ? (
        <>
          <span className={s.qty} style={{ color: flashColor, transition }}>
            {qty.total}
          </span>
          <span className={s.unit}>개</span>
          <div className={s.oqDetail}>
            {qty.completed > 0 && <span style={{ color: '#1a9e75' }}>완료 {qty.completed}</span>}
            {qty.test1_only > 0 && <span style={{ color: '#e67e22' }}>T1만 {qty.test1_only}</span>}
            {qty.test2_only > 0 && <span style={{ color: '#e67e22' }}>T2만 {qty.test2_only}</span>}
            {qty.recheck > 0 && <span style={{ color: '#2e86c1' }}>재검사 {qty.recheck}</span>}
            {qty.probe > 0 && <span style={{ color: '#8e44ad' }}>조사 {qty.probe}</span>}
            {qty.fail > 0 && <span style={{ color: '#c0392b' }}>불합격 {qty.fail}</span>}
          </div>
        </>
      ) : isBox ? (
        <>
          <span className={s.qty} style={{ color: flash ? '#F99535' : qty.filled > 0 ? '#1a2540' : '#c0c8d8', transition }}>
            {qty.filled}
          </span>
          <span className={s.unit}>박스</span>
          {qty.empty > 0 && <span className={s.subQty}>빈 {qty.empty}</span>}
        </>
      ) : (
        <>
          <span className={s.qty} style={{ color: flashColor, transition }}>
            {qty.toLocaleString()}
          </span>
          <span className={s.unit}>{unit}</span>
        </>
      )}
    </div>
  )
}
