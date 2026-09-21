// src/components/Inventory/RmSection.jsx
// 원자재(RM) 화면 — Warehouse 기준, 분류(ItemCategory)별 카드 (2026-06-17 · 큰 글씨 개편 2026-09-21)
//   RM 은 phi/모터가 없고 재질 분류로 묶인다. 카드 = 분류 1개: 분류명 · 총량(큰 글씨) · 건수/오늘 · 품목 줄.
//   ★ 원자재가 자기 화면을 갖게 되면서(고정자·회전자와 분리) 자리가 생겼다 — 품목을 카드 안에 **상위 몇 줄**까지 바로 보여 준다.
//     전부 펼치면 품목 많은 분류가 끝없이 길어지므로(2026-06-18 에 인라인 칩을 뺐던 이유) RM_INLINE_MAX 에서 끊고
//     나머지는 '외 N종' — 카드 뷰는 눌러서 상세 패널(자석 극성 등은 거기서만 보인다).
//   ★ 목록 뷰는 상세 패널이 없는 표시 전용이라 **자르지 않는다** — 자르면 5번째 품목부터 볼 길이 없다(리뷰 fix).
import Section from '@/components/common/Section'
import { qtySizeStep } from './inventoryHelpers'
import s from './Inventory.module.css'

const RM_INLINE_MAX = 4   // 카드 뷰에서 카드 안에 바로 보이는 품목 줄 수 (나머지는 눌러서 상세)
const QTY_STEP_CLASS = { long: s.qtyLong, xlong: s.qtyXLong }

const fmtQty = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

// onSelect(key) 주면 카드 클릭 시 DetailPanel(합성키 'RM:{c.key}') 호출 — 카드 뷰에서만 전달.
//   selectedKey = 현재 열린 상세 합성키 (하이라이트용). 목록 뷰는 미전달 → 표시 전용.
export default function RmSection({ rmData, onSelect, selectedKey }) {
  if (!rmData) return null
  const cats = rmData.categories || []
  const clickable = typeof onSelect === 'function'

  return (
    <Section label="원자재">
      {cats.length === 0 ? (
        <p className={s.rmEmpty}>원자재 재고가 없습니다.</p>
      ) : (
        <div className={s.rmGrid}>
          {cats.map((c) => {
            const unit = c.items?.[0]?.unit || 'ea'
            const empty = (c.qty || 0) === 0
            const ck = `RM:${c.key}`
            const items = c.items || []
            const shown = clickable ? items.slice(0, RM_INLINE_MAX) : items
            const more = items.length - shown.length
            const totalText = fmtQty(c.weight)
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
                {/* 머리줄: 분류명 · 건수 · 오늘 +N */}
                <div className={s.cellHeader}>
                  <span className={s.processKey}>{c.label}</span>
                  <span className={s.processLabel}>{c.qty}건</span>
                  {c.today > 0 && (
                    <span className={s.cellToday}>
                      <span className={s.todayNum} title="오늘 들어온 건수">+{c.today}</span>
                    </span>
                  )}
                </div>

                {/* 총량 + 단위 */}
                <div className={s.cellMain}>
                  <span className={`${s.qty} ${QTY_STEP_CLASS[qtySizeStep(totalText)] || ''}`} style={{ color: empty ? '#c0c8d8' : '#1a2540' }}>{totalText}</span>
                  <span className={s.unit}>{unit}</span>
                </div>

                {/* 품목 줄 — 품목명 … 수량 (N건). 카드 뷰는 상위 RM_INLINE_MAX 줄까지, 목록 뷰는 전부 */}
                {items.length > 0 && (
                  <div className={s.cellFooter}>
                    <div className={s.phiList}>
                      {shown.map((it) => (
                        <span key={it.key} className={s.phiItem} title={`${it.label} · ${it.boxes}건`}>
                          <span className={`${s.phiLabel} ${s.rmItemName}`}>{it.label}</span>
                          <span className={s.phiCount}>
                            {fmtQty(it.quantity)}<i className={s.rmBoxes}> {it.boxes}건</i>
                          </span>
                        </span>
                      ))}
                    </div>
                    {/* LOT 목록·자석 극성은 상세 패널에만 있다 — 품목이 다 보이는 분류에도 눌러 보라는 단서를 남긴다(폰은 커서가 없다) */}
                    {clickable && (
                      <span className={s.rmMoreHint}>
                        {more > 0 ? `외 ${more}종 · 눌러서 전체 보기` : '눌러서 LOT 보기'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}
