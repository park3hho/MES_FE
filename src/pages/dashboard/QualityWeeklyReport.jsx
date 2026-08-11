// pages/dashboard/QualityWeeklyReport.jsx
// 품질 주간 리포트 — 검사이력 엑셀과 동일 로직(BE qc_xlsx 병합 행)으로 4분류 집계 (2026-08-03)
//   주차(ISO) 선택 → KPI + 대분류/공정별/제품군/사이즈 4카드(불량률 막대·심각도색)
//   + 주별 불량률 추이 + 공정별 불량 파레토 + 해당 주 엑셀 다운로드.
//   불량률 = 불량수량 ÷ 검사수량 (엑셀 방식). 숫자는 검사이력 엑셀과 1:1 일치.

import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { getQualityWeekly, downloadQualityWeeklyXlsx } from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import s from './QualityWeeklyReport.module.css'

// 불량률 심각도 임계 (%) — 막대 색 + 강조. (엑셀 노란칸 강조 대체)
const SEV_WARN = 5
const SEV_CRIT = 15
const BAR_MAX = 40 // 막대 100% 기준 불량률 (스케일)

// 필터 선택지 (BE _MAJOR_ORDER/_PROC_ORDER/_PRODUCT_ORDER/_SIZE_ORDER 와 동기)
const F_LINE = ['고정자', '회전자']
const F_MAJOR = ['수입', '공정', '출하']
const F_PROCESS = ['낱장', '본딩', '전착', '권선', '중성점', '출하']
const F_PRODUCT = ['원자재', '반제품', '완제품']
const F_SIZE = ['20', '45', '70', '87', '95', '기타']
const TREND_WEEK_OPTS = [8, 12, 16, 26]

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
  // 건수 = 양품+불량 구성적 정의 (2026-08-06) — 불량 이동 시 그 몫의 건수도 함께 이동해야 항등 유지.
  const newCount = Math.max(0, (r.count || 0) + (newDefect - (r.defect_qty || 0)))
  const rate = newCount ? Math.round((newDefect / newCount) * 1000) / 10 : null
  return {
    ...r,
    count: newCount,
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
function BreakdownCard({ title, hint, rows, summary, sizeMode, oqOrigin, target, open: openProp, onToggle }) {
  const [openState, setOpenState] = useState(false)
  const open = onToggle ? !!openProp : openState        // onToggle 있으면 부모 제어(다운로드 반영용)
  const toggle = onToggle || (() => setOpenState((o) => !o))
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
        onClick={clickable ? toggle : undefined}
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
  // 좌우 여백 — 끝점 원(r=4.5)과 마지막 주차 라벨이 잘리지 않게 확보 (2026-08-06)
  const W = 520, H = 134, PT = 14, PB = 24, PL = 18, PR = 26
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
        {/* none 이면 끝점 원·주차 라벨이 가로로 늘어나 잘려 보임 → 비율 유지 (2026-08-06) */}
        <svg viewBox={`0 0 ${W} ${H}`} className={s.spark} preserveAspectRatio="xMidYMid meet">
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
          {/* 값(%) 라벨 — 라벨을 찍는 지점에만 (전부 찍으면 겹침) */}
          {trend.map((t, i) => {
            const { x, y } = xy(t, i)
            const isSel = t.iso_week === selWeek
            const isTick = i % Math.ceil(trend.length / 6) === 0 || isSel || i === trend.length - 1
            if (!isTick) return null
            const above = y > PT + innerH * 0.35        // 점이 아래쪽이면 위에, 위쪽이면 아래에 표기
            return (
              <text key={`v${i}`} x={x} y={above ? y - 8 : y + 15} className={s.sparkVal} textAnchor="middle"
                fill={isSel ? 'var(--color-error)' : 'var(--color-text-sub)'}
                fontWeight={isSel ? 700 : 600}>
                {t.defect_rate == null ? '–' : `${t.defect_rate}%`}
              </text>
            )
          })}
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
// 불량 유형별 — 카드 2장 (좌: 대분류 표 / 우: 선택 행의 중분류 드릴다운).
//   그리드 셀 2칸을 차지하도록 Fragment 반환 (2026-08-06).
// ══════════════════════════════════════════════════
function DefectTypes({ types }) {
  const [sel, setSel] = useState(null)
  const list = types || []
  const total = list.reduce((acc, t) => acc + (t.qty || 0), 0)
  const share = (q, base) => (base ? `${Math.round((q / base) * 1000) / 10}%` : '–')
  // 선택 없으면 최다 항목(첫 행)을 기본 표시 — 우측 카드가 비어 보이지 않게
  const cur = list.find((t) => t.key === sel) || list[0] || null

  return (
    <>
      <div className={s.card}>
        <div className={s.cardH}>
          <h3>불량 유형별</h3>
          <span className={s.hint}>행을 누르면 오른쪽에 중분류</span>
        </div>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr><th>구분</th><th>불량</th><th>점유율</th></tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={3} className={s.muted}>불량 없음</td></tr>
              )}
              {list.map((t) => (
                <tr
                  key={t.key}
                  className={`${s.clickable} ${cur && cur.key === t.key ? s.rowSel : ''}`}
                  onClick={() => setSel(t.key)}
                >
                  <td>{t.key}</td>
                  <td>{t.qty}</td>
                  <td className={s.sub}>{share(t.qty, total)}</td>
                </tr>
              ))}
              {list.length > 0 && (
                <tr className={s.sum}>
                  <td>합계</td><td>{total}</td><td>100%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.cardH}>
          <h3>{cur ? `${cur.key} — 중분류` : '중분류'}</h3>
          {cur && <span className={s.hint}>불량 {cur.qty}건</span>}
        </div>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr><th>구분</th><th>불량</th><th>비중</th></tr>
            </thead>
            <tbody>
              {!cur && <tr><td colSpan={3} className={s.muted}>불량 없음</td></tr>}
              {cur && cur.items.map((i) => (
                <tr key={i.key}>
                  <td>{i.key}</td>
                  <td>{i.qty}</td>
                  <td className={s.sub}>{share(i.qty, cur.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════
// 필터 드롭다운 (2026-08-06) — 트리거 버튼 + 오버레이 패널(다중 선택).
//   패널은 absolute 라 레이아웃 높이를 차지하지 않고 아래 콘텐츠 위에 떠오른다.
//   danger=true 는 '불량 개수에만 영향'하는 항목 (불량 유형) 시각 구분.
// ══════════════════════════════════════════════════
function FilterDD({ label, opts, sel, onToggle, onClear, fmt, danger, cols = 1, open, onOpen, onHover, onLeave }) {
  const on = sel.length > 0
  return (
    <div className={s.dd} onMouseEnter={onHover} onMouseLeave={onLeave}>
      <button
        type="button"
        className={`${s.ddBtn} ${on ? (danger ? s.ddBtnOnDanger : s.ddBtnOn) : ''} ${open ? s.ddBtnOpen : ''}`}
        onClick={onOpen}
      >
        <span>{label}</span>
        {/* 배지는 항상 렌더 — 미선택 시 visibility 로만 숨겨 버튼 너비가 안 바뀌게 (레이아웃 시프트 방지) */}
        <span className={`${s.ddCount} ${danger ? s.ddCountDanger : ''} ${on ? '' : s.ddCountOff}`}>
          {sel.length}
        </span>
        <span className={s.ddCaret}>▾</span>
      </button>

      {open && (
        <div className={s.ddPanel}>
          <div className={cols > 1 ? s.ddOpts2 : s.ddOpts}>
            {opts.map((o) => {
              const chk = sel.includes(o)
              return (
                <button
                  key={o}
                  type="button"
                  className={`${s.ddOpt} ${chk ? (danger ? s.ddOptOnDanger : s.ddOptOn) : ''}`}
                  onClick={() => onToggle(o)}
                >
                  {fmt ? fmt(o) : o}
                </button>
              )
            })}
          </div>
          {on && (
            <button type="button" className={s.ddClear} onClick={onClear}>전체 해제</button>
          )}
        </div>
      )}
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
  const [oqOpen, setOqOpen] = useState(false)   // 출하행 펼침(귀책 재분배) — 다운로드에도 반영
  // 필터 (2026-08-06) — major/process/product/size 는 전범위, defect_cat 은 불량 개수에만 영향
  // ★ 필터는 '초안(ft) / 적용(applied)' 분리 (2026-08-06) — 칩을 누를 때마다 조회하면
  //   여러 항목 고를 때 요청이 그만큼 나간다. '적용하기' 를 눌러야 1회만 조회.
  const [ft, setFt] = useState({ line: [], major: [], process: [], product: [], size: [], defect_cat: [] })
  const [applied, setApplied] = useState({ line: [], major: [], process: [], product: [], size: [], defect_cat: [] })
  const [trendWeeks, setTrendWeeks] = useState(12)
  // 칩 토글 — 이미 선택돼 있으면 해제, 아니면 추가 (다중 선택)
  const toggleF = (k, v) => setFt((p) => ({
    ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v],
  }))
  const clearF = () => {
    const empty = { line: [], major: [], process: [], product: [], size: [], defect_cat: [] }
    setFt(empty)
    setApplied(empty)      // 초기화는 즉시 반영 (조회 1회)
  }
  const hasF = Object.values(ft).some((a) => a.length)
  // 초안 ≠ 적용 이면 '적용하기' 활성 (아직 조회에 반영 안 된 변경이 있음)
  const dirty = useMemo(
    () => Object.keys(ft).some((k) => ft[k].join(',') !== applied[k].join(',')),
    [ft, applied],
  )
  const [openDD, setOpenDD] = useState(null)   // 열린 드롭다운 키 (한 번에 하나)
  // 바에 올리면 펼쳐지고 벗어나면 닫힘 (메가메뉴 방식). 클릭은 터치 기기용 토글.
  const ddProps = (k) => ({
    open: openDD === k,
    onOpen: () => setOpenDD((p) => (p === k ? null : k)),
    onHover: () => setOpenDD(k),
    onLeave: () => setOpenDD((p) => (p === k ? null : p)),
  })

  const range = useMemo(() => ({
    from: fmtYMD(monday),
    to: fmtYMD(addDays(monday, 6)),
  }), [monday])

  // 다음 주 이동 제한 — 이번 주(월요일) 이후로는 못 감 (미래 데이터 없음)
  const atCurrent = fmtYMD(monday) >= fmtYMD(mondayOf(new Date()))

  // 조회는 '적용된' 필터만 사용 — 칩 선택(ft)만으로는 요청이 나가지 않는다.
  //   다중 선택은 CSV 로 전달 (qs 헬퍼가 빈 문자열은 자동 제외)
  const query = useMemo(() => ({
    date_from: range.from, date_to: range.to, trend_weeks: trendWeeks,
    line: applied.line.join(','),
    major: applied.major.join(','), process: applied.process.join(','),
    product: applied.product.join(','), size: applied.size.join(','),
    defect_cat: applied.defect_cat.join(','),
  }), [range.from, range.to, trendWeeks, applied])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    getQualityWeekly(query)
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(e.message || '조회 실패') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query])

  const saveBlob = (blob, fname) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fname
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const runDownload = async (fetcher, fname) => {
    setDownloading(true)
    try {
      saveBlob(await fetcher(), fname)
      emitToast('다운로드 완료', 'success')
    } catch (e) {
      emitToast(e.message || '다운로드 실패', 'error')
    } finally {
      setDownloading(false)
    }
  }

  const fnameSuffix = `${range.from.replace(/-/g, '')}_${range.to.replace(/-/g, '')}`
  // ⬇ 엑셀 = 주간 리포트 템플릿(QC_Weekly_Report_Template) 채워서 다운로드
  const handleReport = () =>
    runDownload(
      () => downloadQualityWeeklyXlsx({ date_from: range.from, date_to: range.to, redistribute_oq: oqOpen }),
      `주간보고서_${fnameSuffix}.xlsx`,
    )

  const sum = data?.summary
  const prev = data?.prev_summary
  // 전주 대비 불량률 델타 (%p)
  const rateDelta = sum?.defect_rate != null && prev?.defect_rate != null
    ? Math.round((sum.defect_rate - prev.defect_rate) * 10) / 10
    : null
  const qtyDelta = sum?.insp_qty != null && prev?.insp_qty != null ? sum.insp_qty - prev.insp_qty : null
  const cntDelta = sum?.count != null && prev?.count != null ? sum.count - prev.count : null

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
          {/* 추이 표시 주 수 — 데이터 필터가 아니라 '보기' 설정이라 설정값 조정 밖에 둠 */}
          <select className={s.trendSel} value={trendWeeks}
            onChange={(e) => setTrendWeeks(Number(e.target.value))} title="추이 표시 주 수">
            {TREND_WEEK_OPTS.map((n) => <option key={n} value={n}>추이 {n}주</option>)}
          </select>
          {!atCurrent && (
            <button type="button" className={s.thisWeek} onClick={() => setMonday(mondayOf(new Date()))}>이번 주</button>
          )}
          <button type="button" className={s.dlBtn} onClick={handleReport} disabled={downloading || !data}>
            {downloading ? '내려받는 중…' : '⬇ 엑셀'}
          </button>
        </div>
      </div>

      {/* 설정값 조정 — 좌: 전범위(모든 지표에 영향) / 우: 불량 유형(불량 개수에만) · 세로선으로 분리 */}
      <div className={s.fsWrap}>
        <div className={s.fsTitleRow}>
          <span className={s.fsTitle}>설정값 조정</span>
          {hasF && <button type="button" className={s.fclear} onClick={clearF}>초기화</button>}
        </div>
        <div className={s.fsRow} onMouseLeave={() => setOpenDD(null)}>
          <FilterDD label="라인" opts={F_LINE} sel={ft.line} {...ddProps('line')}
            onToggle={(v) => toggleF('line', v)} onClear={() => setFt((p) => ({ ...p, line: [] }))} />
          <FilterDD label="공정 대분류" opts={F_MAJOR} sel={ft.major} {...ddProps('major')}
            onToggle={(v) => toggleF('major', v)} onClear={() => setFt((p) => ({ ...p, major: [] }))} />
          <FilterDD label="공정별" opts={F_PROCESS} sel={ft.process} {...ddProps('process')}
            onToggle={(v) => toggleF('process', v)} onClear={() => setFt((p) => ({ ...p, process: [] }))} />
          <FilterDD label="제품군" opts={F_PRODUCT} sel={ft.product} {...ddProps('product')}
            onToggle={(v) => toggleF('product', v)} onClear={() => setFt((p) => ({ ...p, product: [] }))} />
          <FilterDD label="사이즈" opts={F_SIZE} sel={ft.size} {...ddProps('size')}
            onToggle={(v) => toggleF('size', v)} onClear={() => setFt((p) => ({ ...p, size: [] }))}
            fmt={(v) => (v === '기타' ? v : `Φ${v}`)} />

          <span className={s.fsDiv} />

          <FilterDD label="불량 유형" opts={data?.defect_cat_options || []} sel={ft.defect_cat}
            {...ddProps('defect')}
            onToggle={(v) => toggleF('defect_cat', v)} onClear={() => setFt((p) => ({ ...p, defect_cat: [] }))}
            danger cols={2} />

          {/* 적용하기 — 여러 항목을 고른 뒤 한 번만 조회 (칩 선택마다 요청 나가는 것 방지) */}
          <button
            type="button"
            className={`${s.applyBtn} ${dirty ? s.applyBtnOn : ''}`}
            onClick={() => { setApplied(ft); setOpenDD(null) }}
            disabled={!dirty || loading}
          >
            {dirty ? '적용하기' : '적용됨'}
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
              <span className={s.kLabel}>검사건수</span>
              <span className={s.kVal}>{fmtQty(sum.count)}<i>건</i></span>
              <span className={`${s.kDelta} ${s.flat}`}>
                {cntDelta == null ? '판정 = 양품+불량'
                  : `${cntDelta >= 0 ? '▲' : '▼'} ${Math.abs(cntDelta)} 전주 대비`}
              </span>
            </div>
            <div className={s.kpi}>
              <span className={s.kLabel}>검사수량</span>
              <span className={s.kVal}>{fmtQty(sum.insp_qty)}<i>개</i></span>
              <span className={`${s.kDelta} ${s.flat}`}>
                {qtyDelta == null ? '생산 시도 유닛'
                  : `${qtyDelta >= 0 ? '▲' : '▼'} ${Math.abs(qtyDelta)} 전주 대비`}
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
              <span className={`${s.kDelta} ${s.flat}`}>양품 {fmtQty(sum.good_qty)}건</span>
            </div>
          </div>

          {/* 2열 × 4행 — 대분류·공정별 / 제품군·사이즈 / 불량유형·요약AI / 추이·파레토 (2026-08-06) */}
          <div className={s.grid}>
            <BreakdownCard title="대분류" hint="검사 구분(수입·공정·출하)" rows={data.breakdowns.major} summary={sum} />
            <BreakdownCard
              title="공정별"
              hint="검사=LOT prefix · 불량=suffix(원인 공정) · 출하행 누르면 귀책 재분배"
              rows={data.breakdowns.process}
              summary={sum}
              oqOrigin={data.oq_origin}
              target={data.target}
              open={oqOpen}
              onToggle={() => setOqOpen((o) => !o)}
            />
            <BreakdownCard title="제품군" hint="원자재·반제품·완제품" rows={data.breakdowns.product} summary={sum} />
            <BreakdownCard title="사이즈" hint="모델 5종 (Φ20·45·70·87·95)" rows={data.breakdowns.size} summary={sum} sizeMode />
            {/* 카드 2장 차지 — 좌: 대분류 표 / 우: 선택 행의 중분류 드릴다운 */}
            <DefectTypes types={data.defect_types} />
            <TrendSpark trend={data.trend} selWeek={data.week?.iso_week} />
            <Pareto process={data.breakdowns.process} />
          </div>

          <p className={s.foot}>
            불량률 = 불량 ÷ 건수 (건수=양품+불량 판정 횟수 · 수량=생산 시도 유닛) · 심각도{' '}
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
