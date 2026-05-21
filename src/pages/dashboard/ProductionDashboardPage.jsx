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

// 일별 생산량 막대 차트
function ProductionChart({ trend }) {
  if (!trend || trend.length === 0) {
    return <p className={s.empty}>생산량 데이터가 없어요.</p>
  }
  const maxVal = Math.max(1, ...trend.map((t) => t.count))
  const dense = trend.length > 14   // 막대 많으면(30/90일) 값·날짜 라벨 생략, hover 툴팁만
  return (
    <div className={s.prodChart}>
      {trend.map((t) => (
        <div key={t.date} className={s.prodCol} title={`${fmtShort(t.date)} · ${t.count}개`}>
          {!dense && <span className={s.prodColVal}>{t.count || ''}</span>}
          <div
            className={s.prodColBar}
            style={{ height: `${(t.count / maxVal) * 100}%` }}
          />
          {!dense && <span className={s.prodColDate}>{fmtShort(t.date)}</span>}
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

          <Section label="일별 생산량">
            <ProductionChart trend={prod.trend} />
          </Section>
        </>
      )}

      {!prod && !loading && !error && (
        <p className={s.empty}>생산량 데이터가 없어요.</p>
      )}
    </div>
  )
}
