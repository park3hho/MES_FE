// components/TracePage/Breadcrumbs.jsx
// 히스토리 경로 시각화 (2026-04-24)
// - history 스택을 breadcrumbs 로 표시
// - 각 단계 클릭 시 그 지점으로 점프 (뒤의 히스토리 버림)
// - 현재 LOT 은 활성 상태 (non-clickable)

import s from './Breadcrumbs.module.css'

const PROC_COLOR = {
  SO: 'var(--color-primary)',
  FP: 'var(--color-success, #27ae60)',
  UB: '#3498db',
  MB: '#9b59b6',
  OB: '#e67e22',
}

export default function Breadcrumbs({ history, entities, currentLot, onJump }) {
  if (!history || history.length <= 1) return null

  return (
    <nav className={s.breadcrumbs} aria-label="탐색 경로">
      <span className={s.label}>경로</span>
      <ol className={s.list}>
        {history.map((lotNo, idx) => {
          const ent = entities?.[lotNo]
          const proc = ent?.process || '?'
          const isLast = idx === history.length - 1
          const isCurrent = lotNo === currentLot
          const procColor = PROC_COLOR[proc] || 'var(--color-gray)'

          return (
            <li key={`${idx}-${lotNo}`} className={s.item}>
              {idx > 0 && <span className={s.sep} aria-hidden="true">›</span>}
              {isLast || isCurrent ? (
                <span className={`${s.crumb} ${s.crumbActive}`}>
                  <span
                    className={s.procBadge}
                    style={{ background: procColor }}
                  >
                    {proc}
                  </span>
                  <span className={s.lotNo}>{lotNo}</span>
                </span>
              ) : (
                <button
                  type="button"
                  className={s.crumb}
                  onClick={() => onJump(idx)}
                  title={`${lotNo}로 점프`}
                >
                  <span
                    className={s.procBadge}
                    style={{ background: procColor }}
                  >
                    {proc}
                  </span>
                  <span className={s.lotNo}>{lotNo}</span>
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
