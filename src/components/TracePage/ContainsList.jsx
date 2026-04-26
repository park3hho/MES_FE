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

export default function ContainsList({ contains, entities, modelBreakdown, onNavigate }) {
  const items = contains || []
  const breakdown = (modelBreakdown || []).filter((m) => m.count > 0)

  return (
    <div className={s.section}>
      <div className={s.sectionHeader}>
        <h3 className={s.sectionTitle}>담긴 내용물</h3>
        <span className={s.countTag}>{items.length}개</span>
      </div>

      {/* 모델별 구성 chip — ModelRegistry 매핑된 라벨/컬러 (2026-04-27) */}
      {breakdown.length > 0 && (
        <div className={s.modelChips}>
          {breakdown.map((m, idx) => (
            <span
              key={`${m.phi}-${m.motor_type}-${m.rt_st_type}-${idx}`}
              className={s.modelChip}
              style={m.color_hex ? {
                background: m.color_hex,
                borderColor: m.color_hex,
              } : undefined}
              title={`${m.label} ${m.count}개`}
            >
              <span className={s.modelChipLabel}>{m.label}</span>
              <span className={s.modelChipCount}>{m.count}</span>
            </span>
          ))}
        </div>
      )}

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
                    {/* 박스 안의 dominant model chip (2026-04-27) — UB/MB 가 어떤 모델인지 한눈에 */}
                    {ent?.dominant_label && (
                      <span
                        className={s.itemModelChip}
                        style={ent.dominant_color ? {
                          background: ent.dominant_color,
                          borderColor: ent.dominant_color,
                        } : undefined}
                        title={ent.dominant_label}
                      >
                        {ent.dominant_label}
                      </span>
                    )}
                  </div>
                  <div className={s.itemMeta}>
                    {/* dominant_label 있으면 phi/motor 중복 표시 안 함 */}
                    {!ent?.dominant_label && ent?.phi && <span className={s.itemPhi}>Φ{ent.phi}</span>}
                    {!ent?.dominant_label && ent?.motor_type && <span className={s.itemMotor}>{ent.motor_type}</span>}
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
