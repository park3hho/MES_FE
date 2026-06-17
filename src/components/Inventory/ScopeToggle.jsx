// src/components/Inventory/ScopeToggle.jsx
// 실시간 재고현황 범위 토글 — 메타(메타 파이만) / 전체 (2026-06-17)
//   1차: 메타 = META_PHIS(95/87/70/45/20). 외전형 등 추가 분리는 다음 단계.
import s from './Inventory.module.css'

const OPTIONS = [
  { key: 'meta', label: '메타' },
  { key: 'all', label: '전체' },
]

export default function ScopeToggle({ scope, onChange }) {
  return (
    <div className={s.scopeToggle} role="tablist">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={scope === o.key}
          className={`${s.scopeBtn} ${scope === o.key ? s.scopeBtnOn : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
