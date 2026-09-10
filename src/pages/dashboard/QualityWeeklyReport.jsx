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
// 라인 — 단일선택 뷰 전환. '전체'(2026-09-11 복원)는 서버에 빈 값으로 보내 양 라인을 합쳐 본다.
//   ★ 전체일 때 공정별 표는 BE 가 회전자를 REA/RBO 로 갈라 준다 (같은 EA/BO 코드라 안 그러면 뭉침).
const LINE_ALL = '전체'
const F_LINE = [LINE_ALL, '고정자', '회전자']
const F_MAJOR = ['수입', '공정', '출하']
// 고정자 공정 (BE _PROC_ORDER 의 고정자 몫과 동기)
const F_PROCESS = ['낱장', '본딩', '전착', '권선', '중성점', '출하']
// 회전자 공정 — BE _ROTOR_PROC_ALIAS 와 동기. '전체' 뷰에서만 의미가 있다
//   (단일 라인 뷰는 BE 가 분리를 끄므로 이 키로 필터하면 0건이 된다 → 옵션에서 제외).
const F_PROCESS_ROTOR = ['REA', 'RBO']
// 회전자 분리 키 → 기저 공정. 분리를 모르는 소비자(엑셀)에게 보낼 때 되돌린다.
const ROTOR_TO_BASE = { REA: '낱장', RBO: '본딩' }
const F_PRODUCT = ['원자재', '반제품', '완제품']
// '20'=Φ20 내전 · '20o'=Φ20 외전 (2026-08-28 분리) — BE _SIZE_ORDER 와 동기
const F_SIZE = ['20', '20o', '45', '70', '87', '95', '기타']
const SIZE_FMT = { 20: 'Φ20 내전', '20o': 'Φ20 외전', 기타: '기타' }
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
  oqOrigin.forEach((o) => { add[o.key] = (add[o.key] || 0) + o.count })
  // ★ 차감액은 oqOrigin 총합이 아니라 **실제로 더해질 몫**만 센다 (2026-09-11 버그fix).
  //   예전엔 전량을 '출하'에서 뺐는데, 더할 행이 없는 키는 어디에도 안 더해져 불량이 증발했다:
  //     · 원인이 '기타'(HT/MP/RM) — 공정별 표에 '기타' 행 자체가 없다
  //     · 원인이 '출하' 로 풀림 — 아래 조기 반환에 먼저 걸려 add 가 적용 안 됨(빼기만 두 번)
  //   라인 소계행이 생기면서 이 누수가 '소계 합 < 합계' 로 눈에 보이게 됐다.
  const totalAttr = rows.reduce((n, r) => n + (r.key === '출하' ? 0 : (add[r.key] || 0)), 0)
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
// 라인 그룹 소계 (2026-09-11, 공정별 전용) — 표시 중인 행에서 직접 합산한다.
//   ★ 서버 소계를 따로 받지 않는 이유: 출하행 펼침(귀책 재분배)이 반영된 **화면 값**과 맞아야 한다.
//   비율 3종의 분모는 전체 합계와 동일 — 그래야 고정자 + 회전자 = 100% 가 성립한다.
function groupSubtotal(part, summary, target) {
  const acc = part.reduce((a, r) => ({
    count: a.count + (r.count || 0),
    insp_qty: a.insp_qty + (r.insp_qty || 0),
    good_qty: a.good_qty + (r.good_qty || 0),
    defect_qty: a.defect_qty + (r.defect_qty || 0),
  }), { count: 0, insp_qty: 0, good_qty: 0, defect_qty: 0 })
  const rate = acc.count ? Math.round((acc.defect_qty / acc.count) * 1000) / 10 : null
  const ti = summary?.insp_qty || 0
  const td = summary?.defect_qty || 0
  return {
    ...acc,
    defect_rate: rate,
    insp_share: ti ? Math.round((acc.insp_qty / ti) * 1000) / 10 : 0,
    defect_share: td ? Math.round((acc.defect_qty / td) * 1000) / 10 : 0,
    achievement: rate == null ? null : rate <= (target ?? 0) ? 100 : Math.round((100 - rate) * 10) / 10,
  }
}

function BreakdownCard({ title, hint, rows, summary, sizeMode, oqOrigin, target, detail,
  groupByLine, open: openProp, onToggle }) {
  const [openState, setOpenState] = useState(false)
  const open = onToggle ? !!openProp : openState        // onToggle 있으면 부모 제어(다운로드 반영용)
  const toggle = onToggle || (() => setOpenState((o) => !o))
  const hasOrigin = !!(oqOrigin && oqOrigin.length)
  const label = (k) => (sizeMode ? (k === '기타' ? '기타' : k === '20o' ? 'Φ20' : `Φ${k}`) : k)
  // ★ '출하' 행이 없으면 재분배를 아예 하지 않는다 (2026-09-11 버그fix).
  //   oq_origin 은 날짜만으로 계산되는 **고정자 출하검사** 귀책이라 라인·공정 필터와 무관하게 온다.
  //   그런데 oqOpen 은 필터를 바꿔도 유지된다 → 회전자 뷰나 '출하' 제외 필터에서는 차감할 행이
  //   없는 채 가산만 일어나 불량이 부풀었다. 소계행이 이걸 '소계 합 > 합계' 로 드러낸다.
  const displayRows = hasOrigin && open && rows.some((r) => r.key === '출하')
    ? redistributeOrigin(rows, summary, oqOrigin, target)
    : rows

  // 라인 그룹 — BE 가 행마다 실어 준 line 으로만 판단한다 (키 문자열 파싱 금지: 별칭 규칙 사본이 생긴다).
  //   line 이 비어 있으면(단일 라인 뷰·구버전 응답) 그룹을 아예 그리지 않는다 → 빈/군더더기 헤더 없음.
  const lineGroups = (() => {
    if (!groupByLine) return null
    const order = ['고정자', '회전자']
    const buckets = new Map()
    for (const r of displayRows) {
      if (!r.line) return null            // 한 행이라도 line 이 없으면 분리 불가 — 기존 표로
      if (!buckets.has(r.line)) buckets.set(r.line, [])
      buckets.get(r.line).push(r)
    }
    if (buckets.size < 2) return null      // 실제로 한 라인뿐이면 헤더가 군더더기
    return [...buckets.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([ln, part]) => ({ line: ln, part }))
  })()

  // o: { key, label, cls } — 그룹 소계행처럼 키·라벨·스타일만 다른 행에 쓴다
  const renderRow = (r, isSum, o = {}) => {
    const empty = !r.insp_qty
    const clickable = !isSum && !o.label && hasOrigin && r.key === '출하'
    return (
      <tr
        key={o.key || (isSum ? '__sum' : r.key)}
        className={`${isSum ? s.sum : ''} ${o.cls || ''} ${clickable ? s.clickable : ''}`}
        onClick={clickable ? toggle : undefined}
      >
        <td title={detail && !isSum && !o.label && detail[r.key]?.length
          ? detail[r.key].map((x) => `${x.label}  ${x.count}건${x.defect_qty ? ` (불량 ${x.defect_qty})` : ''}`).join('\n')
          : undefined}>
          {o.label || (isSum ? '합계' : label(r.key))}
          {detail && !isSum && !o.label && detail[r.key]?.length ? <span className={s.tag}>ⓘ</span> : null}
          {!isSum && sizeMode && r.key === '20' && <span className={s.tag}>내전형</span>}
          {!isSum && sizeMode && r.key === '20o' && <span className={s.tag}>외전형</span>}
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
          {/* ⚠️ tbody 를 그룹마다 나누지 않는다 — `.table tbody tr:last-child td {border-bottom:0}` 이
              그룹마다 발동해 경계선이 오히려 사라진다. 소제목도 일반 tr(colspan=9)로 넣어
              nth-child 세로선 규칙(2·6·8열)에 걸리지 않게 한다. */}
          <tbody>
            {lineGroups
              ? lineGroups.flatMap(({ line: ln, part }) => [
                <tr key={`h-${ln}`} className={`${s.grp} ${ln === '회전자' ? s.grpRt : ''}`}>
                  <td colSpan={9}>{ln}<span className={s.grpN}>{part.length}개 공정</span></td>
                </tr>,
                ...part.map((r) => renderRow(r, false)),
                renderRow(groupSubtotal(part, summary, target), false,
                  { key: `st-${ln}`, label: `${ln} 소계`, cls: s.grpSum }),
              ])
              : displayRows.map((r) => renderRow(r, false))}
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
// groups: [{label, n}] — opts 를 앞에서부터 n 개씩 잘라 소제목을 붙인다 (2026-09-11, 공정별 라인 구분).
//   null 이면 기존처럼 한 덩어리. 합이 opts.length 와 달라도 남는 건 마지막 그룹 뒤에 그대로 붙는다.
function FilterDD({ label, opts, sel, onToggle, onClear, fmt, danger, cols = 1, single, groups,
  open, onOpen, onHover, onLeave }) {
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
          {single ? (sel[0] || '') : sel.length}
        </span>
        <span className={s.ddCaret}>▾</span>
      </button>

      {open && (
        <div className={s.ddPanel}>
          {(() => {
            const btn = (o) => (
              <button
                key={o}
                type="button"
                className={`${s.ddOpt} ${sel.includes(o) ? (danger ? s.ddOptOnDanger : s.ddOptOn) : ''}`}
                onClick={() => onToggle(o)}
              >
                {fmt ? fmt(o) : o}
              </button>
            )
            const box = cols > 1 ? s.ddOpts2 : s.ddOpts
            if (!groups) return <div className={box}>{opts.map(btn)}</div>
            let i = 0
            const blocks = groups.map((g) => {
              const part = opts.slice(i, i + g.n)
              i += g.n
              return { ...g, part }
            })
            if (i < opts.length) blocks.push({ label: '', n: 0, part: opts.slice(i) })
            return blocks.filter((g) => g.part.length > 0).map((g, gi) => (
              <div key={g.label || `g${gi}`}>
                {g.label && (
                  <div className={`${s.ddGrp} ${gi > 0 ? s.ddGrpSep : ''}`}>{g.label}</div>
                )}
                <div className={box}>{g.part.map(btn)}</div>
              </div>
            ))
          })()}
          {on && !single && (
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
  // 라인은 단일선택 '뷰 전환'(기본 고정자) — 두 라인 동시 조회 불가. 나머지는 다중선택 필터.
  // 기본값 = 전체 (2026-09-11, 고정자에서 변경) — 첫 화면이 양 라인 합계이고
  //   공정별 표는 고정자/회전자 그룹으로 갈려 나온다.
  const [ft, setFt] = useState({ line: [LINE_ALL], major: [], process: [], product: [], size: [], defect_cat: [] })
  const [applied, setApplied] = useState({ line: [LINE_ALL], major: [], process: [], product: [], size: [], defect_cat: [] })
  const [trendWeeks, setTrendWeeks] = useState(12)
  // 칩 토글 — 이미 선택돼 있으면 해제, 아니면 추가 (다중 선택)
  const toggleF = (k, v) => setFt((p) => ({
    ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v],
  }))
  const clearF = () => {
    const empty = { line: [LINE_ALL], major: [], process: [], product: [], size: [], defect_cat: [] }
    setFt(empty)
    setApplied(empty)      // 초기화는 즉시 반영 (조회 1회) — 라인은 기본 고정자로
  }
  // 초기화 노출 = 기본값(고정자·나머지 빈값)에서 벗어난 게 있을 때
  const hasF = ft.line[0] !== LINE_ALL
    || ft.major.length || ft.process.length || ft.product.length || ft.size.length || ft.defect_cat.length
  // 초안 ≠ 적용 이면 '적용하기' 활성 (아직 조회에 반영 안 된 변경이 있음)
  const dirty = useMemo(
    () => Object.keys(ft).some((k) => ft[k].join(',') !== applied[k].join(',')),
    [ft, applied],
  )
  // 공정별 선택지 — 라인 뷰에 따라 달라진다 (2026-09-11).
  //   ★ 초안(ft.line)을 기준으로 삼는다. applied 를 쓰면 라인을 바꾼 직후 '적용하기' 전까지
  //     드롭다운에 없는 값이 선택돼 있는 어긋난 상태가 보인다.
  const lineAll = ft.line[0] === LINE_ALL
  const procOpts = useMemo(
    () => (lineAll ? [...F_PROCESS, ...F_PROCESS_ROTOR] : F_PROCESS),
    [lineAll],
  )
  const procGroups = useMemo(
    () => (lineAll ? [{ label: '고정자', n: F_PROCESS.length }, { label: '회전자', n: F_PROCESS_ROTOR.length }] : null),
    [lineAll],
  )
  // 라인 뷰를 벗어나면 회전자 공정 선택을 걷어낸다 — 남겨두면 조회가 0건이 된다.
  useEffect(() => {
    if (lineAll) return
    setFt((p) => (p.process.some((x) => F_PROCESS_ROTOR.includes(x))
      ? { ...p, process: p.process.filter((x) => !F_PROCESS_ROTOR.includes(x)) }
      : p))
  }, [lineAll])

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
    // '전체' 는 빈 값 = 라인 필터 없음. BE 가 이 조건에서 공정별 회전자 분리를 켠다.
    line: applied.line[0] === LINE_ALL ? '' : applied.line.join(','),
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
      () => downloadQualityWeeklyXlsx({
        date_from: range.from, date_to: range.to, redistribute_oq: oqOpen,
        // 엑셀 주간리포트는 '양 라인 전체'(19~25 고정자 + 27·28 회전자 레이아웃) — 대시보드 라인선택과 무관.
        //   (라인을 실으면 단일라인만 나와 회전자 행이 빈칸이 됨.) 나머지 필터는 화면 그대로.
        // ★ 공정 필터의 REA/RBO 는 기저 공정으로 되돌려 보낸다 (2026-09-11) — 엑셀은
        //   process_stator/process_rotor(분리 안 된 낱장·본딩 키)를 쓰므로 그대로 실으면
        //   매칭이 하나도 안 돼 **전부 0 인 정상 서식 파일**이 만들어진다 (에러도 안 남).
        filters: { ...applied, line: [], process: applied.process.map((p) => ROTOR_TO_BASE[p] || p) },
      }),
      `주간보고서_${fnameSuffix}.xlsx`,
    )

  // ★ KPI 카드 = '선택 라인 / 전체' 병기 (2026-09-10).
  //   BE 는 summary(양 라인 전체)와 line_summary(선택 라인)를 따로 준다. 예전엔 카드가 전체만 보여줘
  //   아래 breakdown 표(선택 라인 기준)와 숫자가 안 맞아 "어느 쪽 수냐" 는 혼동이 났다.
  //   주 숫자를 선택 라인으로 두어 아래 표와 맞추고, 전체는 뒤에 작게 붙여 맥락을 남긴다.
  const lineSum = data?.line_summary || data?.summary
  const sum = data?.summary
  const selLine = applied.line[0] || ''
  // 라인 선택이 전체와 같은 결과면(=한 라인만 존재) 분모를 숨긴다 — '500 / 500' 은 노이즈다
  const showBoth = !!lineSum && !!sum && lineSum.count !== sum.count
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
          <FilterDD label="라인" opts={F_LINE} sel={ft.line} {...ddProps('line')} single
            onToggle={(v) => setFt((p) => ({ ...p, line: [v] }))}
            onClear={() => setFt((p) => ({ ...p, line: [LINE_ALL] }))} />
          <FilterDD label="공정 대분류" opts={F_MAJOR} sel={ft.major} {...ddProps('major')}
            onToggle={(v) => toggleF('major', v)} onClear={() => setFt((p) => ({ ...p, major: [] }))} />
          {/* 공정별 — '전체' 뷰에서만 회전자(REA/RBO) 선택지가 붙는다. 단일 라인 뷰에 띄우면
              BE 가 분리를 꺼 둔 상태라 고르는 순간 0건이 되는 함정이 된다. */}
          <FilterDD label="공정별" opts={procOpts} groups={procGroups} sel={ft.process}
            {...ddProps('process')}
            onToggle={(v) => toggleF('process', v)} onClear={() => setFt((p) => ({ ...p, process: [] }))} />
          <FilterDD label="제품군" opts={F_PRODUCT} sel={ft.product} {...ddProps('product')}
            onToggle={(v) => toggleF('product', v)} onClear={() => setFt((p) => ({ ...p, product: [] }))} />
          <FilterDD label="사이즈" opts={F_SIZE} sel={ft.size} {...ddProps('size')}
            onToggle={(v) => toggleF('size', v)} onClear={() => setFt((p) => ({ ...p, size: [] }))}
            fmt={(v) => SIZE_FMT[v] || `Φ${v}`} />

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
            {/* ★ 주 숫자 = 선택 라인(아래 표들과 같은 기준), 뒤 = 양 라인 전체.
                라인이 하나뿐인 주(showBoth=false)엔 분모를 숨긴다. */}
            <div className={s.kpi}>
              <span className={s.kLabel}>검사건수</span>
              <span className={s.kVal}>
                {fmtQty(lineSum.count)}
                {showBoth && <em className={s.kAll}> / {fmtQty(sum.count)}</em>}
                <i>건</i>
              </span>
              {showBoth && <span className={s.kSplit}>{selLine} / 전체</span>}
              <span className={`${s.kDelta} ${s.flat}`} title="전체 라인 기준">
                {cntDelta == null ? '판정 = 양품+불량'
                  : `${cntDelta >= 0 ? '▲' : '▼'} ${Math.abs(cntDelta)} 전주 대비`}
              </span>
            </div>
            <div className={s.kpi}>
              <span className={s.kLabel}>검사수량</span>
              <span className={s.kVal}>
                {fmtQty(lineSum.insp_qty)}
                {showBoth && <em className={s.kAll}> / {fmtQty(sum.insp_qty)}</em>}
                <i>개</i>
              </span>
              {showBoth && <span className={s.kSplit}>{selLine} / 전체</span>}
              <span className={`${s.kDelta} ${s.flat}`} title="전체 라인 기준">
                {qtyDelta == null ? '생산 시도 유닛'
                  : `${qtyDelta >= 0 ? '▲' : '▼'} ${Math.abs(qtyDelta)} 전주 대비`}
              </span>
            </div>
            <div className={s.kpi}>
              <span className={s.kLabel}>품질 달성률</span>
              <span className={s.kVal}>
                {lineSum.achievement == null ? '–' : lineSum.achievement}
                {showBoth && <em className={s.kAll}> / {sum.achievement == null ? '–' : sum.achievement}</em>}
                <i>%</i>
              </span>
              {showBoth && <span className={s.kSplit}>{selLine} / 전체</span>}
              <span className={`${s.kDelta} ${s.good}`}>목표 불량률 {data.target}% 이하</span>
            </div>
            <div className={`${s.kpi} ${s.accent}`}>
              <span className={s.kLabel}>불량률</span>
              <span className={s.kVal}>
                {lineSum.defect_rate == null ? '–' : lineSum.defect_rate}
                {showBoth && <em className={s.kAll}> / {sum.defect_rate == null ? '–' : sum.defect_rate}</em>}
                <i>%</i>
              </span>
              {showBoth && <span className={s.kSplit}>{selLine} / 전체</span>}
              <span className={s.kDelta} style={{ color: rateDelta > 0 ? '#ffb3ab' : '#bff0cf' }}
                title="전체 라인 기준">
                {rateDelta == null ? '기준 없음'
                  : `${rateDelta >= 0 ? '▲' : '▼'} ${Math.abs(rateDelta)}%p 전주`}
              </span>
            </div>
            <div className={s.kpi}>
              <span className={s.kLabel}>불량수량</span>
              <span className={s.kVal}>
                {fmtQty(lineSum.defect_qty)}
                {showBoth && <em className={s.kAll}> / {fmtQty(sum.defect_qty)}</em>}
                <i>개</i>
              </span>
              {showBoth && <span className={s.kSplit}>{selLine} / 전체</span>}
              <span className={`${s.kDelta} ${s.flat}`}>양품 {fmtQty(lineSum.good_qty)}건</span>
            </div>
          </div>

          {/* 2열 × 4행 — 대분류·공정별 / 제품군·사이즈 / 불량유형·요약AI / 추이·파레토 (2026-08-06) */}
          <div className={s.grid}>
            <BreakdownCard title="대분류" hint="행에 커서 올리면 구성 공정" rows={data.breakdowns.major} summary={data.line_summary} detail={data.major_detail} />
            <BreakdownCard
              title="공정별"
              hint="검사=LOT prefix · 불량=suffix(원인 공정) · 출하행 누르면 귀책 재분배"
              rows={data.breakdowns.process}
              summary={data.line_summary}
              oqOrigin={data.oq_origin}
              target={data.target}
              groupByLine
              open={oqOpen}
              onToggle={() => setOqOpen((o) => !o)}
            />
            <BreakdownCard title="제품군" hint="원자재·반제품·완제품" rows={data.breakdowns.product} summary={data.line_summary} />
            <BreakdownCard title="사이즈" hint="Φ20 내·외전 · 45 · 70 · 87 · 95" rows={data.breakdowns.size} summary={data.line_summary} sizeMode />
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
