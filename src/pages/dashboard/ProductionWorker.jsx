// pages/dashboard/ProductionWorker.jsx
// 생산 대시보드 · 작업자 실적 탭 (2026-09-09) — 작업자 × 일자 생산량 매트릭스 + 셀 드릴다운.
//
// ★ 세는 근거가 '생산 현황' 탭과 다르다 — 여기는 **작업일지(work_log)의 생산 수량**,
//   옆 탭은 **LOT 발급 건수**(재고 테이블). 그래서 두 탭의 합계는 원래 다르고, 화면에서 밝힌다.
// ★ 요크가공(REA)은 BE 가 뺀다 — 1건이 수십 개를 만드는 배치라 개수 축이 본딩과 다르고
//   작업자가 전부 비어 있어 작업자별로 볼 값이 아니다 (production_worker_service._EXCLUDED_PROCESSES).
// ★ 화면 구성은 '생산 현황' 매트릭스와 같은 컴포넌트·클래스를 그대로 쓴다 — 두 탭의 표가
//   다르게 생기면 같은 히트맵인데 다른 규칙처럼 읽힌다.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { getProductionWorker, getProductionWorkerLogs } from '@/api'
import { DASHBOARD_POLL_MS } from '@/constants/etcConst'
import CoreLot from '@/components/common/CoreLot'
import {
  num, fmtMD, dowOf, isWeekend, toggleIn,
} from './prodShared'
import s from './ProductionDashboardPage.module.css'

const RANGES = [7, 14, 30, 90]
const HEAT_STEPS = [0.12, 0.3, 0.48, 0.66, 0.88]
const MOTOR_LABEL = { outer: '외전', inner: '내전' }
const UNASSIGNED_LABEL = '미지정'

const fmtTime = (iso) => (iso ? iso.slice(11, 16) : '-')
const workerLabel = (code) => (code ? `작업자 ${code}` : UNASSIGNED_LABEL)

export default function ProductionWorker() {
  const [days, setDays] = useState(14)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const reqRef = useRef(0)
  // 공용 필터 — 매트릭스와 드릴다운이 모두 이걸 본다
  const [fWorker, setFWorker] = useState([])
  const [fProc, setFProc] = useState([])
  const [fPhi, setFPhi] = useState([])
  const [fMotor, setFMotor] = useState([])
  // 드릴다운
  const [cell, setCell] = useState(null)          // { code, di, date }
  const [cellLogs, setCellLogs] = useState(null)
  const [cellLoading, setCellLoading] = useState(false)
  const [cellError, setCellError] = useState(null)

  // 응답 순서 보장 — ProductionDaily 와 같은 ref 토큰 방식.
  //   silent(폴링)는 토큰을 올리지 않는다 — 사용자가 방금 띄운 조회를 타이머가 무효화하면
  //   스피너가 영영 안 꺼진다.
  const load = useCallback((opts) => {
    const silent = opts?.silent === true
    const token = silent ? reqRef.current : ++reqRef.current
    if (!silent) { setLoading(true); setError(null); setCell(null) }
    getProductionWorker({ days })
      .then((d) => {
        if (token !== reqRef.current) return
        setData(d)
      })
      .catch((e) => {
        if (token !== reqRef.current || silent) return   // 폴링 실패는 조용히
        setError(e.message || '조회 실패')
      })
      .finally(() => {
        if (token === reqRef.current && !silent) setLoading(false)
      })
  }, [days])

  useEffect(() => { load() }, [load])

  // 띄워놓고 보는 화면 — 주기적으로 조용히 갱신
  useEffect(() => {
    const t = setInterval(() => load({ silent: true }), DASHBOARD_POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (!cell) return undefined
    let alive = true
    setCellLoading(true); setCellError(null); setCellLogs(null)
    getProductionWorkerLogs({ date: cell.date, worker: cell.code, line: data?.line || '' })
      .then((d) => { if (alive) setCellLogs(d.items || []) })
      .catch((e) => { if (alive) setCellError(e.message || '조회 실패') })
      .finally(() => { if (alive) setCellLoading(false) })
    return () => { alive = false }
  }, [cell, data])

  useEffect(() => {
    if (!cell) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setCell(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cell])

  // ── 필터 적용 후 매트릭스 ──
  //   큐브(최소 단위 셀)를 그때그때 접어서 만든다 — 필터를 바꿔도 재조회가 없다.
  const view = useMemo(() => {
    if (!data) return null
    const dn = data.days.length
    const rows = data.workers
      .filter((w) => fWorker.length === 0 || fWorker.includes(w.code))
      .map((w) => ({ ...w, vals: new Array(dn).fill(0), lots: new Array(dn).fill(0) }))
    const byCode = new Map(rows.map((r) => [r.code, r]))

    for (const c of data.cells) {
      if (fProc.length > 0 && !fProc.includes(c.p)) continue
      if (fPhi.length > 0 && !fPhi.includes(c.phi)) continue
      if (fMotor.length > 0 && !fMotor.includes(c.motor)) continue
      const r = byCode.get(c.w)
      if (!r || c.d < 0 || c.d >= dn) continue
      r.vals[c.d] += c.n
      r.lots[c.d] += c.lots
    }
    // 필터로 전부 0 이 된 작업자는 행에서 뺀다 — 빈 줄이 남으면 '이 사람은 논 것' 처럼 읽힌다
    const shown = rows.filter((r) => r.vals.some((v) => v > 0))
    const colTot = new Array(dn).fill(0)
    let grand = 0
    for (const r of shown) {
      r.total = r.vals.reduce((a, b) => a + b, 0)
      r.lotTotal = r.lots.reduce((a, b) => a + b, 0)
      grand += r.total
      r.vals.forEach((v, i) => { colTot[i] += v })
    }
    return { rows: shown, colTot, grand, max: Math.max(1, ...shown.flatMap((r) => r.vals)) }
  }, [data, fWorker, fProc, fPhi, fMotor])

  const activeDays = view ? view.colTot.filter((v) => v > 0).length : 0
  const hasFilter = fWorker.length + fProc.length + fPhi.length + fMotor.length > 0
  const resetAll = () => { setFWorker([]); setFProc([]); setFPhi([]); setFMotor([]) }

  const openCell = (r, di) => {
    if (!r.vals[di]) return
    setCell({ code: r.code, di, date: data.days[di] })
  }

  // 드릴다운 목록도 상단 필터를 그대로 따른다 — 셀 숫자와 목록이 어긋나면 근거가 안 된다
  const shownLogs = useMemo(() => {
    if (!cellLogs) return []
    return cellLogs.filter((l) => (
      (fProc.length === 0 || fProc.includes(l.process))
      && (fPhi.length === 0 || fPhi.includes(l.phi))
      && (fMotor.length === 0 || fMotor.includes(l.motor_type))
    ))
  }, [cellLogs, fProc, fPhi, fMotor])
  const shownQty = shownLogs.reduce((a, l) => a + (l.qty || 0), 0)
  const shownMin = shownLogs.reduce((a, l) => a + (l.work_min || 0), 0)

  const procLabel = (code) => data?.processes.find((p) => p.code === code)?.label || code

  return (
    <>
      {/* ── 컨트롤 바 ── */}
      <div className={s.ctl}>
        <div className={s.seg}>
          {RANGES.map((d) => (
            <button key={d} type="button"
              className={`${s.segBtn} ${days === d ? s.segOn : ''}`}
              onClick={() => setDays(d)}>{d}일</button>
          ))}
        </div>
        {data && (
          <span className={s.hint}>
            {data.range.from} ~ {data.range.to}
          </span>
        )}

        {data && (
          <div className={s.ctlRight}>
            {data.workers.length > 1 && (
              <>
                <span className={s.flab}>작업자</span>
                {data.workers.map((w) => (
                  <button key={w.code || '_'} type="button"
                    className={`${s.chip} ${fWorker.includes(w.code) ? s.chipOn : ''}`}
                    onClick={() => toggleIn(setFWorker)(w.code)}>
                    {w.code || UNASSIGNED_LABEL}
                  </button>
                ))}
              </>
            )}
            {data.processes.length > 1 && (
              <>
                <span className={s.flab}>공정</span>
                {data.processes.map((p) => (
                  <button key={p.code} type="button"
                    className={`${s.chip} ${fProc.includes(p.code) ? s.chipOn : ''}`}
                    onClick={() => toggleIn(setFProc)(p.code)}>{p.label}</button>
                ))}
              </>
            )}
            {data.phis.length > 1 && (
              <>
                <span className={s.flab}>모델</span>
                {data.phis.map((p) => (
                  <button key={p} type="button"
                    className={`${s.chip} ${fPhi.includes(p) ? s.chipOn : ''}`}
                    onClick={() => toggleIn(setFPhi)(p)}>Φ{p}</button>
                ))}
              </>
            )}
            {data.motors.length > 1 && data.motors.map((m) => (
              <button key={m} type="button"
                className={`${s.chip} ${fMotor.includes(m) ? s.chipOn : ''}`}
                onClick={() => toggleIn(setFMotor)(m)}>{MOTOR_LABEL[m] || m}</button>
            ))}
            {/* 초기화는 항상 자리를 지킨다 — 조건부로 나타나면 옆 칩들이 밀린다 (생산 현황과 동일) */}
            <button type="button" className={s.clearBtn}
              disabled={!hasFilter} onClick={resetAll}>초기화</button>
          </div>
        )}
      </div>

      {loading && <p className={s.info}>불러오는 중…</p>}
      {error && <p className={s.errorMsg}>⚠ {error}</p>}

      {!loading && !error && data && view && (
        <>
          <div className={s.card}>
            <div className={s.cardH}>
              <h3>작업자별 일 생산량</h3>
              <span className={s.hint}>
                셀 = 그날 그 작업자가 만든 개수 · <b>클릭하면 그 작업일지</b>가 열립니다
              </span>
            </div>

            {view.rows.length === 0 ? (
              <p className={s.dwEmpty}>
                조건에 맞는 작업 기록이 없습니다.<br />
                <span className={s.hint}>기간을 넓히거나 필터를 풀어 보세요.</span>
              </p>
            ) : (
              <div className={s.mxWrap}>
                <table className={s.mx}>
                  <thead>
                    <tr>
                      <th className={s.pcol}>작업자</th>
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
                        <tr key={r.code || '_'}>
                          <td className={s.pcol}>
                            {workerLabel(r.code)}
                            <span className={s.hint}> {r.processes.map(procLabel).join(' · ')}</span>
                          </td>
                          {r.vals.map((v, di) => {
                            const on = cell && cell.code === r.code && cell.di === di
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
                                  title={v === 0 ? '그날 작업 기록 없음'
                                    : `${workerLabel(r.code)} ${fmtMD(data.days[di])} · ${v}개 (작업일지 ${r.lots[di]}건) — 클릭하면 목록`}
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
            )}

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
                {view.rows.length > 0 && ` · 작업일 ${activeDays}일`}
              </span>
            </div>
          </div>

          <p className={s.note}>
            <b>이 화면이 답하는 질문</b> — “어느 작업자가, 어느 날, 몇 개를 만들었나?”<br />
            셀 값 = 그날 그 작업자의 <b>작업일지 생산 수량</b> 합입니다. 날짜는 <b>작업 시작시각</b> 기준이라
            자정을 넘긴 작업은 시작한 날에 잡힙니다(작업일지 목록·엑셀과 같은 규칙).<br />
            옆 탭 <b>생산 현황</b>은 LOT 발급 건수를 세므로 합계가 다릅니다 — 작업일지를 쓰지 않는 공정은
            여기 잡히지 않고, 요크가공처럼 1건이 여러 개를 만드는 공정은 집계에서 빠져 있습니다.
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
                <span className={s.dwEyebrow}>작업자 × 일자 드릴다운</span>
                <h3 className={s.dwTitle}>
                  {workerLabel(cell.code)} · {fmtMD(cell.date)} ({dowOf(cell.date)})
                </h3>
              </div>
              <button type="button" className={s.xBtn} onClick={() => setCell(null)} aria-label="닫기">✕</button>
            </div>

            {/* 상단 필터를 그대로 재현 — 이 목록이 어떤 조건인지 명시 */}
            <div className={s.dwFilt}>
              <span className={s.flab}>적용 필터</span>
              {fProc.length > 0 && <span className={s.fchip}>{fProc.map(procLabel).join(', ')}</span>}
              {fPhi.length > 0 && (
                <span className={s.fchip}>
                  {[...fPhi].sort((a, b) => Number(a) - Number(b)).map((p) => `Φ${p}`).join(', ')}
                </span>
              )}
              {fMotor.length > 0 && (
                <span className={s.fchip}>{fMotor.map((m) => MOTOR_LABEL[m] || m).join(', ')}</span>
              )}
              {fProc.length === 0 && fPhi.length === 0 && fMotor.length === 0 && (
                <span className={`${s.fchip} ${s.fchipNone}`}>전체</span>
              )}
            </div>

            <div className={s.dwStats}>
              <div className={s.dwStat}><span>생산</span><b>{num(shownQty)}<i>개</i></b></div>
              <div className={s.dwStat}><span>작업일지</span><b>{num(shownLogs.length)}<i>건</i></b></div>
              <div className={s.dwStat}><span>작업시간</span><b>{num(shownMin)}<i>분</i></b></div>
              <div className={s.dwStat}>
                <span>개당</span>
                <b>{shownQty ? (Math.round((shownMin / shownQty) * 10) / 10) : '-'}<i>분</i></b>
              </div>
            </div>

            <div className={s.dwList}>
              {cellLoading && <p className={s.dwEmpty}>불러오는 중…</p>}
              {cellError && <p className={s.dwEmpty}>⚠ {cellError}</p>}
              {!cellLoading && !cellError && shownLogs.length === 0 && (
                <p className={s.dwEmpty}>
                  조건에 맞는 작업일지가 없습니다.<br />
                  <span className={s.hint}>상단 모델·공정 필터를 확인해 보세요.</span>
                </p>
              )}
              {shownLogs.map((l) => (
                <div key={l.id} className={s.lrow}>
                  <span className={s.lno}>
                    <CoreLot core={l.core_no} lot={l.lot_no}>
                      <span className={s.badge}>{l.process_label}</span>
                    </CoreLot>
                  </span>
                  <span className={s.lqty}>{num(l.qty)}</span>
                  <span className={s.lmeta}>
                    {l.product_code || (l.phi ? `Φ${l.phi}` : '모델 미분류')}
                    {l.motor_type ? ` · ${MOTOR_LABEL[l.motor_type] || l.motor_type}` : ''}
                    {` · 작업 ${num(l.work_min)}분`}
                    {l.batch_size > 1 ? ` · 일괄 ${l.batch_size}건` : ''}
                    {l.remark ? ` · ${l.remark}` : ''}
                  </span>
                  <span className={s.ltime}>
                    {fmtTime(l.started_at)}~{fmtTime(l.ended_at)}
                  </span>
                </div>
              ))}
            </div>

            <div className={s.dwF}>
              <span className={s.pgInfo}>
                {num(shownLogs.length)}건 표시 · 생산 <b>{num(shownQty)}</b>개
              </span>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
