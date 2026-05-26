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
//   - 제목/모델(phi) 필터/삭제 (2026-05-26 추가)

import { useState, useEffect, useMemo, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  getInventorySurveySnapshot, createInventorySurvey,
  listInventorySurveys, getInventorySurvey, deleteInventorySurvey,
} from '@/api'
import { TOAST_MSG_MS, TOAST_ERROR_MS } from '@/constants/etcConst'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
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
// EA(낱장)·HT(열처리완료) 는 표시·집계 제외 (사용자 요청 2026-05-26) — BO 부터 시작.
//   현장 카운트 대상이 아니라 차이값 의미 없음. snapshot 은 BE 가 여전히 EA/HT 포함 응답하지만
//   행이 없으면 렌더·rowSubtotal·diffProcTotal·entries 모두 자동 제외됨.
const STATOR_ROWS = [
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

// 우측 공정 표시 블록 (이미지의 병합셀 재현) — EA/HT 제거에 맞춰 인덱스 재계산.
const PROCESS_BLOCKS = [
  { code: 'BO', firstRowIdx: 0, span: 2 },   // 본딩완료 + 도장중
  { code: 'EC', firstRowIdx: 2, span: 2 },   // 검사대기 + 권선중
  { code: 'WI', firstRowIdx: 4, span: 1 },
  { code: 'SO', firstRowIdx: 5, span: 1 },
  { code: 'FP', firstRowIdx: 6, span: 2 },   // 테스트완료 + 포장완료
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
// 부호 살린 표시 — 양수 앞에 + 붙임 (음수는 native '-', 0 은 그대로 '0')
const fmtSigned = (n) => {
  const v = Number(n || 0)
  if (Math.abs(v) < 0.001) return '0'
  const str = fmtNum(v)
  return v > 0 ? `+${str}` : str
}

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
  const confirm = useConfirm()
  // 탭 / 모드
  const [tab, setTab] = useState('input')               // 'input' | 'history'
  const [historyMode, setHistoryMode] = useState('list')  // 'list' | 'detail'

  // 입력 모드 상태
  const [counts, setCounts] = useState(emptyCounts)
  const [snapshot, setSnapshot] = useState(null)
  const [title, setTitle] = useState('')                  // 제목 (2026-05-26)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // 이력 모드 상태
  const [historyItems, setHistoryItems] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyDetail, setHistoryDetail] = useState(null)
  const [dateFrom, setDateFrom] = useState(defaultFromDate)
  const [dateTo, setDateTo] = useState(defaultToDate)
  const [deletingId, setDeletingId] = useState(null)      // 삭제 중인 row id

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

  // ── 이력 행 삭제 (2026-05-26) ──
  //   confirm 후 BE DELETE 호출 + 로컬 리스트에서 제거. 행 클릭(상세 열기) 와 분리.
  const handleDelete = async (it, e) => {
    e?.stopPropagation()
    if (deletingId === it.id) return
    const titleStr = it.title || it.note || '이 실사'
    if (
      !(await confirm({
        title: '실사 스냅샷 삭제',
        message: `'${titleStr}' (${formatKstDateTime(it.surveyed_at)}) 을(를) 삭제할까요?\n동결된 차이값/스냅샷도 함께 사라집니다.`,
        confirmText: '삭제',
        danger: true,
      }))
    )
      return
    setDeletingId(it.id)
    try {
      await deleteInventorySurvey(it.id)
      setHistoryItems((prev) => prev.filter((x) => x.id !== it.id))
      setMsg('삭제되었습니다.')
    } catch (ee) {
      setErr(`삭제 실패: ${ee.message}`)
    } finally {
      setDeletingId(null)
    }
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
      await createInventorySurvey({
        entries,
        title: title.trim(),
        note: note.trim(),
      })
      setMsg('실사 저장 완료 — 그 순간의 전산 스냅샷이 동결되었어요.')
      setCounts(emptyCounts())
      setTitle('')
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
        <td key={phi} className={s.cellInputWrap}>
          <span className={s.cellReadOnly}>{val ? fmtNum(val) : 0}</span>
        </td>
      )
    }
    return (
      <td key={phi} className={s.cellInputWrap}>
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
          {/* 상세 모드 — 뒤로 + 메타 (제목 강조) */}
          {isReadOnly && historyDetail && (
            <div className={s.detailHeader}>
              <button className="btn-text" onClick={closeDetail}>← 목록으로</button>
              <div className={s.detailMeta}>
                {historyDetail.title && (
                  <strong className={s.detailTitle}>{historyDetail.title}</strong>
                )}
                <span className={s.detailWhen}>{formatKstDateTime(historyDetail.surveyed_at)}</span>
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
                          {fmtSigned(computed.diffProcTotal[block.code] ?? 0)}
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
                  {fmtSigned(computed.diffProcTotal['RT'] ?? 0)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* 입력 모드일 때만 저장 영역 — 제목 + 비고 + 저장 */}
          {!isReadOnly && (
            <div className={s.actions}>
              <input
                className={s.titleInput}
                type="text"
                placeholder="제목 (예: 5월 4주차 정기 실사)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
              <input
                className={s.noteInput}
                type="text"
                placeholder="비고 (선택)"
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
                <th>제목</th>
                <th>비고</th>
                <th>차이 합 (±)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {historyLoading ? (
                <tr><td colSpan={5} className={s.historyEmpty}>로딩 중...</td></tr>
              ) : historyItems.length === 0 ? (
                <tr><td colSpan={5} className={s.historyEmpty}>해당 기간 실사 이력이 없습니다.</td></tr>
              ) : (
                historyItems.map((it) => (
                  <tr
                    key={it.id}
                    className={s.historyRow}
                    onClick={() => openDetail(it.id)}
                  >
                    <td className={s.historyDate}>{formatKstDateTime(it.surveyed_at)}</td>
                    <td className={s.historyTitle}>{it.title || '-'}</td>
                    <td className={s.historyNote}>{it.note || '-'}</td>
                    <td
                      className={`${s.historyDiffSum} ${
                        Math.abs(it.diff_sum ?? 0) > 0.001 ? s.diffNonZero : s.diffZero
                      }`}
                    >
                      {fmtSigned(it.diff_sum)}
                    </td>
                    <td className={s.historyActions}>
                      <button
                        type="button"
                        className={s.historyDelBtn}
                        onClick={(e) => handleDelete(it, e)}
                        disabled={deletingId === it.id}
                        title="이 실사 삭제"
                      >
                        {deletingId === it.id ? '삭제 중…' : '삭제'}
                      </button>
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
