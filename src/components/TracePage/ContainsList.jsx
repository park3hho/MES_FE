// components/TracePage/ContainsList.jsx
// 박스 공정(UB/MB/OB)의 담긴 내용물 리스트 (2026-04-24)
// 각 item 클릭 → navigate, entity 정보에서 간단한 미리보기 (phi/상태/판정)

import s from './ContainsList.module.css'

const JUDG_COLOR = {
  OK: 'var(--color-success, #27ae60)',
  FAIL: 'var(--color-error, #e74c3c)',
  PENDING: '#f39c12',
  RECHECK: '#3498db',
  PROBE: '#9b59b6',
}

const STATUS_LABEL = {
  in_stock: '재고',
  in_inspection: '검사중',
  consumed: '소진',
  repair: '수리',
  discarded: '폐기',
  shipped: '출하',
}

export default function ContainsList({ contains, entities, onNavigate }) {
  const items = contains || []

  return (
    <div className={s.section}>
      <div className={s.sectionHeader}>
        <h3 className={s.sectionTitle}>담긴 내용물</h3>
        <span className={s.countTag}>{items.length}개</span>
      </div>

      {items.length === 0 ? (
        <p className={s.emptyNote}>비어있는 박스입니다.</p>
      ) : (
        <ul className={s.list}>
          {items.map((lotNo) => {
            const ent = entities?.[lotNo] || null
            const hasEnt = !!ent
            const insp = ent?.inspection
            return (
              <li key={lotNo}>
                <button
                  type="button"
                  className={s.item}
                  onClick={() => onNavigate(lotNo)}
                  disabled={!hasEnt}
                  title={hasEnt ? '클릭하여 탐색' : '엔티티 정보 없음'}
                >
                  <div className={s.itemMain}>
                    <span className={s.itemLot}>{lotNo}</span>
                    {ent?.process && (
                      <span className={s.itemProc}>{ent.process}</span>
                    )}
                  </div>
                  <div className={s.itemMeta}>
                    {ent?.phi && <span className={s.itemPhi}>Φ{ent.phi}</span>}
                    {ent?.motor_type && <span className={s.itemMotor}>{ent.motor_type}</span>}
                    {ent?.status && (
                      <span className={s.itemStatus}>
                        {STATUS_LABEL[ent.status] || ent.status}
                      </span>
                    )}
                    {insp?.judgment && (
                      <span
                        className={s.itemJudg}
                        style={{ background: JUDG_COLOR[insp.judgment] || 'var(--color-gray)' }}
                      >
                        {insp.judgment}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
