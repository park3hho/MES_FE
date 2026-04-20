import { useState } from 'react'

import { getBoxItems } from '@/api'
import { PHI_SPECS } from '@/constants/processConst'
import s from './Inventory.module.css'

// PHI 칩 표시 순서 (20 → 45 → 70 → 87)
const PHI_DISPLAY_ORDER = ['20', '45', '70', '87']

// ════════════════════════════════════════════
// 내용물 행 — BX/OB 공정 내용물 펼치기
// ════════════════════════════════════════════

// item — { lot_no, quantity, created_at, contents: [...] }
export function ContentsRow({ item, formatTime }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={s.contentsWrap}>
      <div className={s.contentsHeader} onClick={() => setOpen(!open)}>
        <span className={s.colLot}>
          {item.lot_no}
        </span>
        <span className={s.colTime}>
          {formatTime(item.created_at)}
        </span>
        <span className={`${s.colSmall} ${s.colQty}`}>
          {item.quantity}
        </span>
      </div>
      <div
        className={s.expandBody}
        style={{ maxHeight: open ? (item.contents?.length || 0) * 28 + 2000 : 0 }}
      >
        {item.contents?.length > 0 ? (
          <div className={s.contentsBody}>
            {item.contents.map((c, i) => (
              <div key={i} className={s.contentItem}>
                <span className={s.contentProcess}>{c.process}</span>
                <span className={s.contentLot}>{c.lot_no}</span>
                <span className={s.contentQty}>{c.quantity}개</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.emptyMsg}>
            내용물 정보 없음
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
// 박스 상세 행 — UB/MB 개별 박스 (lazy load)
// ════════════════════════════════════════════

// box — { lot_no, created_at, item_count, spec?, empty? }
// process — 'UB' 또는 'MB', 클릭 시 /box/{lot_no}/items API 호출
function BoxDetailRow({ box, process, visible, idx }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null)

  // 최초 클릭 시 내용물 로드 — 이후 토글만
  const loadItems = async () => {
    if (items) {
      setOpen(!open)
      return
    }
    try {
      const d = await getBoxItems(box.lot_no)
      // 표시 정렬: created_at 오름차순(빠른 순) — DB는 안 건드리고 표시 단계에서만
      const list = [...(d.items || [])].sort((a, b) =>
        (a.created_at || '').localeCompare(b.created_at || ''),
      )
      setItems(list)
    } catch {
      setItems([])
    }
    setOpen(true)
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div
      className={s.contentsWrap}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: `opacity 0.3s ease ${idx * 0.04}s, transform 0.3s ease ${idx * 0.04}s`,
      }}
    >
      <div className={s.contentsHeader} onClick={loadItems}>
        <span className={s.colLot}>
          {box.lot_no}
        </span>
        <span className={s.colTimeNarrow}>
          {formatTime(box.created_at)}
        </span>
        {process === 'UB' && box.spec && (
          <span
            className={s.colSmall}
            style={{
              fontWeight: 700,
              fontSize: 11,
              color: PHI_SPECS[box.spec]?.color || '#6b7585',
            }}
          >
            Φ{box.spec}
          </span>
        )}
        {process === 'MB' && box.phi_counts && Object.keys(box.phi_counts).length > 0 && (
          <span className={s.colSmall} style={{ display: 'flex', gap: 6, fontSize: 11, fontWeight: 700 }}>
            {PHI_DISPLAY_ORDER
              .filter((phi) => box.phi_counts[phi])
              .map((phi) => (
                <span key={phi} style={{ color: PHI_SPECS[phi]?.color || '#6b7585' }}>
                  Φ{phi} {box.phi_counts[phi]}
                </span>
              ))}
          </span>
        )}
        <span className={`${s.colSmall} ${s.colQty}`}>
          {box.item_count}개
        </span>
        <span
          className={s.groupArrow}
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', flex: 0.3 }}
        >
          ▾
        </span>
      </div>

      <div
        className={s.expandBody}
        style={{ maxHeight: open ? (items?.length || 0) * 36 + 20 : 0 }}
      >
        {items === null ? (
          <div className={s.emptyMsg}>로딩 중...</div>
        ) : items.length === 0 ? (
          <div className={s.emptyMsg}>빈 박스</div>
        ) : (
          <div className={s.contentsBody}>
            {items.map((item, i) => (
              <div key={i} className={s.contentItem}>
                <span className={s.contentProcess}>{process === 'UB' ? 'OQ' : 'UB'}</span>
                <span className={s.contentLot}>{item.serial_no || item.lot_no}</span>
                {item.spec && (
                  <span
                    className={s.contentQty}
                    style={{ color: PHI_SPECS[item.spec]?.color || '#6b7585' }}
                  >
                    Φ{item.spec}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
// 박스 아코디언 그룹 — "사용 중" / "빈 박스" 구분
// ════════════════════════════════════════════

// boxes — BoxDetailRow 배열, defaultOpen — 초기 펼침 여부
export function BoxAccordionGroup({ label, boxes, process, visible, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)

  if (boxes.length === 0) return null

  return (
    <div className={s.groupWrap}>
      <div className={s.groupHeader} onClick={() => setOpen(!open)}>
        <span className={s.groupLabel}>{label}</span>
        <span className={s.groupTotal}>{boxes.length}박스</span>
        <span className={s.groupArrow} style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>
          ▾
        </span>
      </div>
      <div
        className={s.expandBody}
        style={{ maxHeight: open ? boxes.length * 300 + 4000 : 0, transition: 'max-height 0.3s ease' }}
      >
        {boxes.map((box, idx) => (
          <BoxDetailRow
            key={box.lot_no}
            box={box}
            process={process}
            visible={visible && open}
            idx={idx}
          />
        ))}
      </div>
    </div>
  )
}
