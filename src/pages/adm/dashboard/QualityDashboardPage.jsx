// pages/adm/dashboard/QualityDashboardPage.jsx
// 품질 대시보드 — FAIL/되돌리기/폐기 집계 (2026-04-22)
// 호출: App.jsx → /admin/dashboard/quality
// 기간 토글 1/7/30/90일 → BE 한 번 호출로 요약 + 추세 + 분포 + 리스트 반환
// 폴링 없음, 진입 시 + 수동 새로고침만

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { getQualityDashboard } from '@/api'
import { FaradayLogo } from '@/components/FaradayLogo'
import { PHI_SPECS, PROCESS_LIST } from '@/constants/processConst'

// 공정 코드 → 한글 라벨 (PROCESS_LIST 기반 lookup 맵)
const PROC_LABEL = Object.fromEntries(PROCESS_LIST.map((p) => [p.key, p.label]))
import s from './QualityDashboardPage.module.css'

const DAYS_OPTIONS = [
  { value: 1,  label: '1일' },
  { value: 7,  label: '7일' },
  { value: 30, label: '30일' },
  { value: 90, label: '90일' },
]

// MM/DD
const fmtShort = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

// MM/DD HH:mm
const fmtDateTime = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ══════════════════════════════════════════════════
// 추세 라인 차트 — SVG 3라인 (FAIL / 되돌리기 / 폐기)
// ══════════════════════════════════════════════════
function TrendChart({ trend }) {
  if (!trend || trend.length < 2) {
    return <p className={s.empty}>추세를 표시할 데이터가 부족해요.</p>
  }
  const W = 720, H = 220, PAD_L = 40, PAD_R = 16, PAD_T = 16, PAD_B = 32
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const KEYS = ['fail', 'repair', 'discard']
  const COLORS = { fail: '#e74c3c', repair: '#3498db', discard: '#95a5a6' }
  const LABELS = { fail: 'FAIL', repair: '되돌리기', discard: '폐기' }

  const maxY = Math.max(1, ...trend.flatMap((t) => KEYS.map((k) => t[k])))
  const stepX = trend.length > 1 ? innerW / (trend.length - 1) : innerW

  const pointFor = (t, i) => {
    const x = PAD_L + i * stepX
    const y = PAD_T + innerH - (t[{}.toString.call(t) === '[object Object]' ? 'fail' : 'fail'] / maxY) * innerH
    return [x, y]
  }
  const pathFor = (key) =>
    trend.map((t, i) => {
      const x = PAD_L + i * stepX
      const y = PAD_T + innerH - (t[key] / maxY) * innerH
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')

  // Y축 눈금 (0, mid, max)
  const ticks = [0, Math.ceil(maxY / 2), maxY].filter((v, i, arr) => arr.indexOf(v) === i)

  // X축 레이블 — 개수 적으면 전부, 많으면 4개만
  const xLabelIdx = trend.length <= 8
    ? trend.map((_, i) => i)
    : [0, Math.floor(trend.length / 3), Math.floor((trend.length * 2) / 3), trend.length - 1]

  return (
    <div className={s.chartWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.chart} preserveAspectRatio="xMidYMid meet">
        {/* 눈금선 */}
        {ticks.map((t) => {
          const y = PAD_T + innerH - (t / maxY) * innerH
          return (
            <g key={t}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="#e6e8ec" strokeDasharray="2,3" />
              <text x={PAD_L - 8} y={y + 4} className={s.axisLabel} textAnchor="end">{t}</text>
            </g>
          )
        })}
        {/* X축 레이블 */}
        {xLabelIdx.map((i) => (
          <text
            key={i}
            x={PAD_L + i * stepX}
            y={H - 10}
            className={s.axisLabel}
            textAnchor="middle"
          >
            {fmtShort(trend[i].date)}
          </text>
        ))}
        {/* 라인 3종 */}
        {KEYS.map((k) => (
          <motion.path
            key={k}
            d={pathFor(k)}
            stroke={COLORS[k]}
            strokeWidth="2.4"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        ))}
        {/* 점 */}
        {KEYS.map((k) => trend.map((t, i) => {
          const x = PAD_L + i * stepX
          const y = PAD_T + innerH - (t[k] / maxY) * innerH
          return <circle key={`${k}-${i}`} cx={x} cy={y} r="3" fill={COLORS[k]} />
        }))}
      </svg>
      <div className={s.legend}>
        {KEYS.map((k) => (
          <span key={k} className={s.legendItem}>
            <i style={{ background: COLORS[k] }} />
            {LABELS[k]}
          </span>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 분포 막대 — Top-down 순 정렬
// ══════════════════════════════════════════════════
function DistBars({ title, dist, colorFn, labelFn }) {
  const entries = Object.entries(dist || {}).sort((a, b) => b[1] - a[1])
  return (
    <div className={s.distSection}>
      <h3 className={s.distTitle}>{title}</h3>
      {entries.length === 0 ? (
        <p className={s.empty}>데이터 없음</p>
      ) : (
        <div className={s.distRows}>
          {entries.map(([k, v]) => {
            const maxVal = entries[0][1]
            return (
              <div key={k} className={s.distRow}>
                <span className={s.distLabel}>{labelFn ? labelFn(k) : k}</span>
                <div className={s.distBar}>
                  <motion.div
                    className={s.distFill}
                    initial={{ width: 0 }}
                    animate={{ width: `${(v / maxVal) * 100}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    style={{ background: colorFn ? colorFn(k) : 'var(--color-primary)' }}
                  />
                </div>
                <span className={s.distVal}>{v}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════
// 메인 페이지
// ══════════════════════════════════════════════════
export default function QualityDashboardPage({ onLogout, onBack }) {
  const [days, setDays] = useState(7)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = (d) => {
    setLoading(true)
    setError(null)
    getQualityDashboard(d)
      .then(setData)
      .catch((e) => setError(e.message || '조회 실패'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(days) }, [days])

  const phiColor  = (k) => PHI_SPECS[k]?.color || '#95a5a6'
  const phiLabel  = (k) => PHI_SPECS[k]?.label || (k === '미분류' ? k : `Φ${k}`)
  const procLabel = (k) => PROC_LABEL[k] || k

  return (
    <div className="page">
      <div className={`card card-wide ${s.card}`}>
        {/* 헤더 */}
        <div className={s.header}>
          <FaradayLogo size="sm" />
          <h2 className={s.title}>품질 현황</h2>
          {onBack && (
            <button className={s.backBtn} onClick={onBack}>← 이전</button>
          )}
        </div>

        {/* 기간 토글 + 새로고침 */}
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
            onClick={() => load(days)}
            disabled={loading}
            aria-label="새로고침"
          >
            ↻
          </button>
        </div>

        {loading && <p className={s.info}>불러오는 중…</p>}
        {error && <p className={s.errorMsg}>⚠ {error}</p>}

        {data && !loading && (
          <>
            {/* 요약 카드 4개 */}
            <div className={s.summaryGrid}>
              <div className={`${s.sumCard} ${s.sumFail}`}>
                <span className={s.sumLabel}>FAIL</span>
                <span className={s.sumValue}>{data.summary.fail}</span>
              </div>
              <div className={`${s.sumCard} ${s.sumRepair}`}>
                <span className={s.sumLabel}>되돌리기</span>
                <span className={s.sumValue}>{data.summary.repair}</span>
              </div>
              <div className={`${s.sumCard} ${s.sumDiscard}`}>
                <span className={s.sumLabel}>폐기</span>
                <span className={s.sumValue}>{data.summary.discard}</span>
              </div>
              <div className={`${s.sumCard} ${s.sumRate}`}>
                <span className={s.sumLabel}>불량률</span>
                <span className={s.sumValue}>{data.summary.fail_rate}%</span>
              </div>
            </div>
            <p className={s.rangeText}>
              기간 <b>{data.range.from} ~ {data.range.to}</b> · 전체 OQ {data.summary.total_oq}건
            </p>

            {/* 추세 (1일 선택 시 숨김 — 포인트 1개라 의미 없음) */}
            {days > 1 && (
              <div className={s.section}>
                <h3 className={s.sectionTitle}>일별 추세</h3>
                <TrendChart trend={data.trend} />
              </div>
            )}

            {/* 분포 4종 */}
            <div className={s.distGrid}>
              <DistBars
                title="phi별 FAIL"
                dist={data.distributions.phi_fail}
                colorFn={phiColor}
                labelFn={phiLabel}
              />
              <DistBars
                title="motor별 FAIL"
                dist={data.distributions.motor_fail}
              />
              <DistBars
                title="되돌리기 원본 공정"
                dist={data.distributions.repair_src}
                labelFn={procLabel}
              />
              <DistBars
                title="되돌리기 목적 공정"
                dist={data.distributions.repair_dest}
                labelFn={procLabel}
              />
            </div>

            {/* 되돌리기 상세 리스트 */}
            <div className={s.section}>
              <h3 className={s.sectionTitle}>
                되돌리기 상세 <span className={s.countTag}>{data.repair_list.length}</span>
              </h3>
              {data.repair_list.length === 0 ? (
                <p className={s.empty}>해당 기간에 되돌리기 없음</p>
              ) : (
                <ul className={s.repairList}>
                  {data.repair_list.map((r, i) => (
                    <li key={`${r.lot_no}-${i}`} className={s.repairItem}>
                      <span className={s.repairTime}>{fmtDateTime(r.at)}</span>
                      <span className={s.repairLot}>{r.lot_no}</span>
                      <span className={s.repairProc}>
                        <b>{r.from_process}</b>
                        <span className={s.arrow}>→</span>
                        <b className={s.destProc}>{r.to_process || '?'}</b>
                      </span>
                      <span className={s.repairReason}>
                        {r.reason || <i className={s.reasonNone}>사유 없음</i>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
