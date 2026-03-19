import { useState, useEffect, useRef } from 'react'
import { FaradayLogo } from '@/components/FaradayLogo'
import { useMobile } from '@/hooks/useMobile'
import s from './InventoryPage.module.css'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const PROCESS_LIST = [
  { key: 'RM', label: '원자재' },  { key: 'MP', label: '자재준비' },
  { key: 'EA', label: '낱장가공' }, { key: 'HT', label: '열처리' },
  { key: 'BO', label: '본딩' },    { key: 'EC', label: '전착도장' },
  { key: 'WI', label: '권선' },    { key: 'SO', label: '중성점' },
  { key: 'OQ', label: '출하검사' }, { key: 'BX', label: '포장' },
  { key: 'OB', label: '출하' },
]

const KG_PROCESSES  = new Set(['RM', 'MP'])
const MAE_PROCESSES = new Set(['EA', 'HT'])

// ─── 재고 셀 ───
function InventoryCell({ processKey, label, qty, selected, onClick }) {
  const isMobile = useMobile()
  const [flash,  setFlash]  = useState(false)
  const [fading, setFading] = useState(false)
  const prevQty = useRef(qty)

  const qtyKey = typeof qty === 'object' ? qty?.weight : qty

  useEffect(() => {
    if (prevQty.current !== qtyKey && prevQty.current !== null) {
      setFlash(true)
      setFading(false)
      const t1 = setTimeout(() => setFading(true), 100)
      const t2 = setTimeout(() => { setFlash(false); setFading(false) }, 2500)
      prevQty.current = qtyKey
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    prevQty.current = qtyKey
  }, [qtyKey])

  const isKg      = typeof qty === 'object' && qty?.unit === 'kg'
  const isEmpty   = isKg ? qty?.weight === 0 : qty === 0
  const isLoading = qty === null
  const defaultColor = isEmpty ? '#c0c8d8' : '#1a2540'
  const unit = isKg ? 'kg' : MAE_PROCESSES.has(processKey) ? '매' : '개'

  return (
    <div
      className={s.cell}
      onClick={onClick}
      style={{
        borderColor: selected ? '#F99535' : isEmpty ? '#e0e4ef' : '#1a2f6e',
        background:  flash ? '#e8eeff' : selected ? '#fffaf5' : '#fff',
      }}
    >
      <span className={s.processKey}>{processKey}</span>
      <span className={s.processLabel}>{label}</span>
      {isLoading ? (
        <span className={s.qty} style={{ color: defaultColor }}>...</span>
      ) : isKg ? (
        <>
          <span
            className={s.qty}
            style={{ color: flash ? '#F99535' : defaultColor, transition: fading ? 'color 2.4s ease' : 'none' }}
          >
            {qty.weight.toLocaleString()}
          </span>
          <span className={s.unit}>kg</span>
          {/* RM은 개수 표시 안 함 */}
          {processKey !== 'RM' && (
            <span className={s.subQty}>{qty.qty}개</span>
          )}
        </>
      ) : (
        <>
          <span
            className={s.qty}
            style={{ color: flash ? '#F99535' : defaultColor, transition: fading ? 'color 2.4s ease' : 'none' }}
          >
            {qty.toLocaleString()}
          </span>
          <span className={s.unit}>{unit}</span>
        </>
      )}
    </div>
  )
}

// ─── 그룹 아코디언 ───
function GroupAccordion({ group, visible, formatTime, proc }) {
  const [open, setOpen] = useState(false)
  const isKg = KG_PROCESSES.has(proc)

  return (
    <div className={s.groupWrap}>
      <div className={s.groupHeader} onClick={() => setOpen(!open)}>
        {group.color && <span className={s.colorDot} style={{ background: group.color }} />}
        <span className={s.groupLabel}>{group.label}</span>
        <span className={s.groupTotal}>
          {isKg ? `${Math.round(group.total * 1000) / 1000}kg` : `${group.total.toLocaleString()}${MAE_PROCESSES.has(proc) ? '매' : '개'}`}
        </span>
        <span className={s.groupLotCount}>{group.items.length}건</span>
        <span className={s.groupArrow} style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
      </div>
      {/* maxHeight — 아이템 수 기반 동적값 */}
      <div style={{ maxHeight: open ? group.items.length * 36 + 40 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
        <div className={s.groupListHeader}>
          <span className={s.detailCol} style={{ flex: 3 }}>LOT 번호</span>
          <span className={s.detailCol} style={{ flex: 2.5 }}>생성일시</span>
          <span className={s.detailCol} style={{ flex: 1 }}>{isKg ? '중량' : '수량'}</span>
        </div>
        {group.items.map((item, idx) => (
          <div
            key={`${item.lot_no}-${idx}`}
            className={s.detailRow}
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(8px)',
              transition: `opacity 0.3s ease ${idx * 0.04}s, transform 0.3s ease ${idx * 0.04}s`,
            }}
          >
            <span className={s.detailCol} style={{ flex: 3, fontWeight: 600, color: '#1a2540', fontSize: 12 }}>{item.lot_no}</span>
            <span className={s.detailCol} style={{ flex: 2.5, color: '#8a93a8', fontSize: 11 }}>{formatTime(item.created_at)}</span>
            <span className={s.detailCol} style={{ flex: 1, fontWeight: 700, color: '#1a2f6e', fontSize: 13 }}>
              {isKg ? `${item.quantity}kg` : item.quantity}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 내용물 행 ───
function ContentsRow({ item, formatTime }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={s.contentsWrap}>
      <div className={s.contentsHeader} onClick={() => setOpen(!open)}>
        <span style={{ flex: 3, fontWeight: 600, color: '#1a2540', fontSize: 12 }}>{item.lot_no}</span>
        <span style={{ flex: 2.5, color: '#8a93a8', fontSize: 11 }}>{formatTime(item.created_at)}</span>
        <span style={{ flex: 0.5, fontWeight: 700, color: '#1a2f6e', fontSize: 13 }}>{item.quantity}</span>
      </div>
      <div style={{ maxHeight: open ? (item.contents?.length || 0) * 28 + 20 : 0, overflow: 'hidden', transition: 'max-height 0.25s ease' }}>
        {item.contents?.length > 0 ? (
          <div className={s.contentsBody}>
            {item.contents.map((c, i) => (
              <div key={i} className={s.contentItem}>
                <span className={s.contentProcess}>{c.process}</span>
                <span className={s.contentLot}>{c.lot_no}</span>
                <span className={s.contentQty}>{c.quantity}개</span>
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

// ─── 상세 패널 ───
function DetailPanel({ process, visible, onClose }) {
  const [detail,  setDetail]  = useState(null)
  const [loading, setLoading] = useState(true)
  const isKg = KG_PROCESSES.has(process)

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
  const totalDisplay = detail?.total != null
    ? typeof detail.total === 'object'
      ? `${detail.total.weight}kg / ${detail.total.qty}개`
      : `${detail.total}${MAE_PROCESSES.has(process) ? '매' : '개'}`
    : '...'

  return (
    <div
      className={s.detailPanel}
      style={{
        maxHeight:   visible ? 500 : 0,
        opacity:     visible ? 1 : 0,
        marginTop:   visible ? 16 : 0,
        borderWidth: visible ? 1 : 0,
      }}
    >
      <div className={s.detailHeader}>
        <span className={s.detailProcessKey}>{process}</span>
        <span className={s.detailTitle}>{processLabel} 재고 상세</span>
        <span className={s.detailTotalBadge}>{totalDisplay}</span>
        <button className={s.detailClose} onClick={onClose}>✕</button>
      </div>
      {loading ? (
        <div className={s.detailLoading}>조회 중...</div>
      ) : !detail?.groups?.length ? (
        <div className={s.detailLoading}>재고가 없습니다</div>
      ) : (
        <div className={s.detailList}>
          {detail.display_type === 'contents' ? (
            <>
              <div className={s.groupListHeader}>
                <span className={s.detailCol} style={{ flex: 3 }}>LOT 번호</span>
                <span className={s.detailCol} style={{ flex: 2.5 }}>생성일시</span>
                <span className={s.detailCol} style={{ flex: 0.5 }}>수량</span>
                <span className={s.detailCol} style={{ flex: 0.3 }}></span>
              </div>
              {detail.groups[0]?.items?.map((item, idx) => (
                <ContentsRow key={idx} item={item} formatTime={formatTime} />
              ))}
            </>
          ) : detail.groups.length === 1 && detail.groups[0].key === '(미분류)' ? (
            <>
              <div className={s.groupListHeader}>
                <span className={s.detailCol} style={{ flex: 3 }}>LOT 번호</span>
                <span className={s.detailCol} style={{ flex: 2.5 }}>생성일시</span>
                <span className={s.detailCol} style={{ flex: 1 }}>{isKg ? '중량' : '수량'}</span>
              </div>
              {detail.groups[0].items.map((item, idx) => (
                <div
                  key={`${item.lot_no}-${idx}`}
                  className={s.detailRow}
                  style={{
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0)' : 'translateY(8px)',
                    transition: `opacity 0.3s ease ${idx * 0.04}s, transform 0.3s ease ${idx * 0.04}s`,
                  }}
                >
                  <span className={s.detailCol} style={{ flex: 3, fontWeight: 600, color: '#1a2540', fontSize: 12 }}>{item.lot_no}</span>
                  <span className={s.detailCol} style={{ flex: 2.5, color: '#8a93a8', fontSize: 11 }}>{formatTime(item.created_at)}</span>
                  <span className={s.detailCol} style={{ flex: 1, fontWeight: 700, color: '#1a2f6e', fontSize: 13 }}>
                    {isKg ? `${item.quantity}kg` : item.quantity}
                  </span>
                </div>
              ))}
            </>
          ) : (
            detail.groups.map(group => (
              <GroupAccordion key={group.key} group={group} visible={visible} formatTime={formatTime} proc={process} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── 메인 ───
export default function InventoryPage({ onLogout, onBack }) {
  const isMobile = useMobile()
  const [data,            setData]            = useState(null)
  const [lastUpdated,     setLastUpdated]     = useState(null)
  const [error,           setError]           = useState(null)
  const [selectedProcess, setSelectedProcess] = useState(null)
  const [detailProcess,   setDetailProcess]   = useState(null)
  const [detailVisible,   setDetailVisible]   = useState(false)
  const intervalRef = useRef(null)

  const fetchSummary = async () => {
    try {
      const res = await fetch(`${BASE_URL}/inventory/summary`, { credentials: 'include' })
      if (!res.ok) throw new Error('조회 실패')
      setData(await res.json())
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
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <FaradayLogo size={isMobile ? 'sm' : 'md'} />
          <div className={s.headerBtns}>
            <button className={s.backBtn} onClick={onBack}>← 뒤로</button>
            <button className={s.logoutBtn} onClick={onLogout}>로그아웃</button>
          </div>
        </div>
        <div className={s.titleRow}>
          <h2 className={s.title}>실시간 재고 현황</h2>
          <span className={s.updated} style={{ color: error ? '#e05555' : '#8a93a8' }}>
            {error ? '⚠ 연결 오류' : `업데이트: ${formatTime(lastUpdated)}`}
          </span>
        </div>
        <div className={s.grid}>
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