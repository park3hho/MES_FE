import { useState, useEffect, useRef } from 'react'

function getStatusDisplay(status, isSearched) {
  if (isSearched) return { label: '재고', color: '#1a9e75' }
  if (status === 'discarded') return { label: '폐기', color: '#c0392b' }
  if (status === 'repair') return { label: '수리중', color: '#1565c0' }
  return { label: '진행됨', color: '#8a93a8' }
}

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  })
}

// ── 분기 내부 타임라인 ──
function BranchMini({ nodes, branchIdx, totalBranches }) {
  return (
    <div style={{ display: 'flex', marginBottom: branchIdx < totalBranches - 1 ? 6 : 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0 }}>
        <div style={{ width: 10, height: 1.5, background: '#d0d4e0', marginTop: 8, alignSelf: 'flex-end' }} />
        {branchIdx < totalBranches - 1 && (
          <div style={{ width: 1.5, flex: 1, background: '#e8eaf0', alignSelf: 'flex-start' }} />
        )}
      </div>
      <div style={{ flex: 1, paddingLeft: 6, paddingTop: 2 }}>
        {nodes.map((node, nIdx) => {
          const isFirst = nIdx === 0
          const isLast = nIdx === nodes.length - 1
          return (
            <div key={`${node.process}-${nIdx}`} style={{ display: 'flex', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 10, flexShrink: 0 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: isFirst ? '#F99535' : '#d0d4e0',
                }} />
                {!isLast && <div style={{ width: 1, flex: 1, minHeight: 10, background: '#e0e4ef' }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: isLast ? 4 : 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                    background: '#f0f2f7', color: '#6b7585',
                  }}>{node.process}</span>
                  <span style={{ fontSize: 10, color: '#8a93a8' }}>{node.label}</span>
                  {node.created_at && (
                    <span style={{ fontSize: 9, color: '#b0b4c0', marginLeft: 'auto' }}>{formatTime(node.created_at)}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1a2540' }}>{node.lot_no}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 메인 타임라인 ──
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
          <div key={`${item.process}-${idx}`} style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.4s ease, transform 0.4s ease',
          }}>
            {/* 메인 노드 */}
            <div style={{ display: 'flex', gap: 10, minHeight: 50 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                  background: isSearched ? '#F99535' : 'transparent',
                  border: isSearched ? '2px solid #F99535' : '2px solid #d0d4e0',
                  boxShadow: isSearched ? '0 0 0 3px rgba(249,149,53,0.15)' : 'none',
                  transform: visible ? 'scale(1)' : 'scale(0)',
                  transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }} />
                {!isLast && !hasBranches && (
                  <div style={{
                    width: 2, flex: 1, marginTop: 3,
                    background: isSearched ? 'linear-gradient(to bottom, #F99535, #e0e4ef)' : '#e0e4ef',
                    transformOrigin: 'top',
                    transform: visible ? 'scaleY(1)' : 'scaleY(0)',
                    transition: 'transform 0.3s ease 0.15s',
                  }} />
                )}
              </div>

              <div style={{ flex: 1, paddingBottom: hasBranches ? 4 : 10 }}>
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
                  {item.created_at && <span style={{ fontSize: 10, color: '#8a93a8' }}>{formatTime(item.created_at)}</span>}
                </div>
                {hasBranches && (
                  <div style={{ fontSize: 10, color: '#F99535', fontWeight: 600, marginTop: 4 }}>
                    {item.branches.length}개 재료 투입
                  </div>
                )}
              </div>
            </div>

            {/* 분기 영역 */}
            {hasBranches && (
              <div style={{ marginLeft: 8, paddingLeft: 8, borderLeft: '2px solid #e0e4ef', marginBottom: 8 }}>
                {item.branches.map((branch, bIdx) => (
                  <BranchMini
                    key={bIdx}
                    nodes={branch}
                    branchIdx={bIdx}
                    totalBranches={item.branches.length}
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