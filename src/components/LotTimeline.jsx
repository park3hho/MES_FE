import { useState, useEffect, useRef } from 'react'

const STATUS_LABEL = {
  in_stock: '재고',
  consumed: '진행됨',
  shipped: '출하',
  discarded: '폐기',
  repair: '수리중',
}

const STATUS_COLOR = {
  in_stock: '#1a9e75',
  consumed: '#8a93a8',
  shipped: '#1a2f6e',
  discarded: '#c0392b',
  repair: '#1565c0',
}

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
        const statusColor = STATUS_COLOR[item.status] || '#8a93a8'
        const visible = idx < visibleCount

        return (
          <div key={`${item.process}-${idx}`} style={{
            display: 'flex', gap: 10, minHeight: 50,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(16px)',
            transition: `opacity 0.4s ease, transform 0.4s ease`,
          }}>
            {/* dot + line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                background: isSearched ? '#F99535' : 'transparent',
                border: isSearched ? '2px solid #F99535' : '2px solid #d0d4e0',
                boxShadow: isSearched ? '0 0 0 3px rgba(249,149,53,0.15)' : 'none',
                transform: visible ? 'scale(1)' : 'scale(0)',
                transition: `transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)`,
              }} />
              {!isLast && (
                <div style={{
                  width: 2, flex: 1, marginTop: 3,
                  background: isSearched ? 'linear-gradient(to bottom, #F99535, #e0e4ef)' : '#e0e4ef',
                  transformOrigin: 'top',
                  transform: visible ? 'scaleY(1)' : 'scaleY(0)',
                  transition: `transform 0.3s ease 0.15s`,
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
                  {STATUS_LABEL[item.status] || item.status || '-'}
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
            </div>
          </div>
        )
      })}
    </div>
  )
}