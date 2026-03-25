import { useState, useEffect, useRef } from 'react'
import { PROCESS_INPUT } from '@/constants/processConst'
import s from './LotTimeline.module.css'

const BRANCH_LABEL_MAP = {
  BO: '낱장',
  UB: '고정자',
  MB: '박스',
  OB: '박스',
}

function getStatusDisplay(isSearched) {
  if (isSearched) return { label: '조회됨', color: '#1a9e75' }
  return { label: '진행됨', color: '#8a93a8' }
}

function getBranchLabel(process) {
  return BRANCH_LABEL_MAP[process] || '항목'
}

// ─── 분기 미니 타임라인 ───
function BranchMini({ branch, branchIdx, parentProcess }) {
  const [expanded, setExpanded] = useState(false)
  const itemLabel = getBranchLabel(parentProcess)

  return (
    <div className={s.branchMini}>
      <div className={s.branchHeader} onClick={() => setExpanded(!expanded)}>
        {/* 화살표 — 회전값은 동적 */}
        <span className={s.arrow} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0)' }}>
          ▶
        </span>
        <span className={s.branchTitle}>
          {itemLabel} {branchIdx + 1}
        </span>
        <span className={s.branchLabel}>{branch.label}</span>
        <span className={s.branchCount}>{branch.timeline?.length || 0}개 공정</span>
      </div>

      {/* 펼침 — maxHeight/opacity는 동적 */}
      <div
        className={s.branchContent}
        style={{
          maxHeight: expanded ? 400 : 0,
          overflowY: expanded ? 'auto' : 'hidden',
          opacity: expanded ? 1 : 0,
        }}
      >
        {branch.timeline && (
          <div className={s.branchInner}>
            {branch.timeline.map((item, idx) => {
              const isLast = idx === branch.timeline.length - 1
              const { label: statusLabel, color: statusColor } = getStatusDisplay(false)

              return (
                <div key={`${item.process}-${idx}`}>
                  <div className={s.subItem}>
                    <div className={s.subDotCol}>
                      <div className={s.subDot} />
                      {!isLast && <div className={s.subLine} />}
                    </div>
                    <div className={s.subBody}>
                      <div className={s.subHead}>
                        <span className={s.subBadge}>{item.process}</span>
                        <span className={s.subLabel}>{item.label}</span>
                        <span className={s.subStatus} style={{ color: statusColor }}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className={s.subLotNo}>{item.lot_no}</div>
                      {/* ★ ST 시리얼 번호 (OQ 노드일 때만 존재) */}
                      {item.serial_no && <div className={s.subBranchInfo}>{item.serial_no}</div>}
                      {item.branches && item.branches.length > 0 && (
                        <div className={s.subBranchInfo}>
                          {item.branch_count}개 {getBranchLabel(item.process)} 투입
                        </div>
                      )}
                    </div>
                  </div>
                  {/* 2차 분기: 재귀 렌더링 */}
                  {item.branches &&
                    item.branches.map((subBranch, sbIdx) => (
                      <BranchMini
                        key={`sub-${item.process}-${sbIdx}`}
                        branch={subBranch}
                        branchIdx={sbIdx}
                        parentProcess={item.process}
                      />
                    ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 메인 타임라인 ───
export default function LotTimeline({ timeline, searchedLotNo, animated = true }) {
  const [visibleCount, setVisibleCount] = useState(animated ? 0 : timeline.length)
  const [openBranches, setOpenBranches] = useState(new Set())
  const timerRef = useRef(null)

  useEffect(() => {
    if (!animated || !timeline?.length) return
    setVisibleCount(0)
    let count = 0
    timerRef.current = setInterval(() => {
      count++
      setVisibleCount(count)
      if (count >= timeline.length) clearInterval(timerRef.current)
    }, 250)
    return () => clearInterval(timerRef.current)
  }, [timeline, animated])

  const toggleBranch = (key) => {
    setOpenBranches((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  if (!timeline?.length) return null

  return (
    <div className={s.container}>
      {timeline.map((item, idx) => {
        const isLast = idx === timeline.length - 1
        const isSearched = item.lot_no === searchedLotNo
        const { label: statusLabel, color: statusColor } = getStatusDisplay(isSearched)
        const visible = idx < visibleCount
        const hasBranches = item.branches && item.branches.length > 0
        const branchKey = `${item.process}-${idx}`
        const branchOpen = openBranches.has(branchKey)

        return (
          <div key={branchKey}>
            {/* 아이템 행 — opacity/transform은 애니메이션용 동적값 */}
            <div
              className={s.item}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(16px)',
              }}
            >
              <div className={s.dotCol}>
                {/* 도트 — isSearched 조건부 색상/그림자/크기 */}
                <div
                  className={s.dot}
                  style={{
                    background: isSearched ? '#F99535' : 'transparent',
                    border: isSearched ? '2px solid #F99535' : '2px solid #d0d4e0',
                    boxShadow: isSearched ? '0 0 0 3px rgba(249,149,53,0.15)' : 'none',
                    transform: visible ? 'scale(1)' : 'scale(0)',
                  }}
                />
                {!isLast && (
                  <div
                    className={s.line}
                    style={{
                      background: isSearched
                        ? 'linear-gradient(to bottom, #F99535, #e0e4ef)'
                        : '#e0e4ef',
                      transform: visible ? 'scaleY(1)' : 'scaleY(0)',
                    }}
                  />
                )}
              </div>

              <div className={s.itemBody}>
                <div className={s.itemHead}>
                  {/* 공정 배지 — isSearched 조건부 색상 */}
                  <span
                    className={s.processBadge}
                    style={{
                      background: isSearched ? '#F99535' : '#e8eeff',
                      color: isSearched ? '#fff' : '#1a2f6e',
                    }}
                  >
                    {item.process}
                  </span>
                  <span className={s.itemLabel}>{item.label}</span>
                  <span className={s.itemStatus} style={{ color: statusColor }}>
                    {statusLabel}
                  </span>
                </div>
                <div className={s.itemLotNo}>{item.lot_no}</div>
                <div className={s.itemMeta}>
                  {item.quantity != null && PROCESS_INPUT[item.process]?.unit_type !== '중량' && (
                    <span className={s.itemMetaText}>수량: {item.quantity}</span>
                  )}
                  {/* ★ ST 시리얼 번호 */}
                  {item.serial_no && <span className={s.itemMetaText}>{item.serial_no}</span>}
                  {item.created_at && (
                    <span className={s.itemMetaText}>
                      {new Date(item.created_at).toLocaleString('ko-KR', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>

                {/* 분기 토글 버튼 */}
                {hasBranches && (
                  <div className={s.branchToggle} onClick={() => toggleBranch(branchKey)}>
                    <span
                      className={s.arrow}
                      style={{ transform: branchOpen ? 'rotate(90deg)' : 'rotate(0)' }}
                    >
                      ▶
                    </span>
                    {item.branch_count}개 {getBranchLabel(item.process)} 투입
                  </div>
                )}
              </div>
            </div>

            {/* 분기 슬라이드 영역 */}
            {hasBranches && visible && (
              <div
                className={s.branchWrap}
                style={{ maxHeight: branchOpen ? 2000 : 0, opacity: branchOpen ? 1 : 0 }}
              >
                {item.branches.map((branch, bIdx) => (
                  <BranchMini
                    key={`branch-${item.process}-${bIdx}`}
                    branch={branch}
                    branchIdx={bIdx}
                    parentProcess={item.process}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
