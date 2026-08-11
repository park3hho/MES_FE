// pages/dashboard/ProductionDaily.jsx
// 생산 대시보드 · 생산 현황 탭 (2026-08-11) — "어느 공정에서, 어느 날, 몇 개가 나왔나".
//   BE 가 (일자 × 공정 × 구분 × 사이즈 × 모터) 최소 단위 카운트 큐브를 내려주므로,
//   집계 기준·모델 필터를 바꿔도 재조회 없이 히트맵/KPI 를 다시 계산한다.
//   ★ 필터는 한 벌 — 매트릭스·KPI·셀 드릴다운 목록에 같이 걸린다.
import { useState, useEffect, useMemo } from 'react'
import { getProductionDaily, getProductionCellLots } from '@/api'
import {
  KIND_LABEL, KIND_ORDER, MODE_LABEL, MODE_KINDS, STATUS_LABEL,
  num, fmtMD, dowOf, isWeekend, fmtTime, toggleIn,
} from './prodShared'
import s from './ProductionDashboardPage.module.css'

const RANGES = [7, 14, 30, 90]
const MODES = ['prod', 'new', 'all']
const HEAT_STEPS = [0.12, 0.3, 0.48, 0.66, 0.88]

export default function ProductionDaily() {
  const [days, setDays] = useState(14)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // 공용 필터 — 매트릭스·KPI·드릴다운이 모두 이걸 본다
  const [mode, setMode] = useState('prod')
  const [fPhi, setFPhi] = useState([])
  const [fMotor, setFMotor] = useState([])
  // 드릴다운
  const [cell, setCell] = useState(null)          // { code, label, di, date }
  const [cellLots, setCellLots] = useState(null)
  const [cellLoading, setCellLoading] = useState(false)
  const [cellError, setCellError] = useState(null)
  const [kindView, setKindView] = useState('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null); setCell(null)
    getProductionDaily({ days })
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(e.message || '조회 실패') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days])

  useEffect(() => {
    if (!cell) return undefined
    let alive = true
    setCellLoading(true); setCellError(null); setCellLots(null)
    getProductionCellLots({ date: cell.date, process: cell.code })
      .then((d) => { if (alive) setCellLots(d.lots || []) })
      .catch((e) => { if (alive) setCellError(e.message || '조회 실패') })
      .finally(() => { if (alive) setCellLoading(false) })
    return () => { alive = false }
  }, [cell])

  useEffect(() => {
    if (!cell) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setCell(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cell])

  // 큐브 → (공정, 일자) 별 구분 카운트. 모델 필터만 적용 — 집계 기준은 표시 단계에서.
  const cube = useMemo(() => {
    const m = new Map()
    for (const c of data?.cells || []) {
      if (fPhi.length && !fPhi.includes(c.phi)) continue
      if (fMotor.length && !fMotor.includes(c.motor)) continue
      const k = `${c.p}:${c.d}`
      const a = m.get(k) || { new: 0, repair: 0, via: 0 }
      a[c.kind] += c.n
      m.set(k, a)
    }
    return m
  }, [data, fPhi, fMotor])

  const view = useMemo(() => {
    const kinds = MODE_KINDS[mode]
    const dayList = data?.days || []
    const rows = (data?.processes || []).map((p) => {
      const vals = dayList.map((_, di) => {
        const a = cube.get(`${p.code}:${di}`)
        return a ? kinds.reduce((n, k) => n + a[k], 0) : 0
      })
      return { ...p, vals, total: vals.reduce((n, v) => n + v, 0) }
    })
    const colTot = dayList.map((_, di) => rows.reduce((n, r) => n + r.vals[di], 0))
    const grand = colTot.reduce((n, v) => n + v, 0)
    return { rows, colTot, grand, max: Math.max(1, ...rows.flatMap((r) => r.vals)) }
  }, [cube, data, mode])

  // KPI 용 총계 — 구분별 원본 수치 (집계 기준과 무관하게 재공정·경유가 몇 건인지)
  const totals = useMemo(() => {
    const t = { new: 0, repair: 0, via: 0 }
    for (const a of cube.values()) {
      t.new += a.new; t.repair += a.repair; t.via += a.via
    }
    return t
  }, [cube])

  const hasFilter = mode !== 'prod' || fPhi.length > 0 || fMotor.length > 0
  const clearFilter = () => { setMode('prod'); setFPhi([]); setFMotor([]) }

  const openCell = (proc, di) => {
    setKindView('all'); setQ('')
    setCell({ code: proc.code, label: proc.label, di, date: data.days[di] })
  }

  // 드릴다운 — 모델 필터는 목록에도 그대로, 집계 기준은 '제외' 표시로만
  const drawerLots = useMemo(() => (cellLots || []).filter((l) =>
    (fPhi.length === 0 || fPhi.includes(l.phi))
    && (fMotor.length === 0 || fMotor.includes(l.motor)),
  ), [cellLots, fPhi, fMotor])

  const kw = q.trim().toUpperCase()
  const shownLots = drawerLots.filter((l) =>
    (kindView === 'all' || l.kind === kindView)
    && (!kw || l.lot_no.toUpperCase().includes(kw)))
  const countedKinds = MODE_KINDS[mode]
  const countedN = drawerLots.filter((l) => countedKinds.includes(l.kind)).length
  const kindN = (k) => drawerLots.filter((l) => l.kind === k).length

  const workDays = view.colTot.filter((v) => v > 0).length
  const avg = workDays ? Math.round(view.grand / workDays) : 0
  const bestVal = Math.max(0, ...view.colTot)
  const bestIdx = view.colTot.indexOf(bestVal)
  const bestPct = avg ? Math.round((bestVal / avg - 1) * 100) : 0

  const filterText = [
    MODE_LABEL[mode],
    fPhi.length ? [...fPhi].sort((a, b) => Number(a) - Number(b)).map((p) => `Φ${p}`).join('·') : '',
    fMotor.length ? fMotor.join('·') : '',
  ].filter(Boolean).join(' · ')

  return (
    <>
      {/* ── 컨트롤 ── */}
      <div className={s.ctl}>
        <div className={s.seg}>
          {RANGES.map((d) => (
            <button key={d} type="button"
              className={`${s.segBtn} ${days === d ? s.segOn : ''}`}
              onClick={() => setDays(d)}>{d}일</button>
          ))}
        </div>
        <span className={s.fdiv} />
        <span className={s.flab}>집계</span>
        <div className={s.seg}>
          {MODES.map((m) => (
            <button key={m} type="button"
              className={`${s.segBtn} ${mode === m ? s.segOn : ''}`}
              onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>
          ))}
        </div>
        {(data?.phis?.length > 0 || data?.motors?.length > 0) && (
          <div className={s.ctlRight}>
            {data.phis.length > 0 && (
              <div className={s.fgrp}>
                <span className={s.flab}>모델</span>
                {data.phis.map((p) => (
                  <button key={p} type="button"
                    className={`${s.chip} ${fPhi.includes(p) ? s.chipOn : ''}`}
                    onClick={() => toggleIn(setFPhi)(p)}>Φ{p}</button>
                ))}
              </div>
            )}
            {data.motors.length > 0 && (
              <>
                <span className={s.fdiv} />
                <div className={s.fgrp}>
                  {data.motors.map((m) => (
                    <button key={m} type="button"
                      className={`${s.chip} ${fMotor.includes(m) ? s.chipOn : ''}`}
                      onClick={() => toggleIn(setFMotor)(m)}>{m}</button>
                  ))}
                </div>
              </>
            )}
            {hasFilter && (
              <button type="button" className={s.clearBtn} onClick={clearFilter}>초기화</button>
            )}
          </div>
        )}
      </div>

      {loading && <p className={s.info}>불러오는 중…</p>}
      {error && <p className={s.errorMsg}>⚠ {error}</p>}

      {data && !loading && (
        <>
          {/* ── KPI ── */}
          <div className={`${s.kpis} ${s.kpis4}`}>
            <div className={`${s.kpi} ${s.accent}`}>
              <span className={s.kLab}>기간 생산</span>
              <span className={s.kVal}>{num(view.grand)}<i>건</i></span>
              <span className={s.kSub}>{fmtMD(data.range.from)}–{fmtMD(data.range.to)} · {filterText}</span>
            </div>
            <div className={s.kpi} style={{ '--accent': 'var(--prod-new)' }}>
              <span className={s.kLab}>일평균 (가동일)</span>
              <span className={s.kVal}>{num(avg)}<i>건</i></span>
              <span className={s.kSub}>가동 {workDays}일 · 무실적일 제외</span>
            </div>
            <div className={s.kpi} style={{ '--accent': 'var(--color-success)' }}>
              <span className={s.kLab}>최다 생산일</span>
              <span className={s.kVal}>{num(bestVal)}<i>건</i></span>
              <span className={s.kSub}>
                {bestVal > 0
                  ? `${fmtMD(data.days[bestIdx])} ${dowOf(data.days[bestIdx])} · 평균 대비 ${bestPct >= 0 ? '+' : ''}${bestPct}%`
                  : '실적 없음'}
              </span>
            </div>
            <div className={s.kpi} style={{ '--accent': 'var(--prod-rep)' }}>
              <span className={s.kLab}>재공정</span>
              <span className={`${s.kVal} ${s.cRep}`}>{num(totals.repair)}<i>건</i></span>
              <span className={s.kSub}>
                경유 {num(totals.via)}건 {mode === 'all' ? '포함됨' : '제외됨'}
              </span>
            </div>
          </div>

          {/* ── 공정 × 일자 매트릭스 ── */}
          <div className={s.card} style={{ marginTop: 14 }}>
            <div className={s.cardH}>
              <h3>공정별 일 생산량</h3>
              <span className={s.hint}>
                셀 = 그날 그 공정에서 발급된 LOT 수 · <b>클릭하면 그 LOT 목록</b>이 열립니다
              </span>
            </div>
            <div className={s.mxWrap}>
              <table className={s.mx}>
                <thead>
                  <tr>
                    <th className={s.pcol}>공정</th>
                    {data.days.map((d) => (
                      <th key={d} className={isWeekend(d) ? s.wkHead : ''}>
                        <span className={s.dnum}>{fmtMD(d)}</span>
                        <span className={s.ddow}>{dowOf(d)}</span>
                      </th>
                    ))}
                    <th className={s.mxTot}>합계</th>
                    <th>추이</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => {
                    const smax = Math.max(1, ...r.vals)
                    return (
                      <tr key={r.code}>
                        <td className={s.pcol}>{r.label} <span className={s.hint}>{r.code}</span></td>
                        {r.vals.map((v, di) => {
                          const a = cube.get(`${r.code}:${di}`) || { new: 0, repair: 0, via: 0 }
                          const on = cell && cell.code === r.code && cell.di === di
                          const parts = countedKinds
                            .filter((k) => a[k] > 0)
                            .map((k) => `${KIND_LABEL[k]} ${a[k]}`)
                            .join(' · ')
                          return (
                            <td key={data.days[di]}>
                              <button type="button" disabled={v === 0}
                                className={[
                                  s.cellBtn,
                                  v === 0 ? s.cellZero : '',
                                  v / view.max > 0.62 ? s.cellHi : '',
                                  on ? s.cellSel : '',
                                ].filter(Boolean).join(' ')}
                                style={{
                                  background: v === 0 ? 'transparent'
                                    : `rgba(var(--prod-heat), ${(0.1 + (v / view.max) * 0.78).toFixed(2)})`,
                                }}
                                title={v === 0 ? '해당 조건의 생산 없음'
                                  : `${r.label} ${fmtMD(data.days[di])} · ${v}건 (${parts}) — 클릭하면 LOT 목록`}
                                onClick={() => openCell(r, di)}>{v}</button>
                            </td>
                          )
                        })}
                        <td className={s.mxTot}>{num(r.total)}</td>
                        <td>
                          <span className={s.spark}>
                            {r.vals.map((v, di) => (
                              <i key={data.days[di]}
                                className={di === r.vals.length - 1 ? s.sparkLast : ''}
                                style={{ height: `${Math.max(2, (v / smax) * 22)}px` }} />
                            ))}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className={s.mxTotRow}>
                    <td className={s.pcol}>일 합계</td>
                    {view.colTot.map((v, di) => <td key={data.days[di]}>{num(v)}</td>)}
                    <td className={s.mxTot}>{num(view.grand)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className={`${s.legend} ${s.mxLegend}`}>
              <span className={s.lg}>적음</span>
              <span className={s.scale}>
                {HEAT_STEPS.map((a) => (
                  <i key={a} style={{ background: `rgba(var(--prod-heat), ${a})` }} />
                ))}
              </span>
              <span className={s.lg}>많음</span>
              <span className={s.hint}>
                위 필터는 매트릭스와 드릴다운 목록에 <b>같이</b> 적용됩니다
              </span>
            </div>
          </div>

          <p className={s.note}>
            <b>이 화면이 답하는 질문</b> — “어느 공정에서, 어느 날, 몇 개가 나왔나 · 그게 어떤 LOT 인가?”<br />
            셀 값 = 그날 그 공정에서 <b>발급된 LOT 수</b>. 기본 집계는 <b>신규 + 재공정</b>(= 실제 생산)이고,
            <b> 경유 LOT</b>(중성점 재작업하려 뽑은 권선 번호처럼 실제 작업 없이 체인만 잇는 번호)은
            기본적으로 <b>제외</b>됩니다. ‘경유 포함’ 을 누르면 함께 봅니다.<br />
            셀을 클릭하면 그 칸에 집계된 LOT 이 전부 나오고, 집계에서 빠진 LOT 은 숨기지 않고
            <b> 취소선</b>으로 함께 보여 숫자의 근거를 번호 단위로 확인할 수 있습니다.
          </p>
        </>
      )}

      {/* ── 셀 드릴다운 드로어 ── */}
      {cell && <div className={s.scrim} onClick={() => setCell(null)} />}
      <aside className={`${s.drawer} ${cell ? s.drawerOn : ''}`}
        role="dialog" aria-modal="true" aria-hidden={!cell}>
        {cell && (
          <>
            <div className={s.dwH}>
              <div>
                <span className={s.dwEyebrow}>공정 × 일자 드릴다운</span>
                <h3 className={s.dwTitle}>
                  {cell.label} <em>{cell.code}</em> · {fmtMD(cell.date)} ({dowOf(cell.date)})
                </h3>
              </div>
              <button type="button" className={s.xBtn} onClick={() => setCell(null)} aria-label="닫기">✕</button>
            </div>

            {/* 상단 필터를 그대로 재현 — 이 목록이 어떤 조건인지 명시 */}
            <div className={s.dwFilt}>
              <span className={s.flab}>적용 필터</span>
              <span className={s.fchip}>집계 {MODE_LABEL[mode]}</span>
              {fPhi.length > 0 && (
                <span className={s.fchip}>
                  {[...fPhi].sort((a, b) => Number(a) - Number(b)).map((p) => `Φ${p}`).join(', ')}
                </span>
              )}
              {fMotor.length > 0 && <span className={s.fchip}>{fMotor.join(', ')}</span>}
              {fPhi.length === 0 && fMotor.length === 0 && (
                <span className={`${s.fchip} ${s.fchipNone}`}>모델 전체</span>
              )}
            </div>

            <div className={s.dwStats}>
              <div className={s.dwStat}>
                <span>집계 ({MODE_LABEL[mode]})</span><b>{num(countedN)}<i>건</i></b>
              </div>
              {KIND_ORDER.map((k) => (
                <div key={k} className={`${s.dwStat} ${countedKinds.includes(k) ? '' : s.dwStatDim}`}>
                  <span>{KIND_LABEL[k]}</span>
                  <b className={k === 'repair' ? s.cRep : (k === 'via' ? s.cVia : '')}>
                    {num(kindN(k))}<i>건</i>
                  </b>
                </div>
              ))}
            </div>

            <div className={s.dwCtl}>
              <button type="button"
                className={`${s.chip} ${s.chipSm} ${kindView === 'all' ? s.chipOn : ''}`}
                onClick={() => setKindView('all')}>전체</button>
              {KIND_ORDER.map((k) => (
                <button key={k} type="button"
                  className={`${s.chip} ${s.chipSm} ${kindView === k ? s[`chipOn_${k}`] : ''}`}
                  onClick={() => setKindView(k)}>{KIND_LABEL[k]}</button>
              ))}
              <input className={s.dwSearch} placeholder="LOT 번호"
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            <div className={s.dwList}>
              {cellLoading && <p className={s.dwEmpty}>불러오는 중…</p>}
              {cellError && <p className={s.dwEmpty}>⚠ {cellError}</p>}
              {!cellLoading && !cellError && shownLots.length === 0 && (
                <p className={s.dwEmpty}>
                  조건에 맞는 LOT 이 없습니다.<br />
                  <span className={s.hint}>상단 모델 필터나 집계 기준을 확인해 보세요.</span>
                </p>
              )}
              {shownLots.map((l) => {
                const out = !countedKinds.includes(l.kind)
                return (
                  <div key={l.lot_no} className={`${s.lrow} ${out ? s.lrowOut : ''}`}>
                    <span className={s.lno}>
                      {l.lot_no}
                      <span className={`${s.badge} ${s[`b_${l.kind}`]}`}>{KIND_LABEL[l.kind]}</span>
                      {out && <span className={`${s.badge} ${s.bOut}`}>집계 제외</span>}
                    </span>
                    <span className={s.lqty}>{num(l.quantity)}</span>
                    <span className={s.lmeta}>
                      {l.phi ? `Φ${l.phi}` : '모델 미분류'}
                      {l.motor ? ` · ${l.motor}` : ''}
                      {l.worker ? ` · 작업자 ${l.worker}` : ''}
                      {` · ${STATUS_LABEL[l.status] || l.status || '-'}`}
                      {l.origin ? ` · 원본 ${l.origin}` : ''}
                    </span>
                    <span className={s.ltime}>{fmtTime(l.at)}</span>
                  </div>
                )
              })}
            </div>

            <div className={s.dwF}>
              <span className={s.pgInfo}>
                {num(shownLots.length)}건 표시 · 집계 <b>{num(countedN)}</b>건
              </span>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
