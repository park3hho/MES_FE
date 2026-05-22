// pages/process/manage/DayBatchPage.jsx
// 공정 일별 작업 — 한 공정 + 한 작업일(lot_num 의 YYMMDD)의 처리 LOT 묶음 (2026-05-22).
// 진입: TracePage 의 "같은 날·공정 전체 보기" 유도 (URL ?process=&date=).
// 데이터: PrintLog 기반 (/printer/day-batch). 날짜 기준 = lot_num 내 작업일.

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '@/components/common/PageHeader'
import { getDayBatch } from '@/api'
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

export default function DayBatchPage({ onBack }) {
  const [searchParams, setSearchParams] = useSearchParams()
  // URL 이 진실의 원천 — 공유/새로고침에 강건
  const process = searchParams.get('process') || 'SO'
  const workDate = searchParams.get('date') || ''   // YYMMDD

  const [data, setData] = useState(null)   // {process, work_date, items[], count, error?}
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const setParam = (k, v) => {
    const next = new URLSearchParams(searchParams)
    if (v) next.set(k, v)
    else next.delete(k)
    setSearchParams(next, { replace: true })
  }

  const load = useCallback(async () => {
    if (!process || !workDate) { setData(null); return }
    setLoading(true); setError('')
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

  const items = data?.items || []
  // 수량 합계 — 그날 그 공정 총 발행량 한눈에
  const totalQty = items.reduce((sum, it) => sum + (it.print_count || 0), 0)

  return (
    <div className="page-flat">
      <PageHeader
        title="공정 일별 작업"
        subtitle="한 공정의 같은 날 처리된 LOT 을 한눈에"
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
                  {items.map((it, i) => (
                    <tr key={it.lot_num}>
                      <td className={s.idx}>{i + 1}</td>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
