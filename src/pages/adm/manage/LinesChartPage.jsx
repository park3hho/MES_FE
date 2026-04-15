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

      // 빈 날짜 채우기: 첫날~마지막날 연속 생성, 누락일은 이전 값 이월
      const knownDates = [...new Set([...Object.keys(data.be), ...Object.keys(data.fe)])].sort()
      const allDates = []
      const cur = new Date(knownDates[0])
      const end = new Date(knownDates[knownDates.length - 1])
      while (cur <= end) {
        allDates.push(cur.toISOString().slice(0, 10))
        cur.setDate(cur.getDate() + 1)
      }

      let lastBe = 0, lastFe = 0
      const beVals = allDates.map(d => {
        if (data.be[d] !== undefined) lastBe = data.be[d]
        return lastBe
      })
      const feVals = allDates.map(d => {
        if (data.fe[d] !== undefined) lastFe = data.fe[d]
        return lastFe
      })
      const total    = beVals.map((v, i) => v + feVals[i])
      const beDelta  = [beVals[0], ...beVals.slice(1).map((v, i) => v - beVals[i])]
      const feDelta  = [feVals[0], ...feVals.slice(1).map((v, i) => v - feVals[i])]
      const totDelta = beDelta.map((v, i) => v + feDelta[i])
      const labels   = allDates.map(d => d.slice(5))

      // 라이트 테마 컬러 — variables.css 토큰 매핑
      const gc = '#d0d6e4'  // grid (살짝 진하게 — 가독성)
      const tc = '#64748b'  // tick
      const tb = '#ffffff'  // tooltip bg
      const sc = {
        x: { ticks: { color: tc, font: { size: 10 }, maxRotation: 45 }, grid: { color: gc, drawOnChartArea: true } },
        y: { ticks: { color: tc, font: { size: 10 }, callback: v => v.toLocaleString() }, grid: { color: gc, drawOnChartArea: true } },
      }
      const tt = {
        backgroundColor: tb,
        borderColor: '#d8dce8',
        borderWidth: 1,
        titleColor: '#1a2540',
        bodyColor: '#475569',
      }

      // 바 차트 팔레트 — 라이트 배경 대비 솔리드 컬러
      const POS_BE = '#3b82f6'   // blue-500
      const POS_FE = '#10b981'   // emerald-500
      const NEG_BE = '#f59e0b'   // amber-500 (BE 감소)
      const NEG_FE = '#ef4444'   // red-500 (FE 감소)
      const POS_WK = '#8b5cf6'   // violet-500 (주별)
      const NEG_WK = '#ef4444'
      const POS_R7 = '#f59e0b'   // amber (최근 7일)
      const NEG_R7 = '#ef4444'

      // 누적 — 스택 영역 (BE 아래 + FE 위로 쌓음) + 합계 라인 오버레이
      charts.current.push(new Chart(cumRef.current, {
        type: 'line',
        data: { labels, datasets: [
          // BE 영역 — 바닥에 쌓음
          {
            label: 'MES_BE',
            data: beVals,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(59,130,246,0.28)',
            borderWidth: 1.8,
            tension: 0.3,
            fill: 'origin',
            pointRadius: 2,
            pointHoverRadius: 5,
            stack: 'cum',
          },
          // FE 영역 — BE 위에 쌓음 (stack)
          {
            label: 'MES_FE',
            data: feVals,
            borderColor: '#059669',
            backgroundColor: 'rgba(16,185,129,0.28)',
            borderWidth: 1.8,
            tension: 0.3,
            fill: '-1',     // 아래 데이터셋(BE)과의 사이 영역만 채움
            pointRadius: 2,
            pointHoverRadius: 5,
            stack: 'cum',
          },
          // 합계 — 라인만 (fill 없음, 쌓지 않음 — 두 영역의 top을 선으로 강조)
          {
            label: '합계',
            data: total,
            borderColor: '#db2777',
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            tension: 0.3,
            fill: false,
            pointRadius: 2,
            pointHoverRadius: 5,
            stack: false,
          },
        ]},
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          layout: { padding: { top: 16, right: 8, bottom: 4, left: 4 } },
          plugins: {
            legend: { position: 'bottom', labels: { color: '#475569', font: { size: 11 }, padding: 14, boxWidth: 14, boxHeight: 14, usePointStyle: true } },
            datalabels: { display: false },
            tooltip: {
              ...tt,
              callbacks: {
                label: c => ` ${c.dataset.label}: ${c.parsed.y.toLocaleString()}줄`,
                // 호버 시 해당 일자의 일 산출량 (전일 대비) 추가 표시
                afterBody: items => {
                  const i = items[0]?.dataIndex ?? 0
                  if (i === 0) return ['', '  (첫 날 — 이전 값 없음)']
                  const dBe  = beDelta[i]
                  const dFe  = feDelta[i]
                  const dTot = totDelta[i]
                  const sign = v => (v > 0 ? '+' : '') + v.toLocaleString()
                  return [
                    '',
                    '─ 일 산출량 ─',
                    `  합계: ${sign(dTot)}줄`,
                    `  MES_BE: ${sign(dBe)}줄`,
                    `  MES_FE: ${sign(dFe)}줄`,
                  ]
                },
              },
            },
          },
          scales: sc,
        },
      }))

      // 일별 델타 차트는 제거됨 — 누적 차트 tooltip의 afterBody에서 일 산출량 표시

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
          backgroundColor: wv.map(v => v >= 0 ? POS_WK : NEG_WK),
          borderRadius: 4, borderSkipped: false,
        }]},
        options: {
          responsive: true,
          layout: { padding: { top: 20, right: 8, bottom: 4, left: 4 } },
          categoryPercentage: 0.75, barPercentage: 0.85,
          plugins: { legend: { display: false }, datalabels: { display: false },
            tooltip: { ...tt, callbacks: { label: c => ` ${c.parsed.y >= 0 ? '+' : ''}${c.parsed.y.toLocaleString()}줄` } } },
          scales: { ...sc, y: { ...sc.y, ticks: { ...sc.y.ticks, callback: v => (v >= 0 ? '+' : '') + v.toLocaleString() } } },
        },
      }))

      // 최근 7일
      const r7d = labels.slice(-7)
      const r7v = totDelta.slice(-7)
      charts.current.push(new Chart(recentRef.current, {
        type: 'bar',
        data: { labels: r7d, datasets: [{
          label: '생산량', data: r7v,
          backgroundColor: r7v.map(v => v >= 0 ? POS_R7 : NEG_R7),
          borderRadius: 4, borderSkipped: false,
        }]},
        options: {
          responsive: true,
          layout: { padding: { top: 20, right: 8, bottom: 4, left: 4 } },
          categoryPercentage: 0.65, barPercentage: 0.85,
          plugins: { legend: { display: false }, datalabels: { display: false },
            tooltip: { ...tt, callbacks: { label: c => ` ${c.parsed.y >= 0 ? '+' : ''}${c.parsed.y.toLocaleString()}줄` } } },
          scales: { ...sc, y: { ...sc.y, ticks: { ...sc.y.ticks, callback: v => (v >= 0 ? '+' : '') + v.toLocaleString() } } },
        },
      }))

      // 통계 계산
      const days         = allDates.length
      const posDeltas    = totDelta.filter(v => v > 0)
      const activeDeltas = totDelta.filter(v => v !== 0)
      const avgDaily     = Math.round(totDelta.reduce((a, b) => a + b, 0) / days)
      const avgActive    = activeDeltas.length
        ? Math.round(activeDeltas.reduce((a, b) => a + Math.abs(b), 0) / activeDeltas.length) : 0
      const absTotDelta  = totDelta.map(v => Math.abs(v))
      const peakIdx      = absTotDelta.indexOf(Math.max(...absTotDelta))
      const curTotal     = total[total.length - 1] ?? 0
      const etaRate      = posDeltas.length ? Math.round(posDeltas.reduce((a, b) => a + b, 0) / posDeltas.length) : 0
      const eta          = etaRate > 0 ? Math.ceil((1_000_000 - curTotal) / etaRate) : 9999
      const etaDate    = new Date(); etaDate.setDate(etaDate.getDate() + eta)

      document.getElementById('stat-be').textContent    = (beVals.at(-1) ?? 0).toLocaleString()
      document.getElementById('stat-fe').textContent    = (feVals.at(-1) ?? 0).toLocaleString()
      document.getElementById('stat-tot').textContent   = curTotal.toLocaleString()
      document.getElementById('stat-avg').textContent   = avgDaily.toLocaleString()
      document.getElementById('stat-act').textContent   = avgActive.toLocaleString()
      document.getElementById('stat-peak').textContent  = Math.max(...absTotDelta).toLocaleString()
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

          {/* 업계 평균 참고 */}
          <div className={s.baseline}>
            <span className={s.baselineIcon}>💡</span>
            <span className={s.baselineText}>
              <b>업계 평균 참고:</b> 풀타임 개발자 기준 <b>~50–100줄/일</b> (리팩토링·삭제 제외 순증가 기준).
              바쁜 스타트업/해커톤 스퍼트 구간에서도 <b>~200줄/일</b> 이 상한선에 가까움.
            </span>
          </div>

          <div className={s.card}><div className={s.cardTitle}>누적 라인 수</div><canvas ref={cumRef} height={200} /></div>

          {/* 일별 순 생산량 — 풀 와이드 */}
          <div className={s.card}>
            <div className={s.cardTitle}>일별 순 생산량</div>
            <canvas ref={deltaRef} height={140} />
          </div>

          {/* 주별 + 최근 7일 — 한 줄 반반 */}
          <div className={s.row2}>
            <div className={s.card}><div className={s.cardTitle}>주별 생산량</div><canvas ref={weekRef} height={220} /></div>
            <div className={s.card}><div className={s.cardTitle}>최근 7일</div><canvas ref={recentRef} height={220} /></div>
          </div>
        </>}
      </div>
    </div>
  )
}
