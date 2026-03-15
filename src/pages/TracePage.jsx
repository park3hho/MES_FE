import { useState, useEffect, useRef } from 'react'
import { traceLot } from '../api'
import QRScanner from '../components/QRScanner'
import { FaradayLogo } from '../components/FaradayLogo'

const STATUS_LABEL = {
  in_stock: '재고',
  consumed: '진행됨',
  shipped: '출하',
  discarded: '폐기',
}

const STATUS_COLOR = {
  in_stock: '#1a9e75',
  consumed: '#8a93a8',
  shipped: '#1a2f6e',
  discarded: '#c0392b',
}

const DELAY_PER_ITEM = 300

function TimelineItem({ item, idx, isLast, isSearched, visible, totalCount }) {
  const statusColor = STATUS_COLOR[item.status] || '#8a93a8'

  return (
    <div style={{
      ...s.timelineItem,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(20px)',
      transition: `opacity 0.5s ease ${idx * 0.05}s, transform 0.5s ease ${idx * 0.05}s`,
    }}>
      <div style={s.left}>
        {/* dot: 검색된 건 오렌지 채움 + 작은 glow, 나머지는 회색 링 */}
        <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          flexShrink: 0,
          marginTop: 5,
          background: isSearched ? '#F99535' : 'transparent',
          border: isSearched ? '2px solid #F99535' : '2px solid #d0d4e0',
          boxShadow: isSearched ? '0 0 0 4px rgba(249,149,53,0.15)' : 'none',
          transform: visible ? 'scale(1)' : 'scale(0)',
          transition: `transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 0.05}s`,
        }} />
        {/* 세로선: 검색 공정 바로 아래만 오렌지→회색 그라데이션 */}
        {!isLast && (
          <div style={{
            width: 2,
            flex: 1,
            marginTop: 4,
            background: isSearched ? 'linear-gradient(to bottom, #F99535, #e0e4ef)' : '#e0e4ef',
            transformOrigin: 'top',
            transform: visible ? 'scaleY(1)' : 'scaleY(0)',
            transition: `transform 0.4s ease ${idx * 0.05 + 0.2}s`,
          }} />
        )}
      </div>

      <div style={{
        ...s.infoCard,
        borderLeftColor: isSearched ? '#F99535' : '#e0e4ef',
        background: isSearched ? 'rgba(249,149,53,0.05)' : 'transparent',
      }}>
        <div style={s.processRow}>
          <span style={{
            ...s.processKey,
            background: isSearched ? '#F99535' : '#e8eeff',
            color: isSearched ? '#fff' : '#1a2f6e',
          }}>{item.process}</span>
          <span style={s.processLabel}>{item.label}</span>
          <span style={{ ...s.status, color: statusColor }}>
            {STATUS_LABEL[item.status] || item.status || '-'}
          </span>
        </div>
        <div style={s.lotNo}>{item.lot_no}</div>
        <div style={s.detailRow}>
          {item.quantity != null && (
            <span style={s.detail}>수량: {item.quantity}</span>
          )}
          {item.consumed_by && (
            <span style={s.detail}>→ {item.consumed_by}</span>
          )}
          {item.created_at && (
            <span style={s.detail}>
              {new Date(item.created_at).toLocaleString('ko-KR', {
                month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TracePage({ onLogout, onBack }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('qr')
  const [visibleCount, setVisibleCount] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!result?.timeline?.length) return
    setVisibleCount(0)
    let count = 0
    timerRef.current = setInterval(() => {
      count++
      setVisibleCount(count)
      if (count >= result.timeline.length) {
        clearInterval(timerRef.current)
      }
    }, DELAY_PER_ITEM)
    return () => clearInterval(timerRef.current)
  }, [result])

  const handleScan = async (val) => {
    setLoading(true)
    setError(null)
    try {
      const data = await traceLot(val)
      setResult(data)
      setStep('result')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    clearInterval(timerRef.current)
    setResult(null); setError(null); setVisibleCount(0); setStep('qr')
  }

  if (step === 'qr') {
    return (
      <QRScanner
        processLabel="LOT 이력 조회"
        onScan={handleScan}
        onLogout={onLogout}
        onBack={onBack}
      />
    )
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <FaradayLogo size="md" />
          <p style={s.title}>LOT 이력 조회</p>
        </div>

        <div style={{
          ...s.searchedLot,
          opacity: visibleCount > 0 ? 1 : 0,
          transform: visibleCount > 0 ? 'translateY(0)' : 'translateY(-10px)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
        }}>
          <span style={s.searchLabel}>조회</span>
          <span style={s.searchValue}>{result?.lot_no}</span>
          {result?.scanned_process && (
            <span style={s.searchProcess}>{result.scanned_process}</span>
          )}
        </div>

        {result?.timeline?.length > 0 ? (
          <div style={s.timeline}>
            {result.timeline.map((item, idx) => (
              <TimelineItem
                key={`${item.process}-${idx}`}
                item={item}
                idx={idx}
                isLast={idx === result.timeline.length - 1}
                isSearched={item.lot_no === result.lot_no}
                visible={idx < visibleCount}
                totalCount={result.timeline.length}
              />
            ))}
          </div>
        ) : (
          <div style={s.empty}>이력이 없습니다.</div>
        )}

        {error && <div style={s.error}>{error}</div>}

        <div style={{
          ...s.btnRow,
          opacity: visibleCount >= (result?.timeline?.length || 0) ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}>
          <button style={s.primaryBtn} onClick={handleReset}>다시 조회</button>
          <button style={s.textBtn} onClick={onBack ?? onLogout}>
            {onBack ? '이전으로' : '로그아웃'}
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f4f6fb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' },
  card: { background: '#fff', borderRadius: 14, padding: '28px 32px 24px', width: '100%', maxWidth: 520, boxShadow: '0 4px 24px rgba(26,47,110,0.09)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16, gap: 6 },
  title: { fontSize: 15, fontWeight: 700, color: '#1a2540', margin: 0 },

  searchedLot: { width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f0f3fb', borderRadius: 8, marginBottom: 16 },
  searchLabel: { fontSize: 11, fontWeight: 600, color: '#8a93a8' },
  searchValue: { fontSize: 14, fontWeight: 700, color: '#1a2f6e', wordBreak: 'break-all', flex: 1 },
  searchProcess: { fontSize: 11, fontWeight: 700, color: '#fff', background: '#F99535', padding: '2px 8px', borderRadius: 4 },

  timeline: { width: '100%', display: 'flex', flexDirection: 'column', gap: 0 },
  timelineItem: { display: 'flex', gap: 12, minHeight: 60 },

  left: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 },
  dot: { width: 12, height: 12, borderRadius: '50%', flexShrink: 0, marginTop: 4 },
  line: { width: 2, flex: 1, marginTop: 4 },

  infoCard: { flex: 1, borderLeft: '3px solid #e0e4ef', borderRadius: '0 6px 6px 0', paddingLeft: 12, paddingBottom: 16, paddingTop: 2, paddingRight: 8 },
  processRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 },
  processKey: { fontSize: 12, fontWeight: 700, color: '#1a2f6e', background: '#e8eeff', padding: '1px 6px', borderRadius: 4 },
  processLabel: { fontSize: 12, fontWeight: 600, color: '#6b7585' },
  status: { fontSize: 11, fontWeight: 600, marginLeft: 'auto' },
  lotNo: { fontSize: 13, fontWeight: 700, color: '#1a2540', wordBreak: 'break-all', marginBottom: 2 },
  detailRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  detail: { fontSize: 11, color: '#8a93a8' },

  empty: { padding: 24, color: '#8a93a8', fontSize: 13 },
  error: { color: '#c0392b', fontSize: 12, textAlign: 'center', marginTop: 8 },

  btnRow: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 16 },
  primaryBtn: { width: '100%', padding: '12px', background: '#1a2f6e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  textBtn: { background: 'none', border: 'none', fontSize: 13, color: '#8a93a8', cursor: 'pointer', textDecoration: 'underline' },
}