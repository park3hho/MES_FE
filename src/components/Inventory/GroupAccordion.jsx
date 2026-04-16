import { useState } from 'react'

import { PROCESS_INPUT } from '@/constants/processConst'

import s from './Inventory.module.css'

// ════════════════════════════════════════════
// 그룹 아코디언 — group_key별 LOT 묶음 펼치기
// ════════════════════════════════════════════

// group — { label, color, total, items }, proc — 공정 키
// isMobile — useMobile() 결과값 (부모에서 전달)
export default function GroupAccordion({ group, visible, formatTime, proc, isMobile }) {
  const [open, setOpen] = useState(false)
  const isKg = PROCESS_INPUT[proc]?.unit === 'kg'
  const unit = PROCESS_INPUT[proc]?.unit || '개'

  const fontSize = isMobile ? 9 : 11

  return (
    <div className={s.groupWrap}>
      <div className={s.groupHeader} onClick={() => setOpen(!open)}>
        {group.color && <span className={s.colorDot} style={{ background: group.color }} />}
        <span className={s.groupLabel}>{group.label}</span>
        <span className={s.groupTotal}>
          {isKg
            ? `${Math.round(group.total * 1000) / 1000}kg`
            : `${group.total.toLocaleString()}${unit}`}
        </span>
        <span className={s.groupLotCount}>{group.items.length}건</span>
        <span className={s.groupArrow} style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>
          ▾
        </span>
      </div>

      {/* 아이템 수 기반 maxHeight */}
      <div
        className={s.expandBody}
        style={{ maxHeight: open ? group.items.length * 36 + 40 : 0, transition: 'max-height 0.5s cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <div className={s.groupListHeader}>
          <span className={s.detailCol} style={{ flex: 3, fontSize }}>LOT 번호</span>
          <span className={s.detailCol} style={{ flex: 2.5, fontSize }}>생성일시</span>
          <span className={s.detailCol} style={{ flex: 1, fontSize }}>{isKg ? '중량' : '수량'}</span>
        </div>
        {group.items.map((item, idx) => (
          <div
            key={`${item.lot_no}-${idx}`}
            className={s.detailRow}
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(8px)',
              transition: `opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${idx * 0.05}s, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${idx * 0.05}s`,
            }}
          >
            <span className={`${s.detailCol} ${s.colLot}`}>
              {item.serial_no || item.lot_no}
            </span>
            <span className={`${s.detailCol} ${s.colTime}`}>
              {formatTime(item.created_at)}
            </span>
            <span className={`${s.detailCol} ${s.colQty}`}>
              {isKg ? `${item.quantity}kg` : item.quantity}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
