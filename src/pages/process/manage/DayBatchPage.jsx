// pages/process/manage/DayBatchPage.jsx
// 공정 일별 작업 — 한 공정 + 한 작업일(lot_num 의 YYMMDD)의 처리 LOT 묶음 (2026-05-22).
// 진입: TracePage 의 "같은 날·공정 전체 보기" 유도 (URL ?process=&date=).
// 데이터: PrintLog 기반 (/printer/day-batch). 날짜 기준 = lot_num 내 작업일.
//
// LOT 행 클릭 → 그 LOT 의 OQ 출하검사 수치 펼침 (traceLot 재사용 — BE 추가 0).
//   1:N — 한 LOT 이 여러 검사로 분기되면 모두 표시 (EA 등 무한스캔 공정).
//   여러 행 동시 펼침 가능 → 같은 날 LOT 들의 수치 세로 비교용. (2026-05-22)

import { useState, useEffect, useCallback, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '@/components/common/PageHeader'
import { getDayBatch, traceLot } from '@/api'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import s from './DayBatchPage.module.css'

// 공정 — RM 은 lot_num 에 날짜가 없어 제외. BE core/lot_config 와 동기.
const PROCESS_OPTIONS = [
  { code: 'MP', label: '자재준비' },
  { code: 'EA', label: '낱장가공' },
  { code: 'HT', label: '열처리' },
  { code: 'BO', label: '본딩' },
  { code: 'EC', label: '전착도장' },
  { code: 'WI', label: '권선' },
  { code: 'SO', label: '중성점' },
  { code: 'IQ', label: '수입검사' },
  { code: 'OQ', label: '출하검사' },
  { code: 'UB', label: '소포장' },
  { code: 'MB', label: '대포장' },
  { code: 'OB', label: '출하' },
]
const procLabel = (code) =>
  PROCESS_OPTIONS.find((p) => p.code === code)?.label || code

// YYMMDD → 'YYYY-MM-DD' 표시용
const fmtWorkDate = (yymmdd) => {
  if (!yymmdd || yymmdd.length !== 6) return yymmdd || '-'
  return `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`
}

const fmtKst = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// 측정 수치 — null/빈값 '-', 숫자면 소수 3자리까지
const fmtNum = (v) => {
  if (v == null || v === '') return '-'
  const n = Number(v)
  return Number.isNaN(n) ? String(v) : n.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

// 한 LOT 의 OQ 검사 수치 — 1:N (검사 여러 건)
function InspectionRows({ state }) {
  if (!state || state.loading) {
    return <span className={s.muted}>검사 수치 조회 중...</span>
  }
  if (state.error) return <span className={s.err}>{state.error}</span>
  const list = state.inspections || []
  if (list.length === 0) {
    return (
      <span className={s.muted}>
        연결된 OQ 출하검사 데이터가 없습니다 (아직 출하검사 전이거나 미연결).
      </span>
    )
  }
  return (
    <table className={s.inspTable}>
      <thead>
        <tr>
          <th>시리얼 / OQ</th><th>판정</th><th>R (Ω)</th><th>L (µH)</th>
          <th>I.T.</th><th>K_T rms</th><th>K_e rms</th>
          <th>외관</th><th>A</th><th>B</th><th>C</th><th>D</th><th>검사일</th>
        </tr>
      </thead>
      <tbody>
        {list.map((q) => (
          <tr key={q.id}>
            <td className={s.mono}>{q.serial_no || q.lot_oq_no || q.lot_so_no || '-'}</td>
            <td>
              <span className={`${s.judg} ${s[`j_${q.judgment}`] || ''}`}>
                {q.judgment || '-'}
              </span>
            </td>
            <td className={s.num}>{fmtNum(q.resistance)}</td>
            <td className={s.num}>{fmtNum(q.inductance)}</td>
            <td className={s.num}>{fmtNum(q.insulation)}</td>
            <td className={s.num}>{fmtNum(q.k_t_rms)}</td>
            <td className={s.num}>{fmtNum(q.k_e_rms)}</td>
            <td>{q.appearance || '-'}</td>
            <td>{q.dim_a || '-'}</td>
            <td>{q.dim_b || '-'}</td>
            <td>{q.dim_c || '-'}</td>
            <td>{q.dim_d || '-'}</td>
            <td className={s.timeCell}>{fmtKst(q.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function DayBatchPage({ onBack }) {
  const [searchParams, setSearchParams] = useSearchParams()
  // URL 이 진실의 원천 — 공유/새로고침에 강건
  const process = searchParams.get('process') || 'SO'
  const workDate = searchParams.get('date') || ''   // YYMMDD

  const [data, setData] = useState(null)   // {process, work_date, items[], count, error?}
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // LOT 행 펼침 — 여러 행 동시 펼침 허용(수치 비교용). inspCache = LOT별 검사결과 캐시.
  const [expanded, setExpanded] = useState(() => new Set())
  const [inspCache, setInspCache] = useState({})

  const setParam = (k, v) => {
    const next = new URLSearchParams(searchParams)
    if (v) next.set(k, v)
    else next.delete(k)
    setSearchParams(next, { replace: true })
  }

  const load = useCallback(async () => {
    if (!process || !workDate) { setData(null); return }
    setLoading(true); setError('')
    setExpanded(new Set())   // 공정/날짜 변경 시 펼침 초기화
    try {
      const r = await getDayBatch(process, workDate)
      setData(r)
      if (r.error) setError(r.error)
    } catch (e) {
      setError(e.message || '조회 실패')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [process, workDate])
  useEffect(() => { load() }, [load])

  // LOT → OQ 검사 수치 (traceLot 재사용 — 응답 inspections 가 분기까지 1:N 수집)
  const loadInspections = async (lotNum) => {
    setInspCache((p) => ({ ...p, [lotNum]: { loading: true } }))
    try {
      const r = await traceLot(lotNum)
      setInspCache((p) => ({
        ...p, [lotNum]: { loading: false, inspections: r.inspections || [] },
      }))
    } catch (e) {
      setInspCache((p) => ({
        ...p, [lotNum]: { loading: false, error: e.message || '검사 조회 실패' },
      }))
    }
  }

  const toggleExpand = (lotNum) => {
    const isOpen = expanded.has(lotNum)
    setExpanded((prev) => {
      const next = new Set(prev)
      if (isOpen) next.delete(lotNum)
      else next.add(lotNum)
      return next
    })
    if (!isOpen && !inspCache[lotNum]) loadInspections(lotNum)
  }

  const items = data?.items || []
  // 수량 합계 — 그날 그 공정 총 발행량 한눈에
  const totalQty = items.reduce((sum, it) => sum + (it.print_count || 0), 0)

  return (
    <div className="page-flat">
      <PageHeader
        title="공정 일별 작업"
        subtitle="한 공정의 같은 날 처리된 LOT — 행 클릭 시 OQ 검사 수치 펼침"
        onBack={onBack}
      />

      <div className={s.toolbar}>
        <label className={s.field}>
          <span className={s.fieldLabel}>공정</span>
          <select value={process} onChange={(e) => setParam('process', e.target.value)}>
            {PROCESS_OPTIONS.map((p) => (
              <option key={p.code} value={p.code}>{p.code} · {p.label}</option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          <span className={s.fieldLabel}>작업일</span>
          <input type="date"
            value={workDate ? toInputDate(workDate) : ''}
            onChange={(e) => setParam('date', toYYMMDD(e.target.value))} />
        </label>
      </div>

      {!workDate && (
        <p className={s.info}>작업일을 선택하면 해당 공정의 그날 처리 LOT 이 표시됩니다.</p>
      )}
      {loading && <p className={s.info}>조회 중...</p>}
      {error && <p className={s.err}>{error}</p>}

      {workDate && !loading && !error && data && (
        <>
          <div className={s.summary}>
            <span className={s.summaryProc}>{process} · {procLabel(process)}</span>
            <span className={s.summaryDate}>{fmtWorkDate(workDate)}</span>
            <span className={s.summaryCount}>
              LOT <b>{data.count}</b>건 · 총 수량 <b>{totalQty.toLocaleString()}</b>
            </span>
          </div>

          {items.length === 0 ? (
            <p className={s.info}>이 날짜·공정에 처리된 LOT 이 없습니다.</p>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>#</th><th>LOT 번호</th><th>수량</th>
                    <th>인쇄</th><th>첫 인쇄</th><th>작업자</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const isOpen = expanded.has(it.lot_num)
                    return (
                      <Fragment key={it.lot_num}>
                        <tr className={s.dataRow} onClick={() => toggleExpand(it.lot_num)}>
                          <td className={s.idx}>
                            <span className={s.caret}>{isOpen ? '▼' : '▶'}</span>
                            {' '}{i + 1}
                          </td>
                          <td className={s.mono}>{it.lot_num}</td>
                          <td className={s.num}>{it.print_count}</td>
                          <td className={s.num}>
                            {it.print_events > 1
                              ? <span className={s.reprint}>{it.print_events}회</span>
                              : '1회'}
                          </td>
                          <td className={s.timeCell}>{fmtKst(it.first_printed_at)}</td>
                          <td>{it.login_id || '-'}</td>
                        </tr>
                        {isOpen && (
                          <tr className={s.inspRow}>
                            <td colSpan={6}>
                              <InspectionRows state={inspCache[it.lot_num]} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
