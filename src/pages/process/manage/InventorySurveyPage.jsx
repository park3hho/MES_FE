// src/pages/process/manage/InventorySurveyPage.jsx
// 재고 실사 — 현장 카운트 입력 + 그 시점 전산 스냅샷 차이
// Phase 1: 입력 + 즉시 차이  /  Phase 2: 이력 목록 + 상세 (동결된 그리드 재현)
//
// 호출: App.jsx → /admin/inventory-survey
//
// 정책:
//   - 그리드는 단일 컴포넌트 — 입력 모드 vs 상세 모드(read-only)는 input/span 토글만 다름
//   - 차이 = 현장 sum − 전산 (저장 시 BE 가 그 순간 스냅샷 동결)
//   - 저장 후 입력 리셋 + 새 스냅샷 다시 로드

import { useState, useEffect, useMemo, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  getInventorySurveySnapshot, createInventorySurvey,
  listInventorySurveys, getInventorySurvey,
} from '@/api'
import { TOAST_MSG_MS, TOAST_ERROR_MS } from '@/constants/etcConst'
import s from './InventorySurveyPage.module.css'

// ─────────────────────────────────────────
// 상수 (이미지 표기 그대로 — Mini/Small/Medium/Large = phi 20/45/70/87)
// ─────────────────────────────────────────
const SIZES = [
  { phi: '20', label: 'Mini' },
  { phi: '45', label: 'Small' },
  { phi: '70', label: 'Medium' },
  { phi: '87', label: 'Large' },
]
const PHIS = SIZES.map((sz) => sz.phi)

// 좌측 행 — process 는 BE schemas.inventory_survey.STATE_TO_PROCESS 와 동기
const STATOR_ROWS = [
  { code: 'loose_sheet',     label: '낱장',       process: 'EA' },
  { code: 'ht_done',         label: '열처리완료', process: 'HT' },
  { code: 'bo_done',         label: '본딩완료',   process: 'BO' },
  { code: 'coating',         label: '도장중',     process: 'BO' },
  { code: 'inspection_wait', label: '검사대기',   process: 'EC' },
  { code: 'winding',         label: '권선중',     process: 'EC' },
  { code: 'wi_done',         label: '권선완료',   process: 'WI' },
  { code: 'so_done',         label: '중성점완료', process: 'SO' },
  { code: 'test_done',       label: '테스트완료', process: 'FP' },
  { code: 'packed',          label: '포장완료',   process: 'FP' },
]
const ROTOR_ROW = { code: 'rotor', label: '회전자', process: 'RT' }
const ALL_ROWS = [...STATOR_ROWS, ROTOR_ROW]

// 우측 공정 표시 블록 (이미지의 병합셀 재현)
const PROCESS_BLOCKS = [
  { code: 'EA', firstRowIdx: 0, span: 1 },
  { code: 'HT', firstRowIdx: 1, span: 1 },
  { code: 'BO', firstRowIdx: 2, span: 2 },   // 본딩완료 + 도장중
  { code: 'EC', firstRowIdx: 4, span: 2 },   // 검사대기 + 권선중
  { code: 'WI', firstRowIdx: 6, span: 1 },
  { code: 'SO', firstRowIdx: 7, span: 1 },
  { code: 'FP', firstRowIdx: 8, span: 2 },   // 테스트완료 + 포장완료
]
const FIRST_ROW_TO_PROCESS = Object.fromEntries(
  PROCESS_BLOCKS.map((b) => [b.firstRowIdx, b]),
)

// ─────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────
const num = (v) => {
  if (v === '' || v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const diffClass = (d) => (Math.abs(d) < 0.001 ? s.diffZero : s.diffNonZero)

const ymd = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const defaultFromDate = () => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return ymd(d)
}
const defaultToDate = () => ymd(new Date())

// 빈 counts dict (입력 초기화 / 상세 모드 기본값 폴백용)
const emptyCounts = () => {
  const o = {}
  for (const r of ALL_ROWS) {
    o[r.code] = {}
    for (const phi of PHIS) o[r.code][phi] = ''
  }
  return o
}

// entries 배열 → counts dict (상세 모드 표시용)
const entriesToCounts = (entries) => {
  const o = emptyCounts()
  for (const e of entries || []) {
    if (o[e.state_code]) o[e.state_code][e.phi] = e.physical_count
  }
  return o
}

// snapshot 배열 → {proc: {phi: count}} (상세 모드 — 동결된 스냅샷)
const snapshotArrayToMap = (arr) => {
  const m = {}
  for (const sn of arr || []) {
    m[sn.process_code] = m[sn.process_code] || {}
    m[sn.process_code][sn.phi] = sn.system_count
  }
  return m
}

// 숫자 표시 (.00 trailing zero 제거)
const fmtNum = (n) => Number(n || 0).toFixed(2).replace(/\.00$/, '')

// KST 일시 표시
const formatKstDateTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────
export default function InventorySurveyPage({ onBack }) {
  // 탭 / 모드
  const [tab, setTab] = useState('input')               // 'input' | 'history'
  const [historyMode, setHistoryMode] = useState('list')  // 'list' | 'detail'

  // 입력 모드 상태
  const [counts, setCounts] = useState(emptyCounts)
  const [snapshot, setSnapshot] = useState(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // 이력 모드 상태
  const [historyItems, setHistoryItems] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyDetail, setHistoryDetail] = useState(null)
  const [dateFrom, setDateFrom] = useState(defaultFromDate)
  const [dateTo, setDateTo] = useState(defaultToDate)

  // 토스트
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  // ── 입력 탭 활성 시 스냅샷 미리보기 로드 ──
  const loadSnapshot = useCallback(async () => {
    try {
      const r = await getInventorySurveySnapshot()
      setSnapshot(r.snapshot || null)
    } catch (e) {
      setErr(`전산 재고 조회 실패: ${e.message}`)
    }
  }, [])
  useEffect(() => {
    if (tab === 'input') loadSnapshot()
  }, [tab, loadSnapshot])

  // ── 이력 목록 로드 ──
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const r = await listInventorySurveys({ from: dateFrom, to: dateTo, limit: 200 })
      setHistoryItems(r.items || [])
    } catch (e) {
      setErr(`이력 조회 실패: ${e.message}`)
    } finally {
      setHistoryLoading(false)
    }
  }, [dateFrom, dateTo])
  useEffect(() => {
    if (tab === 'history' && historyMode === 'list') loadHistory()
  }, [tab, historyMode, loadHistory])

  // ── 상세 열기/닫기 ──
  const openDetail = async (id) => {
    setErr(null)
    try {
      const r = await getInventorySurvey(id)
      setHistoryDetail(r.survey)
      setHistoryMode('detail')
    } catch (e) {
      setErr(`상세 조회 실패: ${e.message}`)
    }
  }
  const closeDetail = () => {
    setHistoryDetail(null)
    setHistoryMode('list')
  }

  // ── 토스트 자동 해제 ──
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), TOAST_MSG_MS)
    return () => clearTimeout(t)
  }, [msg])
  useEffect(() => {
    if (!err) return
    const t = setTimeout(() => setErr(null), TOAST_ERROR_MS)
    return () => clearTimeout(t)
  }, [err])

  // 셀 입력 (입력 모드 전용)
  const setCell = (stateCode, phi, value) => {
    setCounts((prev) => ({
      ...prev,
      [stateCode]: { ...prev[stateCode], [phi]: value },
    }))
  }

  // ── 그리드 데이터 소스 결정 (모드별) ──
  const isReadOnly = tab === 'history' && historyMode === 'detail'
  const gridCounts = useMemo(() => {
    if (isReadOnly && historyDetail) return entriesToCounts(historyDetail.entries)
    return counts
  }, [isReadOnly, historyDetail, counts])
  const gridSnapshot = useMemo(() => {
    if (isReadOnly && historyDetail) return snapshotArrayToMap(historyDetail.snapshot)
    return snapshot
  }, [isReadOnly, historyDetail, snapshot])

  // ── 집계 (gridCounts + gridSnapshot 기준) ──
  const computed = useMemo(() => {
    const rowSubtotal = {}
    for (const r of ALL_ROWS) {
      rowSubtotal[r.code] = PHIS.reduce((acc, phi) => acc + num(gridCounts[r.code]?.[phi]), 0)
    }
    const physicalByProc = {}
    for (const r of ALL_ROWS) {
      const map = physicalByProc[r.process] || (physicalByProc[r.process] = {})
      for (const phi of PHIS) {
        map[phi] = (map[phi] || 0) + num(gridCounts[r.code]?.[phi])
      }
    }
    const physicalProcTotal = {}
    for (const proc of Object.keys(physicalByProc)) {
      physicalProcTotal[proc] = PHIS.reduce(
        (acc, phi) => acc + (physicalByProc[proc][phi] || 0), 0)
    }
    const diffProcTotal = {}
    for (const proc of Object.keys(physicalProcTotal)) {
      const sys = gridSnapshot
        ? PHIS.reduce((acc, phi) => acc + (gridSnapshot[proc]?.[phi] || 0), 0)
        : 0
      diffProcTotal[proc] = physicalProcTotal[proc] - sys
    }
    const statorColSum = {}
    for (const phi of PHIS) {
      statorColSum[phi] = STATOR_ROWS.reduce(
        (acc, r) => acc + num(gridCounts[r.code]?.[phi]), 0)
    }
    const statorGrandTotal = PHIS.reduce((acc, phi) => acc + statorColSum[phi], 0)
    return { rowSubtotal, diffProcTotal, statorColSum, statorGrandTotal }
  }, [gridCounts, gridSnapshot])

  // 공정별 시스템 합계 (전산 컬럼 표시)
  const systemProcTotal = useMemo(() => {
    if (!gridSnapshot) return {}
    const out = {}
    for (const proc of Object.keys(gridSnapshot)) {
      out[proc] = PHIS.reduce((acc, phi) => acc + (gridSnapshot[proc][phi] || 0), 0)
    }
    return out
  }, [gridSnapshot])

  // ── 저장 ──
  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setErr(null)
    try {
      const entries = []
      for (const r of ALL_ROWS) {
        for (const phi of PHIS) {
          entries.push({
            state_code: r.code,
            phi,
            physical_count: num(counts[r.code]?.[phi]),
          })
        }
      }
      await createInventorySurvey({ entries, note: note.trim() })
      setMsg('실사 저장 완료 — 그 순간의 전산 스냅샷이 동결되었어요.')
      setCounts(emptyCounts())
      setNote('')
      await loadSnapshot()
    } catch (e) {
      setErr(`저장 실패: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── 그리드 셀 렌더 (입력 vs 상세) ──
  const renderCell = (stateCode, phi) => {
    const val = gridCounts[stateCode]?.[phi]
    if (isReadOnly) {
      return (
        <td className={s.cellInputWrap}>
          <span className={s.cellReadOnly}>{val ? fmtNum(val) : 0}</span>
        </td>
      )
    }
    return (
      <td className={s.cellInputWrap}>
        <input
          className={s.cellInput}
          type="number"
          min="0"
          step="0.5"
          inputMode="decimal"
          value={val}
          onChange={(e) => setCell(stateCode, phi, e.target.value)}
        />
      </td>
    )
  }

  // ─────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────
  const showGrid = tab === 'input' || (tab === 'history' && historyMode === 'detail')

  return (
    <div className="page-flat">
      <PageHeader
        title="재고 실사"
        subtitle="현장 카운트 입력 → 그 순간 전산 재고와 차이 동결"
        onBack={onBack}
      />

      {/* 탭 바 */}
      <div className={s.tabs}>
        <button
          className={`${s.tab} ${tab === 'input' ? s.tabActive : ''}`}
          onClick={() => {
            setTab('input')
            setHistoryMode('list')
            setHistoryDetail(null)
          }}
        >
          입력
        </button>
        <button
          className={`${s.tab} ${tab === 'history' ? s.tabActive : ''}`}
          onClick={() => {
            setTab('history')
            setHistoryMode('list')
            setHistoryDetail(null)
          }}
        >
          이력
        </button>
      </div>

      {/* 그리드 (입력 모드 또는 이력 상세 모드) */}
      {showGrid && (
        <div className={s.wrap}>
          {/* 상세 모드 — 뒤로 + 메타 */}
          {isReadOnly && historyDetail && (
            <div className={s.detailHeader}>
              <button className="btn-text" onClick={closeDetail}>← 목록으로</button>
              <div className={s.detailMeta}>
                <strong>{formatKstDateTime(historyDetail.surveyed_at)}</strong>
                {historyDetail.note && <span className={s.detailNote}>· {historyDetail.note}</span>}
              </div>
            </div>
          )}

          <table className={s.grid}>
            <thead>
              <tr>
                <th className={s.headerLabel} rowSpan={2}>구분</th>
                <th className={s.headerStator} colSpan={SIZES.length + 1}>
                  Meta 제품 재공/재고 현황
                </th>
                <th className={s.headerCompare} colSpan={3}>
                  {isReadOnly ? '전산재고 비교 (동결)' : '전산재고 비교'}
                </th>
              </tr>
              <tr>
                {SIZES.map((sz) => (
                  <th key={sz.phi} className={s.headerSize}>{sz.label}</th>
                ))}
                <th className={s.headerSize}>소계</th>
                <th className={s.headerSize}>코드</th>
                <th className={s.headerSize}>전산</th>
                <th className={s.headerSize}>차이</th>
              </tr>
            </thead>

            <tbody>
              {STATOR_ROWS.map((r, idx) => {
                const block = FIRST_ROW_TO_PROCESS[idx]
                return (
                  <tr key={r.code}>
                    <th className={s.rowLabel}>{r.label}</th>
                    {PHIS.map((phi) => renderCell(r.code, phi))}
                    <td className={s.cellSubtotal}>{fmtNum(computed.rowSubtotal[r.code])}</td>
                    {block && (
                      <>
                        <td className={s.cellProcCode} rowSpan={block.span}>{block.code}</td>
                        <td className={s.cellSystem} rowSpan={block.span}>
                          {gridSnapshot ? fmtNum(systemProcTotal[block.code]) : '…'}
                        </td>
                        <td
                          className={`${s.cellDiff} ${diffClass(computed.diffProcTotal[block.code] ?? 0)}`}
                          rowSpan={block.span}
                        >
                          {fmtNum(computed.diffProcTotal[block.code] ?? 0)}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}

              {/* 고정자 합계 */}
              <tr className={s.totalRow}>
                <th className={s.rowLabel}>고정자 합계</th>
                {PHIS.map((phi) => (
                  <td key={phi} className={s.cellSubtotal}>{fmtNum(computed.statorColSum[phi])}</td>
                ))}
                <td className={s.cellSubtotal}>{fmtNum(computed.statorGrandTotal)}</td>
                <td colSpan={3} className={s.cellSpacer} />
              </tr>

              {/* 회전자 */}
              <tr className={s.rotorRow}>
                <th className={s.rowLabel}>{ROTOR_ROW.label}</th>
                {PHIS.map((phi) => renderCell(ROTOR_ROW.code, phi))}
                <td className={s.cellSubtotal}>{fmtNum(computed.rowSubtotal[ROTOR_ROW.code])}</td>
                <td className={s.cellProcCode}>RT</td>
                <td className={s.cellSystem}>
                  {gridSnapshot ? fmtNum(systemProcTotal['RT']) : '…'}
                </td>
                <td className={`${s.cellDiff} ${diffClass(computed.diffProcTotal['RT'] ?? 0)}`}>
                  {fmtNum(computed.diffProcTotal['RT'] ?? 0)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* 입력 모드일 때만 저장 영역 */}
          {!isReadOnly && (
            <div className={s.actions}>
              <input
                className={s.noteInput}
                type="text"
                placeholder="비고 (선택, 예: 5월 4주차 정기 실사)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
              />
              <button
                className="btn-primary btn-lg"
                onClick={handleSave}
                disabled={saving || !snapshot}
              >
                {saving ? '저장 중...' : '저장 (현 시점 차이 동결)'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 이력 목록 */}
      {tab === 'history' && historyMode === 'list' && (
        <div className={s.wrap}>
          <div className={s.historyFilter}>
            <label className={s.filterLabel}>기간</label>
            <input
              className={s.filterDate}
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <span>~</span>
            <input
              className={s.filterDate}
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
            <button className="btn-secondary btn-sm" onClick={loadHistory}>
              새로고침
            </button>
          </div>

          <table className={s.historyTable}>
            <thead>
              <tr>
                <th>실사일</th>
                <th>비고</th>
                <th>차이 절댓값 합</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {historyLoading ? (
                <tr><td colSpan={4} className={s.historyEmpty}>로딩 중...</td></tr>
              ) : historyItems.length === 0 ? (
                <tr><td colSpan={4} className={s.historyEmpty}>해당 기간 실사 이력이 없습니다.</td></tr>
              ) : (
                historyItems.map((it) => (
                  <tr
                    key={it.id}
                    className={s.historyRow}
                    onClick={() => openDetail(it.id)}
                  >
                    <td className={s.historyDate}>{formatKstDateTime(it.surveyed_at)}</td>
                    <td className={s.historyNote}>{it.note || '-'}</td>
                    <td
                      className={`${s.historyDiffSum} ${
                        (it.diff_abs_sum ?? 0) > 0.001 ? s.diffNonZero : s.diffZero
                      }`}
                    >
                      {fmtNum(it.diff_abs_sum)}
                    </td>
                    <td>
                      <span className={s.historyOpen}>상세 →</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {msg && <div className={s.toastInfo}>{msg}</div>}
      {err && <div className={s.toastError}>{err}</div>}
    </div>
  )
}
