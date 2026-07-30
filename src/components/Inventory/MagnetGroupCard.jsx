import { useState } from 'react'

import s from './Inventory.module.css'

// ════════════════════════════════════════════
// 자석 규격 카드 — 규격(70i 56H INST)별 카드 + 극성(AZ/N/S) 소계 (2026-07-28)
// ════════════════════════════════════════════
// group — { key, label, spare, total, poles:[{pole,qty}], items:[{lot_no,quantity,pole,created_at}] }
//   spare=true 면 예비/기타(집계안됨) 카드로 흐리게 + 태그 표시.
//   헤더 클릭 시 LOT 상세(items) 펼침. 극성 소계는 항상 노출.
export default function MagnetGroupCard({ group, visible, formatTime, isMobile }) {
  const [open, setOpen] = useState(false)
  const fontSize = isMobile ? 9 : 11

  return (
    <div className={`${s.magnetCard} ${group.spare ? s.magnetCardSpare : ''}`}>
      <div className={s.magnetCardHead} onClick={() => setOpen(!open)}>
        <span className={s.magnetCardTitle}>
          {group.label}
          {group.spare && <span className={s.magnetSpareTag}>예비 · 집계안됨</span>}
        </span>
        <span className={s.magnetCardTotal}>{group.total.toLocaleString()}ea</span>
        <span className={s.groupLotCount}>{group.items.length}건</span>
        <span className={s.groupArrow} style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>
          ▾
        </span>
      </div>

      {/* 극성 소계 — 극성 | 사용중(개봉 박스 잔량) | 총개수. AZ/N/S 순 (BE 정렬) */}
      <div className={s.magnetPoles}>
        <div className={`${s.magnetPoleRow} ${s.magnetPoleHead}`}>
          <span className={s.magnetPoleName} />
          <span className={s.magnetPoleUse}>사용중</span>
          <span className={s.magnetPoleQty}>총개수</span>
        </div>
        {group.poles.map((p) => (
          <div key={p.pole} className={s.magnetPoleRow}>
            <span className={s.magnetPoleName}>{p.pole}</span>
            <span className={`${s.magnetPoleUse} ${p.in_use > 0 ? '' : s.magnetPoleZero}`}>
              {p.in_use > 0 ? `${p.in_use.toLocaleString()}ea` : '—'}
            </span>
            <span className={s.magnetPoleQty}>{p.qty.toLocaleString()}ea</span>
          </div>
        ))}
      </div>

      {/* LOT 상세 — 헤더 클릭 시 펼침 */}
      <div className={`${s.expandBody} ${open ? s.expandBodyOpen : ''}`}>
        <div>
          <div className={s.groupListHeader}>
            <span className={s.detailCol} style={{ flex: 3, fontSize }}>LOT 번호</span>
            <span className={s.detailCol} style={{ flex: 1, fontSize }}>극성</span>
            <span className={s.detailCol} style={{ flex: 2.5, fontSize }}>생성일시</span>
            <span className={s.detailCol} style={{ flex: 1, fontSize }}>수량</span>
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
              <span className={`${s.detailCol} ${s.colLot}`}>{item.lot_no}</span>
              <span className={s.detailCol} style={{ flex: 1 }}>{item.pole}</span>
              <span className={`${s.detailCol} ${s.colTime}`}>{formatTime(item.created_at)}</span>
              <span className={`${s.detailCol} ${s.colQty}`}>{item.quantity.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
