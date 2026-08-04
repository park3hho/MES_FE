// pages/dashboard/QualityWeeklyReport.jsx
// 품질 주간 리포트 — 검사이력 엑셀과 동일 로직(BE qc_xlsx 병합 행)으로 4분류 집계 (2026-08-03)
//   주차(ISO) 선택 → KPI + 대분류/공정별/제품군/사이즈 4카드(불량률 막대·심각도색)
//   + 주별 불량률 추이 + 공정별 불량 파레토 + 해당 주 엑셀 다운로드.
//   불량률 = 불량수량 ÷ 검사수량 (엑셀 방식). 숫자는 검사이력 엑셀과 1:1 일치.

import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { getQualityWeekly, downloadQcXlsx } from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import s from './QualityWeeklyReport.module.css'

// 불량률 심각도 임계 (%) — 막대 색 + 강조. (엑셀 노란칸 강조 대체)
const SEV_WARN = 5
const SEV_CRIT = 15
const BAR_MAX = 40 // 막대 100% 기준 불량률 (스케일)

const sevClass = (r) =>
  r == null ? s.n : r >= SEV_CRIT ? s.c : r >= SEV_WARN ? s.w : s.g

const fmtQty = (v) => (v == null ? '0' : Number(v).toLocaleString())
const fmtRate = (r) => (r == null ? '–' : `${r}%`)
const fmtPct = (v) => (v == null ? '–' : `${v}%`)
// 품질 달성률 색: 목표 달성(≥100) 녹색 / 80↑ 보통 / 그 아래 미달
const achvClass = (v) => (v == null ? s.aNone : v >= 100 ? s.aGood : v >= 80 ? s.aMid : s.aBad)

// ── 날짜 헬퍼 (로컬 기준) ──
const pad = (n) => String(n).padStart(2, '0')
const fmtYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function mondayOf(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // 0=월
  return d
}
const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const fmtMD = (iso) => {
  if (!iso) return ''
  const [, m, dd] = iso.split('-')
  return `${Number(m)}/${Number(dd)}`
}

// 불량률 셀 (막대 + 값)
function RateCell({ rate }) {
  return (
    <div className={`${s.rate} ${sevClass(rate)}`}>
      <span className={s.bar}>
        <i style={{ width: `${Math.min(100, ((rate || 0) / BAR_MAX) * 100)}%` }} />
      </span>
      <span className={s.num}>{fmtRate(rate)}</span>
    </div>
  )
}

// 불량 수 바뀌면(귀책 재분배) 불량률·점유율·달성률 다시 계산
function recompRow(r, newDefect, totalDefect, target) {
  const insp = r.insp_qty
  const rate = insp ? Math.round((newDefect / insp) * 1000) / 10 : null
  return {
    ...r,
    defect_qty: newDefect,
    defect_rate: rate,
    defect_share: totalDefect ? Math.round((newDefect / totalDefect) * 1000) / 10 : 0,
    achievement: rate == null ? null : rate <= target ? 100 : Math.round((100 - rate) * 10) / 10,
  }
}

// 출하 불량 개수만 발생공정(oqOrigin)으로 재분배 — 출하엔 미확인 잔여만. 총 불량 보존.
function redistributeOrigin(rows, summary, oqOrigin, target) {
  const totalDefect = summary?.defect_qty || 0
  const add = {}
  let totalAttr = 0
  oqOrigin.forEach((o) => { add[o.key] = (add[o.key] || 0) + o.count; totalAttr += o.count })
  return rows.map((r) => {
    if (r.key === '출하') return recompRow(r, Math.max(0, (r.defect_qty || 0) - totalAttr), totalDefect, target)
    const a = add[r.key] || 0
    return a ? recompRow(r, (r.defect_qty || 0) + a, totalDefect, target) : r
  })
}

// ══════════════════════════════════════════════════
// 4분류 카드 — 미니표. 5지표 + 품질 달성률 섹션(검사비율·점유율·달성률)
//   oqOrigin 넘기면 '출하' 행을 눌러 발생공정(귀책)으로 펼쳐 재분배 (공정별 전용)
// ══════════════════════════════════════════════════
function BreakdownCard({ title, hint, rows, summary, sizeMode, oqOrigin, target }) {
  const [open, setOpen] = useState(false)
  const hasOrigin = !!(oqOrigin && oqOrigin.length)
  const label = (k) => (sizeMode ? (k === '기타' ? '기타' : `Φ${k}`) : k)
  const displayRows = hasOrigin && open ? redistributeOrigin(rows, summary, oqOrigin, target) : rows

  const renderRow = (r, isSum) => {
    const empty = !r.insp_qty
    const clickable = !isSum && hasOrigin && r.key === '출하'
    return (
      <tr
        key={isSum ? '__sum' : r.key}
        className={`${isSum ? s.sum : ''} ${clickable ? s.clickable : ''}`}
        onClick={clickable ? () => setOpen((o) => !o) : undefined}
      >
        <td>
          {isSum ? '합계' : label(r.key)}
          {!isSum && sizeMode && r.key === '20' && <span className={s.tag}>내전형</span>}
        </td>
        <td>{r.count}</td>
        <td className={empty ? s.muted : ''}>{fmtQty(r.insp_qty)}</td>
        <td className={empty ? s.muted : ''}>{fmtQty(r.good_qty)}</td>
        <td className={empty ? s.muted : ''}>{fmtQty(r.defect_qty)}</td>
        <td><RateCell rate={r.defect_rate} /></td>
        <td className={s.sub}>{fmtPct(r.insp_share)}</td>
        <td className={s.sub}>{fmtPct(r.defect_share)}</td>
        <td><span className={`${s.achv} ${achvClass(r.achievement)}`}>{fmtPct(r.achievement)}</span></td>
      </tr>
    )
  }

  return (
    <div className={s.card}>
      <div className={s.cardH}>
        <h3>{title}</h3>
        <span className={s.hint}>{hint}</span>
      </div>
      <div className={s.tableScroll}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>{sizeMode ? '모델' : '구분'}</th>
              <th>건수</th>
              <th>수량</th>
              <th>양품</th>
              <th>불량</th>
              <th>불량률</th>
              <th>검사비율</th>
              <th>점유율</th>
              <th>달성률</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => renderRow(r, false))}
            {summary && renderRow(summary, true)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 주별 불량률 추이 (스파크라인)
// ══════════════════════════════════════════════════
function TrendSpark({ trend, selWeek }) {
  if (!trend || trend.length < 2) return <p className={s.empty}>추이 데이터가 부족해요.</p>
  const W = 520, H = 130, PT = 12, PB = 22, PL = 4, PR = 4
  const innerW = W - PL - PR, innerH = H - PT - PB
  const maxY = Math.max(4, ...trend.map((t) => t.defect_rate || 0))
  const stepX = trend.length > 1 ? innerW / (trend.length - 1) : innerW
  const xy = (t, i) => ({
    x: PL + i * stepX,
    y: PT + innerH - ((t.defect_rate || 0) / maxY) * innerH,
  })
  const line = trend.map((t, i) => {
    const { x, y } = xy(t, i)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const area = `${line} L${(PL + (trend.length - 1) * stepX).toFixed(1)},${(PT + innerH).toFixed(1)} L${PL},${(PT + innerH).toFixed(1)} Z`
  const last = trend[trend.length - 1]
  const lastXY = xy(last, trend.length - 1)
  return (
    <div className={s.card}>
      <div className={s.cardH}>
        <h3>주별 불량률 추이</h3>
        <span className={s.hint}>최근 {trend.length}주</span>
      </div>
      <div className={s.sparkWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} className={s.spark} preserveAspectRatio="none">
          <defs>
            <linearGradient id="qwFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={PL} x2={W - PR} y1={PT + innerH} y2={PT + innerH} stroke="var(--color-border)" />
          <motion.path
            d={area} fill="url(#qwFill)"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
          />
          <motion.path
            d={line} fill="none" stroke="var(--color-primary)" strokeWidth="2.2"
            strokeLinejoin="round" strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }}
          />
          <circle cx={lastXY.x} cy={lastXY.y} r="4.5" fill="var(--color-white)" stroke="var(--color-error)" strokeWidth="3" />
          {trend.map((t, i) => {
            const { x } = xy(t, i)
            const isSel = t.iso_week === selWeek
            if (i % Math.ceil(trend.length / 6) !== 0 && !isSel && i !== trend.length - 1) return null
            return (
              <text key={i} x={x} y={H - 6} className={s.sparkX} textAnchor="middle"
                fill={isSel ? 'var(--color-error)' : 'var(--color-text-muted)'}
                fontWeight={isSel ? 700 : 400}>
                {t.label}
              </text>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 공정별 불량 파레토
// ══════════════════════════════════════════════════
function Pareto({ process }) {
  const rows = useMemo(() => {
    const withDefect = (process || [])
      .filter((r) => (r.defect_qty || 0) > 0)
      .sort((a, b) => b.defect_qty - a.defect_qty)
    const total = withDefect.reduce((sum, r) => sum + r.defect_qty, 0) || 1
    let cum = 0
    return withDefect.map((r) => {
      cum += r.defect_qty
      return { ...r, cumPct: Math.round((cum / total) * 100) }
    })
  }, [process])
  const max = rows[0]?.defect_qty || 1
  return (
    <div className={s.card}>
      <div className={s.cardH}>
        <h3>공정별 불량 파레토</h3>
        <span className={s.hint}>불량수량 내림차순 · 누적%</span>
      </div>
      <div className={s.pareto}>
        {rows.length === 0 && <p className={s.empty}>불량 없음 🎉</p>}
        {rows.map((r) => (
          <div key={r.key} className={s.prow}>
            <span className={s.pl}>{r.key}</span>
            <span className={s.ptrack}>
              <motion.i
                initial={{ width: 0 }} animate={{ width: `${(r.defect_qty / max) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </span>
            <span className={s.pv}>{r.defect_qty}<span className={s.cum}> · {r.cumPct}%</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 메인
// ══════════════════════════════════════════════════
export default function QualityWeeklyReport() {
  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState(false)

  const range = useMemo(() => ({
    from: fmtYMD(monday),
    to: fmtYMD(addDays(monday, 6)),
  }), [monday])

  // 다음 주 이동 제한 — 이번 주(월요일) 이후로는 못 감 (미래 데이터 없음)
  const atCurrent = fmtYMD(monday) >= fmtYMD(mondayOf(new Date()))

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    getQualityWeekly({ date_from: range.from, date_to: range.to })
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(e.message || '조회 실패') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [range.from, range.to])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      // QC export 는 from/to 쿼리 alias 사용 (date_from/date_to 아님) — 해당 주만 스코프.
      const blob = await downloadQcXlsx({ from: range.from, to: range.to })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `QC_${range.from.replace(/-/g, '')}_${range.to.replace(/-/g, '')}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      emitToast('엑셀 다운로드 완료', 'success')
    } catch (e) {
      emitToast(e.message || '다운로드 실패', 'error')
    } finally {
      setDownloading(false)
    }
  }

  const sum = data?.summary
  const prev = data?.prev_summary
  // 전주 대비 불량률 델타 (%p)
  const rateDelta = sum?.defect_rate != null && prev?.defect_rate != null
    ? Math.round((sum.defect_rate - prev.defect_rate) * 10) / 10
    : null
  const qtyDelta = sum?.insp_qty != null && prev?.insp_qty != null ? sum.insp_qty - prev.insp_qty : null

  return (
    <div className={s.wrap}>
      {/* 주차 선택 + 다운로드 */}
      <div className={s.head}>
        <div className={s.weeksel}>
          <button type="button" onClick={() => setMonday(addDays(monday, -7))} aria-label="이전 주">‹</button>
          <div className={s.wk}>
            <b>{data?.week?.label || '…'}</b>
            <span>{fmtMD(range.from)}–{fmtMD(range.to)} · ISO</span>
          </div>
          <button type="button" onClick={() => setMonday(addDays(monday, 7))} disabled={atCurrent} aria-label="다음 주">›</button>
        </div>
        <div className={s.headRight}>
          {!atCurrent && (
            <button type="button" className={s.thisWeek} onClick={() => setMonday(mondayOf(new Date()))}>이번 주</button>
          )}
          <button type="button" className={s.dlBtn} onClick={handleDownload} disabled={downloading || !data}>
            {downloading ? '내려받는 중…' : '⬇ 엑셀'}
          </button>
        </div>
      </div>

      {loading && <p className={s.info}>불러오는 중…</p>}
      {error && <p className={s.errorMsg}>⚠ {error}</p>}

      {data && !loading && (
        <>
          {/* KPI */}
          <div className={s.kpis}>
            <div className={s.kpi}>
              <span className={s.kLabel}>검사수량</span>
              <span className={s.kVal}>{fmtQty(sum.insp_qty)}<i>개</i></span>
              <span className={`${s.kDelta} ${s.flat}`}>
                {qtyDelta == null ? `검사 ${sum.count}건` : `${qtyDelta >= 0 ? '▲' : '▼'} ${Math.abs(qtyDelta)} 전주 대비`}
              </span>
            </div>
            <div className={s.kpi}>
              <span className={s.kLabel}>품질 달성률</span>
              <span className={s.kVal}>{sum.achievement == null ? '–' : sum.achievement}<i>%</i></span>
              <span className={`${s.kDelta} ${s.good}`}>목표 불량률 {data.target}% 이하</span>
            </div>
            <div className={`${s.kpi} ${s.accent}`}>
              <span className={s.kLabel}>불량률</span>
              <span className={s.kVal}>{sum.defect_rate == null ? '–' : sum.defect_rate}<i>%</i></span>
              <span className={s.kDelta} style={{ color: rateDelta > 0 ? '#ffb3ab' : '#bff0cf' }}>
                {rateDelta == null ? '기준 없음'
                  : `${rateDelta >= 0 ? '▲' : '▼'} ${Math.abs(rateDelta)}%p 전주`}
              </span>
            </div>
            <div className={s.kpi}>
              <span className={s.kLabel}>불량수량</span>
              <span className={s.kVal}>{fmtQty(sum.defect_qty)}<i>개</i></span>
              <span className={`${s.kDelta} ${s.flat}`}>검사건수 {sum.count}건</span>
            </div>
          </div>

          {/* 4 분류 카드 */}
          <div className={s.grid}>
            <BreakdownCard title="대분류" hint="검사 구분(수입·공정·출하)" rows={data.breakdowns.major} summary={sum} />
            <BreakdownCard
              title="공정별"
              hint="검사=LOT prefix · 불량=suffix(원인 공정) · 출하행 누르면 귀책 재분배"
              rows={data.breakdowns.process}
              summary={sum}
              oqOrigin={data.oq_origin}
              target={data.target}
            />
            <BreakdownCard title="제품군" hint="원자재·반제품·완제품" rows={data.breakdowns.product} summary={sum} />
            <BreakdownCard title="사이즈" hint="모델 5종 (Φ20·45·70·87·95)" rows={data.breakdowns.size} summary={sum} sizeMode />
          </div>

          {/* 추이 + 파레토 */}
          <div className={s.bottom}>
            <TrendSpark trend={data.trend} selWeek={data.week?.iso_week} />
            <Pareto process={data.breakdowns.process} />
          </div>

          <p className={s.foot}>
            불량률 = 불량 ÷ 검사수량 · 심각도{' '}
            <span className={s.legGood}>0–{SEV_WARN}%</span>{' '}
            <span className={s.legWarn}>{SEV_WARN}–{SEV_CRIT}%</span>{' '}
            <span className={s.legCrit}>{SEV_CRIT}%+</span><br />
            검사비율 = 그 구분 검사수량÷총검사수량 · 점유율 = 그 구분 불량÷총불량 ·
            품질 달성률 = 불량률 {data.target}% 이하면 100%, 초과 시 양품률 · 검사이력 엑셀과 동일 집계
          </p>
        </>
      )}
    </div>
  )
}
