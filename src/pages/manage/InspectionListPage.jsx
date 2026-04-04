// src/pages/manage/InspectionListPage.jsx
// OQ 검사 데이터 목록 — 필터 + 테이블 + 엑셀 다운로드
// 호출: App.jsx → ADM 메뉴 INSPECT_LIST

import { useState, useEffect, useCallback } from 'react'
import { getOqInspections, downloadFilteredOqExcel } from '@/api'
import { FaradayLogo } from '@/components/FaradayLogo'
import { PHI_SPECS } from '@/constants/processConst'
import s from './InspectionListPage.module.css'

const PHI_OPTIONS = ['', ...Object.keys(PHI_SPECS)]
const MOTOR_OPTIONS = ['', 'outer', 'inner']
const WIRE_OPTIONS = ['', 'copper', 'silver']
const JUDGMENT_OPTIONS = ['', 'OK', 'FAIL']

const judgmentColor = (j) => (j === 'OK' ? '#1a9e75' : '#c0392b')
const phiColor = (phi) => PHI_SPECS[phi]?.color ?? '#ccc'

export default function InspectionListPage({ onLogout, onBack }) {
  const [filters, setFilters] = useState({
    date_from: '', date_to: '',
    phi: '', motor_type: '', wire_type: '', judgment: '',
  })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }))

  const handleSearch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getOqInspections(filters)
      setRows(data)
      setSearched(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  // 초기 전체 조회
  useEffect(() => { handleSearch() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const blob = await downloadFilteredOqExcel(filters)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const label = filters.phi ? `phi${filters.phi}` : 'FILTERED'
      a.download = `inspection_${label}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message)
    } finally {
      setDownloading(false)
    }
  }

  const handleReset = () => {
    setFilters({ date_from: '', date_to: '', phi: '', motor_type: '', wire_type: '', judgment: '' })
  }

  return (
    <div className={s.page}>
      <div className={s.container}>
        {/* 헤더 */}
        <div className={s.header}>
          <div className={s.headerLeft}>
            <FaradayLogo size="sm" />
            <div>
              <p className={s.title}>OQ 검사 목록</p>
              <p className={s.sub}>필터 조건으로 검색하고 엑셀로 다운로드</p>
            </div>
          </div>
          <div className={s.headerBtns}>
            {onBack && (
              <button className="btn-ghost btn-sm" onClick={onBack}>← 이전</button>
            )}
            <button className="btn-ghost btn-sm" onClick={onLogout}>로그아웃</button>
          </div>
        </div>

        {/* 필터 */}
        <div className={s.filterCard}>
          {/* 날짜 범위 */}
          <div className={s.filterRow}>
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>시작일</label>
              <input
                className={`form-input ${s.dateInput}`}
                type="date"
                value={filters.date_from}
                onChange={e => setFilter('date_from', e.target.value)}
              />
            </div>
            <span className={s.dateSep}>~</span>
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>종료일</label>
              <input
                className={`form-input ${s.dateInput}`}
                type="date"
                value={filters.date_to}
                onChange={e => setFilter('date_to', e.target.value)}
              />
            </div>
          </div>

          {/* 파이 */}
          <div className={s.filterRow}>
            <label className={s.filterLabel}>Φ</label>
            <div className={s.chipRow}>
              {PHI_OPTIONS.map(p => (
                <button
                  key={p}
                  className={`${s.chip} ${filters.phi === p ? s.chipActive : ''}`}
                  style={filters.phi === p && p ? { background: phiColor(p), color: '#fff', borderColor: phiColor(p) } : {}}
                  onClick={() => setFilter('phi', p)}
                >
                  {p ? `Φ${p}` : '전체'}
                </button>
              ))}
            </div>
          </div>

          {/* Motor Type */}
          <div className={s.filterRow}>
            <label className={s.filterLabel}>Motor</label>
            <div className={s.chipRow}>
              {MOTOR_OPTIONS.map(m => (
                <button
                  key={m}
                  className={`${s.chip} ${filters.motor_type === m ? s.chipActive : ''}`}
                  onClick={() => setFilter('motor_type', m)}
                >
                  {m || '전체'}
                </button>
              ))}
            </div>
          </div>

          {/* Wire / Judgment */}
          <div className={s.filterRow}>
            <label className={s.filterLabel}>Wire</label>
            <div className={s.chipRow}>
              {WIRE_OPTIONS.map(w => (
                <button
                  key={w}
                  className={`${s.chip} ${filters.wire_type === w ? s.chipActive : ''}`}
                  onClick={() => setFilter('wire_type', w)}
                >
                  {w || '전체'}
                </button>
              ))}
            </div>
            <label className={s.filterLabel} style={{ marginLeft: 16 }}>판정</label>
            <div className={s.chipRow}>
              {JUDGMENT_OPTIONS.map(j => (
                <button
                  key={j}
                  className={`${s.chip} ${filters.judgment === j ? s.chipActive : ''}`}
                  style={filters.judgment === j && j ? { background: judgmentColor(j), color: '#fff', borderColor: judgmentColor(j) } : {}}
                  onClick={() => setFilter('judgment', j)}
                >
                  {j || '전체'}
                </button>
              ))}
            </div>
          </div>

          {/* 버튼 */}
          <div className={s.filterActions}>
            <button className="btn-text btn-sm" onClick={handleReset}>초기화</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-secondary btn-md"
                onClick={handleDownload}
                disabled={downloading || rows.length === 0}
              >
                {downloading ? '다운로드 중...' : `📥 엑셀 (${rows.length}건)`}
              </button>
              <button className="btn-primary btn-md" onClick={handleSearch} disabled={loading}>
                {loading ? '검색 중...' : '🔍 검색'}
              </button>
            </div>
          </div>
        </div>

        {/* 에러 */}
        {error && <p className={s.error}>{error}</p>}

        {/* 결과 카운트 */}
        {searched && !loading && (
          <p className={s.count}>
            {rows.length > 0 ? `총 ${rows.length}건` : '조건에 맞는 데이터가 없습니다.'}
          </p>
        )}

        {/* 테이블 */}
        {rows.length > 0 && (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>시리얼</th>
                  <th>OQ LOT</th>
                  <th>Φ</th>
                  <th>Motor</th>
                  <th>Wire</th>
                  <th>R (Ω)</th>
                  <th>L</th>
                  <th>I.T.</th>
                  <th>외관</th>
                  <th>Go/No-go</th>
                  <th>Pin</th>
                  <th>판정</th>
                  <th>일시</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={r.judgment === 'FAIL' ? s.rowFail : ''}>
                    <td className={s.mono}>{r.serial_no}</td>
                    <td className={s.mono}>{r.lot_oq_no}</td>
                    <td>
                      <span className={s.phiBadge} style={{ background: phiColor(r.phi) }}>
                        Φ{r.phi}
                      </span>
                    </td>
                    <td>{r.motor_type || '-'}</td>
                    <td>{r.wire_type}</td>
                    <td>{r.resistance ?? '-'}</td>
                    <td>{r.inductance ?? '-'}</td>
                    <td>{r.insulation != null ? `${r.insulation}` : '-'}</td>
                    <td className={r.appearance === 'NG' ? s.ng : ''}>{r.appearance}</td>
                    <td className={r.dim_b === 'NG' ? s.ng : ''}>{r.dim_b}</td>
                    <td className={r.dim_d === 'NG' ? s.ng : ''}>{r.dim_d}</td>
                    <td>
                      <span
                        className={s.judgmentBadge}
                        style={{ color: judgmentColor(r.judgment) }}
                      >
                        {r.judgment}
                      </span>
                    </td>
                    <td className={s.dateCell}>
                      {r.created_at ? r.created_at.replace('T', ' ').slice(0, 16) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
