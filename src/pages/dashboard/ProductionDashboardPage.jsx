// pages/dashboard/ProductionDashboardPage.jsx
// 스테이터 생산량 — OQ 합격 완제품 수 추이 (2026-05-21 품질 대시보드에서 분리).
// 대시보드 탭의 독립 뷰. 데이터는 품질 대시보드 API 의 production 필드를 재사용.

import { useState, useEffect } from 'react'
import { getQualityDashboard } from '@/api'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import s from './ProductionDashboardPage.module.css'

const DAYS_OPTIONS = [
  { value: 1,  label: '1일' },
  { value: 7,  label: '7일' },
  { value: 30, label: '30일' },
  { value: 90, label: '90일' },
]

const fmtShort = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}
const fmtDateTime = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// "YYYY-MM-DD" → 로컬 Date (UTC 파싱 회피 — 타임존 무관하게 정확)
const parseYMD = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
// 해당 날짜가 속한 주의 월요일 키 ("YYYY-MM-DD")
const mondayKey = (iso) => {
  const d = parseYMD(iso)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))   // 월0 화1 … 일6 만큼 되감기
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// 일별 trend → 주별 묶음 [{key, label, count, title}] (월~일, 양끝 부분 주 허용)
const groupByWeek = (trend) => {
  const weeks = new Map()
  for (const t of trend) {
    const key = mondayKey(t.date)
    let w = weeks.get(key)
    if (!w) {
      w = { key, start: t.date, end: t.date, count: 0, days: 0 }
      weeks.set(key, w)
    }
    if (t.date < w.start) w.start = t.date
    if (t.date > w.end) w.end = t.date
    w.count += t.count
    w.days += 1
  }
  return [...weeks.values()].map((w) => {
    const start = parseYMD(w.start)
    const end = parseYMD(w.end)
    const sm = start.getMonth() + 1
    const em = end.getMonth() + 1
    const label = sm === em
      ? `${sm}/${start.getDate()}~${end.getDate()}`
      : `${sm}/${start.getDate()}~${em}/${end.getDate()}`
    const avg = (w.count / w.days).toFixed(1)
    return {
      key: w.key,
      label,
      count: w.count,
      title: `${w.start} ~ ${w.end} · ${w.count}개 (일평균 ${avg}개)`,
    }
  })
}

// 생산량 막대 차트 — 7일 이하 일별, 30·90일은 주별로 묶어 표시
function ProductionChart({ trend, days }) {
  if (!trend || trend.length === 0) {
    return <p className={s.empty}>생산량 데이터가 없어요.</p>
  }
  const bars = days >= 30
    ? groupByWeek(trend)
    : trend.map((t) => ({
        key: t.date,
        label: fmtShort(t.date),
        count: t.count,
        title: `${fmtShort(t.date)} · ${t.count}개`,
      }))
  const maxVal = Math.max(1, ...bars.map((b) => b.count))
  return (
    <div className={s.prodChart}>
      {bars.map((b) => (
        <div key={b.key} className={s.prodCol} title={b.title}>
          <span className={s.prodColVal}>{b.count}</span>
          <div
            className={s.prodColBar}
            style={{ height: `${(b.count / maxVal) * 85}%` }}
          />
          <span className={s.prodColDate}>{b.label}</span>
        </div>
      ))}
    </div>
  )
}

export default function ProductionDashboardPage({ onBack }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // silent=true → 폴링 갱신 / force=true → BE 캐시 무시 강제 재계산
  const load = (d, { force = false, silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    getQualityDashboard(d, force)
      .then(setData)
      .catch((e) => { if (!silent) setError(e.message || '조회 실패') })
      .finally(() => { if (!silent) setLoading(false) })
  }

  useEffect(() => { load(days) }, [days])

  const prod = data?.production

  return (
    <div className="page-flat">
      <PageHeader
        title="스테이터 생산량"
        subtitle="OQ 합격 완제품 수 추이"
        onBack={onBack}
      />

      <div className={s.periodRow}>
        <div className={s.periodBtns}>
          {DAYS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`${s.periodBtn} ${days === opt.value ? s.periodBtnActive : ''}`}
              onClick={() => setDays(opt.value)}
              disabled={loading}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={s.refreshBtn}
          onClick={() => load(days, { force: true })}
          disabled={loading}
          aria-label="새로고침 (캐시 무시 재계산)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {loading && <p className={s.info}>불러오는 중…</p>}
      {error && <p className={s.errorMsg}>⚠ {error}</p>}

      {prod && !loading && (
        <>
          <div className={s.prodTiles}>
            <div className={s.sumTile}>
              <span className={s.sumLabel}>오늘</span>
              <span className={s.sumValue}>{prod.today}</span>
            </div>
            <div className={s.sumTile}>
              <span className={s.sumLabel}>이번주</span>
              <span className={s.sumValue}>{prod.week}</span>
            </div>
            <div className={s.sumTile}>
              <span className={s.sumLabel}>이번달</span>
              <span className={s.sumValue}>{prod.month}</span>
            </div>
          </div>

          {data.range && (
            <p className={s.rangeText}>
              {data.range.from} ~ {data.range.to}
              {data.computed_at && ` · 갱신 ${fmtDateTime(data.computed_at)}`}
            </p>
          )}

          <Section label={days >= 30 ? '주별 생산량' : '일별 생산량'}>
            <ProductionChart trend={prod.trend} days={days} />
          </Section>
        </>
      )}

      {!prod && !loading && !error && (
        <p className={s.empty}>생산량 데이터가 없어요.</p>
      )}
    </div>
  )
}
