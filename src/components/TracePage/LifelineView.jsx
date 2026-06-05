// components/TracePage/LifelineView.jsx
// 세로 생애 타임라인 — RM→OB 전체를 한 화면에 (2026-06-05)
//
// 구조:
//   entities (flat dict) 를 PROCESS_ORDER 순 + 시간순 정렬해 세로 줄기로 렌더.
//   스캔 LOT 하이라이트, 노드 클릭 시 인라인 아코디언 상세 펼침.
//   repair_siblings 로 재공정 점프(꺾인 화살표 + 사유) 연결.
//
// props:
//   entities          : { lot_no: entity }  — BE trace_lot 응답
//   scannedLot        : string              — 조회한 LOT
//   scannedProcess    : string              — 조회한 LOT 의 공정
//   repairSiblings    : [{ origin_lot, siblings: [...] }]  — repair_chain_origin 형제
//   chainRepairSummary: [{ origin_lot_no, replacement_lot_no, ... }]
//   inspections       : [...]               — OQ 검사 배열
//   onNavigate(lotNo) : 교체품/원본 클릭 시 새 trace 로 재조회

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import InspectionGrid from './InspectionGrid'
import { ModelBreakdownChips } from './ContainsList'
import s from './LifelineView.module.css'

const PROCESS_ORDER = ['RM', 'MP', 'EA', 'HT', 'BO', 'EC', 'WI', 'SO', 'OQ', 'FP', 'UB', 'MB', 'OB']

const PROC_LABEL = {
  RM: '원자재', MP: '자재준비', EA: '낱장가공', HT: '열처리',
  BO: '본딩', EC: '전착도장', WI: '권선', SO: '중성점',
  OQ: '출하검사', FP: '완제품', UB: '소포장', MB: '대포장', OB: '출하',
}

const STATUS_LABEL = {
  in_stock: '재고', in_inspection: '검사중', consumed: '소진',
  repair: '수리', discarded: '폐기', shipped: '출하',
  OK: '합격', FAIL: '불합격', PENDING: '대기', RECHECK: '재검사', PROBE: '조사',
}

const fmtTime = (iso) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return '' }
}

// entities → 공정순 + 시간순 정렬된 노드 배열
function buildLifeline(entities, scannedLot) {
  const arr = Object.values(entities || {}).filter((e) => e && e.lot_no)
  arr.sort((a, b) => {
    const ai = PROCESS_ORDER.indexOf(a.process)
    const bi = PROCESS_ORDER.indexOf(b.process)
    if (ai !== bi) return ai - bi
    return (a.created_at || '').localeCompare(b.created_at || '')
  })
  return arr
}

// 재공정 summary 에서 원본→교체품 점프 정보 빌드
function buildRepairJumps(chainRepairSummary) {
  const jumps = {}
  for (const r of (chainRepairSummary || [])) {
    if (r.origin_lot_no) {
      jumps[r.origin_lot_no] = {
        replacement: r.replacement_lot_no || '',
        reason: r.repair_reason || '',
        category: r.repair_category || '',
        problemProcess: r.problem_process || '',
      }
    }
  }
  return jumps
}


export default function LifelineView({
  entities, scannedLot, scannedProcess,
  repairSiblings, chainRepairSummary, inspections,
  onNavigate,
}) {
  const [openNodes, setOpenNodes] = useState(() => new Set([scannedLot]))

  const nodes = useMemo(() => buildLifeline(entities, scannedLot), [entities, scannedLot])
  const repairJumps = useMemo(() => buildRepairJumps(chainRepairSummary), [chainRepairSummary])

  const toggle = (lotNo) => {
    setOpenNodes((prev) => {
      const next = new Set(prev)
      if (next.has(lotNo)) next.delete(lotNo)
      else next.add(lotNo)
      return next
    })
  }

  return (
    <div className={s.wrap}>
      <div className={s.lifeline}>
        {nodes.map((ent) => {
          const isScanned = ent.lot_no === scannedLot
          const isOpen = openNodes.has(ent.lot_no)
          const isRepair = ent.repaired_out || !!ent.repaired_from
          const isForward = ent.forward_only
          const jump = repairJumps[ent.lot_no]
          const proc = ent.process || ''
          const showInspection = ['SO', 'FP', 'OQ'].includes(proc) && ent.inspection

          return (
            <div key={ent.lot_no}>
              <div className={`${s.node} ${isScanned ? s.scanned : ''} ${isRepair ? s.repairNode : ''} ${isForward ? s.forwardNode : ''}`}>
                <span className={s.dot} />

                {/* 헤더 — 클릭으로 아코디언 */}
                <div className={s.header} onClick={() => toggle(ent.lot_no)}>
                  <span className={`${s.procBadge} ${s['proc_' + proc]}`}>{proc}</span>
                  <span className={s.lotNo}>{ent.lot_no}</span>
                  {isScanned && <span className={s.scannedTag}>조회</span>}
                  {ent.status && (
                    <span className={`${s.statusChip} ${s['status_' + ent.status] || ''}`}>
                      {STATUS_LABEL[ent.status] || ent.status}
                    </span>
                  )}
                  {ent.created_at && <span className={s.timestamp}>{fmtTime(ent.created_at)}</span>}
                  <span className={`${s.chevron} ${isOpen ? s.chevronOpen : ''}`}>▶</span>
                </div>

                {/* 아코디언 상세 */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      className={s.detail}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      {/* 메타 그리드 */}
                      <div className={s.metaGrid}>
                        {ent.phi && <MetaItem k="Φ" v={ent.phi} />}
                        {ent.motor_type && <MetaItem k="Motor" v={ent.motor_type} />}
                        {ent.quantity > 0 && <MetaItem k="수량" v={ent.quantity} />}
                        {ent.serial_no && <MetaItem k="ST" v={ent.serial_no} />}
                        {Object.entries(ent.meta || {}).map(([mk, mv]) =>
                          mv ? <MetaItem key={mk} k={mk} v={mv} /> : null
                        )}
                      </div>

                      {/* 박스 모델 분포 */}
                      {['UB', 'MB', 'OB'].includes(proc) && !isForward && (
                        <ModelBreakdownChips modelBreakdown={ent.model_breakdown} />
                      )}

                      {/* 박스 contains */}
                      {(ent.contains || []).length > 0 && (
                        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-sub)' }}>
                          내용물: {ent.contains.length}개
                          {' — '}
                          {ent.contains.slice(0, 5).join(', ')}
                          {ent.contains.length > 5 && ` 외 ${ent.contains.length - 5}개`}
                        </div>
                      )}

                      {/* 검사 그리드 */}
                      {showInspection && <InspectionGrid inspection={ent.inspection} />}

                      {/* 수리 원본/교체품 네비 */}
                      {ent.repaired_from && (
                        <div style={{ marginTop: 8, fontSize: 11.5 }}>
                          <span style={{ color: 'var(--color-text-muted)' }}>수리 교체품 ← 원본: </span>
                          <button className={s.repairJumpBtn} onClick={() => onNavigate?.(ent.repaired_from)}>
                            {ent.repaired_from} →
                          </button>
                          {ent.repair_reason && (
                            <span style={{ marginLeft: 8, color: 'var(--color-warning-dark, #7c2d12)' }}>
                              사유: {ent.repair_reason}
                            </span>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 재공정 점프 — 원본 노드 바로 아래 */}
              {jump && jump.replacement && (
                <div className={s.repairJump}>
                  <span className={s.repairIcon}>🔧</span>
                  <span className={s.repairJumpText}>
                    되돌리기 → <b>{jump.replacement}</b>
                    {jump.reason && ` (${jump.reason})`}
                    {jump.problemProcess && ` [${jump.problemProcess}]`}
                  </span>
                  <button className={s.repairJumpBtn} onClick={() => onNavigate?.(jump.replacement)}>
                    이동
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


function MetaItem({ k, v }) {
  return (
    <div className={s.metaItem}>
      <span className={s.metaKey}>{k}</span>
      <span className={s.metaVal}>{String(v)}</span>
    </div>
  )
}
