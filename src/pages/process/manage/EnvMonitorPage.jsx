// pages/process/manage/EnvMonitorPage.jsx
// QC 온습도 모니터링 (2026-08-14)
//   데이터 흐름: 온습도계 → 로컬 PC(10초마다 측정) → 1분마다 EC2 푸쉬 → 이 화면.
//   ★ EC2 에는 '분당 1행' 만 쌓인다. 그래서 폴링을 초 단위로 돌릴 이유가 없다(POLL_MS).
//     대신 '마지막 수신 후 경과' 는 1초마다 다시 그린다 — 통신 끊김은 새 데이터가 아니라
//     '시간이 흐른 것' 으로 판정되므로, 폴링에 묶어두면 화면이 최대 15초 동안 거짓말을 한다.
import { useState, useEffect, useMemo, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import { getEnvSensors, updateEnvSensor, getEnvHistory } from '@/api'
import { todayKst, kstDaysAgo } from '@/utils/dateConvert'
import s from './EnvMonitorPage.module.css'

const POLL_MS = 15000        // 데이터 재조회 — 원본이 분당 1점이라 이 이상 잦게 돌 이유가 없다
const TICK_MS = 1000         // 경과시간 표시 갱신

const RANGES = [
  { key: 'today', label: '오늘', days: 0 },
  { key: 'd7', label: '7일', days: 6 },
  { key: 'd30', label: '30일', days: 29 },
]

// ── 표시 헬퍼 ─────────────────────────────────────────
// ★ toISOString() 금지 (UTC 라 9시간 어긋남) — 표시는 전부 KST 로케일 포맷 경유.
const KST = { timeZone: 'Asia/Seoul' }
const hhmm = (iso) =>
  new Date(iso).toLocaleTimeString('ko-KR', { ...KST, hour: '2-digit', minute: '2-digit', hour12: false })
const mdhm = (iso) =>
  new Date(iso).toLocaleString('ko-KR', { ...KST, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

const fmtAge = (sec) => {
  if (sec < 60) return `${Math.max(0, Math.floor(sec))}초 전`
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`
  return `${Math.floor(sec / 86400)}일 전`
}
const num1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—')

// 기준 범위 이탈 판정 — 상한만/하한만 설정도 허용(null = 그쪽은 안 봄)
const isOut = (v, lo, hi) => {
  if (!Number.isFinite(v)) return false
  if (Number.isFinite(lo) && v < lo) return true
  if (Number.isFinite(hi) && v > hi) return true
  return false
}
const rangeText = (lo, hi, unit) => {
  const l = Number.isFinite(lo) ? `${lo}` : ''
  const h = Number.isFinite(hi) ? `${hi}` : ''
  if (!l && !h) return '기준 미설정'
  if (l && h) return `${l} ~ ${h}${unit}`
  return l ? `${l}${unit} 이상` : `${h}${unit} 이하`
}

// 센서 상태 — 'none'(수신 이력 없음) | 'stale'(통신 끊김) | 'warn'(기준 이탈) | 'ok'
//   ★ 순서가 중요하다. 통신이 끊긴 센서의 마지막 값이 정상 범위라고 '정상' 으로 보이면
//     현장에서는 멀쩡한 줄 알고 지나간다 — 끊김이 이탈보다 먼저다.
function sensorState(sensor, nowMs, staleSec) {
  const last = sensor.latest
  if (!last) return { code: 'none', label: '수신 없음', outs: [] }
  const ageSec = (nowMs - new Date(last.measured_at).getTime()) / 1000
  if (ageSec > staleSec) return { code: 'stale', label: '통신 끊김', outs: [], ageSec }
  const outs = []
  if (isOut(last.temperature, sensor.temp_min, sensor.temp_max)) outs.push('온도')
  if (isOut(last.humidity, sensor.humi_min, sensor.humi_max)) outs.push('습도')
  return outs.length
    ? { code: 'warn', label: `${outs.join('·')} 기준 이탈`, outs, ageSec }
    : { code: 'ok', label: '정상', outs: [], ageSec }
}

export default function EnvMonitorPage({ onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [editing, setEditing] = useState(null)      // 설정 중인 센서
  const [showApi, setShowApi] = useState(false)

  // 추이
  const [selKey, setSelKey] = useState('')
  const [range, setRange] = useState('today')
  const [hist, setHist] = useState(null)
  const [histLoading, setHistLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await getEnvSensors()
      setData(d)
      setError(null)
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(t)
  }, [])

  const sensors = useMemo(() => data?.sensors || [], [data])
  const staleSec = data?.stale_after_sec ?? 300

  // 서버-브라우저 시계 차이 보정 (2026-08-14)
  //   '통신 끊김' 은 (지금 − 마지막 측정시각) 으로 판정하는데, '지금' 을 브라우저 시계로 잡으면
  //   현장 PC 시계가 몇 분만 어긋나도 멀쩡한 센서가 끊김으로 뜨거나 끊긴 센서가 정상으로 보인다.
  //   측정시각은 서버가 기록한 값이므로 기준 시계도 서버 것을 써야 앞뒤가 맞는다.
  const [offset, setOffset] = useState(0)   // 서버 − 브라우저 (ms)
  useEffect(() => {
    if (!data?.server_now) return
    setOffset(new Date(data.server_now).getTime() - Date.now())
  }, [data])
  const nowSrv = now + offset

  // 선택 센서 — 목록이 바뀌어 사라지면 첫 센서로 되돌린다(유령 선택 방지)
  useEffect(() => {
    if (!sensors.length) return
    if (!sensors.some((x) => x.key === selKey)) setSelKey(sensors[0].key)
  }, [sensors, selKey])

  const loadHist = useCallback(async () => {
    if (!selKey) return
    setHistLoading(true)
    try {
      const r = RANGES.find((x) => x.key === range) || RANGES[0]
      setHist(await getEnvHistory({
        sensor: selKey,
        dateFrom: r.days ? kstDaysAgo(r.days) : todayKst(),
        dateTo: todayKst(),
      }))
    } catch (e) {
      setError(e.message || '이력 조회 실패')
    } finally {
      setHistLoading(false)
    }
  }, [selKey, range])

  useEffect(() => { loadHist() }, [loadHist])

  const saveSensor = async (patch) => {
    await updateEnvSensor(editing.id, patch)
    setEditing(null)
    await load()
    await loadHist()
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="온습도 모니터링"
        subtitle="현장 온습도계가 1분마다 자동으로 올립니다"
        onBack={onBack}
      />

      {error && <p className={s.err}>⚠ {error}</p>}

      <Section label="현재 상태">
        {loading && <p className={s.info}>불러오는 중…</p>}
        {!loading && sensors.length === 0 && (
          <p className={s.empty}>
            아직 수신된 센서가 없습니다. 로컬 PC 가 첫 데이터를 보내면 여기에 자동으로 나타납니다.
          </p>
        )}
        <div className={s.grid}>
          {sensors.map((sensor) => (
            <SensorCard
              key={sensor.id}
              sensor={sensor}
              state={sensorState(sensor, nowSrv, staleSec)}
              onEdit={() => setEditing(sensor)}
            />
          ))}
        </div>
      </Section>

      {sensors.length > 0 && (
        <Section label="추이">
          <div className={s.ctl}>
            <div className={s.fgrp}>
              <span className={s.flab}>센서</span>
              {sensors.map((x) => (
                <button key={x.key} type="button"
                  className={`${s.chip} ${selKey === x.key ? s.chipOn : ''}`}
                  aria-pressed={selKey === x.key}
                  onClick={() => setSelKey(x.key)}>
                  {x.name || x.location || x.key}
                </button>
              ))}
            </div>
            <span className={s.fdiv} />
            <div className={s.seg} role="group" aria-label="조회 기간">
              {RANGES.map((r) => (
                <button key={r.key} type="button"
                  className={`${s.segBtn} ${range === r.key ? s.segOn : ''}`}
                  aria-pressed={range === r.key}
                  onClick={() => setRange(r.key)}>{r.label}</button>
              ))}
            </div>
          </div>

          {histLoading && <p className={s.info}>불러오는 중…</p>}
          {!histLoading && hist && hist.points.length === 0 && (
            <p className={s.empty}>이 기간에 기록된 데이터가 없습니다.</p>
          )}
          {!histLoading && hist && hist.points.length > 0 && (
            <>
              <TrendChart
                title="온도" unit="℃" points={hist.points}
                vKey="temp" loKey="temp_lo" hiKey="temp_hi"
                min={hist.sensor.temp_min} max={hist.sensor.temp_max}
                color="var(--chart-red)"
              />
              <TrendChart
                title="습도" unit="%" points={hist.points}
                vKey="humi" loKey="humi_lo" hiKey="humi_hi"
                min={hist.sensor.humi_min} max={hist.sensor.humi_max}
                color="var(--chart-blue)"
              />
              <p className={s.note}>
                {hist.bucket_min > 1
                  ? <>기간이 길어 <b>{hist.bucket_min}분 단위로 묶어</b> 표시합니다 (원본 {hist.raw_count.toLocaleString()}점).
                     선은 구간 평균이고, 옅은 띠는 그 구간의 <b>최저~최고</b>입니다 — 잠깐 스친 이탈도 띠로 보입니다.</>
                  : <>1분 간격 원본 {hist.raw_count.toLocaleString()}점을 그대로 표시합니다.</>}
              </p>
            </>
          )}
        </Section>
      )}

      <button type="button" className={s.apiToggle} onClick={() => setShowApi((v) => !v)}>
        {showApi ? '▾' : '▸'} 로컬 PC 연동 규격
      </button>
      {showApi && <ApiGuide />}

      {editing && (
        <SensorModal sensor={editing} onClose={() => setEditing(null)} onSave={saveSensor} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════
// 센서 카드 — 현재값 + 상태
// ══════════════════════════════════════════════════
function SensorCard({ sensor, state, onEdit }) {
  const last = sensor.latest
  const dim = state.code === 'stale' || state.code === 'none'
  return (
    <div className={`${s.sc} ${s[`sc_${state.code}`]}`}>
      <div className={s.scHead}>
        <div className={s.scName}>
          <b>{sensor.name || sensor.key}</b>
          {sensor.location
            ? <span className={s.scLoc}>{sensor.location}</span>
            : <span className={s.scLocNone}>위치 미설정</span>}
        </div>
        <button type="button" className={s.scGear} onClick={onEdit} title="이름·위치·기준범위 설정"
          aria-label={`${sensor.name || sensor.key} 설정`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10.6 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 16.11 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09A1.65 1.65 0 0 0 21.91 11H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      <div className={`${s.scVals} ${dim ? s.scDim : ''}`}>
        <div className={`${s.scVal} ${state.outs.includes('온도') ? s.scBad : ''}`}>
          <span className={s.scNum}>{num1(last?.temperature)}</span>
          <span className={s.scUnit}>℃</span>
          <span className={s.scRange}>{rangeText(sensor.temp_min, sensor.temp_max, '℃')}</span>
        </div>
        <div className={`${s.scVal} ${state.outs.includes('습도') ? s.scBad : ''}`}>
          <span className={s.scNum}>{num1(last?.humidity)}</span>
          <span className={s.scUnit}>%</span>
          <span className={s.scRange}>{rangeText(sensor.humi_min, sensor.humi_max, '%')}</span>
        </div>
      </div>

      <div className={s.scFoot}>
        <span className={`${s.scBadge} ${s[`bg_${state.code}`]}`}>{state.label}</span>
        <span className={s.scTime}>
          {last
            ? <>{hhmm(last.measured_at)} · {fmtAge(state.ageSec ?? 0)}</>
            : '데이터 없음'}
        </span>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 추이 그래프 — 평균선 + 구간 최저~최고 밴드 + 기준범위
// ══════════════════════════════════════════════════
const W = 760
const H = 190
const PAD = { l: 44, r: 14, t: 14, b: 26 }

function TrendChart({ title, unit, points, vKey, loKey, hiKey, min, max, color }) {
  const [sel, setSel] = useState(null)

  const vals = points.map((p) => p[vKey]).filter(Number.isFinite)
  const los = points.map((p) => p[loKey]).filter(Number.isFinite)
  const his = points.map((p) => p[hiKey]).filter(Number.isFinite)
  if (!vals.length) {
    return <div className={s.chartWrap}><p className={s.empty}>{title} 데이터가 없습니다.</p></div>
  }

  // 스케일 — 기준선도 화면에 들어와야 '얼마나 벗어났는지'가 보인다
  const cand = [...los, ...his, ...vals]
  if (Number.isFinite(min)) cand.push(min)
  if (Number.isFinite(max)) cand.push(max)
  let lo = Math.min(...cand)
  let hi = Math.max(...cand)
  const span = hi - lo || Math.abs(hi) * 0.05 || 1
  lo -= span * 0.12
  hi += span * 0.12

  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const x = (i) => PAD.l + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1))
  const y = (v) => PAD.t + plotH * (1 - (v - lo) / (hi - lo))

  const line = points
    .map((p, i) => (Number.isFinite(p[vKey]) ? `${x(i)},${y(p[vKey])}` : null))
    .filter(Boolean).join(' ')

  // 최저~최고 밴드 — 위쪽 경계로 갔다가 아래쪽 경계로 되돌아오는 폴리곤
  //   구간이 1분이면 lo=hi 라 두께 0 → 선과 겹쳐 보이지 않는다 (의도된 동작)
  const bandTop = points.map((p, i) => (Number.isFinite(p[hiKey]) ? `${x(i)},${y(p[hiKey])}` : null)).filter(Boolean)
  const bandBot = points.map((p, i) => (Number.isFinite(p[loKey]) ? `${x(i)},${y(p[loKey])}` : null)).filter(Boolean).reverse()
  const band = [...bandTop, ...bandBot].join(' ')

  const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4)
  const labelEvery = Math.max(1, Math.ceil((points.length * 68) / plotW))
  const spanDays = points.length > 1
    ? (new Date(points[points.length - 1].t) - new Date(points[0].t)) / 86400000 : 0
  const xLabel = (iso) => (spanDays > 1 ? mdhm(iso) : hhmm(iso))

  const selP = sel != null ? points[sel] : null

  return (
    <div className={s.chartWrap}>
      <div className={s.chartHead}>
        <h4 className={s.chartTitle}>{title}</h4>
        <span className={s.chartHint}>
          {selP
            ? `${mdhm(selP.t)} · 평균 ${num1(selP[vKey])}${unit} (${num1(selP[loKey])}~${num1(selP[hiKey])})`
            : `기준 ${rangeText(min, max, unit)}`}
        </span>
      </div>
      <div className={s.chartScroll}>
        <svg className={s.chartSvg} width={W} height={H} viewBox={`0 0 ${W} ${H}`}
          role="img" aria-label={`${title} 추이`}
          onMouseLeave={() => setSel(null)}>
          {/* 기준 범위 — 이 띠 안이 정상 */}
          {(Number.isFinite(min) || Number.isFinite(max)) && (
            <rect
              x={PAD.l}
              y={y(Number.isFinite(max) ? max : hi)}
              width={plotW}
              height={Math.max(0, y(Number.isFinite(min) ? min : lo) - y(Number.isFinite(max) ? max : hi))}
              fill="var(--chart-emerald)" opacity="0.08"
            />
          )}
          {[min, max].map((v, i) => (Number.isFinite(v) ? (
            <line key={i} x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)}
              stroke="var(--chart-red)" strokeWidth="1.2" strokeDasharray="5 4" opacity="0.75" />
          ) : null))}
          {/* 격자 + y 눈금 */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)}
                stroke="var(--chart-grid)" strokeWidth="1" strokeDasharray="2 3" />
              <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--chart-tick)">
                {t.toFixed(1)}
              </text>
            </g>
          ))}
          {/* 구간 최저~최고 밴드 */}
          {bandTop.length > 1 && <polygon points={band} fill={color} opacity="0.16" />}
          {/* 평균선 */}
          <polyline points={line} fill="none" stroke={color} strokeWidth="1.6"
            strokeLinejoin="round" strokeLinecap="round" />
          {/* x축 라벨 */}
          {points.map((p, i) => (i % labelEvery === 0 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--chart-tick)">
              {xLabel(p.t)}
            </text>
          ) : null))}
          {/* 선택 표시 */}
          {selP && Number.isFinite(selP[vKey]) && (
            <g>
              <line x1={x(sel)} x2={x(sel)} y1={PAD.t} y2={H - PAD.b}
                stroke="var(--chart-tick)" strokeWidth="1" opacity="0.5" />
              <circle cx={x(sel)} cy={y(selP[vKey])} r="3.5" fill={color} />
            </g>
          )}
          {/* 히트 영역 — 점이 촘촘해도 집히도록 열 단위로 덮는다 (터치 포함) */}
          {points.map((p, i) => (
            <rect key={i} x={x(i) - plotW / points.length / 2} y={PAD.t}
              width={Math.max(2, plotW / points.length)} height={plotH}
              fill="transparent"
              onMouseEnter={() => setSel(i)}
              onClick={() => setSel(i)} />
          ))}
        </svg>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 센서 설정 — 이름 / 위치 / 기준 범위
// ══════════════════════════════════════════════════
function SensorModal({ sensor, onClose, onSave }) {
  const [d, setD] = useState({
    name: sensor.name || '',
    location: sensor.location || '',
    temp_min: sensor.temp_min ?? '',
    temp_max: sensor.temp_max ?? '',
    humi_min: sensor.humi_min ?? '',
    humi_max: sensor.humi_max ?? '',
    use_for_qc: !!sensor.use_for_qc,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k, v) => setD((p) => ({ ...p, [k]: v }))
  // 빈칸 = 기준 미설정(null). 0 은 유효한 값이라 살려야 한다.
  const numOrNull = (v) => (v === '' || v === null ? null : Number(v))

  const submit = async () => {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      await onSave({
        name: d.name.trim(),
        location: d.location.trim(),
        temp_min: numOrNull(d.temp_min), temp_max: numOrNull(d.temp_max),
        humi_min: numOrNull(d.humi_min), humi_max: numOrNull(d.humi_max),
        use_for_qc: d.use_for_qc,
      })
    } catch (e) {
      setErr(e.message || '저장 실패')
      setBusy(false)
    }
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={s.modalH}>센서 설정</h3>
        <p className={s.modalSub}>
          식별자 <code className={s.code}>{sensor.key}</code> — 로컬 PC 가 이 값으로 보냅니다(변경 불가).
        </p>

        {err && <p className={s.err}>⚠ {err}</p>}

        {/* OQ 선간저항 온도보정 (2026-08-18) — 지정하면 이 센서 온도로 QC 기준온도(25℃) 환산해 판정한다.
            한 대만 지정 가능(BE 가 저장 시 나머지를 자동 해제). 미지정이면 보정 없이 기존대로 판정. */}
        <label className={s.fieldL}>
          <span>
            <input type="checkbox" checked={d.use_for_qc}
              onChange={(e) => set('use_for_qc', e.target.checked)} />
            {' '}OQ 선간저항 온도보정에 사용
          </span>
          <small className={s.modalSub}>
            체크하면 이 센서 온도로 선간저항을 25℃ 기준으로 환산해 판정합니다.
            검사실에 설치된 센서 <b>한 대만</b> 지정하세요 — 다른 센서는 자동 해제됩니다.
          </small>
        </label>

        <label className={s.fieldL}>이름
          <input className={s.input} value={d.name} maxLength={50}
            placeholder="예: 검사실 온습도계"
            onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className={s.fieldL}>설치 위치
          <input className={s.input} value={d.location} maxLength={50}
            placeholder="예: 2층 검사실"
            onChange={(e) => set('location', e.target.value)} />
        </label>

        <p className={s.fieldNote}>기준 범위 — 비워두면 그 항목은 경고하지 않습니다.</p>
        <div className={s.twoCol}>
          <label className={s.fieldL}>온도 하한 (℃)
            <input type="number" step="0.1" className={s.input} value={d.temp_min}
              onChange={(e) => set('temp_min', e.target.value)} />
          </label>
          <label className={s.fieldL}>온도 상한 (℃)
            <input type="number" step="0.1" className={s.input} value={d.temp_max}
              onChange={(e) => set('temp_max', e.target.value)} />
          </label>
        </div>
        <div className={s.twoCol}>
          <label className={s.fieldL}>습도 하한 (%)
            <input type="number" step="0.1" className={s.input} value={d.humi_min}
              onChange={(e) => set('humi_min', e.target.value)} />
          </label>
          <label className={s.fieldL}>습도 상한 (%)
            <input type="number" step="0.1" className={s.input} value={d.humi_max}
              onChange={(e) => set('humi_max', e.target.value)} />
          </label>
        </div>

        <div className={s.modalBtns}>
          <button type="button" className="btn-secondary" onClick={onClose}>취소</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 로컬 PC 연동 규격 — 장비 담당자가 화면에서 바로 확인
// ══════════════════════════════════════════════════
function ApiGuide() {
  return (
    <div className={s.api}>
      <p className={s.apiLine}>
        <b>POST</b> <code className={s.code}>/env/readings</code> ·
        헤더 <code className={s.code}>X-Cron-Token: &lt;CRON_TOKEN&gt;</code>
      </p>
      <pre className={s.pre}>{`{
  "readings": [
    {
      "sensor": "QC-01",
      "measured_at": "2026-08-14T14:23:00+09:00",
      "temperature": 23.4,
      "humidity": 48.2
    }
  ]
}`}</pre>
      <ul className={s.apiUl}>
        <li><b>sensor</b> — 센서 식별자. 처음 보는 값이면 자동 등록되고, 이름·위치는 이 화면에서 채웁니다.</li>
        <li><b>measured_at</b> — 생략하면 서버 수신 시각. 타임존을 안 붙이면 한국 시간으로 해석합니다.</li>
        <li><b>temperature / humidity</b> — 둘 중 하나만 보내도 됩니다.</li>
        <li>
          서버는 <b>분 단위로 잘라 저장</b>합니다. 같은 분을 다시 보내면 덮어쓰므로
          <b> 재전송해도 중복이 쌓이지 않습니다</b> — 통신이 끊겼다 복구되면 밀린 분들을
          배열에 담아 한 번에 보내세요 (최대 1500건).
        </li>
      </ul>
    </div>
  )
}
