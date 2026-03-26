import { useState } from 'react'

import s from './Inventory.module.css'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const SPEC_COLORS = { 87: '#FF69B4', 70: '#FFB07C', 45: '#F0D000', 20: '#77DD77' }

// ════════════════════════════════════════════
// 내용물 행 — BX/OB 공정 내용물 펼치기
// ════════════════════════════════════════════

// item — { lot_no, quantity, created_at, contents: [...] }
export function ContentsRow({ item, formatTime }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={s.contentsWrap}>
      <div className={s.contentsHeader} onClick={() => setOpen(!open)}>
        <span style={{ flex: 3, fontWeight: 600, color: '#1a2540', fontSize: 12 }}>
          {item.lot_no}
        </span>
        <span style={{ flex: 2.5, color: '#8a93a8', fontSize: 11 }}>
          {formatTime(item.created_at)}
        </span>
        <span style={{ flex: 0.5, fontWeight: 700, color: '#1a2f6e', fontSize: 13 }}>
          {item.quantity}
        </span>
      </div>
      <div
        style={{
          maxHeight: open ? (item.contents?.length || 0) * 28 + 2000 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.25s ease',
        }}
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
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#adb4c2' }}>
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
      const res = await fetch(`${BASE_URL}/box/${box.lot_no}/items`, { credentials: 'include' })
      if (res.ok) {
        const d = await res.json()
        setItems(d.items || [])
      }
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
        <span style={{ flex: 3, fontWeight: 600, color: '#1a2540', fontSize: 12 }}>
          {box.lot_no}
        </span>
        <span style={{ flex: 1.5, color: '#8a93a8', fontSize: 11 }}>
          {formatTime(box.created_at)}
        </span>
        {process === 'UB' && box.spec && (
          <span
            style={{
              flex: 0.5,
              fontWeight: 700,
              fontSize: 11,
              color: SPEC_COLORS[box.spec] || '#6b7585',
            }}
          >
            Φ{box.spec}
          </span>
        )}
        <span style={{ flex: 0.5, fontWeight: 700, color: '#1a2f6e', fontSize: 13 }}>
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
        style={{
          maxHeight: open ? (items?.length || 0) * 36 + 20 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.25s ease',
        }}
      >
        {items === null ? (
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#adb4c2' }}>로딩 중...</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#adb4c2' }}>빈 박스</div>
        ) : (
          <div className={s.contentsBody}>
            {items.map((item, i) => (
              <div key={i} className={s.contentItem}>
                <span className={s.contentProcess}>{process === 'UB' ? 'OQ' : 'UB'}</span>
                <span className={s.contentLot}>{item.serial_no || item.lot_no}</span>
                {item.spec && (
                  <span
                    className={s.contentQty}
                    style={{ color: SPEC_COLORS[item.spec] || '#6b7585' }}
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
        style={{
          maxHeight: open ? boxes.length * 300 + 4000 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}
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
