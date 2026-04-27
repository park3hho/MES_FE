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

// breakdown 항목의 의미 있는 카운트 부분만 추려 chip 숫자열 만들기
// mb_count > 0  →  "MB N · UB M · ST K"  (OB 화면)
// ub_count > 0  →  "UB M · ST K"          (MB 화면)
// 그 외           →  "ST K"                (UB 화면)
function formatChipCounts(m) {
  const parts = []
  if ((m.mb_count || 0) > 0) parts.push(`MB ${m.mb_count}`)
  if ((m.ub_count || 0) > 0) parts.push(`UB ${m.ub_count}`)
  if ((m.st_count || 0) > 0) parts.push(`ST ${m.st_count}`)
  return parts.join(' · ')
}

export default function ContainsList({ contains, entities, modelBreakdown, onNavigate }) {
  const items = contains || []
  // model_breakdown 항목 형식 (통일):
  //   { phi, motor_type, label, color_hex, mb_count, ub_count, st_count }
  // 박스 종류에 따라 0 인 카운트는 자동 생략됨
  const breakdown = (modelBreakdown || []).filter(
    (m) => (m.mb_count || 0) + (m.ub_count || 0) + (m.st_count || 0) > 0
  )

  return (
    <div className={s.section}>
      <div className={s.sectionHeader}>
        <h3 className={s.sectionTitle}>담긴 내용물</h3>
        <span className={s.countTag}>{items.length}개</span>
      </div>

      {/* 모델별 구성 chip — UB 단위 통일 + 의미 있는 카운트만 자동 표시 (2026-04-27 v4) */}
      {breakdown.length > 0 && (
        <div className={s.modelChips}>
          {breakdown.map((m, idx) => (
            <span
              key={`${m.phi}-${m.motor_type}-${idx}`}
              className={s.modelChip}
              style={m.color_hex ? {
                background: m.color_hex,
                borderColor: m.color_hex,
              } : undefined}
              title={`${m.label} — ${formatChipCounts(m)}`}
            >
              <span className={s.modelChipLabel}>{m.label}</span>
              <span className={s.modelChipCount}>{formatChipCounts(m)}</span>
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
                    {/* 자식 박스의 model_breakdown 그대로 chip 렌더 — UB는 단일, MB는 다중 (2026-04-27 v4) */}
                    {(ent?.model_breakdown || [])
                      .filter((c) => (c.mb_count || 0) + (c.ub_count || 0) + (c.st_count || 0) > 0)
                      .map((c, ci) => (
                        <span
                          key={`${c.phi}-${c.motor_type}-${ci}`}
                          className={s.itemModelChip}
                          style={c.color_hex ? {
                            background: c.color_hex,
                            borderColor: c.color_hex,
                          } : undefined}
                          title={`${c.label} — ${formatChipCounts(c)}`}
                        >
                          <span>{c.label}</span>
                          <span className={s.itemModelChipCount}>{formatChipCounts(c)}</span>
                        </span>
                      ))}
                  </div>
                  <div className={s.itemMeta}>
                    {/* model_breakdown 이 있으면 phi/motor meta 는 중복이라 숨김 */}
                    {!(ent?.model_breakdown?.length) && ent?.phi && <span className={s.itemPhi}>Φ{ent.phi}</span>}
                    {!(ent?.model_breakdown?.length) && ent?.motor_type && <span className={s.itemMotor}>{ent.motor_type}</span>}
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
