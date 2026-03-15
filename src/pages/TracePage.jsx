import { useState } from 'react'
import { traceLot } from '../api'
import QRScanner from '../components/QRScanner'
import { FaradayLogo } from '../components/FaradayLogo'

const STATUS_LABEL = {
  in_stock: '재고',
  consumed: '소비됨',
  shipped: '출하',
  discarded: '폐기',
}

const STATUS_COLOR = {
  in_stock: '#1a9e75',
  consumed: '#8a93a8',
  shipped: '#1a2f6e',
  discarded: '#c0392b',
}

export default function TracePage({ onLogout, onBack }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('qr')

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
    setResult(null); setError(null); setStep('qr')
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
        {/* 헤더 */}
        <div style={s.header}>
          <FaradayLogo size="md" />
          <p style={s.title}>LOT 이력 조회</p>
        </div>

        {/* 검색한 LOT */}
        <div style={s.searchedLot}>
          <span style={s.searchLabel}>조회 LOT</span>
          <span style={s.searchValue}>{result?.lot_no}</span>
        </div>

        {/* 타임라인 */}
        {result?.timeline?.length > 0 ? (
          <div style={s.timeline}>
            {result.timeline.map((item, idx) => {
              const isLast = idx === result.timeline.length - 1
              const statusColor = STATUS_COLOR[item.status] || '#8a93a8'
              const isSearched = item.lot_no === result.lot_no

              return (
                <div key={`${item.process}-${idx}`} style={s.timelineItem}>
                  {/* 왼쪽: 공정 표시 + 세로선 */}
                  <div style={s.left}>
                    <div style={{
                      ...s.dot,
                      background: isSearched ? '#1a2f6e' : statusColor,
                      boxShadow: isSearched ? '0 0 0 3px rgba(26,47,110,0.2)' : 'none',
                    }} />
                    {!isLast && <div style={s.line} />}
                  </div>

                  {/* 오른쪽: 정보 카드 */}
                  <div style={{
                    ...s.infoCard,
                    borderLeftColor: isSearched ? '#1a2f6e' : '#e0e4ef',
                  }}>
                    <div style={s.processRow}>
                      <span style={s.processKey}>{item.process}</span>
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
            })}
          </div>
        ) : (
          <div style={s.empty}>이력이 없습니다.</div>
        )}

        {error && (
          <div style={s.error}>{error}</div>
        )}

        {/* 하단 버튼 */}
        <div style={s.btnRow}>
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
  searchValue: { fontSize: 14, fontWeight: 700, color: '#1a2f6e', wordBreak: 'break-all' },

  timeline: { width: '100%', display: 'flex', flexDirection: 'column', gap: 0 },
  timelineItem: { display: 'flex', gap: 12, minHeight: 60 },

  left: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 },
  dot: { width: 12, height: 12, borderRadius: '50%', flexShrink: 0, marginTop: 4 },
  line: { width: 2, flex: 1, background: '#e0e4ef', marginTop: 4 },

  infoCard: { flex: 1, borderLeft: '3px solid #e0e4ef', paddingLeft: 12, paddingBottom: 16 },
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