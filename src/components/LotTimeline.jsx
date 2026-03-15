import { useState, useEffect, useRef } from 'react'

const STATUS_LABEL = {
  consumed: '진행됨',
  shipped: '출하',
  discarded: '폐기',
  repair: '수리중',
}

const STATUS_COLOR = {
  in_stock: '#1a9e75',
  in_stock_prev: '#F99535',
  consumed: '#8a93a8',
  shipped: '#1a2f6e',
  discarded: '#c0392b',
  repair: '#1565c0',
}

function getStatusDisplay(status, isSearched) {
  if (isSearched) {
    return { label: '재고', color: '#1a9e75' }
  }
  if (status === 'discarded') return { label: '폐기', color: '#c0392b' }
  if (status === 'repair') return { label: '수리중', color: '#1565c0' }
  return { label: '진행됨', color: '#8a93a8' }
}

// ─── 분기(Branch) 미니 타임라인 ───
function BranchMini({ branch, branchIdx }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      marginLeft: 26,
      marginBottom: 6,
      borderLeft: '2px solid #F99535',
      borderRadius: '0 8px 8px 0',
      background: 'rgba(249,149,53,0.04)',
      overflow: 'hidden',
    }}>
      {/* 분기 헤더 (클릭으로 펼치기/접기) */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#F99535',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
          transition: 'transform 0.2s ease',
          display: 'inline-block',
        }}>▶</span>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#F99535',
        }}>
          재료 {branchIdx + 1}
        </span>
        <span style={{
          fontSize: 10,
          color: '#8a93a8',
        }}>
          {branch.label}
        </span>
        <span style={{
          fontSize: 10,
          color: '#b0b4c0',
          marginLeft: 'auto',
        }}>
          {branch.timeline?.length || 0}개 공정
        </span>
      </div>

      {/* 분기 타임라인 (펼쳤을 때) */}
      {expanded && branch.timeline && (
        <div style={{ padding: '0 10px 8px 14px' }}>
          {branch.timeline.map((item, idx) => {
            const isLast = idx === branch.timeline.length - 1
            const { label: statusLabel, color: statusColor } = getStatusDisplay(item.status, false)

            return (
              <div key={`${item.process}-${idx}`} style={{
                display: 'flex',
                gap: 8,
                minHeight: 36,
              }}>
                {/* 작은 dot + line */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: 12,
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    marginTop: 5,
                    background: '#F99535',
                    opacity: 0.6,
                  }} />
                  {!isLast && (
                    <div style={{
                      width: 1,
                      flex: 1,
                      marginTop: 2,
                      background: '#e0e4ef',
                    }} />
                  )}
                </div>

                {/* 정보 */}
                <div style={{ flex: 1, paddingBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '0 4px',
                      borderRadius: 2,
                      background: '#e8eeff',
                      color: '#1a2f6e',
                    }}>{item.process}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7585' }}>{item.label}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: statusColor, marginLeft: 'auto' }}>
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1a2540' }}>{item.lot_no}</div>
                  {item.quantity != null && (
                    <span style={{ fontSize: 9, color: '#8a93a8' }}>수량: {item.quantity}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 메인 타임라인 ───
export default function LotTimeline({ timeline, searchedLotNo, animated = true }) {
  const [visibleCount, setVisibleCount] = useState(animated ? 0 : timeline.length)
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

  if (!timeline?.length) return null

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      {timeline.map((item, idx) => {
        const isLast = idx === timeline.length - 1
        const isSearched = item.lot_no === searchedLotNo
        const { label: statusLabel, color: statusColor } = getStatusDisplay(item.status, isSearched)
        const visible = idx < visibleCount
        const hasBranches = item.branches && item.branches.length > 0

        return (
          <div key={`${item.process}-${idx}`}>
            {/* 메인 노드 */}
            <div style={{
              display: 'flex', gap: 10, minHeight: 50,
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(16px)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}>
              {/* dot + line */}
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

              {/* info */}
              <div style={{ flex: 1, paddingBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                    background: isSearched ? '#F99535' : '#e8eeff',
                    color: isSearched ? '#fff' : '#1a2f6e',
                  }}>{item.process}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7585' }}>{item.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: statusColor, marginLeft: 'auto' }}>
                    {statusLabel}
                  </span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2540', marginBottom: 1 }}>{item.lot_no}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.quantity != null && <span style={{ fontSize: 10, color: '#8a93a8' }}>수량: {item.quantity}</span>}
                  {item.created_at && (
                    <span style={{ fontSize: 10, color: '#8a93a8' }}>
                      {new Date(item.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {/* ★ 분기 라벨 */}
                {hasBranches && (
                  <div style={{
                    marginTop: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#F99535',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    <span style={{
                      display: 'inline-block',
                      width: 14, height: 14,
                      borderRadius: '50%',
                      background: '#F99535',
                      color: '#fff',
                      fontSize: 9,
                      fontWeight: 700,
                      textAlign: 'center',
                      lineHeight: '14px',
                    }}>{item.branch_count}</span>
                    개 재료 투입
                  </div>
                )}
              </div>
            </div>

            {/* ★ 분기 미니 타임라인들 */}
            {hasBranches && visible && item.branches.map((branch, bIdx) => (
              <BranchMini
                key={`branch-${item.process}-${bIdx}`}
                branch={branch}
                branchIdx={bIdx}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}