// components/TracePage/TraceEntityView.jsx
// 단일 LOT 엔티티 뷰 — 공정별 특화 섹션 + upstream/contains/from_lots 네비 (2026-04-24)
// TracePage 에서 currentLot 바뀔 때마다 rerender

import { motion, AnimatePresence } from 'framer-motion'
import InspectionGrid from './InspectionGrid'
import ContainsList, { ModelBreakdownChips } from './ContainsList'
import s from './TraceEntityView.module.css'

// 공정 한글 라벨 — processConst 에 의존 않도록 인라인
const PROC_LABEL = {
  RM: '원자재', MP: '자재준비', EA: '낱장가공', HT: '열처리',
  BO: '본딩', EC: '전착도장', WI: '권선', SO: '중성점',
  OQ: '출하검사', FP: '완제품', UB: '소포장', MB: '대포장', OB: '출하',
}

// 공정 컬러 토큰 (간단 매핑)
const PROC_COLOR = {
  SO: 'var(--color-primary)',
  FP: 'var(--color-success, #27ae60)',
  UB: '#3498db',
  MB: '#9b59b6',
  OB: '#e67e22',
}

const STATUS_LABEL = {
  // 재고 상태
  in_stock: '재고',
  in_inspection: '검사 중',
  consumed: '소진',
  repair: '수리',
  discarded: '폐기',
  shipped: '출하',
  // OQ 엔티티의 status = judgment 값 (2026-04-24)
  OK: '합격',
  FAIL: '불합격',
  PENDING: '대기',
  RECHECK: '재검사',
  PROBE: '조사',
}

const fmtTime = (iso) => {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return iso }
}

// 공정 배지
function ProcBadge({ process, size = 'md' }) {
  const color = PROC_COLOR[process] || 'var(--color-gray)'
  return (
    <span
      className={`${s.procBadge} ${size === 'sm' ? s.procBadgeSm : ''}`}
      style={{ background: color }}
    >
      {process}
    </span>
  )
}

// 상태 chip
function StatusChip({ status }) {
  if (!status) return <span className={s.statusChip}>-</span>
  const label = STATUS_LABEL[status] || status
  return (
    <span className={`${s.statusChip} ${s['status_' + status] || ''}`}>
      {label}
    </span>
  )
}

// 공정 체인 bar — upstream/downstream 공통
function ChainBar({ title, chain, onNavigate }) {
  if (!chain?.length) return null
  return (
    <div className={s.chainBar}>
      <span className={s.chainTitle}>{title}</span>
      <div className={s.chainChips}>
        {chain.map((item) => (
          <button
            key={`${item.process}-${item.lot_no}`}
            type="button"
            className={s.chainChip}
            onClick={() => onNavigate(item.lot_no)}
            title={item.lot_no}
          >
            <ProcBadge process={item.process} size="sm" />
            <span className={s.chainLotNo}>{item.lot_no}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// from_lots 섹션 — 재료 체인 (snbt 추적)
function FromLotsSection({ fromLots, entities, onNavigate }) {
  const entries = Object.entries(fromLots || {}).filter(([_, v]) => v)
  if (entries.length === 0) return null
  return (
    <div className={s.section}>
      <h3 className={s.sectionTitle}>재료 체인</h3>
      <div className={s.fromGrid}>
        {entries.map(([key, lot]) => {
          const proc = key.replace('lot_', '').replace('_no', '').toUpperCase()
          const clickable = !!entities?.[lot]
          return (
            <button
              key={key}
              type="button"
              className={`${s.fromItem} ${clickable ? s.fromItemClickable : ''}`}
              onClick={() => clickable && onNavigate(lot)}
              disabled={!clickable}
            >
              <ProcBadge process={proc} size="sm" />
              <span className={s.fromLotNo}>{lot}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function TraceEntityView({
  entity, entities, upstreamChain, downstreamChain, scannedLot, onNavigate,
}) {
  const isScanned = entity.lot_no === scannedLot
  const isBox = ['UB', 'MB', 'OB'].includes(entity.process)
  // OQ 엔티티도 inspection 표시 (2026-04-24) — OQ 는 검사 자체라 inspection 필수
  const showInspection = ['SO', 'FP', 'OQ'].includes(entity.process) && entity.inspection != null
  const label = PROC_LABEL[entity.process] || entity.process

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={entity.lot_no}
        className={s.entityView}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* 상위 공정 네비 */}
        <ChainBar title="상위 공정" chain={upstreamChain} onNavigate={onNavigate} />

        {/* 메인 엔티티 카드 */}
        <div className={s.mainCard}>
          <div className={s.mainHeader}>
            <ProcBadge process={entity.process} />
            <div className={s.mainTitle}>
              <div className={s.mainLot}>{entity.lot_no}</div>
              <div className={s.mainSub}>
                {label}
                {isScanned && <span className={s.scannedTag}>조회 LOT</span>}
              </div>
            </div>
            <StatusChip status={entity.status} />
          </div>

          {/* 메타 그리드 */}
          <div className={s.metaGrid}>
            {entity.phi && (
              <div className={s.metaItem}>
                <span className={s.metaKey}>Φ</span>
                <span className={s.metaVal}>{entity.phi}</span>
              </div>
            )}
            {entity.motor_type && (
              <div className={s.metaItem}>
                <span className={s.metaKey}>Motor</span>
                <span className={s.metaVal}>{entity.motor_type}</span>
              </div>
            )}
            {entity.wire_type && (
              <div className={s.metaItem}>
                <span className={s.metaKey}>Wire</span>
                <span className={s.metaVal}>{entity.wire_type}</span>
              </div>
            )}
            {entity.quantity != null && entity.quantity > 0 && (
              <div className={s.metaItem}>
                <span className={s.metaKey}>수량</span>
                <span className={s.metaVal}>{entity.quantity}</span>
              </div>
            )}
            {entity.created_at && (
              <div className={s.metaItem}>
                <span className={s.metaKey}>생성</span>
                <span className={s.metaVal}>{fmtTime(entity.created_at)}</span>
              </div>
            )}
            {/* LotXX meta (worker/vendor/shape/...) */}
            {Object.entries(entity.meta || {}).map(([k, v]) => (
              v && (
                <div key={k} className={s.metaItem}>
                  <span className={s.metaKey}>{k}</span>
                  <span className={s.metaVal}>{v}</span>
                </div>
              )
            ))}
          </div>

          {/* 박스 자체 모델 분포 chip — UB/MB/OB 헤더 영역에 배치 (2026-04-27 v5) */}
          {isBox && <ModelBreakdownChips modelBreakdown={entity.model_breakdown} />}

          {/* 수리 이력 — 원본(repaired_out) / 교체품(repaired_from) 양방향 네비 */}
          {entity.repaired_out && (
            <div className={`${s.repairCard} ${s.repairOrigin}`}>
              <div className={s.repairHeader}>
                <span className={s.repairIcon}>🔧</span>
                <span className={s.repairTitle}>수리 원본</span>
              </div>
              <div className={s.repairBody}>
                {entity.repair_suffix && (
                  <div className={s.repairRow}>
                    <span className={s.repairKey}>문제 공정</span>
                    <span className={s.repairVal}>{entity.repair_suffix}</span>
                  </div>
                )}
                {entity.repair_reason && (
                  <div className={s.repairRow}>
                    <span className={s.repairKey}>사유</span>
                    <span className={s.repairVal}>{entity.repair_reason}</span>
                  </div>
                )}
                {entity.replacement_lot_no ? (
                  <button
                    type="button"
                    className={s.repairLinkBtn}
                    onClick={() => onNavigate(entity.replacement_lot_no)}
                    title="교체품 LOT으로 이동 (없으면 재조회)"
                  >
                    교체품 <b>{entity.replacement_lot_no}</b> →
                  </button>
                ) : (
                  <div className={s.repairEmpty}>교체품 정보 없음</div>
                )}
              </div>
            </div>
          )}
          {entity.repaired_from && (
            <div className={`${s.repairCard} ${s.repairReplacement}`}>
              <div className={s.repairHeader}>
                <span className={s.repairIcon}>♻️</span>
                <span className={s.repairTitle}>수리 교체품</span>
              </div>
              <div className={s.repairBody}>
                <div className={s.repairRow}>
                  <span className={s.repairKey}>원본</span>
                  <span className={s.repairVal}>{entity.repaired_from}</span>
                </div>
                {entity.repair_suffix && (
                  <div className={s.repairRow}>
                    <span className={s.repairKey}>문제 공정</span>
                    <span className={s.repairVal}>{entity.repair_suffix}</span>
                  </div>
                )}
                {entity.repair_reason && (
                  <div className={s.repairRow}>
                    <span className={s.repairKey}>사유</span>
                    <span className={s.repairVal}>{entity.repair_reason}</span>
                  </div>
                )}
                <button
                  type="button"
                  className={s.repairLinkBtn}
                  onClick={() => onNavigate(entity.repaired_from)}
                  title="원본 LOT으로 이동 (없으면 재조회)"
                >
                  ← 원본 <b>{entity.repaired_from}</b>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 공정별 특화 섹션 */}
        {showInspection && (
          <InspectionGrid inspection={entity.inspection} />
        )}
        {['SO', 'FP'].includes(entity.process) && !entity.inspection && (
          <div className={s.section}>
            <h3 className={s.sectionTitle}>OQ 검사 결과</h3>
            <p className={s.emptyNote}>
              {entity.process === 'SO' ? '아직 OQ 검사 전입니다.' : '검사 결과 없음'}
            </p>
          </div>
        )}

        {isBox && (
          <ContainsList
            contains={entity.contains}
            entities={entities}
            onNavigate={onNavigate}
            parentProcess={entity.process}
          />
        )}

        {/* 재료 체인 */}
        <FromLotsSection
          fromLots={entity.from_lots}
          entities={entities}
          onNavigate={onNavigate}
        />

        {/* 하위 공정 네비 (박스 공정은 downstream 빈 배열) */}
        <ChainBar
          title="하위 공정 (재료)"
          chain={downstreamChain}
          onNavigate={onNavigate}
        />
      </motion.div>
    </AnimatePresence>
  )
}
