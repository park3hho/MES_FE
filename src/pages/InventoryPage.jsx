import { useState, useEffect, useRef } from 'react'
import { FaradayLogo } from '../components/FaradayLogo'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const PROCESS_LIST = [
  { key: 'RM', label: '원자재' },
  { key: 'MP', label: '자재준비' },
  { key: 'EA', label: '낱장가공' },
  { key: 'HT', label: '열처리' },
  { key: 'BO', label: '본딩' },
  { key: 'EC', label: '전착도장' },
  { key: 'IQ', label: '수입검사' },
  { key: 'WI', label: '권선' },
  { key: 'SO', label: '중성점' },
  { key: 'OQ', label: '출하검사' },
  { key: 'BX', label: '포장' },
  { key: 'OB', label: '출하' },
]

function InventoryCell({ processKey, label, qty }) {
  const [flash, setFlash] = useState(false)
  const [fading, setFading] = useState(false)
  const prevQty = useRef(qty)

  useEffect(() => {
    if (prevQty.current !== qty && prevQty.current !== null) {
      // 1단계: 즉시 주황
      setFlash(true)
      setFading(false)
      // 2단계: 약간 뒤에 페이드 시작
      const t1 = setTimeout(() => setFading(true), 50)
      const t2 = setTimeout(() => { setFlash(false); setFading(false) }, 600)
      prevQty.current = qty
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    prevQty.current = qty
  }, [qty])

  const isEmpty = qty === 0
  const isLoading = qty === null
  const defaultColor = isEmpty ? '#c0c8d8' : '#1a2540'

  return (
    <div style={{
      ...s.cell,
      borderColor: isEmpty ? '#e0e4ef' : '#1a2f6e',
      background: flash ? '#e8eeff' : '#fff',
      transition: 'background 0.3s ease',
    }}>
      <span style={s.processKey}>{processKey}</span>
      <span style={s.processLabel}>{label}</span>
      <span style={{
        ...s.qty,
        color: flash ? '#F99535' : defaultColor,
        transition: fading ? 'color 0.5s ease' : 'none',
      }}>
        {isLoading ? '...' : qty.toLocaleString()}
      </span>
      <span style={s.unit}>개</span>
    </div>
  )
}

export default function InventoryPage({ onLogout, onBack }) {
  const [data, setData] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  const fetchSummary = async () => {
    try {
      const res = await fetch(`${BASE_URL}/inventory/summary`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('조회 실패')
      const json = await res.json()
      setData(json)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    fetchSummary()
    intervalRef.current = setInterval(fetchSummary, 5000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const formatTime = (date) => date ? date.toLocaleTimeString('ko-KR') : '-'

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <FaradayLogo size="md" />
          <button style={s.backBtn} onClick={onBack}>← 뒤로</button>
          <button style={s.logoutBtn} onClick={onLogout}>로그아웃</button>
        </div>

        <div style={s.titleRow}>
          <h2 style={s.title}>실시간 재고 현황</h2>
          <span style={{ ...s.updated, color: error ? '#e05555' : '#8a93a8' }}>
            {error ? '⚠ 연결 오류' : `업데이트: ${formatTime(lastUpdated)}`}
          </span>
        </div>

        <div style={s.grid}>
          {PROCESS_LIST.map(({ key, label }) => (
            <InventoryCell
              key={key}
              processKey={key}
              label={label}
              qty={data ? (data[key] ?? 0) : null}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100vh', background: '#f4f6fb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '40px 16px',
  },
  card: {
    background: '#fff', borderRadius: 14, padding: '32px 36px',
    width: '100%', maxWidth: 900,
    boxShadow: '0 4px 24px rgba(26,47,110,0.09)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 24, gap: 8,
  },
  backBtn: {
    background: 'none', border: '1px solid #d8dce8', borderRadius: 6,
    padding: '6px 14px', fontSize: 13, color: '#1a2f6e', cursor: 'pointer',
    marginLeft: 'auto',
  },
  logoutBtn: {
    background: 'none', border: '1px solid #d8dce8', borderRadius: 6,
    padding: '6px 14px', fontSize: 13, color: '#6b7585', cursor: 'pointer',
  },
  titleRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18, fontWeight: 700, color: '#1a2540', margin: 0,
  },
  updated: { fontSize: 12 },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
  },
  cell: {
    border: '1.5px solid', borderRadius: 10,
    padding: '20px 16px', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  },
  processKey: {
    fontSize: 13, fontWeight: 700, color: '#1a2f6e', letterSpacing: '0.05em',
  },
  processLabel: {
    fontSize: 11, color: '#8a93a8', marginBottom: 8,
  },
  qty: {
    fontSize: 32, fontWeight: 700, lineHeight: 1,
  },
  unit: {
    fontSize: 12, color: '#8a93a8',
  },
}