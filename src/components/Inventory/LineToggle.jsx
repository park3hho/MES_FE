// src/components/Inventory/LineToggle.jsx
// 실시간 재고현황 화면 전환 — 고정자 / 회전자 / 원자재 (2026-09-21)
//   한 페이지에 전부 쌓던 것을 셋으로 나눴다. 폰에서는 가로 꽉 찬 3칸(누르기 쉽게 44px), 넓은 화면에서는 내용 폭.
//   선택지 목록은 inventoryHelpers.INVENTORY_LINES — 컴포넌트 파일에서 상수를 export 하지 않는다(react-refresh 규칙).
import { INVENTORY_LINES } from './inventoryHelpers'
import s from './Inventory.module.css'

export default function LineToggle({ line, onChange }) {
  return (
    <div className={s.lineToggle} role="tablist" aria-label="재고 화면 선택">
      {INVENTORY_LINES.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={line === o.key}
          className={`${s.lineBtn} ${line === o.key ? s.lineBtnOn : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
