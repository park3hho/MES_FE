// src/components/Inventory/RmSection.jsx
// 원자재(RM) 섹션 — Warehouse 기준, 분류(ItemCategory)별 카드 + 품목 세부 칩 (2026-06-17)
//   InventoryPage 의 RM 은 phi/모터가 없고 재질 분류로 묶임 → 공정 셀과 같은 카드 디자인으로 통일.
//   카드 = 분류 1개 (수량/오늘 + 품목별 세부 칩). board/list 두 뷰 공용.
import Section from '@/components/common/Section'
import s from './Inventory.module.css'

const fmtQty = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

// onSelect(key) 주면 카드 클릭 시 DetailPanel(합성키 'RM:{c.key}') 호출 — board 뷰에서만 전달.
//   selectedKey = 현재 열린 상세 합성키 (하이라이트용). list 뷰는 미전달 → 표시 전용(칩으로 세부 노출).
export default function RmSection({ rmData, onSelect, selectedKey }) {
  if (!rmData) return null
  const cats = rmData.categories || []

  return (
    <>
      <div className={s.lineDivider} />
      <Section label="원자재">
        {cats.length === 0 ? (
          <p className={s.rmEmpty}>원자재 재고가 없습니다.</p>
        ) : (
          <div className={s.grid}>
            {cats.map((c) => {
              const unit = c.items?.[0]?.unit || 'ea'
              const empty = (c.qty || 0) === 0
              const ck = `RM:${c.key}`
              const clickable = typeof onSelect === 'function'
              return (
                <div key={c.key}
                  className={s.cell}
                  style={{
                    opacity: empty ? 0.7 : 1,
                    cursor: clickable ? 'pointer' : 'default',
                    borderColor: selectedKey === ck ? '#F99535' : undefined,
                    background: selectedKey === ck ? '#fffaf5' : undefined,
                  }}
                  onClick={clickable ? () => onSelect(ck) : undefined}>
                  {/* 상단: 분류명 (공정 셀 헤더와 동일 구조) */}
                  <div className={s.cellHeader}>
                    <span className={s.processKey}>{c.label}</span>
                    <span className={s.processLabel}>원자재</span>
                  </div>

                  {/* 중단: 총 개수(수량 합) + 단위 + 건수 (둘 다 표기) */}
                  <div className={s.cellMain}>
                    <span className={s.qty} style={{ color: empty ? '#c0c8d8' : '#1a2540' }}>{fmtQty(c.weight)}</span>
                    <span className={s.unit}>{unit}</span>
                    <span className={s.subQty}>
                      {c.qty}건{c.today > 0 ? ` · 오늘 +${c.today}` : ''}
                    </span>
                  </div>

                  {/* 하단: 품목별 세부 칩 (phi 칩과 동일 스타일) */}
                  {(c.items?.length > 0) && (
                    <div className={s.cellFooter}>
                      <div className={s.phiList}>
                        {c.items.map((it) => (
                          <span key={it.lot_no} className={s.phiItem} title={`${it.label} · ${it.lot_no}`}>
                            <span className={s.phiLabel}>{it.label}</span>
                            <span className={s.phiCount}>{fmtQty(it.quantity)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>
    </>
  )
}
