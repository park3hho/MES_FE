// src/pages/manage/LinesChartPage.jsx
// 일별 코드 라인 수 통계 페이지
import { useEffect, useRef, useState } from 'react'
import { getLinesData } from '@/api'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './LinesChartPage.module.css'

export default function LinesChartPage({ onLogout, onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const cumRef    = useRef(null)
  const deltaRef  = useRef(null)
  const weekRef   = useRef(null)
  const recentRef = useRef(null)
  const charts    = useRef([])

  useEffect(() => {
    getLinesData()
      .then(setData)
      .catch(e => setError(e.message))
  }, [])

  useEffect(() => {
    if (!data) return
    // Chart.js CDN 동적 로드
    const load = (src) => new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res()
      const s = document.createElement('script')
      s.src = src; s.onload = res; s.onerror = rej
      document.head.appendChild(s)
    })

    const init = async () => {
      await load('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js')
      await load('https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js')

      // 기존 차트 제거
      charts.current.forEach(c => c.destroy())
      charts.current = []

      const { Chart, ChartDataLabels } = window
      Chart.register(ChartDataLabels)

      const allDates = [...new Set([...Object.keys(data.be), ...Object.keys(data.fe)])].sort()
      const beVals   = allDates.map(d => data.be[d] ?? 0)
      const feVals   = allDates.map(d => data.fe[d] ?? 0)
      const total    = beVals.map((v, i) => v + feVals[i])
      const beDelta  = [beVals[0], ...beVals.slice(1).map((v, i) => v - beVals[i])]
      const feDelta  = [feVals[0], ...feVals.slice(1).map((v, i) => v - feVals[i])]
      const totDelta = beDelta.map((v, i) => v + feDelta[i])
      const labels   = allDates.map(d => d.slice(5))

      const gc = '#1e2535', tc = '#475569', tb = '#141824'
      const sc = {
        x: { ticks: { color: tc, font: { size: 10 }, maxRotation: 45 }, grid: { color: gc } },
        y: { ticks: { color: tc, font: { size: 10 }, callback: v => v.toLocaleString() }, grid: { color: gc } },
      }
      const tt = { backgroundColor: tb, borderColor: '#2a3144', borderWidth: 1, titleColor: '#f8fafc', bodyColor: '#94a3b8' }

      // 누적
      charts.current.push(new Chart(cumRef.current, {
        type: 'line',
        data: { labels, datasets: [
          { label: '합계', data: total, borderColor: '#f472b6', backgroundColor: 'rgba(244,114,182,0.07)', borderWidth: 2.5, tension: 0.3, fill: true, pointRadius: 2, pointHoverRadius: 5 },
          { label: 'MES_FE', data: feVals, borderColor: '#34d399', borderWidth: 1.8, tension: 0.3, fill: false, pointRadius: 2, pointHoverRadius: 5 },
          { label: 'MES_BE', data: beVals, borderColor: '#60a5fa', borderWidth: 1.8, tension: 0.3, fill: false, pointRadius: 2, pointHoverRadius: 5 },
        ]},
        options: { responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } }, datalabels: { display: false },
            tooltip: { ...tt, callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toLocaleString()}줄` } } },
          scales: sc },
      }))

      // 일별 델타
      charts.current.push(new Chart(deltaRef.current, {
        type: 'bar',
        data: { labels, datasets: [
          { label: 'MES_BE', data: beDelta, backgroundColor: beDelta.map(v => v >= 0 ? 'rgba(96,165,250,0.7)' : 'rgba(248,113,113,0.6)'), borderRadius: 2, stack: 's', datalabels: { display: false } },
          { label: 'MES_FE', data: feDelta, backgroundColor: feDelta.map(v => v >= 0 ? 'rgba(52,211,153,0.7)' : 'rgba(251,146,60,0.6)'), borderRadius: 2, stack: 's',
            datalabels: { display: true, formatter: (_, ctx) => { const s = totDelta[ctx.dataIndex]; return s === 0 ? '' : (s > 0 ? '+' : '') + s.toLocaleString() },
              anchor: 'end', align: 'end', color: ctx => totDelta[ctx.dataIndex] >= 0 ? '#94a3b8' : '#f87171', font: { size: 10, weight: '600' }, offset: 2 } },
        ]},
        options: { responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } }, datalabels: {},
            tooltip: { ...tt, callbacks: {
              label: c => ` ${c.dataset.label}: ${c.parsed.y >= 0 ? '+' : ''}${c.parsed.y.toLocaleString()}줄`,
              footer: items => { const s = items.reduce((a, b) => a + b.parsed.y, 0); return `합계: ${s >= 0 ? '+' : ''}${s.toLocaleString()}줄` },
            } } },
          scales: { ...sc, y: { ...sc.y, ticks: { ...sc.y.ticks, callback: v => (v >= 0 ? '+' : '') + v.toLocaleString() } } } },
      }))

      // 주별
      const weekly = {}
      allDates.forEach((d, i) => {
        const dt = new Date(d)
        const mon = new Date(dt); mon.setDate(dt.getDate() - dt.getDay() + (dt.getDay() === 0 ? -6 : 1))
        const wk = `${String(mon.getMonth() + 1).padStart(2, '0')}/${String(mon.getDate()).padStart(2, '0')}`
        weekly[wk] = (weekly[wk] ?? 0) + totDelta[i]
      })
      const wv = Object.values(weekly)
      charts.current.push(new Chart(weekRef.current, {
        type: 'bar',
        data: { labels: Object.keys(weekly), datasets: [{
          label: '주별 생산', data: wv,
          backgroundColor: wv.map(v => v >= 0 ? 'rgba(167,139,250,0.75)' : 'rgba(248,113,113,0.6)'), borderRadius: 4,
        }]},
        options: { responsive: true,
          plugins: { legend: { display: false }, datalabels: { display: false },
            tooltip: { ...tt, callbacks: { label: c => ` ${c.parsed.y >= 0 ? '+' : ''}${c.parsed.y.toLocaleString()}줄` } } },
          scales: { ...sc, y: { ...sc.y, ticks: { ...sc.y.ticks, callback: v => (v >= 0 ? '+' : '') + v.toLocaleString() } } } },
      }))

      // 최근 7일
      const r7d = labels.slice(-7)
      const r7v = totDelta.slice(-7)
      charts.current.push(new Chart(recentRef.current, {
        type: 'bar',
        data: { labels: r7d, datasets: [{
          label: '생산량', data: r7v,
          backgroundColor: r7v.map(v => v >= 0 ? 'rgba(251,191,36,0.75)' : 'rgba(248,113,113,0.6)'), borderRadius: 4,
        }]},
        options: { responsive: true,
          plugins: { legend: { display: false }, datalabels: { display: false },
            tooltip: { ...tt, callbacks: { label: c => ` ${c.parsed.y >= 0 ? '+' : ''}${c.parsed.y.toLocaleString()}줄` } } },
          scales: { ...sc, y: { ...sc.y, ticks: { ...sc.y.ticks, callback: v => (v >= 0 ? '+' : '') + v.toLocaleString() } } } },
      }))

      // 통계 계산
      const days       = allDates.length
      const posDeltas  = totDelta.filter(v => v > 0)
      const avgDaily   = Math.round(totDelta.reduce((a, b) => a + b, 0) / days)
      const avgActive  = posDeltas.length ? Math.round(posDeltas.reduce((a, b) => a + b, 0) / posDeltas.length) : 0
      const peakIdx    = totDelta.indexOf(Math.max(...totDelta))
      const curTotal   = total[total.length - 1] ?? 0
      const eta        = avgActive > 0 ? Math.ceil((1_000_000 - curTotal) / avgActive) : 9999
      const etaDate    = new Date(); etaDate.setDate(etaDate.getDate() + eta)

      document.getElementById('stat-be').textContent    = (beVals.at(-1) ?? 0).toLocaleString()
      document.getElementById('stat-fe').textContent    = (feVals.at(-1) ?? 0).toLocaleString()
      document.getElementById('stat-tot').textContent   = curTotal.toLocaleString()
      document.getElementById('stat-avg').textContent   = avgDaily.toLocaleString()
      document.getElementById('stat-act').textContent   = avgActive.toLocaleString()
      document.getElementById('stat-peak').textContent  = Math.max(...totDelta).toLocaleString()
      document.getElementById('stat-pkdt').textContent  = allDates[peakIdx]?.slice(5) ?? '-'
      document.getElementById('stat-eta').textContent   = etaDate.toISOString().slice(0, 10)
    }

    init().catch(console.error)
    return () => { charts.current.forEach(c => c.destroy()); charts.current = [] }
  }, [data])

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <div className={s.header}>
          <div className={s.headerLeft}>
            <FaradayLogo size="sm" />
            <div>
              <p className={s.title}>코드 라인 추이</p>
              <p className={s.sub}>MES_BE · MES_FE · dev 브랜치 기준 · 매일 08:00 갱신</p>
            </div>
          </div>
          <div className={s.headerBtns}>
            {onBack && <button className="btn-ghost btn-sm" onClick={onBack}>← 이전</button>}
            <button className="btn-ghost btn-sm" onClick={onLogout}>로그아웃</button>
          </div>
        </div>

        {error && <p className={s.error}>{error}</p>}
        {!data && !error && <p className={s.loading}>데이터 로딩 중...</p>}

        {data && <>
          <div className={s.stats}>
            <div className={s.stat}><div className={s.statLabel}>MES_BE</div><div className={`${s.statVal} ${s.be}`} id="stat-be">—</div></div>
            <div className={s.stat}><div className={s.statLabel}>MES_FE</div><div className={`${s.statVal} ${s.fe}`} id="stat-fe">—</div></div>
            <div className={s.stat}><div className={s.statLabel}>합계</div><div className={`${s.statVal} ${s.tot}`} id="stat-tot">—</div></div>
          </div>
          <div className={s.stats2}>
            <div className={s.stat}><div className={s.statLabel}>일평균 (전체)</div><div className={`${s.statVal} ${s.grn}`} id="stat-avg">—</div></div>
            <div className={s.stat}><div className={s.statLabel}>일평균 (활동일)</div><div className={`${s.statVal} ${s.ylw}`} id="stat-act">—</div></div>
            <div className={s.stat}><div className={s.statLabel}>최대 단일일</div><div className={`${s.statVal} ${s.pur}`} id="stat-peak">—</div><div className={s.statSub} id="stat-pkdt"></div></div>
            <div className={s.stat}><div className={s.statLabel}>100만줄 달성 예상</div><div className={`${s.statVal} ${s.ora}`} id="stat-eta">—</div></div>
          </div>

          <div className={s.card}><div className={s.cardTitle}>누적 라인 수</div><canvas ref={cumRef} height={200} /></div>
          <div className={s.row2}>
            <div className={s.card}><div className={s.cardTitle}>일별 순 생산량</div><canvas ref={deltaRef} height={240} /></div>
            <div className={s.card}><div className={s.cardTitle}>주별 생산량</div><canvas ref={weekRef} height={240} /></div>
          </div>
          <div className={s.card}><div className={s.cardTitle}>최근 7일</div><canvas ref={recentRef} height={140} /></div>
        </>}
      </div>
    </div>
  )
}
