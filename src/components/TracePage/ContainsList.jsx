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
  // model_breakdown 항목 형식: { phi, motor_type, label, color_hex, box_count, st_count }
  const breakdown = (modelBreakdown || []).filter((m) => (m.box_count || 0) > 0)

  return (
    <div className={s.section}>
      <div className={s.sectionHeader}>
        <h3 className={s.sectionTitle}>담긴 내용물</h3>
        <span className={s.countTag}>{items.length}개</span>
      </div>

      {/* 모델별 구성 chip — 박스 단위 카운트 + 그 박스들 안 같은 모델 ST 수 (2026-04-27 A안) */}
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
              title={`${m.label} 박스 ${m.box_count}개 · 제품 ST ${m.st_count}개`}
            >
              <span className={s.modelChipLabel}>{m.label}</span>
              <span className={s.modelChipCount}>{m.box_count}</span>
              {m.st_count > 0 && m.st_count !== m.box_count && (
                <span className={s.modelChipStCount}>·{m.st_count}</span>
              )}
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
                    {/* 박스 안의 model_chips — 혼합 박스면 모델별 다중 chip (2026-04-27 A안) */}
                    {(ent?.model_chips || []).filter((c) => c.count > 0).map((c, ci) => (
                      <span
                        key={`${c.phi}-${c.motor_type}-${ci}`}
                        className={s.itemModelChip}
                        style={c.color_hex ? {
                          background: c.color_hex,
                          borderColor: c.color_hex,
                        } : undefined}
                        title={`${c.label} ${c.count}개`}
                      >
                        <span>{c.label}</span>
                        <span className={s.itemModelChipCount}>{c.count}</span>
                      </span>
                    ))}
                  </div>
                  <div className={s.itemMeta}>
                    {/* model_chips 가 있으면 phi/motor meta 는 중복이라 숨김 */}
                    {!(ent?.model_chips?.length) && ent?.phi && <span className={s.itemPhi}>Φ{ent.phi}</span>}
                    {!(ent?.model_chips?.length) && ent?.motor_type && <span className={s.itemMotor}>{ent.motor_type}</span>}
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
