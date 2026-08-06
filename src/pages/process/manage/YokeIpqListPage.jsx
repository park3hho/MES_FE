// pages/process/manage/YokeIpqListPage.jsx
// IPQ 검사 목록 (2026-08-06) — OQ '검사 목록'(InspectionListPage)의 IPQ 짝.
//   현재 IPQ 실측 데이터는 요크(YokeIpqInspection)뿐이라 요크 탭 하나로 시작.
//   다른 IPQ 항목이 생기면 lineTabs 에 탭을 추가하는 구조 (OQ 의 고정자/회전자 탭과 동형).
//
// ★ 스타일은 InspectionListPage.module.css 를 **공유** — 두 검사 목록의 생김새가 갈라지면
//   같은 성격의 화면인데 다른 도구처럼 보인다(사용자 지적 2026-08-06). 요크 전용 소수 클래스만 자체 파일.
//
// 엑셀 '요크 검사 이력서' 양식(요크 1개 = 1행) 기준.
//   ⚠️ 수기 엑셀은 '모델명' 칸에 `90파이요크 26극` 같은 특수사양이 섞여 있었지만,
//     시스템은 phi(숫자)/model_name(품목명)/remark(비고)로 분리 저장한다.
//     엑셀은 BE 가 utils/Yoke_IPQ_Template.xlsx 양식으로 생성 — 모델명 칸엔 phi 만 들어간다.
import { useState, useEffect, useCallback, useMemo } from 'react'

import { listYokeIpq, downloadYokeIpqExcel } from '@/api'
import { TableSkeleton } from '@/components/Skeleton'
import Section from '@/components/common/Section'
import { PHI_SPECS } from '@/constants/processConst'
import s from './InspectionListPage.module.css'
import y from './YokeIpqListPage.module.css'

const J_LABEL = { OK: '양호', FAIL: '불량', PENDING: '미검사' }
const J_COLOR = { OK: '#22bb77', FAIL: '#d23f3f', PENDING: '#9aa0a6' }
const MOTOR_LABEL = { inner: '내전', outer: '외전', axial: '축' }

const FILTER_KEY = 'yokeIpqListFilters_v1'

const getDefaultFilters = () => {
  const today = new Date()
  const weekAgo = new Date(today)
  weekAgo.setDate(today.getDate() - 6)
  const fmt = (d) => d.toISOString().slice(0, 10)
  return { date_from: fmt(weekAgo), date_to: fmt(today), judgment: [] }
}

const loadFilters = () => {
  const d = getDefaultFilters()
  try {
    const saved = localStorage.getItem(FILTER_KEY)
    if (saved) {
      const p = JSON.parse(saved)
      return {
        date_from: p.date_from ?? d.date_from,
        date_to: p.date_to ?? d.date_to,
        judgment: p.judgment ?? [],
      }
    }
  } catch { /* 파싱 실패 시 기본값 */ }
  return d
}

const fmtNum = (v) => (v == null || v === '' ? '-' : String(v))
const dateOf = (r) => (r.work_date || (r.created_at || '').slice(0, 10) || '')
const phiColor = (phi) => PHI_SPECS[phi]?.color

// 판정 칩 필터 (OQ ChipRow 동형)
function ChipRow({ label, options, selected, onToggle, colorFn }) {
  const allSelected = selected.length === 0
  return (
    <div className={s.filterGroup}>
      <span className={s.fLabel}>{label}</span>
      <div className={s.chips}>
        <button type="button" className={`${s.chip} ${allSelected ? s.chipOn : ''}`}
          onClick={() => onToggle(null)}>전체</button>
        {options.map((opt) => {
          const active = selected.includes(opt)
          const bg = active && colorFn ? colorFn(opt) : undefined
          return (
            <button key={opt} type="button"
              className={`${s.chip} ${active ? s.chipOn : ''}`}
              style={bg ? { background: bg, borderColor: bg } : undefined}
              onClick={() => onToggle(opt)}>
              {J_LABEL[opt] || opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const SORTS = [
  { key: 'created_at', label: '검사일' },
  { key: 'phi_num', label: 'Φ' },
  { key: 'judgment', label: '판정' },
  { key: 'lot_ea_no', label: 'LOT' },
]

export default function YokeIpqListPage({ onBack }) {
  const [filters, setFilters] = useState(loadFilters)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)) } catch { /* 저장 실패 무시 */ }
  }, [filters])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const f = {}
      if (filters.date_from) f.date_from = filters.date_from
      if (filters.date_to) f.date_to = filters.date_to
      if (filters.judgment.length) f.judgment = filters.judgment.join(',')
      const r = await listYokeIpq(f)
      setRows(r.items || [])
      setPage(1)
    } catch (e) {
      setError(e.message || '불러오기 실패')
    } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { load() }, [load])

  const toggleJudgment = (v) => {
    setFilters((f) => (v === null
      ? { ...f, judgment: [] }
      : { ...f, judgment: f.judgment.includes(v) ? f.judgment.filter((x) => x !== v) : [...f.judgment, v] }))
  }

  // phi 는 문자열이라 숫자 파생 필드로 정렬 (문자 정렬하면 '100' < '20')
  const sorted = useMemo(() => {
    const arr = rows.map((r) => ({ ...r, phi_num: Number(r.phi) || 0 }))
    arr.sort((a, b) => {
      const x = a[sortKey]
      const z = b[sortKey]
      let c
      if (typeof x === 'number' && typeof z === 'number') c = x - z
      else c = String(x ?? '').localeCompare(String(z ?? ''), 'ko')
      return sortDir === 'asc' ? c : -c
    })
    return arr
  }, [rows, sortKey, sortDir])

  const okCount = rows.filter((r) => r.judgment === 'OK').length
  const ngCount = rows.filter((r) => r.judgment === 'FAIL').length

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  // 엑셀 — BE 가 Yoke_IPQ_Template.xlsx 양식으로 생성. **목록과 같은 필터**를 그대로 넘긴다.
  const handleDownload = async () => {
    setDownloading(true); setError('')
    try {
      const f = {}
      if (filters.date_from) f.date_from = filters.date_from
      if (filters.date_to) f.date_to = filters.date_to
      if (filters.judgment.length) f.judgment = filters.judgment.join(',')
      const blob = await downloadYokeIpqExcel(f)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `요크검사이력_${filters.date_from || '전체'}_${filters.date_to || ''}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message || '엑셀 다운로드 실패')
    } finally { setDownloading(false) }
  }

  const onSort = (k) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
    setPage(1)
  }

  return (
    <div className="page-flat">
      <div className={s.headerRow}>
        <div className="page-header" style={{ flex: 1 }}>
          <h1 className="page-title">IPQ 검사 목록</h1>
          <p className="page-subtitle">공정검사 실측·판정 조회 · 엑셀 다운로드</p>
        </div>
        {onBack && (
          <button type="button" className={s.backLink} onClick={onBack}>← 이전</button>
        )}
      </div>

      {/* 검사 대상 탭 — 현재 IPQ 실측은 요크뿐. 항목이 늘면 여기에 탭 추가 (OQ 의 ST/RT 탭과 동형) */}
      <div className={s.lineTabs}>
        <button type="button" className={`${s.lineTab} ${s.lineTabOn}`}>요크 (Yoke)</button>
      </div>

      <Section label="필터">
        <div className={s.filterWrap}>
          <div className={s.filterGroup}>
            <span className={s.fLabel}>기간</span>
            <div className={s.dateRange}>
              <input className={s.dateInput} type="date" value={filters.date_from}
                onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))} />
              <span className={s.dateSep}>~</span>
              <input className={s.dateInput} type="date" value={filters.date_to}
                onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))} />
            </div>
          </div>

          <ChipRow label="판정" options={['OK', 'FAIL', 'PENDING']}
            selected={filters.judgment} onToggle={toggleJudgment}
            colorFn={(j) => J_COLOR[j]} />

          <div className={s.filterActions}>
            <button type="button" className={s.resetBtn}
              onClick={() => setFilters(getDefaultFilters())}>초기화</button>
            <button type="button" className={s.downloadBtn}
              disabled={downloading || sorted.length === 0}
              onClick={handleDownload}>
              {downloading ? '다운로드 중...' : `📥 엑셀 (${sorted.length}건)`}
            </button>
          </div>
        </div>
      </Section>

      {error && <p className={s.error}>{error}</p>}

      {/* 정렬 + 집계 */}
      <div className={s.sortBar}>
        <span className={s.sortLabel}>정렬</span>
        {SORTS.map((o) => (
          <button key={o.key} type="button"
            className={`${s.sortChip} ${sortKey === o.key ? s.sortChipOn : ''}`}
            onClick={() => onSort(o.key)}>
            {o.label}
            {sortKey === o.key && <span className={s.sortArrow}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
          </button>
        ))}
        <span className={y.counts}>
          전체 <b>{rows.length}</b> · 양호 <b className={y.ok}>{okCount}</b> · 불량 <b className={y.ng}>{ngCount}</b>
        </span>
      </div>

      {loading ? (
        <TableSkeleton rows={8} />
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>NO</th>
                <th>검사일</th>
                <th>순서</th>
                <th>모델</th>
                <th>모터</th>
                <th>호기</th>
                <th>판정</th>
                <th>외경</th>
                <th>진원도</th>
                <th>내경</th>
                <th>진원도</th>
                <th>동심도</th>
                <th>검사자</th>
                <th>비고</th>
                <th>요크 LOT</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={r.id} className={s.row}>
                  <td className={s.muted}>{(safePage - 1) * pageSize + i + 1}</td>
                  <td className={s.date}>{dateOf(r)}</td>
                  <td className={s.muted}>{r.sample_no ?? '-'}</td>
                  <td className={s.phiCell}>
                    {r.phi ? (
                      <>
                        <span className={s.phiDot} style={{ background: phiColor(r.phi) || '#ccc' }} />
                        Φ{r.phi}
                      </>
                    ) : '-'}
                  </td>
                  <td className={s.muted}>{MOTOR_LABEL[r.motor_type] || r.motor_type || '-'}</td>
                  <td className={s.muted}>{r.vendor || '-'}</td>
                  <td>
                    <span className={s.jBadge} style={{ background: J_COLOR[r.judgment] || '#9aa0a6' }}>
                      {J_LABEL[r.judgment] || r.judgment || '-'}
                    </span>
                  </td>
                  <td className={s.meas}>{fmtNum(r.outer_dia)}</td>
                  <td className={s.meas}>{fmtNum(r.outer_roundness)}</td>
                  <td className={s.meas}>{fmtNum(r.inner_dia)}</td>
                  <td className={s.meas}>{fmtNum(r.inner_roundness)}</td>
                  <td className={s.meas}>{fmtNum(r.concentricity)}</td>
                  <td className={s.muted}>{r.worker || '-'}</td>
                  <td className={y.remarkCell} title={[r.model_name, r.remark].filter(Boolean).join(' / ')}>
                    {[r.model_name, r.remark].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td className={s.lot}>{r.lot_ea_no}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={15} className={s.empty}>
                    조회된 검사 이력이 없습니다 — 기간·판정 조건을 바꿔보세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {sorted.length > 0 && (
        <div className={s.pagination}>
          <div className={s.pageSizeGroup}>
            <select className={s.pageSizeSelect} value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
              {[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n}개씩</option>)}
            </select>
          </div>
          <div className={s.pageNav}>
            <button type="button" className={s.pageBtn}
              disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>이전</button>
            <span className={s.pageIndicator}>{safePage} / {totalPages}</span>
            <button type="button" className={s.pageBtn}
              disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>다음</button>
          </div>
          <span className={s.pageInfo}>전체 {sorted.length}건</span>
        </div>
      )}
    </div>
  )
}
