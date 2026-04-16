// src/pages/adm/manage/InspectionListPage.jsx
// OQ 검사 목록 — Toss-style 리뉴얼
// ① 멀티셀렉트 필터 (배열 → 콤마 구분 API)
// ② 정렬 (날짜/Φ/판정)
// ③ 통합 카드 리스트 (테이블/모바일 이원화 제거)

import { useState, useEffect, useCallback, useMemo } from 'react'
import { getOqInspections, downloadFilteredOqExcel, downloadKtReport, cycleInspectionJudgment } from '@/api'
import { TableSkeleton } from '@/components/Skeleton'
import Section from '@/components/common/Section'
import { PHI_SPECS } from '@/constants/processConst'
import { JUDGMENT_COLORS, JUDGMENT_OPTIONS, isToggleable, OQ_SPEC } from '@/constants/etcConst'
import s from './InspectionListPage.module.css'

const PHI_OPTIONS = Object.keys(PHI_SPECS) // ['87','70','45','20']
const MOTOR_OPTIONS = ['outer', 'inner']
const WIRE_OPTIONS = ['copper', 'silver']

const judgmentColor = (j) => JUDGMENT_COLORS[j] || JUDGMENT_COLORS.FAIL
const phiColor = (phi) => PHI_SPECS[phi]?.color ?? 'var(--color-gray-light)'

// ── localStorage 필터 영속화 ──
const FILTER_KEY = 'inspectionListFilters_v2' // v2: 배열 기반
const VIEW_KEY = 'inspectionListView' // 'card' | 'table'

const getDefaultFilters = () => {
  const today = new Date()
  const weekAgo = new Date(today)
  weekAgo.setDate(today.getDate() - 6)
  const fmt = (d) => d.toISOString().slice(0, 10)
  return { date_from: fmt(weekAgo), date_to: fmt(today), phi: [], motor_type: [], wire_type: [], judgment: [] }
}

const loadFilters = () => {
  // 날짜는 항상 오늘 기준으로 리셋 (date_from/date_to는 localStorage에서 복원하지 않음)
  // 칩 필터(phi/motor/wire/judgment)만 이전 세션 값 유지
  const defaults = getDefaultFilters()
  try {
    const saved = localStorage.getItem(FILTER_KEY)
    if (saved) {
      const { phi, motor_type, wire_type, judgment } = JSON.parse(saved)
      return { ...defaults, phi: phi ?? [], motor_type: motor_type ?? [], wire_type: wire_type ?? [], judgment: judgment ?? [] }
    }
  } catch { /* */ }
  return defaults
}

// 배열 필터 → API 콤마 구분 문자열
const toApiFilters = (f) => ({
  date_from: f.date_from,
  date_to: f.date_to,
  phi: f.phi.join(','),
  motor_type: f.motor_type.join(','),
  wire_type: f.wire_type.join(','),
  judgment: f.judgment.join(','),
})

// ── 정렬 옵션 ──
const SORT_OPTIONS = [
  { key: 'created_at', label: '날짜' },
  { key: 'phi', label: 'Φ' },
  { key: 'judgment', label: '판정' },
  { key: 'serial_no', label: '시리얼' },
  { key: 'back_emf', label: 'K_t(RMS)' },
]

// ── 검사 카드 ──
function InspCard({ r, onEdit, onCycle }) {
  const serial = r.serial_no || '미정'
  const jColor = judgmentColor(r.judgment)
  const pColor = phiColor(r.phi)
  const canToggle = isToggleable(r.judgment)

  const handleDl = async (e) => {
    e.stopPropagation()
    try {
      const blob = await downloadKtReport(r.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(r.lot_oq_no || '').replace(/^OQ../, 'OQ') || r.serial_no || r.id}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) { alert(err.message) }
  }

  return (
    <div className={s.card} style={{ '--j-color': jColor, '--phi-color': pColor }}>
      <div className={s.row1}>
        <span className={s.phiDot} />
        <span className={s.serial}>{serial}</span>
        <button
          type="button"
          className={`${s.judgBadge} ${canToggle ? s.judgToggle : ''}`}
          onClick={canToggle ? () => onCycle(r.id) : undefined}
          title={canToggle ? 'PENDING → RECHECK → PROBE → FAIL → PENDING' : ''}
        >
          {r.judgment}
        </button>
      </div>
      <div className={s.row2}>
        <span className={s.spec}>Φ{r.phi}</span>
        {r.motor_type && <span className={s.spec}>{r.motor_type}</span>}
        <span className={s.spec}>{r.wire_type}</span>
        <span className={s.sep} />
        <span className={s.meas}>R <b>{r.resistance ?? '-'}</b></span>
        <span className={s.meas}>L <b>{r.inductance ?? '-'}</b></span>
        <span className={s.meas}>I.T <b>{r.insulation ?? '-'}</b></span>
        <span className={s.meas}>K_t(RMS) <b>{r.k_t_rms ?? r.back_emf ?? '-'}</b></span>
        <span className={s.meas}>K_t(PP) <b>{r.k_t_peak ?? '-'}</b></span>
      </div>
      <div className={s.row3}>
        <span className={s.lot}>{r.lot_oq_no || r.lot_so_no || '-'}</span>
        <span className={s.date}>{r.created_at ? r.created_at.slice(0, 10) : '-'}</span>
        <span className={s.actions}>
          {onEdit && (
            <button type="button" className={s.actBtn} onClick={() => onEdit(r.lot_so_no || r.lot_oq_no)}>
              수정
            </button>
          )}
          {r.test_phase === 3 && (
            <button type="button" className={s.actBtn} onClick={handleDl}>PDF</button>
          )}
        </span>
      </div>
    </div>
  )
}

// ── 테이블 뷰 (스프레드시트 스타일) ──
function InspTable({ rows, sortKey, sortDir, onSort, onEdit, onCycle }) {
  const handleDl = async (id, lotOq, serial) => {
    try {
      const blob = await downloadKtReport(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(lotOq || '').replace(/^OQ../, 'OQ') || serial || id}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) { alert(e.message) }
  }

  // 컬럼 정의 — sortable 표시
  const COLS = [
    { key: 'judgment',   label: '판정',    sort: true  },
    { key: 'serial_no',  label: '시리얼',  sort: true  },
    { key: 'lot_oq_no',  label: 'OQ LOT',  sort: false },
    { key: 'phi',        label: 'Φ',       sort: true  },
    { key: 'motor_type', label: 'Motor',   sort: false },
    { key: 'wire_type',  label: 'Wire',    sort: false },
    { key: 'resistance', label: 'R',       sort: false },
    { key: 'inductance', label: 'L',       sort: false },
    { key: 'insulation', label: 'I.T.',    sort: false },
    { key: 'k_t_rms',    label: 'Kt(RMS)', sort: true  },
    { key: 'k_t_peak',   label: 'Kt(PP)',  sort: false },
    { key: 'pp',         label: 'PP',      sort: false },
    { key: 'created_at', label: '날짜',    sort: true  },
    { key: '_actions',   label: '',        sort: false },
  ]

  const arrow = (key) => {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            {COLS.map((c) => (
              <th
                key={c.key}
                className={c.sort ? s.thSortable : ''}
                onClick={c.sort ? () => onSort(c.key === 'k_t_rms' ? 'back_emf' : c.key) : undefined}
              >
                {c.label}{c.sort && arrow(c.key === 'k_t_rms' ? 'back_emf' : c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pp = (r.phi && r.motor_type)
              ? OQ_SPEC[`${r.phi}_${r.motor_type}`]?.polePairs ?? '-'
              : '-'
            const canToggle = isToggleable(r.judgment)
            return (
              <tr key={r.id}>
                <td>
                  <button
                    type="button"
                    className={s.jBadge}
                    style={{ background: judgmentColor(r.judgment), cursor: canToggle ? 'pointer' : 'default' }}
                    onClick={canToggle ? () => onCycle(r.id) : undefined}
                    title={canToggle ? 'PENDING → RECHECK → PROBE → FAIL → PENDING' : ''}
                  >
                    {r.judgment}
                  </button>
                </td>
                <td className={s.mono}>{r.serial_no || '미정'}</td>
                <td className={s.mono}>{r.lot_oq_no || r.lot_so_no || '-'}</td>
                <td>
                  <span className={s.phiCell} style={{ background: phiColor(r.phi) }}>Φ{r.phi}</span>
                </td>
                <td>{r.motor_type || '-'}</td>
                <td>{r.wire_type || '-'}</td>
                <td className={s.num}>{r.resistance ?? '-'}</td>
                <td className={s.num}>{r.inductance ?? '-'}</td>
                <td className={s.num}>{r.insulation ?? '-'}</td>
                <td className={s.num}>{r.k_t_rms ?? r.back_emf ?? '-'}</td>
                <td className={s.num}>{r.k_t_peak ?? '-'}</td>
                <td className={s.num}>{pp}</td>
                <td className={s.dateCell}>{r.created_at ? r.created_at.slice(0, 10) : '-'}</td>
                <td className={s.actionsCell}>
                  {onEdit && (
                    <button type="button" className={s.actBtn}
                      onClick={() => onEdit(r.lot_so_no || r.lot_oq_no)}>수정</button>
                  )}
                  {r.test_phase === 3 && (
                    <button type="button" className={s.actBtn}
                      onClick={() => handleDl(r.id, r.lot_oq_no, r.serial_no)}>PDF</button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── 멀티셀렉트 칩 행 ──
function ChipRow({ label, options, selected, onToggle, colorFn }) {
  const allSelected = selected.length === 0 // 빈 배열 = 전체

  return (
    <div className={s.filterGroup}>
      <span className={s.fLabel}>{label}</span>
      <div className={s.chips}>
        {/* 전체 버튼 */}
        <button
          type="button"
          className={`${s.chip} ${allSelected ? s.chipOn : ''}`}
          onClick={() => onToggle(null)} // null = 전체 리셋
        >
          전체
        </button>
        {options.map((opt) => {
          const active = selected.includes(opt)
          const bg = active && colorFn ? colorFn(opt) : undefined
          return (
            <button
              key={opt}
              type="button"
              className={`${s.chip} ${active ? s.chipOn : ''}`}
              style={bg ? { background: bg, borderColor: bg } : undefined}
              onClick={() => onToggle(opt)}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
// 메인 페이지
// ════════════════════════════════════════════

export default function InspectionListPage({ onLogout, onBack, onEdit }) {
  const [filters, setFilters] = useState(loadFilters)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  // 뷰 모드: 'card' (기본) | 'table' — localStorage 영속
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) || 'card' } catch { return 'card' }
  })
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, viewMode) } catch { /* */ }
  }, [viewMode])

  // 칩 토글: null → 전체(빈 배열), 값 → 추가/제거
  const toggleFilter = (key, val) => {
    setFilters((prev) => {
      if (val === null) return { ...prev, [key]: [] }
      const arr = prev[key]
      return {
        ...prev,
        [key]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val],
      }
    })
  }

  // 영속화
  useEffect(() => {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)) } catch { /* */ }
  }, [filters])

  // 자동 조회
  const handleSearch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getOqInspections(toApiFilters(filters))
      setRows(data)
      setSearched(true)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => { handleSearch() }, [handleSearch])

  // 정렬
  const sortedRows = useMemo(() => {
    if (!rows.length) return rows
    return [...rows].sort((a, b) => {
      const va = a[sortKey] ?? ''
      const vb = b[sortKey] ?? ''
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // 엑셀 다운로드
  const handleDownload = async () => {
    setDownloading(true)
    try {
      const blob = await downloadFilteredOqExcel(toApiFilters(filters))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inspection_${filters.phi.length ? `phi${filters.phi.join('_')}` : 'FILTERED'}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e.message) }
    finally { setDownloading(false) }
  }

  // 판정 순환
  const handleCycleJudgment = async (id) => {
    try {
      const res = await cycleInspectionJudgment(id)
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, judgment: res.judgment } : r)))
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="page-flat">
      {/* 헤더 + 뒤로 (우상단) */}
      <div className={s.headerRow}>
        <div className="page-header" style={{ flex: 1 }}>
          <h1 className="page-title">OQ 검사 목록</h1>
          <p className="page-subtitle">필터 조건으로 검색 · 엑셀 다운로드</p>
        </div>
        {onBack && (
          <button type="button" className={s.backLink} onClick={onBack}>← 이전</button>
        )}
      </div>

      {/* 필터 */}
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

          <ChipRow label="Φ" options={PHI_OPTIONS} selected={filters.phi}
            onToggle={(v) => toggleFilter('phi', v)} colorFn={phiColor} />
          <ChipRow label="Motor" options={MOTOR_OPTIONS} selected={filters.motor_type}
            onToggle={(v) => toggleFilter('motor_type', v)} />
          <ChipRow label="Wire" options={WIRE_OPTIONS} selected={filters.wire_type}
            onToggle={(v) => toggleFilter('wire_type', v)} />
          <ChipRow label="판정" options={JUDGMENT_OPTIONS.filter(Boolean)} selected={filters.judgment}
            onToggle={(v) => toggleFilter('judgment', v)} colorFn={judgmentColor} />

          <div className={s.filterActions}>
            <button type="button" className={s.resetBtn} onClick={() => setFilters(getDefaultFilters())}>
              초기화
            </button>
            <button type="button" className={s.downloadBtn}
              onClick={handleDownload} disabled={downloading || rows.length === 0}>
              {downloading ? '다운로드 중...' : `📥 엑셀 (${rows.length}건)`}
            </button>
          </div>
        </div>
      </Section>

      {error && <p className={s.error}>{error}</p>}

      {/* 결과 */}
      <Section label={searched && !loading ? `결과 ${rows.length}건` : '결과'}>
        {/* 정렬 바 + 뷰 토글 */}
        {rows.length > 0 && (
          <div className={s.sortBar}>
            <span className={s.sortLabel}>정렬</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`${s.sortChip} ${sortKey === opt.key ? s.sortChipOn : ''}`}
                onClick={() => handleSort(opt.key)}
              >
                {opt.label}
                {sortKey === opt.key && (
                  <span className={s.sortArrow}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
            ))}
            {/* 뷰 토글 — 우측 끝 */}
            <div className={s.viewToggle}>
              <button
                type="button"
                className={`${s.viewBtn} ${viewMode === 'card' ? s.viewBtnOn : ''}`}
                onClick={() => setViewMode('card')}
                title="카드 뷰"
                aria-label="카드 뷰"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/>
                </svg>
              </button>
              <button
                type="button"
                className={`${s.viewBtn} ${viewMode === 'table' ? s.viewBtnOn : ''}`}
                onClick={() => setViewMode('table')}
                title="테이블 뷰"
                aria-label="테이블 뷰"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="3" x2="12" y2="21"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {loading && <TableSkeleton rows={5} cols={4} />}

        {!loading && searched && rows.length === 0 && (
          <p className={s.empty}>조건에 맞는 데이터가 없습니다.</p>
        )}

        {!loading && sortedRows.length > 0 && (
          viewMode === 'table' ? (
            <InspTable
              rows={sortedRows}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onEdit={onEdit}
              onCycle={handleCycleJudgment}
            />
          ) : (
            <div className={s.list}>
              {sortedRows.map((r) => (
                <InspCard key={r.id} r={r} onEdit={onEdit} onCycle={handleCycleJudgment} />
              ))}
            </div>
          )
        )}
      </Section>
    </div>
  )
}
