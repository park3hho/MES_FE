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

function TimelineItem({ item, isLast, isSearched, visible, hasBranches }) {
  const { label: statusLabel, color: statusColor } = getStatusDisplay(item.status, isSearched)
  const dotColor = isSearched ? '#F99535' : '#d0d4e0'

  return (
    <div style={{
      display: 'flex', gap: 10, minHeight: hasBranches ? 30 : 50,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity 0.4s ease, transform 0.4s ease',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 4,
          background: isSearched ? '#F99535' : 'transparent',
          border: isSearched ? '2px solid #F99535' : `2px solid ${dotColor}`,
          boxShadow: isSearched ? '0 0 0 3px rgba(249,149,53,0.15)' : 'none',
          transform: visible ? 'scale(1)' : 'scale(0)',
          transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }} />
        {(!isLast || hasBranches) && (
          <div style={{
            width: 2, flex: 1, marginTop: 3,
            background: isSearched ? 'linear-gradient(to bottom, #F99535, #e0e4ef)' : '#e0e4ef',
            transformOrigin: 'top',
            transform: visible ? 'scaleY(1)' : 'scaleY(0)',
            transition: 'transform 0.4s ease',
          }} />
        )}
      </div>

      <div style={{ flex: 1, paddingBottom: isLast && !hasBranches ? 0 : 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#1a2f6e',
            background: '#f0f3fb', padding: '1px 6px', borderRadius: 4,
          }}>{item.process}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1a2540' }}>{item.label}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, color: statusColor,
            marginLeft: 'auto',
          }}>{statusLabel}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2540', marginTop: 2 }}>
          {item.lot_no}
        </div>
        {item.created_at && (
          <div style={{ fontSize: 11, color: '#adb4c2', marginTop: 1 }}>
            {formatTime(item.created_at)}
          </div>
        )}
      </div>
    </div>
  )
}

function BranchTree({ branches, visible }) {
  if (!branches || branches.length === 0) return null

  return (
    <div style={{
      marginLeft: 8, paddingLeft: 14,
      borderLeft: '2px solid #e0e4ef',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.4s ease',
    }}>
      {branches.map((branch, bIdx) => (
        <div key={bIdx} style={{ marginBottom: bIdx < branches.length - 1 ? 8 : 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: 4, marginLeft: -16,
          }}>
            <div style={{ width: 14, height: 2, background: '#e0e4ef' }} />
            <span style={{ fontSize: 10, color: '#8a93a8', fontWeight: 600 }}>
              재료 {bIdx + 1}
            </span>
          </div>
          <TimelineTree timeline={branch} searchedLotNo={null} animated={false} nested={true} />
        </div>
      ))}
    </div>
  )
}

function TimelineTree({ timeline, searchedLotNo, animated = true, nested = false }) {
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
        const visible = idx < visibleCount
        const hasBranches = item.branches && item.branches.length > 0

        return (
          <div key={`${item.process}-${idx}`}>
            <TimelineItem
              item={item}
              isLast={isLast && !hasBranches}
              isSearched={isSearched}
              visible={visible}
              hasBranches={hasBranches}
            />
            {hasBranches && (
              <BranchTree branches={item.branches} visible={visible} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function LotTimeline({ timeline, searchedLotNo, animated = true }) {
  return (
    <TimelineTree
      timeline={timeline}
      searchedLotNo={searchedLotNo}
      animated={animated}
    />
  )
}