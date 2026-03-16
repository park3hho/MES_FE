import { useState, useEffect, useRef } from 'react'
import { FaradayLogo } from '../components/FaradayLogo'

const BASE_URL = import.meta.env.VITE_API_URL || ''
const isMobile = window.innerWidth <= 480

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

function GroupAccordion({ group, visible, formatTime }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={s.groupWrap}>
      <div style={s.groupHeader} onClick={() => setOpen(!open)}>
        {group.color && <span style={{ ...s.colorDot, background: group.color }} />}
        <span style={s.groupLabel}>{group.label}</span>
        <span style={s.groupTotal}>{group.total.toLocaleString()}개</span>
        <span style={s.groupLotCount}>{group.items.length}건</span>
        <span style={{ ...s.groupArrow, transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
      </div>
      <div style={{
        maxHeight: open ? group.items.length * 36 + 40 : 0,
        overflow: 'hidden', transition: 'max-height 0.3s ease',
      }}>
        <div style={s.groupListHeader}>
          <span style={{ ...s.detailCol, flex: 3 }}>LOT 번호</span>
          <span style={{ ...s.detailCol, flex: 1.5 }}>생성일시</span>
          <span style={{ ...s.detailCol, flex: 1 }}>수량</span>
        </div>
        {group.items.map((item, idx) => (
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
    </div>
  )
}

function ContentsRow({ item, formatTime }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={s.contentsWrap}>
      <div style={s.contentsHeader} onClick={() => setOpen(!open)}>
        <span style={{ flex: 3, fontWeight: 600, color: '#1a2540', fontSize: 12 }}>{item.lot_no}</span>
        <span style={{ flex: 1.5, color: '#8a93a8', fontSize: 11 }}>{formatTime(item.created_at)}</span>
        <span style={{ flex: 0.5, fontWeight: 700, color: '#1a2f6e', fontSize: 13 }}>{item.quantity}</span>
        <span style={{ ...s.groupArrow, transform: open ? 'rotate(180deg)' : 'rotate(0)', flex: 0.3 }}>▾</span>
      </div>
      <div style={{
        maxHeight: open ? (item.contents?.length || 0) * 28 + 20 : 0,
        overflow: 'hidden', transition: 'max-height 0.25s ease',
      }}>
        {item.contents?.length > 0 ? (
          <div style={s.contentsBody}>
            {item.contents.map((c, i) => (
              <div key={i} style={s.contentItem}>
                <span style={s.contentProcess}>{c.process}</span>
                <span style={s.contentLot}>{c.lot_no}</span>
                <span style={s.contentQty}>{c.quantity}개</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#adb4c2' }}>내용물 정보 없음</div>
        )}
      </div>
    </div>
  )
}

function DetailPanel({ process, visible, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!process) return
    setLoading(true)
    setDetail(null)
    fetch(`${BASE_URL}/inventory/detail/${process}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setDetail(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [process])

  const formatTime = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const processLabel = PROCESS_LIST.find(p => p.key === process)?.label || process

  return (
    <div style={{
      ...s.detailPanel,
      maxHeight: visible ? 500 : 0,
      opacity: visible ? 1 : 0,
      marginTop: visible ? 16 : 0,
      borderWidth: visible ? 1 : 0,
      transition: 'max-height 0.35s ease, opacity 0.3s ease, margin-top 0.3s ease',
    }}>
      <div style={s.detailHeader}>
        <span style={s.detailProcessKey}>{process}</span>
        <span style={s.detailTitle}>{processLabel} 재고 상세</span>
        <span style={s.detailTotalBadge}>{detail?.total ?? '...'}개</span>
        <button style={s.detailClose} onClick={onClose}>✕</button>
      </div>
      {loading ? (
        <div style={s.detailLoading}>조회 중...</div>
      ) : !detail?.groups?.length ? (
        <div style={s.detailLoading}>재고가 없습니다</div>
      ) : (
        <div style={s.detailList}>
          {detail.display_type === 'contents' ? (
            <>
              <div style={s.groupListHeader}>
                <span style={{ ...s.detailCol, flex: 3 }}>LOT 번호</span>
                <span style={{ ...s.detailCol, flex: 1.5 }}>생성일시</span>
                <span style={{ ...s.detailCol, flex: 0.5 }}>수량</span>
                <span style={{ ...s.detailCol, flex: 0.3 }}></span>
              </div>
              {detail.groups[0]?.items?.map((item, idx) => (
                <ContentsRow key={idx} item={item} formatTime={formatTime} />
              ))}
            </>
          ) : detail.groups.length === 1 && detail.groups[0].key === '(미분류)' ? (
            <>
              <div style={s.groupListHeader}>
                <span style={{ ...s.detailCol, flex: 3 }}>LOT 번호</span>
                <span style={{ ...s.detailCol, flex: 1.5 }}>생성일시</span>
                <span style={{ ...s.detailCol, flex: 1 }}>수량</span>
              </div>
              {detail.groups[0].items.map((item, idx) => (
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
            </>
          ) : (
            detail.groups.map((group) => (
              <GroupAccordion key={group.key} group={group} visible={visible} formatTime={formatTime} />
            ))
          )}
        </div>
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
    } catch (e) { setError(e.message) }
  }

  useEffect(() => {
    fetchSummary()
    intervalRef.current = setInterval(fetchSummary, 5000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const formatTime = (date) => date ? date.toLocaleTimeString('ko-KR') : '-'

  const handleCellClick = (key) => {
    if (selectedProcess === key) {
      setDetailVisible(false)
      setTimeout(() => { setSelectedProcess(null); setDetailProcess(null) }, 350)
    } else if (selectedProcess) {
      setDetailVisible(false)
      setTimeout(() => {
        setSelectedProcess(key)
        setDetailProcess(key)
        setTimeout(() => setDetailVisible(true), 50)
      }, 300)
    } else {
      setSelectedProcess(key)
      setDetailProcess(key)
      setTimeout(() => setDetailVisible(true), 50)
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
          <FaradayLogo size={isMobile ? 'sm' : 'md'} />
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
        <DetailPanel process={detailProcess} visible={detailVisible} onClose={handleClose} />
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100vh', background: '#f4f6fb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: isMobile ? '20px 8px' : '40px 16px',
  },
  card: {
    background: '#fff', borderRadius: 14, padding: isMobile ? '20px 12px' : '32px 36px',
    width: '100%', maxWidth: 900,
    boxShadow: '0 4px 24px rgba(26,47,110,0.09)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: isMobile ? 12 : 24, gap: 8,
  },
  backBtn: {
    background: 'none', border: '1px solid #d8dce8', borderRadius: 6,
    padding: isMobile ? '4px 10px' : '6px 14px', fontSize: isMobile ? 11 : 13, color: '#1a2f6e', cursor: 'pointer',
    marginLeft: 'auto',
  },
  logoutBtn: {
    background: 'none', border: '1px solid #d8dce8', borderRadius: 6,
    padding: isMobile ? '4px 10px' : '6px 14px', fontSize: isMobile ? 11 : 13, color: '#6b7585', cursor: 'pointer',
  },
  titleRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: isMobile ? 10 : 20,
  },
  title: {
    fontSize: isMobile ? 14 : 18, fontWeight: 700, color: '#1a2540', margin: 0,
  },
  updated: { fontSize: isMobile ? 9 : 12 },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: isMobile ? 6 : 12,
  },
  cell: {
    border: '1.5px solid', borderRadius: isMobile ? 8 : 10,
    padding: isMobile ? '10px 2px' : '20px 16px', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 1 : 4,
  },
  processKey: {
    fontSize: isMobile ? 10 : 13, fontWeight: 700, color: '#1a2f6e', letterSpacing: '0.05em',
  },
  processLabel: {
    fontSize: isMobile ? 8 : 11, color: '#8a93a8', marginBottom: isMobile ? 2 : 8,
  },
  qty: {
    fontSize: isMobile ? 20 : 32, fontWeight: 700, lineHeight: 1,
  },
  unit: {
    fontSize: isMobile ? 9 : 12, color: '#8a93a8',
  },
  detailPanel: {
    background: '#f8f9fc', borderRadius: 10,
    border: '1px solid #e0e4ef', overflow: 'hidden', marginTop: 16,
  },
  detailHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 16px', borderBottom: '1px solid #e0e4ef',
  },
  detailProcessKey: {
    fontSize: 12, fontWeight: 700, color: '#fff', background: '#1a2f6e',
    padding: '2px 8px', borderRadius: 4,
  },
  detailTitle: { fontSize: 13, fontWeight: 600, color: '#1a2540', flex: 1 },
  detailTotalBadge: { fontSize: 13, fontWeight: 700, color: '#1a2f6e' },
  detailClose: {
    background: 'none', border: 'none', fontSize: 14, color: '#8a93a8',
    cursor: 'pointer', padding: '0 4px', fontWeight: 700,
  },
  detailList: { maxHeight: 400, overflowY: 'auto', padding: '0 16px 8px' },
  detailCol: { fontSize: 11, fontWeight: 600, color: '#8a93a8', textAlign: 'left' },
  detailRow: {
    display: 'flex', padding: '8px 0', borderBottom: '1px solid #f0f2f7', alignItems: 'center',
  },
  detailLoading: { padding: 16, textAlign: 'center', fontSize: 12, color: '#8a93a8' },
  groupWrap: { borderBottom: '1px solid #e8eaf0' },
  groupHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 4px', cursor: 'pointer', userSelect: 'none',
  },
  colorDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  groupLabel: { fontSize: 13, fontWeight: 700, color: '#1a2540', flex: 1 },
  groupTotal: { fontSize: 13, fontWeight: 700, color: '#1a2f6e' },
  groupLotCount: { fontSize: 11, color: '#8a93a8', marginLeft: 4 },
  groupArrow: { fontSize: 11, color: '#8a93a8', transition: 'transform 0.2s ease', textAlign: 'center' },
  groupListHeader: { display: 'flex', padding: '6px 8px', borderBottom: '1px solid #e8eaf0' },
  contentsWrap: { borderBottom: '1px solid #f0f2f7' },
  contentsHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 4px', cursor: 'pointer', userSelect: 'none',
  },
  contentsBody: {
    padding: '4px 8px 8px 24px', background: '#f0f2f7', borderRadius: 6, margin: '0 4px 6px',
  },
  contentItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 11 },
  contentProcess: { fontWeight: 700, color: '#1a2f6e', width: 24 },
  contentLot: { flex: 1, color: '#1a2540', fontWeight: 500 },
  contentQty: { color: '#8a93a8', fontWeight: 600 },
}