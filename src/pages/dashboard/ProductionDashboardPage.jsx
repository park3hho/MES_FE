// pages/dashboard/ProductionDashboardPage.jsx
// 생산 대시보드 (2026-08-08 전면 개편) — 완제품 생산량 + 공정별 LOT 발급 실적.
//   ★ LOT 3분류 (BE production_weekly_service 와 동일 규약, LOT 번호에서 유도):
//     신규(new) / 재공정(repair, 실제 재작업) / 경유(via, 체인만 잇는 번호 → 실적 제외)
//   생산 실적 = 신규 + 재공정. 구 버전(OQ 합격 추이 전용)을 흡수했다.
import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { getProductionWeekly } from '@/api'
import PageHeader from '@/components/common/PageHeader'
import s from './ProductionDashboardPage.module.css'

const KIND_LABEL = { new: '신규', repair: '재공정', via: '경유' }
const F_KIND = ['new', 'repair', 'via']
const STATUS_LABEL = {
  in_stock: '재고', consumed: '소비됨', discarded: '폐기', repair: '되돌림',
  in_inspection: '검사중',
}

const pad = (n) => String(n).padStart(2, '0')
const fmtYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function mondayOf(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const fmtMD = (iso) => { if (!iso) return ''; const [, m, dd] = iso.split('-'); return `${Number(m)}/${Number(dd)}` }
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const dowOf = (iso) => DOW[new Date(`${iso}T00:00:00`).getDay()]
const fmtDT = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const num = (v) => (v == null ? '0' : Number(v).toLocaleString())

// ══════════════════════════════════════════════════
// 실적 표 (공정별 / 모델별 공용)
// ══════════════════════════════════════════════════
function TallyTable({ rows, firstLabel, renderKey }) {
  const tot = rows.reduce((a, r) => ({
    new: a.new + r.new, repair: a.repair + r.repair,
    via: a.via + r.via, produced: a.produced + r.produced, issued: a.issued + r.issued,
  }), { new: 0, repair: 0, via: 0, produced: 0, issued: 0 })
  const totRate = tot.produced ? Math.round((tot.repair / tot.produced) * 1000) / 10 : 0
  const maxRate = Math.max(15, ...rows.map((r) => r.repair_rate || 0))

  const bar = (rate) => (
    <div className={s.rate}>
      <span className={s.track}>
        <i style={{ width: `${Math.min(100, ((rate || 0) / maxRate) * 100)}%` }} />
      </span>
      <span className={`${s.rateN} ${rate >= 10 ? s.rateHigh : ''}`}>{rate || 0}%</span>
    </div>
  )

  return (
    <div className={s.tscroll}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>{firstLabel}</th><th>신규</th><th>재공정</th><th>생산</th>
            <th>경유</th><th>발급</th><th>재공정률</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className={s.muted}>데이터 없음</td></tr>}
          {rows.map((r, i) => (
            <tr key={`${r.key}-${r.motor || ''}-${i}`}>
              <td>{renderKey ? renderKey(r) : r.key}</td>
              <td className={s.cNew}>{num(r.new)}</td>
              <td className={r.repair ? s.cRep : s.muted}>{num(r.repair)}</td>
              <td>{num(r.produced)}</td>
              <td className={r.via ? s.cVia : s.muted}>{num(r.via)}</td>
              <td>{num(r.issued)}</td>
              <td>{bar(r.repair_rate)}</td>
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className={s.sum}>
              <td>합계</td><td>{num(tot.new)}</td><td>{num(tot.repair)}</td>
              <td>{num(tot.produced)}</td><td>{num(tot.via)}</td><td>{num(tot.issued)}</td>
              <td>{bar(totRate)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 일자별 스택 막대 (신규/재공정/경유)
// ══════════════════════════════════════════════════
function DailyBars({ daily }) {
  const max = Math.max(1, ...daily.map((d) => d.issued))
  return (
    <>
      <div className={s.days}>
        {daily.map((d) => {
          const t = d.issued || 0
          return (
            <div key={d.date} className={s.day}>
              <span className={`${s.dayTot} ${t ? '' : s.muted}`}>{t}</span>
              <motion.div
                className={s.stack}
                initial={{ height: 0 }}
                animate={{ height: `${t ? Math.max(3, (t / max) * 100) : 2}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                {t === 0 ? <span className={s.sEmpty} style={{ height: '100%' }} /> : (
                  <>
                    <span className={s.sNew} style={{ height: `${(d.new / t) * 100}%` }} />
                    <span className={s.sRep} style={{ height: `${(d.repair / t) * 100}%` }} />
                    <span className={s.sVia} style={{ height: `${(d.via / t) * 100}%` }} />
                  </>
                )}
              </motion.div>
              <span className={s.dayLab}>{fmtMD(d.date)} {dowOf(d.date)}</span>
            </div>
          )
        })}
      </div>
      <div className={s.legend}>
        <span className={s.lg}><i className={s.sNew} />신규</span>
        <span className={s.lg}><i className={s.sRep} />재공정</span>
        <span className={s.lg}><i className={s.sVia} />경유 (제외)</span>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════
// 메인
// ══════════════════════════════════════════════════
export default function ProductionDashboardPage({ onBack }) {
  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // LOT 목록 필터 (전부 다중 선택) + 페이지네이션
  const [kind, setKind] = useState([])
  const [fProc, setFProc] = useState([])     // 공정 코드 (EA/HT/BO/EC/WI/SO)
  const [fPhi, setFPhi] = useState([])       // 사이즈
  const [fMotor, setFMotor] = useState([])   // 외전/내전
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const range = useMemo(() => ({
    from: fmtYMD(monday), to: fmtYMD(addDays(monday, 6)),
  }), [monday])
  const atCurrent = fmtYMD(monday) >= fmtYMD(mondayOf(new Date()))

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    getProductionWeekly({ date_from: range.from, date_to: range.to })
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(e.message || '조회 실패') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [range.from, range.to])

  // 다중 선택 토글 (선택 없음 = 전체)
  const toggle = (setter) => (v) =>
    setter((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))
  const toggleKind = toggle(setKind)

  // 선택지는 실제 데이터에서 뽑음 — 없는 값이 칩으로 뜨지 않게
  const opts = useMemo(() => {
    const all = data?.lots || []
    const procs = (data?.by_process || []).map((p) => ({ code: p.code, label: p.key }))
    const phis = [...new Set(all.map((l) => l.phi).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b))
    const motors = [...new Set(all.map((l) => l.motor).filter(Boolean))]
    return { procs, phis, motors }
  }, [data])

  const lots = useMemo(() => {
    const all = data?.lots || []
    const kw = q.trim().toUpperCase()
    return all.filter((l) =>
      (kind.length === 0 || kind.includes(l.kind))
      && (fProc.length === 0 || fProc.includes(l.process))
      && (fPhi.length === 0 || fPhi.includes(l.phi))
      && (fMotor.length === 0 || fMotor.includes(l.motor))
      && (!kw || l.lot_no.toUpperCase().includes(kw)),
    )
  }, [data, kind, fProc, fPhi, fMotor, q])

  const hasLotFilter = kind.length || fProc.length || fPhi.length || fMotor.length || q.trim()
  const clearLotFilter = () => {
    setKind([]); setFProc([]); setFPhi([]); setFMotor([]); setQ('')
  }

  // 필터·주차가 바뀌면 1페이지로
  useEffect(() => { setPage(1) }, [kind, fProc, fPhi, fMotor, q, range.from])
  const PER = 50
  const pageCount = Math.max(1, Math.ceil(lots.length / PER))
  const curPage = Math.min(page, pageCount)
  const pageLots = lots.slice((curPage - 1) * PER, curPage * PER)

  const sum = data?.summary
  const fin = data?.finished
  const split = data?.motor_split || {}
  const splitTot = (split['외전'] || 0) + (split['내전'] || 0)
  const outPct = splitTot ? (split['외전'] / splitTot) * 100 : 0

  return (
    <div className="page-flat">
      <PageHeader
        title="생산 현황은 어떤가요?"
        subtitle="완제품 생산량 + 공정별 LOT 실적 · 신규 / 재공정 / 경유 구분"
        onBack={onBack}
      />

      <div className={s.head}>
        <div className={s.weeksel}>
          <button type="button" onClick={() => setMonday(addDays(monday, -7))} aria-label="이전 주">‹</button>
          <div className={s.wk}>
            <b>{range.from.slice(0, 4)} · {new Date(`${range.from}T00:00:00`).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} 주</b>
            <span>{fmtMD(range.from)}–{fmtMD(range.to)} · ISO</span>
          </div>
          <button type="button" onClick={() => setMonday(addDays(monday, 7))} disabled={atCurrent} aria-label="다음 주">›</button>
        </div>
        {!atCurrent && (
          <button type="button" className={s.btn} onClick={() => setMonday(mondayOf(new Date()))}>이번 주</button>
        )}
      </div>

      {loading && <p className={s.info}>불러오는 중…</p>}
      {error && <p className={s.errorMsg}>⚠ {error}</p>}

      {data && !loading && (
        <>
          {/* KPI */}
          <div className={s.kpis}>
            <div className={`${s.kpi} ${s.accent}`}>
              <span className={s.kLab}>완제품 (OQ 합격)</span>
              <span className={s.kVal}>{num(fin.week)}<i>개</i></span>
              <span className={s.kSub}>오늘 {fin.today} · 이번달 {fin.month}</span>
            </div>
            <div className={s.kpi} style={{ '--accent': 'var(--color-border-dark)' }}>
              <span className={s.kLab}>생산 실적 LOT</span>
              <span className={s.kVal}>{num(sum.produced)}<i>건</i></span>
              <span className={s.kSub}>발급 {num(sum.issued)} · 경유 {num(sum.via)} 제외</span>
            </div>
            <div className={s.kpi} style={{ '--accent': 'var(--prod-new)' }}>
              <span className={s.kLab}>신규 생산</span>
              <span className={s.kVal}>{num(sum.new)}<i>건</i></span>
              <span className={s.kSub}>
                생산의 {sum.produced ? Math.round((sum.new / sum.produced) * 1000) / 10 : 0}%
              </span>
            </div>
            <div className={s.kpi} style={{ '--accent': 'var(--prod-rep)' }}>
              <span className={s.kLab}>재공정 생산</span>
              <span className={`${s.kVal} ${s.cRep}`}>{num(sum.repair)}<i>건</i></span>
              <span className={s.kSub}>재공정률 {sum.repair_rate}%</span>
            </div>
            <div className={s.kpi} style={{ '--accent': 'var(--prod-via)' }}>
              <span className={s.kLab}>경유 LOT</span>
              <span className={`${s.kVal} ${s.cVia}`}>{num(sum.via)}<i>건</i></span>
              <span className={s.kSub}>실적에서 제외됨</span>
            </div>
          </div>

          <div className={s.grid2}>
            <div className={s.card}>
              <div className={s.cardH}>
                <h3>공정별 생산</h3>
                <span className={s.hint}>생산 = 신규 + 재공정 · 경유 제외</span>
              </div>
              <TallyTable rows={data.by_process} firstLabel="공정"
                renderKey={(r) => <>{r.key} <span className={s.hint}>{r.code}</span></>} />
            </div>

            <div className={s.card}>
              <div className={s.cardH}>
                <h3>일자별 발급</h3>
                <span className={s.hint}>{fmtMD(range.from)} – {fmtMD(range.to)}</span>
              </div>
              <DailyBars daily={data.daily} />
            </div>
          </div>

          <div className={s.grid2}>
            <div className={s.card}>
              <div className={s.cardH}>
                <h3>모델별 생산</h3>
                <span className={s.hint}>사이즈 × 모터 타입</span>
              </div>
              {splitTot > 0 && (
                <div className={s.split}>
                  <div className={s.splitBar}>
                    <span className={s.sOut} style={{ width: `${outPct}%` }} />
                    <span className={s.sIn} style={{ width: `${100 - outPct}%` }} />
                  </div>
                  <div className={s.splitLeg}>
                    <span className={s.lg}><i className={s.sOut} />외전 <b>{num(split['외전'])}</b>
                      <span className={s.hint}>{Math.round(outPct * 10) / 10}%</span></span>
                    <span className={s.lg}><i className={s.sIn} />내전 <b>{num(split['내전'])}</b>
                      <span className={s.hint}>{Math.round((100 - outPct) * 10) / 10}%</span></span>
                  </div>
                </div>
              )}
              <TallyTable rows={data.by_model} firstLabel="모델"
                renderKey={(r) => (
                  <>{r.phi ? `Φ${r.phi}` : '미분류'}
                    {r.motor && (
                      <span className={`${s.mt} ${r.motor === '외전' ? s.mtOut : s.mtIn}`}>{r.motor}</span>
                    )}
                  </>
                )} />
            </div>

            <div className={s.card}>
              <div className={s.cardH}>
                <h3>완제품 생산량</h3>
                <span className={s.hint}>OQ 합격 = 완제품 · 일별</span>
              </div>
              <div className={s.days}>
                {(() => {
                  const max = Math.max(1, ...fin.trend.map((t) => t.count))
                  return fin.trend.map((t) => (
                    <div key={t.date} className={s.day}>
                      <span className={`${s.dayTot} ${t.count ? '' : s.muted}`}>{t.count}</span>
                      <motion.div className={s.stack}
                        initial={{ height: 0 }}
                        animate={{ height: `${t.count ? Math.max(3, (t.count / max) * 100) : 2}%` }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}>
                        <span className={t.count ? s.sFin : s.sEmpty} style={{ height: '100%' }} />
                      </motion.div>
                      <span className={s.dayLab}>{fmtMD(t.date)} {dowOf(t.date)}</span>
                    </div>
                  ))
                })()}
              </div>
              <div className={s.tscroll} style={{ borderTop: '1px solid var(--color-border)' }}>
                <table className={s.table}>
                  <thead><tr><th>기간</th><th>완제품</th><th>외전</th><th>내전</th><th>전주 대비</th></tr></thead>
                  <tbody>
                    <tr><td>오늘</td><td>{num(fin.today)}</td><td>{num(fin.today_outer)}</td>
                      <td>{num(fin.today_inner)}</td><td className={s.muted}>—</td></tr>
                    <tr><td>이번주</td><td>{num(fin.week)}</td><td>{num(fin.week_outer)}</td>
                      <td>{num(fin.week_inner)}</td>
                      <td className={fin.week_delta >= 0 ? s.up : s.down}>
                        {fin.week_delta >= 0 ? '▲' : '▼'} {Math.abs(fin.week_delta)}
                      </td></tr>
                    <tr><td>이번달</td><td>{num(fin.month)}</td><td className={s.muted}>—</td>
                      <td className={s.muted}>—</td><td className={s.muted}>—</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* LOT 목록 */}
          <div className={s.card} style={{ marginTop: 14 }}>
            <div className={s.lotHead}>
              <h3>LOT 목록</h3>
              <span className={s.hint}>
                전체 {num(data.lots.length)}건 중 <b>{num(lots.length)}</b>건
                {data.lot_truncated ? ' · 상한 초과분 제외' : ''}
              </span>
              <input className={s.search} placeholder="LOT 번호 검색"
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            {/* 필터 — 공정 / 구분 / 사이즈 / 모터 (전부 다중 선택, 미선택 = 전체) */}
            <div className={s.lotFilters}>
              <div className={s.fgrp}>
                <span className={s.flab}>공정</span>
                {opts.procs.map((p) => (
                  <button key={p.code} type="button"
                    className={`${s.chip} ${fProc.includes(p.code) ? s.chipOn : ''}`}
                    onClick={() => toggle(setFProc)(p.code)}>{p.label}</button>
                ))}
              </div>
              <span className={s.fdiv} />
              <div className={s.fgrp}>
                <span className={s.flab}>구분</span>
                {F_KIND.map((k) => (
                  <button key={k} type="button"
                    className={`${s.chip} ${kind.includes(k) ? s[`chipOn_${k}`] : ''}`}
                    onClick={() => toggleKind(k)}>{KIND_LABEL[k]}</button>
                ))}
              </div>
              {opts.phis.length > 0 && (
                <>
                  <span className={s.fdiv} />
                  <div className={s.fgrp}>
                    <span className={s.flab}>사이즈</span>
                    {opts.phis.map((p) => (
                      <button key={p} type="button"
                        className={`${s.chip} ${fPhi.includes(p) ? s.chipOn : ''}`}
                        onClick={() => toggle(setFPhi)(p)}>Φ{p}</button>
                    ))}
                  </div>
                </>
              )}
              {opts.motors.length > 0 && (
                <>
                  <span className={s.fdiv} />
                  <div className={s.fgrp}>
                    <span className={s.flab}>모터</span>
                    {opts.motors.map((m) => (
                      <button key={m} type="button"
                        className={`${s.chip} ${fMotor.includes(m) ? s.chipOn : ''}`}
                        onClick={() => toggle(setFMotor)(m)}>{m}</button>
                    ))}
                  </div>
                </>
              )}
              {hasLotFilter ? (
                <button type="button" className={s.clearBtn} onClick={clearLotFilter}>초기화</button>
              ) : null}
            </div>
            <div className={s.tscroll}>
              <table className={`${s.table} ${s.lotTbl}`}>
                <thead>
                  <tr>
                    <th>LOT 번호</th><th className={s.thL}>공정</th><th className={s.thL}>구분</th>
                    <th className={s.thL}>모델</th><th>수량</th><th className={s.thL}>작업자·업체</th>
                    <th className={s.thL}>발급일시</th><th className={s.thL}>상태</th><th className={s.thL}>원본 LOT · 사유</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.length === 0 && (
                    <tr><td colSpan={9} className={s.muted}>조건에 맞는 LOT 이 없습니다.</td></tr>
                  )}
                  {pageLots.map((l) => (
                    <tr key={l.lot_no} className={l.kind === 'via' ? s.viaRow : ''}>
                      <td className={s.lotNo}>{l.lot_no}</td>
                      <td className={s.tdL}>{l.process_label}</td>
                      <td className={s.tdL}>
                        <span className={`${s.badge} ${s[`b_${l.kind}`]}`}>{KIND_LABEL[l.kind]}</span>
                      </td>
                      <td className={s.tdL}>
                        {l.phi ? `Φ${l.phi}` : '-'}{l.motor ? ` ${l.motor}` : ''}
                      </td>
                      <td>{num(l.quantity)}</td>
                      <td className={s.tdL}>{l.worker || '-'}</td>
                      <td className={s.tdL}>{fmtDT(l.at)}</td>
                      <td className={s.tdL}><span className={s.stat}>{STATUS_LABEL[l.status] || l.status}</span></td>
                      <td className={s.tdL}>
                        {l.origin || l.reason
                          ? <span className={s.origin}>{[l.origin, l.reason].filter(Boolean).join(' · ')}</span>
                          : <span className={s.muted}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 — 한 페이지 50건 */}
            {pageCount > 1 && (
              <div className={s.pager}>
                <button type="button" className={s.pgBtn} disabled={curPage === 1}
                  onClick={() => setPage(1)}>«</button>
                <button type="button" className={s.pgBtn} disabled={curPage === 1}
                  onClick={() => setPage(curPage - 1)}>이전</button>
                <span className={s.pgInfo}>
                  <b>{curPage}</b> / {pageCount}
                  <span className={s.hint}> · {(curPage - 1) * PER + 1}–{Math.min(curPage * PER, lots.length)}번째</span>
                </span>
                <button type="button" className={s.pgBtn} disabled={curPage === pageCount}
                  onClick={() => setPage(curPage + 1)}>다음</button>
                <button type="button" className={s.pgBtn} disabled={curPage === pageCount}
                  onClick={() => setPage(pageCount)}>»</button>
              </div>
            )}
          </div>

          <p className={s.note}>
            <b>경유 LOT (經由)</b> — 실제 작업 없이 <b>체인을 잇기 위해 번호만 발급</b>된 LOT. 생산 실적에서 제외합니다.
            재공정 LOT 의 suffix = 문제 공정이므로, <b>prefix가 문제공정보다 앞</b>이면 경유
            (예: 중성점 재작업하려고 발급한 권선 번호 — 권선은 다시 하지 않음),
            <b> 문제공정 이상</b>이면 실제 재작업이라 <b>재공정 생산</b>으로 집계합니다.
            <br /><b>생산 실적 = 신규 + 재공정</b>
          </p>
        </>
      )}
    </div>
  )
}
