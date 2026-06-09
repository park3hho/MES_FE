// pages/process/manage/StockLocationPage.jsx
// 재고 현황 (통합) — Warehouse + Inventory + RotorStock 를 위치/상태/NC 로 읽기 (2026-06-09)
//
// 설계: docs/stock-location-design.md (A2)
//   - 한 테이블로 합치지 않고 BE 가 union 정규화 (stock_overview 패턴).
//   - NC 는 Inventory.nc_no 조인으로 배지 표시 (복사 X — 동기화 자동).
//   - 읽기 전용. 상세/수정은 각 원본 화면(창고/재고관리/부적합품)에서.
import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { getStockLocation } from '@/api'
import s from './StockLocationPage.module.css'

const SOURCE_LABELS = { warehouse: '창고', inventory: '공정', rotor: '로터' }
const SOURCE_TABS = [
  { key: '', label: '전체' },
  { key: 'warehouse', label: '창고' },
  { key: 'inventory', label: '공정' },
  { key: 'rotor', label: '로터' },
]
const STATUS_BADGE = {
  nonconforming: { label: '부적합', cls: 'bad' },
  repair: { label: '재공정', cls: 'warn' },
  internal_use: { label: '내부사용', cls: 'muted' },
  in_stock: { label: '재고', cls: 'ok' },
}
const PAGE_SIZE = 50

export default function StockLocationPage({ onBack }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [ncCount, setNcCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [keyword, setKeyword] = useState('')
  const [source, setSource] = useState('')
  const [ncOnly, setNcOnly] = useState(false)
  const [page, setPage] = useState(1)
  const timerRef = useRef(null)

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await getStockLocation({
        keyword: keyword || undefined,
        source: source || undefined,
        status: ncOnly ? 'nonconforming' : undefined,
        page,
        page_size: PAGE_SIZE,
      })
      setItems(data.items || [])
      setTotal(data.total || 0)
      setNcCount(data.nc_count || 0)
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [keyword, source, ncOnly, page])

  // 필터/페이지 변경 시 재조회 (키워드는 디바운스)
  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(reload, 250)
    return () => clearTimeout(timerRef.current)
  }, [reload])

  // 필터 바꾸면 1페이지로
  const onFilter = (fn) => { setPage(1); fn() }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page-flat">
      <PageHeader title="재고 현황" subtitle="창고·공정·로터 통합 위치 + 부적합(NC) 표시" onBack={onBack} />

      <div className={s.toolbar}>
        <input type="text" className={s.search} placeholder="LOT/품명/규격 검색"
          value={keyword} onChange={(e) => onFilter(() => setKeyword(e.target.value))} />
        <div className={s.tabs}>
          {SOURCE_TABS.map((t) => (
            <button key={t.key} type="button"
              className={`${s.tab} ${source === t.key ? s.tabOn : ''}`}
              onClick={() => onFilter(() => setSource(t.key))}>{t.label}</button>
          ))}
        </div>
        <button type="button"
          className={`${s.ncBtn} ${ncOnly ? s.ncBtnOn : ''}`}
          onClick={() => onFilter(() => setNcOnly((v) => !v))}>
          부적합만{ncCount ? ` (${ncCount})` : ''}
        </button>
      </div>

      {loading && <p className={s.msg}>로딩 중…</p>}
      {error && <p className={s.error}>{error}</p>}

      {!loading && !error && (
        <>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>소스</th>
                  <th>식별(LOT)</th>
                  <th>품명</th>
                  <th>규격</th>
                  <th className={s.numCol}>수량</th>
                  <th>단위</th>
                  <th>위치</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={8} className={s.empty}>해당 조건의 재고가 없습니다.</td></tr>
                ) : items.map((r) => {
                  const badge = STATUS_BADGE[r.status] || { label: r.status, cls: 'muted' }
                  return (
                    <tr key={`${r.source}-${r.ref}`}>
                      <td><span className={s.srcTag}>{SOURCE_LABELS[r.source] || r.source}</span></td>
                      <td className={s.mono}>{r.ref}</td>
                      <td className={s.nameCell}>
                        {r.name}
                        {r.nc && (
                          <span className={s.ncTag} title={r.nc.defect_detail || r.nc.defect_type}>
                            {r.nc.nc_no}{r.nc.defect_type ? ` · ${r.nc.defect_type}` : ''}
                          </span>
                        )}
                      </td>
                      <td className={s.ellip} title={r.spec}>{r.spec || '—'}</td>
                      <td className={s.numCol}>{r.qty}</td>
                      <td>{r.unit}</td>
                      <td className={r.location_full ? s.mono : s.unset}>
                        {r.location_full || '위치 미지정'}
                      </td>
                      <td><span className={`${s.badge} ${s[badge.cls]}`}>{badge.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className={s.pager}>
            <span className={s.pagerInfo}>총 {total}건 · {page}/{totalPages}</span>
            <div className={s.pagerBtns}>
              <button type="button" className={s.pageBtn} disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}>이전</button>
              <button type="button" className={s.pageBtn} disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>다음</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
