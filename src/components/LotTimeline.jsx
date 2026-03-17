import { useState, useEffect, useRef } from 'react'
import { PROCESS_INPUT } from '@/constants/processConst'


const STATOR_PROCESSES = ['WI', 'SO', 'OQ', 'BX', 'OB']

function getStatusDisplay(isSearched) {
  if (isSearched) return { label: '조회됨', color: '#1a9e75' }
  return { label: '진행됨', color: '#8a93a8' }
}

function getBranchLabel(process) {
  return STATOR_PROCESSES.includes(process) ? '고정자' : '낱장'
}

// ─── 분기 미니 타임라인 ───
function BranchMini({ branch, branchIdx, parentProcess }) {
  const [expanded, setExpanded] = useState(false)
  const itemLabel = getBranchLabel(parentProcess)

  return (
    <div style={{
      marginLeft: 26,
      marginBottom: 2,
      borderLeft: '2px solid transparent',
      borderImage: 'linear-gradient(to bottom, #fcc88a, #f0f2f7) 1',
      overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: 10, color: '#8a93a8',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
          transition: 'transform 0.2s', display: 'inline-block',
        }}>▶</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7585' }}>
          {itemLabel} {branchIdx + 1}
        </span>
        <span style={{ fontSize: 10, color: '#adb4c2' }}>
          {branch.label}
        </span>
        <span style={{ fontSize: 10, color: '#c8cdd8', marginLeft: 'auto' }}>
          {branch.timeline?.length || 0}개 공정
        </span>
      </div>

      {/* 펼침 (슬라이드 애니메이션) */}
      <div style={{
        maxHeight: expanded ? 600 : 0,
        opacity: expanded ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
      }}>
        {branch.timeline && <div style={{ padding: '0 10px 6px 14px' }}>
          {branch.timeline.map((item, idx) => {
            const isLast = idx === branch.timeline.length - 1
            const { label: statusLabel, color: statusColor } = getStatusDisplay(false)

            return (
              <div key={`${item.process}-${idx}`}>
                <div style={{ display: 'flex', gap: 8, minHeight: 32 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 10, flexShrink: 0 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', marginTop: 5, background: '#d0d4e0' }} />
                    {!isLast && <div style={{ width: 1, flex: 1, marginTop: 2, background: '#e8ecf2' }} />}
                  </div>
                  <div style={{ flex: 1, paddingBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '0 4px', borderRadius: 2, background: '#f0f2f7', color: '#6b7585' }}>{item.process}</span>
                      <span style={{ fontSize: 10, color: '#8a93a8' }}>{item.label}</span>
                      <span style={{ fontSize: 9, color: statusColor, marginLeft: 'auto' }}>{statusLabel}</span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1a2540' }}>{item.lot_no}</div>
                    {item.branches && item.branches.length > 0 && (
                      <div style={{ marginTop: 3, fontSize: 10, fontWeight: 600, color: '#8a93a8' }}>
                        {item.branch_count}개 {getBranchLabel(item.process)} 투입
                      </div>
                    )}
                  </div>
                </div>
                {/* ★ 2차 분기: 재귀로 BranchMini 렌더링 */}
                {item.branches && item.branches.map((subBranch, sbIdx) => (
                  <BranchMini key={`sub-${item.process}-${sbIdx}`} branch={subBranch} branchIdx={sbIdx} parentProcess={item.process} />
                ))}
              </div>
            )
          })}
        </div>}
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
    setOpenBranches(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  if (!timeline?.length) return null

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
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
            <div style={{
              display: 'flex', gap: 10, minHeight: 50,
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(16px)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                  background: isSearched ? '#F99535' : 'transparent',
                  border: isSearched ? '2px solid #F99535' : '2px solid #d0d4e0',
                  boxShadow: isSearched ? '0 0 0 3px rgba(249,149,53,0.15)' : 'none',
                  transform: visible ? 'scale(1)' : 'scale(0)',
                  transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }} />
                {!isLast && (
                  <div style={{
                    width: 2, flex: 1, marginTop: 3,
                    background: isSearched ? 'linear-gradient(to bottom, #F99535, #e0e4ef)' : '#e0e4ef',
                    transformOrigin: 'top',
                    transform: visible ? 'scaleY(1)' : 'scaleY(0)',
                    transition: 'transform 0.3s ease 0.15s',
                  }} />
                )}
              </div>

              <div style={{ flex: 1, paddingBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                    background: isSearched ? '#F99535' : '#e8eeff',
                    color: isSearched ? '#fff' : '#1a2f6e',
                  }}>{item.process}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7585' }}>{item.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: statusColor, marginLeft: 'auto' }}>{statusLabel}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2540', marginBottom: 1 }}>{item.lot_no}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.quantity != null && PROCESS_INPUT[item.process]?.unit_type !== '중량' && (
                    <span style={{ fontSize: 10, color: '#8a93a8' }}>수량: {item.quantity}</span>
                  )}
                  {item.created_at && (
                    <span style={{ fontSize: 10, color: '#8a93a8' }}>
                      {new Date(item.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {/* ★ 분기 토글 버튼 */}
                {hasBranches && (
                  <div
                    onClick={() => toggleBranch(branchKey)}
                    style={{
                      marginTop: 4, fontSize: 10, fontWeight: 600, color: '#8a93a8',
                      cursor: 'pointer', userSelect: 'none',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <span style={{
                      display: 'inline-block',
                      transform: branchOpen ? 'rotate(90deg)' : 'rotate(0)',
                      transition: 'transform 0.2s',
                      fontSize: 9,
                    }}>▶</span>
                    {item.branch_count}개 {getBranchLabel(item.process)} 투입
                  </div>
                )}
              </div>
            </div>

            {/* ★ 분기 영역: 슬라이드 애니메이션 */}
            {hasBranches && visible && (
              <div style={{
                maxHeight: branchOpen ? 2000 : 0,
                opacity: branchOpen ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
              }}>
                {item.branches.map((branch, bIdx) => (
                  <BranchMini key={`branch-${item.process}-${bIdx}`} branch={branch} branchIdx={bIdx} parentProcess={item.process} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}