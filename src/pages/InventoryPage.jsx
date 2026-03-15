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

function InventoryCell({ processKey, label, qty, selected, onClick }) {
  const [flash, setFlash] = useState(false)
  const [fading, setFading] = useState(false)
  const prevQty = useRef(qty)

  useEffect(() => {
    if (prevQty.current !== qty && prevQty.current !== null) {
      setFlash(true)
      setFading(false)
      const t1 = setTimeout(() => setFading(true), 100)
      const t2 = setTimeout(() => { setFlash(false); setFading(false) }, 2500)
      prevQty.current = qty
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    prevQty.current = qty
  }, [qty])

  const isEmpty = qty === 0
  const isLoading = qty === null
  const defaultColor = isEmpty ? '#c0c8d8' : '#1a2540'

  return (
    <div
      onClick={onClick}
      style={{
        ...s.cell,
        borderColor: selected ? '#F99535' : isEmpty ? '#e0e4ef' : '#1a2f6e',
        background: flash ? '#e8eeff' : selected ? '#fffaf5' : '#fff',
        transition: 'background 0.3s ease, border-color 0.2s ease',
        cursor: 'pointer',
      }}
    >
      <span style={s.processKey}>{processKey}</span>
      <span style={s.processLabel}>{label}</span>
      <span style={{
        ...s.qty,
        color: flash ? '#F99535' : defaultColor,
        transition: fading ? 'color 2.4s ease' : 'none',
      }}>
        {isLoading ? '...' : qty.toLocaleString()}
      </span>
      <span style={s.unit}>개</span>
    </div>
  )
}

function DetailPanel({ process, visible, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rendered, setRendered] = useState(false)

  // 데이터 fetch
  useEffect(() => {
    if (!process) return
    setLoading(true)
    setDetail(null)
    fetch(`${BASE_URL}/inventory/detail/${process}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setDetail(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [process])

  // 애니메이션: visible이 true되면 렌더 후 약간 뒤에 열기
  useEffect(() => {
    if (visible) {
      setRendered(true)
    } else {
      const t = setTimeout(() => setRendered(false), 350)
      return () => clearTimeout(t)
    }
  }, [visible])

  if (!rendered && !visible) return null

  const formatTime = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleString('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    })
  }

  const processLabel = PROCESS_LIST.find(p => p.key === process)?.label || process

  return (
    <div style={{
      ...s.detailPanel,
      maxHeight: visible ? 420 : 0,
      opacity: visible ? 1 : 0,
      marginTop: visible ? 16 : 0,
      padding: visible ? undefined : '0 16px',
      transition: 'max-height 0.35s ease, opacity 0.3s ease, margin-top 0.3s ease',
    }}>
      <div style={s.detailHeader}>
        <span style={s.detailProcessKey}>{process}</span>
        <span style={s.detailTitle}>{processLabel} 재고 상세</span>
        <span style={s.detailTotal}>{detail?.total ?? '...'}개</span>
        <button style={s.detailClose} onClick={onClose}>✕</button>
      </div>

      {loading ? (
        <div style={s.detailLoading}>조회 중...</div>
      ) : detail?.items?.length > 0 ? (
        <div style={s.detailList}>
          <div style={s.detailListHeader}>
            <span style={{ ...s.detailCol, flex: 3 }}>LOT 번호</span>
            <span style={{ ...s.detailCol, flex: 1.5 }}>생성일시</span>
            <span style={{ ...s.detailCol, flex: 1 }}>수량</span>
          </div>
          {detail.items.map((item, idx) => (
            <div key={`${item.lot_no}-${idx}`} style={{
              ...s.detailRow,
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(8px)',
              transition: `opacity 0.3s ease ${idx * 0.04}s, transform 0.3s ease ${idx * 0.04}s`,
            }}>
              <span style={{ ...s.detailCol, flex: 3, fontWeight: 600, color: '#1a2540', fontSize: 12 }}>{item.lot_no}</span>
              <span style={{ ...s.detailCol, flex: 1.5, color: '#8a93a8', fontSize: 11 }}>{formatTime(item.created_at)}</span>
              <span style={{ ...s.detailCol, flex: 1, fontWeight: 700, color: '#1a2f6e', fontSize: 13 }}>{item.quantity}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={s.detailLoading}>재고가 없습니다</div>
      )}
    </div>
  )
}

export default function InventoryPage({ onLogout, onBack }) {
  const [data, setData] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)
  const [selectedProcess, setSelectedProcess] = useState(null)
  const [detailProcess, setDetailProcess] = useState(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const intervalRef = useRef(null)

  const fetchSummary = async () => {
    try {
      const res = await fetch(`${BASE_URL}/inventory/summary`, { credentials: 'include' })
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

  const handleCellClick = (key) => {
    if (selectedProcess === key) {
      // 같은 거 클릭 → 닫기
      setDetailVisible(false)
      setTimeout(() => { setSelectedProcess(null); setDetailProcess(null) }, 350)
    } else if (selectedProcess) {
      // 다른 거 클릭 → 닫고 열기
      setDetailVisible(false)
      setTimeout(() => {
        setSelectedProcess(key)
        setDetailProcess(key)
        setDetailVisible(true)
      }, 300)
    } else {
      // 처음 열기 — DOM 생성 후 transition 발동
      setSelectedProcess(key)
      setDetailProcess(key)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setDetailVisible(true))
      })
    }
  }

  const handleClose = () => {
    setDetailVisible(false)
    setTimeout(() => { setSelectedProcess(null); setDetailProcess(null) }, 350)
  }

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
              selected={selectedProcess === key}
              onClick={() => handleCellClick(key)}
            />
          ))}
        </div>

        <DetailPanel
          process={detailProcess}
          visible={detailVisible}
          onClose={handleClose}
        />
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
  detailPanel: {
    background: '#f8f9fc', borderRadius: 10,
    border: '1px solid #e0e4ef', overflow: 'hidden',
    marginTop: 16,
  },
  detailHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 16px', borderBottom: '1px solid #e0e4ef',
  },
  detailProcessKey: {
    fontSize: 12, fontWeight: 700, color: '#fff', background: '#1a2f6e',
    padding: '2px 8px', borderRadius: 4,
  },
  detailTitle: {
    fontSize: 13, fontWeight: 600, color: '#1a2540', flex: 1,
  },
  detailTotal: {
    fontSize: 13, fontWeight: 700, color: '#1a2f6e',
  },
  detailClose: {
    background: 'none', border: 'none', fontSize: 14, color: '#8a93a8',
    cursor: 'pointer', padding: '0 4px', fontWeight: 700,
  },
  detailList: {
    maxHeight: 300, overflowY: 'auto', padding: '0 16px',
  },
  detailListHeader: {
    display: 'flex', padding: '8px 0', borderBottom: '1px solid #e0e4ef',
  },
  detailCol: {
    fontSize: 11, fontWeight: 600, color: '#8a93a8', textAlign: 'left',
  },
  detailRow: {
    display: 'flex', padding: '8px 0', borderBottom: '1px solid #f0f2f7',
    alignItems: 'center',
  },
  detailLoading: {
    padding: 16, textAlign: 'center', fontSize: 12, color: '#8a93a8',
  },
}