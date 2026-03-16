import { useState, useEffect, useRef } from 'react'
import { traceLot } from '../api'
import QRScanner from '../components/QRScanner'
import { FaradayLogo } from '../components/FaradayLogo'
import LotTimeline from '../components/LotTimeline'

export default function TracePage({ onLogout, onBack }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('qr')
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    if (result) {
      // 살짝 딜레이 후 콘텐츠 표시 (fade-in)
      const t = setTimeout(() => setShowContent(true), 100)
      return () => clearTimeout(t)
    }
    setShowContent(false)
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
      setResult({ lot_no: val, timeline: [] })
      setStep('result')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setResult(null); setError(null); setShowContent(false); setStep('qr')
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

        {/* 조회된 LOT 표시 */}
        <div style={{
          ...s.searchedLot,
          opacity: showContent ? 1 : 0,
          transform: showContent ? 'translateY(0)' : 'translateY(-10px)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
        }}>
          <span style={s.searchLabel}>조회</span>
          <span style={s.searchValue}>{result?.lot_no}</span>
          {result?.scanned_process && (
            <span style={s.searchProcess}>{result.scanned_process}</span>
          )}
        </div>

        {/* ★ LotTimeline 컴포넌트 사용 (분기 포함) */}
        {error ? (
          <div style={s.errorWrap}>
            <div style={s.errorIcon}>!</div>
            <p style={s.errorMsg}>{error}</p>
          </div>
        ) : result?.timeline?.length > 0 ? (
          <div style={s.timeline}>
            <LotTimeline
              timeline={result.timeline}
              searchedLotNo={result.lot_no}
              animated={true}
            />
          </div>
        ) : (
          <div style={s.empty}>이력이 없습니다.</div>
        )}

        <div style={{
          ...s.btnRow,
          opacity: (showContent || error) ? 1 : 0,
          transition: 'opacity 0.5s ease 0.3s',
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

  timeline: { width: '100%' },

  empty: { padding: 24, color: '#8a93a8', fontSize: 13, textAlign: 'center' },
  errorWrap: { width: '100%', padding: '28px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  errorIcon: { width: 36, height: 36, borderRadius: '50%', background: '#fef2f0', color: '#c0392b', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  errorMsg: { fontSize: 13, color: '#6b7585', textAlign: 'center', lineHeight: 1.5, margin: 0 },

  btnRow: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 16 },
  primaryBtn: { width: '100%', padding: '12px', background: '#1a2f6e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  textBtn: { background: 'none', border: 'none', fontSize: 13, color: '#8a93a8', cursor: 'pointer', textDecoration: 'underline' },
}