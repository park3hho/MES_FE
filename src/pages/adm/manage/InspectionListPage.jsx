// src/pages/adm/manage/InspectionListPage.jsx
// OQ 검사 목록 — Toss-style 리뉴얼
// page-flat + Section + 통합 카드 리스트 (테이블/모바일 이원화 제거)

import { useState, useEffect, useCallback } from 'react'
import { getOqInspections, downloadFilteredOqExcel, downloadKtReport, cycleInspectionJudgment } from '@/api'
import { TableSkeleton } from '@/components/Skeleton'
import Section from '@/components/common/Section'
import { PHI_SPECS } from '@/constants/processConst'
import { JUDGMENT_COLORS, JUDGMENT_OPTIONS, isToggleable } from '@/constants/etcConst'
import s from './InspectionListPage.module.css'

const PHI_OPTIONS = ['', ...Object.keys(PHI_SPECS)]
const MOTOR_OPTIONS = ['', 'outer', 'inner']
const WIRE_OPTIONS = ['', 'copper', 'silver']

const judgmentColor = (j) => JUDGMENT_COLORS[j] || JUDGMENT_COLORS.FAIL
const phiColor = (phi) => PHI_SPECS[phi]?.color ?? 'var(--color-gray-light)'

// ── 필터 localStorage 영속화 ──
const FILTER_KEY = 'inspectionListFilters'

const getDefaultFilters = () => {
  const today = new Date()
  const weekAgo = new Date(today)
  weekAgo.setDate(today.getDate() - 6)
  const fmt = (d) => d.toISOString().slice(0, 10)
  return { date_from: fmt(weekAgo), date_to: fmt(today), phi: '', motor_type: '', wire_type: '', judgment: '' }
}

const loadFilters = () => {
  try {
    const saved = localStorage.getItem(FILTER_KEY)
    if (saved) return { ...getDefaultFilters(), ...JSON.parse(saved) }
  } catch { /* ignore */ }
  return getDefaultFilters()
}

// ── 검사 카드 한 행 ──
function InspCard({ r, onEdit, onCycle }) {
  const serial = r.serial_no || '미정'
  const jColor = judgmentColor(r.judgment)
  const pColor = phiColor(r.phi)
  const canToggle = isToggleable(r.judgment)

  const handleDownload = async (e) => {
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
    <div
      className={s.card}
      style={{ '--j-color': jColor, '--phi-color': pColor }}
    >
      {/* Row 1: serial + judgment */}
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

      {/* Row 2: specs + measures */}
      <div className={s.row2}>
        <span className={s.spec}>Φ{r.phi}</span>
        {r.motor_type && <span className={s.spec}>{r.motor_type}</span>}
        <span className={s.spec}>{r.wire_type}</span>
        <span className={s.sep} />
        <span className={s.meas}>R <b>{r.resistance ?? '-'}</b></span>
        <span className={s.meas}>L <b>{r.inductance ?? '-'}</b></span>
        <span className={s.meas}>I.T <b>{r.insulation ?? '-'}</b></span>
      </div>

      {/* Row 3: lot info + date + actions */}
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
            <button type="button" className={s.actBtn} onClick={handleDownload}>엑셀</button>
          )}
        </span>
      </div>
    </div>
  )
}

// ── 칩 필터 행 ──
function ChipRow({ label, options, value, onChange, colorFn }) {
  return (
    <div className={s.filterGroup}>
      <span className={s.fLabel}>{label}</span>
      <div className={s.chips}>
        {options.map((opt) => {
          const active = value === opt
          const bg = active && opt && colorFn ? colorFn(opt) : undefined
          return (
            <button
              key={opt}
              type="button"
              className={`${s.chip} ${active ? s.chipOn : ''}`}
              style={bg ? { background: bg, borderColor: bg, color: '#fff' } : undefined}
              onClick={() => onChange(opt)}
            >
              {opt || '전체'}
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

  const setFilter = (key, val) => setFilters((prev) => ({ ...prev, [key]: val }))

  // 필터 영속화
  useEffect(() => {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)) } catch { /* */ }
  }, [filters])

  // 필터 변경 시 자동 조회
  const handleSearch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getOqInspections(filters)
      setRows(data)
      setSearched(true)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => { handleSearch() }, [handleSearch])

  // 엑셀 다운로드
  const handleDownload = async () => {
    setDownloading(true)
    try {
      const blob = await downloadFilteredOqExcel(filters)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inspection_${filters.phi ? `phi${filters.phi}` : 'FILTERED'}.xlsx`
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
      {/* 헤더 */}
      <div className="page-header">
        <h1 className="page-title">OQ 검사 목록</h1>
        <p className="page-subtitle">필터 조건으로 검색 · 엑셀 다운로드</p>
      </div>

      {/* 필터 */}
      <Section label="필터">
        <div className={s.filterWrap}>
          {/* 기간 */}
          <div className={s.filterGroup}>
            <span className={s.fLabel}>기간</span>
            <div className={s.dateRange}>
              <input
                className={s.dateInput}
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilter('date_from', e.target.value)}
              />
              <span className={s.dateSep}>~</span>
              <input
                className={s.dateInput}
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilter('date_to', e.target.value)}
              />
            </div>
          </div>

          <ChipRow label="Φ" options={PHI_OPTIONS} value={filters.phi}
            onChange={(v) => setFilter('phi', v)} colorFn={phiColor} />
          <ChipRow label="Motor" options={MOTOR_OPTIONS} value={filters.motor_type}
            onChange={(v) => setFilter('motor_type', v)} />
          <ChipRow label="Wire" options={WIRE_OPTIONS} value={filters.wire_type}
            onChange={(v) => setFilter('wire_type', v)} />
          <ChipRow label="판정" options={JUDGMENT_OPTIONS} value={filters.judgment}
            onChange={(v) => setFilter('judgment', v)} colorFn={judgmentColor} />

          <div className={s.filterActions}>
            <button type="button" className={s.resetBtn} onClick={() => setFilters(getDefaultFilters())}>
              초기화
            </button>
            <button
              type="button"
              className={s.downloadBtn}
              onClick={handleDownload}
              disabled={downloading || rows.length === 0}
            >
              {downloading ? '다운로드 중...' : `📥 엑셀 (${rows.length}건)`}
            </button>
          </div>
        </div>
      </Section>

      {/* 에러 */}
      {error && <p className={s.error}>{error}</p>}

      {/* 결과 */}
      <Section label={searched && !loading ? `결과 ${rows.length}건` : '결과'}>
        {loading && <TableSkeleton rows={5} cols={4} />}

        {!loading && searched && rows.length === 0 && (
          <p className={s.empty}>조건에 맞는 데이터가 없습니다.</p>
        )}

        {!loading && rows.length > 0 && (
          <div className={s.list}>
            {rows.map((r) => (
              <InspCard
                key={r.id}
                r={r}
                onEdit={onEdit}
                onCycle={handleCycleJudgment}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
