// src/components/Inventory/RmSection.jsx
// 원자재(RM) 섹션 — Warehouse 기준, 분류(ItemCategory)별 카드 + 클릭 시 품목 세부 펼침 (2026-06-17)
//   InventoryPage 의 RM 은 phi/모터가 없고 재질 분류로 묶임 → 공정 셀과 분리한 별도 섹션.
//   board/list 두 뷰 공용 (뷰 무관 — 자체 아코디언).
import { useState } from 'react'
import Section from '@/components/common/Section'
import s from './Inventory.module.css'

const fmtQty = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export default function RmSection({ rmData }) {
  const [open, setOpen] = useState(null)   // 펼친 분류 key
  if (!rmData) return null
  const cats = rmData.categories || []

  return (
    <>
      <div className={s.lineDivider} />
      <Section label="원자재">
        <div className={s.rmList}>
          {cats.length === 0 ? (
            <p className={s.rmEmpty}>원자재 재고가 없습니다.</p>
          ) : cats.map((c) => {
            const isOpen = open === c.key
            return (
              <div key={c.key} className={s.rmGroup}>
                <button type="button"
                  className={`${s.rmHeader} ${isOpen ? s.rmHeaderOpen : ''}`}
                  onClick={() => setOpen(isOpen ? null : c.key)}>
                  <span className={s.rmChevron}>{isOpen ? '▾' : '▸'}</span>
                  <span className={s.rmCatLabel}>{c.label}</span>
                  <span className={s.rmCatMeta}>
                    <b className={s.rmCatWeight}>{fmtQty(c.weight)}</b>
                    <span className={s.rmCatQty}>· {c.qty}건</span>
                    {c.today > 0 && <span className={s.rmToday}>오늘 +{c.today}</span>}
                  </span>
                </button>

                {isOpen && (
                  <div className={s.rmItems}>
                    {(c.items || []).map((it) => (
                      <div key={it.lot_no} className={s.rmItemRow}>
                        <span className={s.rmItemLabel} title={it.label}>{it.label}</span>
                        <span className={s.rmItemLot}>{it.lot_no}</span>
                        <span className={s.rmItemQty}>{fmtQty(it.quantity)}<i className={s.rmItemUnit}> {it.unit}</i></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Section>
    </>
  )
}
