// ══════════════════════════════════════════════════════════════
// SkeletonLotTimeline — LotTimeline 로딩 상태 (FE_CONSTITUTION §XII)
// ══════════════════════════════════════════════════════════════

import s from './LotTimeline.module.css'

export default function SkeletonLotTimeline() {
  // 12개 공정 (RM~OB) 모양의 스켈레톤 표시
  const skeletonCount = 12

  return (
    <div className={s.container}>
      {Array.from({ length: skeletonCount }).map((_, idx) => (
        <div key={idx}>
          <div className={s.item} style={{ opacity: 0.6 }}>
            <div className={s.dotCol}>
              <div className="skeleton" style={{ width: 12, height: 12, borderRadius: '50%' }} />
              {idx < skeletonCount - 1 && (
                <div className="skeleton" style={{ width: 2, height: 40, margin: '8px 5px' }} />
              )}
            </div>

            <div className={s.itemBody}>
              {/* 공정 배지 + 라벨 + 상태 */}
              <div className={s.itemHead} style={{ gap: 8 }}>
                <div className="skeleton" style={{ width: 50, height: 24, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: 80, height: 14 }} />
                <div className="skeleton" style={{ width: 60, height: 14, marginLeft: 'auto' }} />
              </div>

              {/* LOT 번호 */}
              <div className="skeleton skeleton-text-lg" style={{ width: '60%', marginTop: 8 }} />

              {/* 메타 정보 (수량, 시간 등) */}
              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                <div className="skeleton" style={{ width: 70, height: 12 }} />
                <div className="skeleton" style={{ width: 80, height: 12 }} />
                <div className="skeleton" style={{ width: 90, height: 12 }} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
