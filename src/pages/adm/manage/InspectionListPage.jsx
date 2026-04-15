// src/pages/manage/InspectionListPage.jsx
// OQ 검사 데이터 목록 — 필터 + 테이블 + 엑셀 다운로드
// 호출: App.jsx → ADM 메뉴 INSPECT_LIST

import { useState, useEffect, useCallback } from 'react'
import { getOqInspections, downloadFilteredOqExcel, downloadKtReport, cycleInspectionJudgment } from '@/api'
import { FaradayLogo } from '@/components/FaradayLogo'
import { PHI_SPECS } from '@/constants/processConst'
import { JUDGMENT_COLORS, JUDGMENT_OPTIONS, isToggleable } from '@/constants/etcConst'
import s from './InspectionListPage.module.css'

const PHI_OPTIONS = ['', ...Object.keys(PHI_SPECS)]
const MOTOR_OPTIONS = ['', 'outer', 'inner']
const WIRE_OPTIONS = ['', 'copper', 'silver']

const judgmentColor = (j) => JUDGMENT_COLORS[j] || JUDGMENT_COLORS.FAIL
const phiColor = (phi) => PHI_SPECS[phi]?.color ?? '#ccc'

export default function InspectionListPage({ onLogout, onBack, onEdit }) {
  const [filters, setFilters] = useState({
    date_from: '',
    date_to: '',
    phi: '',
    motor_type: '',
    wire_type: '',
    judgment: '',
  })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)

  const setFilter = (key, val) => setFilters((prev) => ({ ...prev, [key]: val }))

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

  // 필터 변경 시 자동 조회 (초기 포함)
  useEffect(() => {
    handleSearch()
  }, [handleSearch])

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

  // 판정 순환 OK → FAIL → RECHECK → OK — 배지 클릭 시 호출
  const handleCycleJudgment = async (inspectionId) => {
    try {
      const res = await cycleInspectionJudgment(inspectionId)
      setRows((prev) =>
        prev.map((r) => (r.id === inspectionId ? { ...r, judgment: res.judgment } : r))
      )
    } catch (e) {
      setError(e.message)
    }
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
              <button className="btn-ghost btn-sm" onClick={onBack}>
                ← 이전
              </button>
            )}
            <button className="btn-ghost btn-sm" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        </div>

        {/* 필터 */}
        <div className={s.filterCard}>
          {/* 기간 */}
          <div className={s.filterRow}>
            <label className={s.filterLabel}>기간</label>
            <div className={s.filterControl}>
              <input
                className={`form-input ${s.dateInput}`}
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilter('date_from', e.target.value)}
              />
              <span className={s.dateSep}>~</span>
              <input
                className={`form-input ${s.dateInput}`}
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilter('date_to', e.target.value)}
              />
            </div>
          </div>

          {/* 파이 */}
          <div className={s.filterRow}>
            <label className={s.filterLabel}>Φ</label>
            <div className={s.chipRow}>
              {PHI_OPTIONS.map((p) => (
                <button
                  key={p}
                  className={`${s.chip} ${filters.phi === p ? s.chipActive : ''}`}
                  style={
                    filters.phi === p && p
                      ? { background: phiColor(p), color: '#fff', borderColor: phiColor(p) }
                      : {}
                  }
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
              {MOTOR_OPTIONS.map((m) => (
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

          {/* Wire */}
          <div className={s.filterRow}>
            <label className={s.filterLabel}>Wire</label>
            <div className={s.chipRow}>
              {WIRE_OPTIONS.map((w) => (
                <button
                  key={w}
                  className={`${s.chip} ${filters.wire_type === w ? s.chipActive : ''}`}
                  onClick={() => setFilter('wire_type', w)}
                >
                  {w || '전체'}
                </button>
              ))}
            </div>
          </div>

          {/* 판정 */}
          <div className={s.filterRow}>
            <label className={s.filterLabel}>판정</label>
            <div className={s.chipRow}>
              {JUDGMENT_OPTIONS.map((j) => (
                <button
                  key={j}
                  className={`${s.chip} ${filters.judgment === j ? s.chipActive : ''}`}
                  style={
                    filters.judgment === j && j
                      ? {
                          background: judgmentColor(j),
                          color: '#fff',
                          borderColor: judgmentColor(j),
                        }
                      : {}
                  }
                  onClick={() => setFilter('judgment', j)}
                >
                  {j || '전체'}
                </button>
              ))}
            </div>
          </div>

          {/* 버튼 */}
          <div className={s.filterActions}>
            <button className="btn-text btn-sm" onClick={handleReset}>
              초기화
            </button>
            <button
              className="btn-secondary btn-md"
              onClick={handleDownload}
              disabled={downloading || rows.length === 0}
            >
              {downloading ? '다운로드 중...' : `📥 엑셀 (${rows.length}건)`}
            </button>
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
                  <th>OQ LOT</th>
                  <th>SO LOT</th>
                  <th>시리얼</th>
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
                  {onEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`${r.judgment === 'FAIL' ? s.rowFail : ''} ${r.judgment === 'PENDING' ? s.rowPending : ''} ${r.judgment === 'RECHECK' ? s.rowRecheck : ''} ${r.judgment === 'PROBE' ? s.rowProbe : ''}`}
                  >
                    <td className={s.mono}>{r.lot_oq_no || '-'}</td>
                    <td className={s.mono}>{r.lot_so_no || '-'}</td>
                    <td className={s.mono}>{r.serial_no || '미정'}</td>
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
                        style={{
                          color: judgmentColor(r.judgment),
                          cursor: isToggleable(r.judgment) ? 'pointer' : 'default',
                          textDecoration: isToggleable(r.judgment) ? 'underline dotted' : 'none',
                        }}
                        onClick={() => isToggleable(r.judgment) && handleCycleJudgment(r.id)}
                        title={isToggleable(r.judgment) ? '클릭: PENDING → RECHECK → PROBE → FAIL → PENDING' : ''}
                      >
                        {r.judgment}
                      </span>
                    </td>
                    <td className={s.dateCell}>
                      {r.created_at ? r.created_at.slice(0, 10) : '-'}
                    </td>
                    {onEdit && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => onEdit(r.lot_so_no || r.lot_oq_no)}
                        >
                          수정
                        </button>
                        {r.test_phase === 3 && (
                          <button
                            className="btn-ghost btn-sm"
                            style={{ marginLeft: 4 }}
                            onClick={async () => {
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
                              } catch (e) { alert(e.message) }
                            }}
                          >
                            엑셀
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 모바일 카드 리스트 */}
        {rows.length > 0 && (
          <div className={s.cardList}>
            {rows.map((r) => (
              <div
                key={r.id}
                className={`${s.listCard} ${r.judgment === 'FAIL' ? s.listCardFail : ''}`}
              >
                <div className={s.cardTop}>
                  <span className={s.cardSerial}>{r.serial_no || '미정'}</span>
                  <div className={s.cardBadges}>
                    <span className={s.phiBadge} style={{ background: phiColor(r.phi) }}>
                      {r.phi}
                    </span>
                    {r.motor_type && <span className={s.cardMotor}>{r.motor_type}</span>}
                    <span
                      className={s.judgmentBadge}
                      style={{
                        color: judgmentColor(r.judgment),
                        cursor: isToggleable(r.judgment) ? 'pointer' : 'default',
                        textDecoration: isToggleable(r.judgment) ? 'underline dotted' : 'none',
                      }}
                      onClick={() => isToggleable(r.judgment) && handleCycleJudgment(r.id)}
                      title={isToggleable(r.judgment) ? '클릭: PENDING → RECHECK → PROBE → FAIL → PENDING' : ''}
                    >
                      {r.judgment}
                    </span>
                  </div>
                </div>
                <div className={s.cardMid}>
                  {r.lot_oq_no || '-'} · {r.lot_so_no || '-'} · {r.wire_type}
                </div>
                <div className={s.cardGrid}>
                  <span>
                    <span className={s.cardKey}>R </span>
                    <span className={s.cardVal}>{r.resistance ?? '-'}</span>
                  </span>
                  <span>
                    <span className={s.cardKey}>L </span>
                    <span className={s.cardVal}>{r.inductance ?? '-'}</span>
                  </span>
                  <span>
                    <span className={s.cardKey}>I.T </span>
                    <span className={s.cardVal}>{r.insulation ?? '-'}</span>
                  </span>
                </div>
                <div className={s.cardBottom}>
                  <span className={s.cardDate}>
                    {r.created_at ? r.created_at.slice(0, 10) : '-'}
                  </span>
                  {onEdit && (
                    <>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => onEdit(r.lot_so_no || r.lot_oq_no)}
                      >
                        수정
                      </button>
                      {r.test_phase === 3 && (
                        <button
                          className="btn-ghost btn-sm"
                          onClick={async () => {
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
                            } catch (e) { alert(e.message) }
                          }}
                        >
                          엑셀
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
