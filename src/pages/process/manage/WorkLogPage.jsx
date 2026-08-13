// pages/process/manage/WorkLogPage.jsx
// 작업일지 (2026-08-12) — 현장 엑셀 작업일지 대체. LOT 발급 1건 = 1행.
//   ★ 기록은 LOT 발급이 자동으로 남긴다(작업자 동작 0). 이 화면은 '틀렸을 때 고치는' 용도다:
//     시각 보정 / 정지 입력 / 근무시간(휴게) 설정.
//   ★ 시각 보정은 반드시 배치 단위 — 한 번의 작업이 N개 LOT 을 만들고 구간을 나눠 갖기 때문에
//     한 행만 고치면 나머지와 이가 안 맞는다. batch_key 로 묶어 N행을 한꺼번에 재분배한다.
import { useState, useEffect, useMemo, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  listWorkLogs, patchWorkLogBatchTime, addWorkLogStop, deleteWorkLogStop,
  getWorkTimeConfig, patchWorkShift, saveWorkBreak, deleteWorkBreak,
} from '@/api'
import s from './WorkLogPage.module.css'

const TABS = [
  { key: 'log', label: '작업일지' },
  { key: 'config', label: '근무시간 설정' },
]
const PROCESSES = [
  { code: 'REA', label: '요크가공' },
  { code: 'RBO1', label: '1차 본딩' },
  { code: 'RBO2', label: '2차 본딩' },
]
const DOW = ['월', '화', '수', '목', '금', '토', '일']

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const hm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const md = (isoDate) => { const [, m, dd] = isoDate.split('-'); return `${Number(m)}/${Number(dd)}` }
// ISO 로컬 시각 — new Date().toISOString() 은 UTC 라 서버에서 9시간 어긋난다
const localIso = (dateStr, timeStr) => `${dateStr}T${timeStr}:00`
const mins = (n) => (n ? `${n}` : '—')

export default function WorkLogPage({ onBack }) {
  const [tab, setTab] = useState('log')
  const [days, setDays] = useState(7)
  const [fWorker, setFWorker] = useState('')
  const [fProc, setFProc] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openBatch, setOpenBatch] = useState(null)   // 시각 보정 중인 batch_key
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [stopFor, setStopFor] = useState(null)       // 정지 추가 중인 work_log 행
  const [busy, setBusy] = useState(false)

  const range = useMemo(() => {
    const to = new Date()
    return { from: ymd(addDays(to, -(days - 1))), to: ymd(to) }
  }, [days])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setData(await listWorkLogs({
        date_from: range.from, date_to: range.to,
        worker: fWorker || undefined,
        process: fProc.length ? fProc.join(',') : undefined,
      }))
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, fWorker, fProc])

  useEffect(() => { if (tab === 'log') load() }, [tab, load])

  const items = data?.items || []
  const groups = data?.stop_groups || {}

  // 배치 단위 묶음 — 시각 보정은 이 단위로만 가능
  const batches = useMemo(() => {
    const m = new Map()
    for (const it of items) {
      const g = m.get(it.batch_key) || { key: it.batch_key, rows: [] }
      g.rows.push(it)
      m.set(it.batch_key, g)
    }
    return m
  }, [items])

  const openTimeEdit = (row) => {
    const g = batches.get(row.batch_key)
    if (!g) return
    const sorted = [...g.rows].sort((a, b) => a.started_at.localeCompare(b.started_at))
    setEditStart(hm(sorted[0].started_at))
    setEditEnd(hm(sorted[sorted.length - 1].ended_at))
    setOpenBatch(row.batch_key)
  }

  const saveTime = async () => {
    const g = batches.get(openBatch)
    if (!g || busy) return
    setBusy(true); setError(null)
    try {
      const day = g.rows[0].work_date
      await patchWorkLogBatchTime({
        batch_key: openBatch,
        started_at: localIso(day, editStart),
        ended_at: localIso(day, editEnd),
      })
      setOpenBatch(null)
      await load()
    } catch (e) {
      setError(e.message || '수정 실패')
    } finally {
      setBusy(false)
    }
  }

  const submitStop = async (group, category, minutes) => {
    if (busy || !stopFor) return
    setBusy(true); setError(null)
    try {
      await addWorkLogStop({ work_log_id: stopFor.id, group, category, minutes: Number(minutes) })
      setStopFor(null)
      await load()
    } catch (e) {
      setError(e.message || '정지 추가 실패')
    } finally {
      setBusy(false)
    }
  }

  const removeStop = async (id) => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      await deleteWorkLogStop(id)
      await load()
    } catch (e) {
      setError(e.message || '삭제 실패')
    } finally {
      setBusy(false)
    }
  }

  const toggleProc = (c) =>
    setFProc((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))

  // 합계 — 시트의 하단 집계와 같은 값
  const sum = items.reduce((a, r) => ({
    qty: a.qty + r.qty_worked, work: a.work + r.work_min,
    run: a.run + r.run_min, planned: a.planned + r.planned_min,
    down: a.down + r.fault_min + r.idle_min,
  }), { qty: 0, work: 0, run: 0, planned: 0, down: 0 })

  return (
    <div className="page-flat">
      <PageHeader
        title="작업일지"
        subtitle="LOT 발급이 자동 기록합니다 · 여기서는 시간 보정과 정지만 입력해요"
        onBack={onBack}
      />

      <div className={s.tabs} role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={`${s.tab} ${tab === t.key ? s.tabOn : ''}`}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {error && <p className={s.err}>⚠ {error}</p>}

      {tab === 'config' ? <ConfigTab onError={setError} /> : (
        <>
          <div className={s.ctl}>
            <div className={s.seg}>
              {[7, 14, 30].map((d) => (
                <button key={d} type="button"
                  className={`${s.segBtn} ${days === d ? s.segOn : ''}`}
                  onClick={() => setDays(d)}>{d}일</button>
              ))}
            </div>
            <span className={s.fdiv} />
            <div className={s.fgrp}>
              <span className={s.flab}>공정</span>
              {PROCESSES.map((p) => (
                <button key={p.code} type="button"
                  className={`${s.chip} ${fProc.includes(p.code) ? s.chipOn : ''}`}
                  aria-pressed={fProc.includes(p.code)}
                  onClick={() => toggleProc(p.code)}>{p.label}</button>
              ))}
            </div>
            <div className={s.fgrp}>
              <span className={s.flab}>작업자</span>
              <select className={s.select} value={fWorker} onChange={(e) => setFWorker(e.target.value)}>
                <option value="">전체</option>
                {(data?.workers || []).map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>

          {loading && <p className={s.info}>불러오는 중…</p>}

          {!loading && (
            <div className={s.tscroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>작업일</th><th>주차</th><th className={s.thL}>LOT</th><th className={s.thL}>입력</th>
                    <th className={s.thL}>공정</th><th className={s.thL}>작업자</th>
                    <th className={s.thL}>제품</th><th>수량</th>
                    <th>시작</th><th>종료</th>
                    <th>작업(분)</th><th>휴지</th><th>장애</th><th>비가동</th><th>가동(분)</th>
                    <th className={s.thL}>정지 내역</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr><td colSpan={16} className={s.muted}>이 기간의 작업일지가 없습니다.</td></tr>
                  )}
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td>{md(r.work_date)}</td>
                      <td className={s.muted}>{r.iso_week}</td>
                      <td className={`${s.tdL} ${s.lotNo}`}>{r.lot_no}</td>
                      <td className={s.tdL}>
                        {r.batch_size > 1
                          ? <span className={s.batchTag} title={`일괄 발급 ${r.batch_size}건 중 ${r.batch_seq}번째`}>
                              일괄 {r.batch_seq}/{r.batch_size}
                            </span>
                          : <span className={s.muted}>단건</span>}
                      </td>
                      <td className={s.tdL}>{r.process_label}</td>
                      <td className={s.tdL}>{r.worker || '—'}</td>
                      <td className={s.tdL}>
                        {r.product_code || (r.phi ? `Φ${r.phi}` : '—')}
                      </td>
                      <td>{r.qty_worked}</td>
                      <td>
                        <button type="button" className={s.timeBtn}
                          title="이 배치의 시작·종료 보정" onClick={() => openTimeEdit(r)}>
                          {hm(r.started_at)}
                        </button>
                      </td>
                      <td>{hm(r.ended_at)}</td>
                      <td>{r.work_min}</td>
                      <td className={r.planned_min ? s.cPlan : s.muted}>{mins(r.planned_min)}</td>
                      <td className={r.fault_min ? s.cFault : s.muted}>{mins(r.fault_min)}</td>
                      <td className={r.idle_min ? s.cIdle : s.muted}>{mins(r.idle_min)}</td>
                      <td className={s.cRun}>{r.run_min}</td>
                      <td className={s.tdL}>
                        {r.stops.map((st) => (
                          <span key={st.id} className={`${s.stopTag} ${st.auto ? s.stopAuto : ''}`}>
                            {st.note || st.category} {st.minutes}분
                            <button type="button" className={s.stopDel}
                              title="삭제" onClick={() => removeStop(st.id)}>×</button>
                          </span>
                        ))}
                        <button type="button" className={s.addStop} onClick={() => setStopFor(r)}>＋ 정지</button>
                      </td>
                    </tr>
                  ))}
                  {items.length > 0 && (
                    <tr className={s.sum}>
                      <td colSpan={7}>합계 {items.length}행</td>
                      <td>{sum.qty}</td><td colSpan={2} />
                      <td>{sum.work}</td><td>{sum.planned}</td>
                      <td colSpan={2}>{sum.down}</td><td>{sum.run}</td><td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p className={s.note}>
            <b>시작시각</b>은 그 작업자의 직전 작업 종료시각, 없으면 그날 근무 시작시각입니다.
            한 번의 작업이 여러 LOT 을 만들면 그 구간을 <b>수량 비율로 나눠</b> 각 행이 갖습니다 —
            그래서 <b>시각 보정은 배치 단위</b>입니다(시작 시각을 누르면 그 배치 전체가 다시 나뉩니다).<br />
            휴게시간과 겹치는 만큼은 <b>휴지(계획정지)</b>로 자동 기록됩니다. 점심에도 돌린 날은 그 정지를 지우세요.
          </p>
        </>
      )}

      {openBatch && (
        <div className={s.overlay} onClick={() => setOpenBatch(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={s.modalH}>배치 시간 보정</h3>
            <p className={s.modalSub}>
              이 배치의 {batches.get(openBatch)?.rows.length ?? 0}개 LOT 이 수량 비율로 다시 나뉩니다.
            </p>
            <label className={s.fieldL}>시작
              <input type="time" className={s.timeInput}
                value={editStart} onChange={(e) => setEditStart(e.target.value)} />
            </label>
            <label className={s.fieldL}>종료
              <input type="time" className={s.timeInput}
                value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
            </label>
            <div className={s.modalBtns}>
              <button type="button" className="btn-secondary" onClick={() => setOpenBatch(null)}>취소</button>
              <button type="button" className="btn-primary" onClick={saveTime} disabled={busy}>
                {busy ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {stopFor && (
        <StopModal row={stopFor} groups={groups} busy={busy}
          onClose={() => setStopFor(null)} onSubmit={submitStop} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════
// 정지 추가 — 사유 칩 1탭 + 분 직접 입력
// ══════════════════════════════════════════════════
function StopModal({ row, groups, busy, onClose, onSubmit }) {
  const keys = Object.keys(groups)
  const [group, setGroup] = useState(keys[0] || 'fault')
  const [category, setCategory] = useState('')
  const [minutes, setMinutes] = useState('')

  const items = groups[group]?.items || []
  const ok = category && Number(minutes) > 0

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={s.modalH}>정지 추가</h3>
        <p className={s.modalSub}>{row.lot_no} · {row.process_label}</p>

        <div className={s.seg}>
          {keys.map((g) => (
            <button key={g} type="button"
              className={`${s.segBtn} ${group === g ? s.segOn : ''}`}
              onClick={() => { setGroup(g); setCategory('') }}>{groups[g].label}</button>
          ))}
        </div>

        <div className={s.catWrap}>
          {items.map((c) => (
            <button key={c} type="button"
              className={`${s.chip} ${category === c ? s.chipOn : ''}`}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>

        <label className={s.fieldL}>정지 시간 (분)
          <input type="number" inputMode="numeric" min="1" className={s.timeInput}
            value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="예: 23" />
        </label>

        <div className={s.modalBtns}>
          <button type="button" className="btn-secondary" onClick={onClose}>취소</button>
          <button type="button" className="btn-primary" disabled={!ok || busy}
            onClick={() => onSubmit(group, category, minutes)}>
            {busy ? '저장 중…' : '추가'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 근무시간 설정 — 시작시각 + 휴게시간 (개수 제한 없음)
// ══════════════════════════════════════════════════
function ConfigTab({ onError }) {
  const [cfg, setCfg] = useState(null)
  const [draft, setDraft] = useState(null)   // 추가/수정 중인 휴게 {id?, name, start, end, weekdays}
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setCfg(await getWorkTimeConfig())
    } catch (e) {
      onError(e.message || '조회 실패')
    }
  }, [onError])
  useEffect(() => { load() }, [load])

  const run = async (fn) => {
    if (busy) return
    setBusy(true)
    try { await fn(); await load() } catch (e) { onError(e.message || '저장 실패') } finally { setBusy(false) }
  }

  if (!cfg) return <p className={s.info}>불러오는 중…</p>

  const wdText = (v) => (v ? v.split(',').map((i) => DOW[Number(i)] || i).join('·') : '매일')

  return (
    <div className={s.cfg}>
      <div className={s.cfgRow}>
        <span className={s.cfgLab}>근무 시작시각</span>
        <input type="time" className={s.timeInput} defaultValue={cfg.shift_start}
          onBlur={(e) => e.target.value !== cfg.shift_start
            && run(() => patchWorkShift({ line: cfg.line, start: e.target.value }))} />
        <span className={s.hint}>직전 작업이 없는 그날 첫 작업의 시작 기준</span>
      </div>

      <h4 className={s.cfgH}>휴게시간</h4>
      <p className={s.hint}>
        작업 구간과 겹치는 만큼 <b>휴지(계획정지)</b>로 자동 차감됩니다. 개수 제한은 없습니다.
      </p>

      <div className={s.breaks}>
        {cfg.breaks.length === 0 && <p className={s.muted}>등록된 휴게시간이 없습니다.</p>}
        {cfg.breaks.map((b) => (
          <div key={b.id} className={s.breakRow}>
            <b className={s.bName}>{b.name}</b>
            <span className={s.bTime}>{b.start} – {b.end}</span>
            <span className={s.bWd}>{wdText(b.weekdays)}</span>
            <button type="button" className={s.linkBtn} onClick={() => setDraft({ ...b })}>수정</button>
            <button type="button" className={`${s.linkBtn} ${s.danger}`}
              onClick={() => run(() => deleteWorkBreak(b.id))}>삭제</button>
          </div>
        ))}
        <button type="button" className={s.addBreak}
          onClick={() => setDraft({ name: '', start: '12:00', end: '13:00', weekdays: '' })}>
          ＋ 휴게시간 추가
        </button>
      </div>

      {draft && (
        <div className={s.overlay} onClick={() => setDraft(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={s.modalH}>{draft.id ? '휴게시간 수정' : '휴게시간 추가'}</h3>
            <label className={s.fieldL}>이름
              <input className={s.textInput} value={draft.name} maxLength={30}
                placeholder="점심 / 오후 휴식 …"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <div className={s.twoCol}>
              <label className={s.fieldL}>시작
                <input type="time" className={s.timeInput} value={draft.start}
                  onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
              </label>
              <label className={s.fieldL}>종료
                <input type="time" className={s.timeInput} value={draft.end}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
              </label>
            </div>
            <span className={s.fieldL}>요일 (선택 없음 = 매일)</span>
            <div className={s.catWrap}>
              {DOW.map((d, i) => {
                const on = (draft.weekdays || '').split(',').filter(Boolean).includes(String(i))
                return (
                  <button key={d} type="button"
                    className={`${s.chip} ${on ? s.chipOn : ''}`} aria-pressed={on}
                    onClick={() => {
                      const cur = (draft.weekdays || '').split(',').filter(Boolean)
                      const next = on ? cur.filter((x) => x !== String(i)) : [...cur, String(i)]
                      setDraft({ ...draft, weekdays: next.sort().join(',') })
                    }}>{d}</button>
                )
              })}
            </div>
            <div className={s.modalBtns}>
              <button type="button" className="btn-secondary" onClick={() => setDraft(null)}>취소</button>
              <button type="button" className="btn-primary" disabled={busy || !draft.name.trim()}
                onClick={() => run(async () => { await saveWorkBreak(draft); setDraft(null) })}>
                {busy ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
