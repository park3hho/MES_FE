// pages/adm/dashboard/QualityDashboardPage.jsx
// 품질 대시보드 — FAIL/되돌리기/폐기 집계 (2026-04-24 개편)
// 변경:
//   - 분포: 모델별 FAIL (phi+motor 조합) + 다시 작업한 공정 (2-column)
//   - TrendChart: 그리드 + 호버 툴팁 추가
//   - 상세: 되돌리기 / FAIL / 폐기 3개 섹션

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { getQualityDashboard } from '@/api'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import { PHI_SPECS, PROCESS_LIST } from '@/constants/processConst'
import { useModels } from '@/hooks/useModels'
import s from './QualityDashboardPage.module.css'

const PROC_LABEL = Object.fromEntries(PROCESS_LIST.map((p) => [p.key, p.label]))

const DAYS_OPTIONS = [
  { value: 1,  label: '1일' },
  { value: 7,  label: '7일' },
  { value: 30, label: '30일' },
  { value: 90, label: '90일' },
]

const METRIC_COLORS = {
  fail:    'var(--color-error)',
  repair:  'var(--color-info, #3498db)',
  discard: 'var(--color-gray)',
}
const METRIC_LABELS = { fail: 'FAIL', repair: '되돌리기', discard: '폐기' }

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
const fmtNumber = (v, digits = 3) =>
  v == null ? '-' : Number(v).toFixed(digits).replace(/\.?0+$/, '')

// ══════════════════════════════════════════════════
// 추세 라인 차트 — 그리드 + 호버 툴팁 (2026-04-24 보완)
// ══════════════════════════════════════════════════
function TrendChart({ trend }) {
  const [hoverIdx, setHoverIdx] = useState(null)

  if (!trend || trend.length < 2) {
    return <p className={s.empty}>추세를 표시할 데이터가 부족해요.</p>
  }
  const W = 720, H = 240, PAD_L = 40, PAD_R = 16, PAD_T = 16, PAD_B = 36
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const KEYS = ['fail', 'repair', 'discard']
  const maxY = Math.max(1, ...trend.flatMap((t) => KEYS.map((k) => t[k])))
  const stepX = trend.length > 1 ? innerW / (trend.length - 1) : innerW

  const pointXY = (t, i, key) => ({
    x: PAD_L + i * stepX,
    y: PAD_T + innerH - (t[key] / maxY) * innerH,
  })

  const pathFor = (key) =>
    trend
      .map((t, i) => {
        const { x, y } = pointXY(t, i, key)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

  // Y축 눈금 — 0 포함 5단계로 세분화 (그리드 추가)
  const tickCount = 4
  const rawStep = maxY / tickCount
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round(rawStep * i))
    .filter((v, i, arr) => arr.indexOf(v) === i)

  const xLabelIdx =
    trend.length <= 8
      ? trend.map((_, i) => i)
      : [0, Math.floor(trend.length / 3), Math.floor((trend.length * 2) / 3), trend.length - 1]

  // 호버: 마우스 X 좌표 → 가장 가까운 인덱스
  const handleMove = (e) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const scaleX = W / rect.width
    const cursorX = (e.clientX - rect.left) * scaleX
    const idx = Math.round((cursorX - PAD_L) / stepX)
    if (idx >= 0 && idx < trend.length) setHoverIdx(idx)
    else setHoverIdx(null)
  }

  const hoveredPoint = hoverIdx != null ? trend[hoverIdx] : null

  return (
    <div className={s.chartWrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={s.chart}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* 가로 그리드 */}
        {yTicks.map((t) => {
          const y = PAD_T + innerH - (t / maxY) * innerH
          return (
            <g key={`gy-${t}`}>
              <line
                x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
                stroke="var(--color-list-divider, #f0f2f6)"
                strokeWidth="1"
              />
              <text x={PAD_L - 8} y={y + 4} className={s.axisLabel} textAnchor="end">
                {t}
              </text>
            </g>
          )
        })}
        {/* 세로 그리드 — X 라벨 위치마다 (너무 조밀하면 trend.length > 8 일 때만) */}
        {trend.length <= 8 &&
          trend.map((_, i) => {
            const x = PAD_L + i * stepX
            return (
              <line
                key={`gx-${i}`}
                x1={x} x2={x} y1={PAD_T} y2={PAD_T + innerH}
                stroke="var(--color-list-divider, #f0f2f6)"
                strokeWidth="1"
                strokeDasharray="2,3"
              />
            )
          })}

        {/* X축 레이블 */}
        {xLabelIdx.map((i) => (
          <text
            key={`xl-${i}`}
            x={PAD_L + i * stepX}
            y={H - 14}
            className={s.axisLabel}
            textAnchor="middle"
          >
            {fmtShort(trend[i].date)}
          </text>
        ))}

        {/* 3 라인 */}
        {KEYS.map((k) => (
          <motion.path
            key={k}
            d={pathFor(k)}
            stroke={METRIC_COLORS[k]}
            strokeWidth="2.4"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        ))}

        {/* 각 점 */}
        {KEYS.map((k) =>
          trend.map((t, i) => {
            const { x, y } = pointXY(t, i, k)
            const isHover = hoverIdx === i
            return (
              <circle
                key={`${k}-${i}`}
                cx={x} cy={y} r={isHover ? 5 : 3}
                fill={METRIC_COLORS[k]}
                stroke={isHover ? 'var(--color-white, #fff)' : 'none'}
                strokeWidth={isHover ? 2 : 0}
              />
            )
          }),
        )}

        {/* 호버 세로선 */}
        {hoverIdx != null && (
          <line
            x1={PAD_L + hoverIdx * stepX}
            x2={PAD_L + hoverIdx * stepX}
            y1={PAD_T} y2={PAD_T + innerH}
            stroke="var(--color-primary)"
            strokeWidth="1"
            strokeDasharray="3,3"
            opacity="0.5"
          />
        )}
      </svg>

      {/* 호버 툴팁 (SVG 밖 HTML) */}
      {hoveredPoint && (
        <div className={s.tooltip}>
          <div className={s.tooltipDate}>{fmtShort(hoveredPoint.date)}</div>
          {KEYS.map((k) => (
            <div key={k} className={s.tooltipRow}>
              <span className={s.tooltipDot} style={{ background: METRIC_COLORS[k] }} />
              <span className={s.tooltipLabel}>{METRIC_LABELS[k]}</span>
              <b className={s.tooltipVal}>{hoveredPoint[k]}</b>
            </div>
          ))}
        </div>
      )}

      <div className={s.legend}>
        {KEYS.map((k) => (
          <span key={k} className={s.legendItem}>
            <i style={{ background: METRIC_COLORS[k] }} />
            {METRIC_LABELS[k]}
          </span>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 분포 — dict 전달 (공통) / array 전달 (모델 FAIL)
// ══════════════════════════════════════════════════
function DistBars({ title, entries, colorFn, labelFn }) {
  if (!entries || entries.length === 0) {
    return (
      <div className={s.distSection}>
        <h3 className={s.distTitle}>{title}</h3>
        <p className={s.empty}>데이터 없음</p>
      </div>
    )
  }
  const maxVal = Math.max(...entries.map((e) => e.count))
  return (
    <div className={s.distSection}>
      <h3 className={s.distTitle}>{title}</h3>
      <div className={s.distRows}>
        {entries.map((e) => (
          <div key={e.key} className={s.distRow}>
            <span className={s.distLabel}>{labelFn ? labelFn(e) : e.label}</span>
            <div className={s.distBar}>
              <motion.div
                className={s.distFill}
                initial={{ width: 0 }}
                animate={{ width: `${(e.count / maxVal) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{ background: colorFn ? colorFn(e) : 'var(--color-primary)' }}
              />
            </div>
            <span className={s.distVal}>{e.count}</span>
          </div>
        ))}
      </div>
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

  const { findModel } = useModels()
  const modelColor = (phi, motor) =>
    findModel(phi, motor)?.color_hex ??
    findModel(phi, 'inner')?.color_hex ??
    findModel(phi, 'outer')?.color_hex ??
    PHI_SPECS[phi]?.color ??
    'var(--color-gray)'
  const procLabel = (k) => PROC_LABEL[k] || k

  // BE 응답 변환
  const modelFailEntries = (data?.distributions?.model_fail || []).map((m) => ({
    key: `${m.phi}|${m.motor_type}`,
    label: m.label,
    count: m.count,
    phi: m.phi,
    motor_type: m.motor_type,
  }))
  const repairDestEntries = Object.entries(data?.distributions?.repair_dest || {})
    .sort((a, b) => b[1] - a[1])
    .map(([proc, count]) => ({ key: proc, label: procLabel(proc), count }))

  const refreshAction = (
    <button
      type="button"
      className={s.refreshBtn}
      onClick={() => load(days)}
      disabled={loading}
      aria-label="새로고침"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </button>
  )

  return (
    <div className="page-flat">
      <PageHeader
        title="품질 현황은 어떤가요?"
        subtitle="FAIL · 되돌리기 · 폐기 현황과 추세"
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
        {refreshAction}
      </div>

      {loading && <p className={s.info}>불러오는 중…</p>}
      {error && <p className={s.errorMsg}>⚠ {error}</p>}

      {data && !loading && (
        <>
          {/* 요약 타일 4개 */}
          <div className={s.summaryGrid}>
            <div className={`${s.sumTile} ${s.sumFail}`}>
              <span className={s.sumLabel}>FAIL</span>
              <span className={s.sumValue}>{data.summary.fail}</span>
            </div>
            <div className={`${s.sumTile} ${s.sumRepair}`}>
              <span className={s.sumLabel}>되돌리기</span>
              <span className={s.sumValue}>{data.summary.repair}</span>
            </div>
            <div className={`${s.sumTile} ${s.sumDiscard}`}>
              <span className={s.sumLabel}>폐기</span>
              <span className={s.sumValue}>{data.summary.discard}</span>
            </div>
            <div className={`${s.sumTile} ${s.sumRate}`}>
              <span className={s.sumLabel}>불량률</span>
              <span className={s.sumValue}>{data.summary.fail_rate}%</span>
            </div>
          </div>
          <p className={s.rangeText}>
            {data.range.from} ~ {data.range.to} · 전체 OQ <b>{data.summary.total_oq}</b>건
          </p>

          {days > 1 && (
            <Section label="일별 추세">
              <TrendChart trend={data.trend} />
            </Section>
          )}

          {/* 분포 — 모델별 FAIL + 다시 작업한 공정 (2개) */}
          <Section label="분포">
            <div className={s.distGrid2}>
              <DistBars
                title="모델별 FAIL"
                entries={modelFailEntries}
                colorFn={(e) => modelColor(e.phi, e.motor_type)}
              />
              <DistBars
                title="되돌리기 — 다시 작업한 공정"
                entries={repairDestEntries}
              />
            </div>
          </Section>

          {/* 상세 — 되돌리기 */}
          <Section
            label={
              <span className={s.sectionLabelRow}>
                되돌리기 상세
                <span className={s.countTag}>{data.repair_list?.length || 0}</span>
              </span>
            }
          >
            {(data.repair_list?.length || 0) === 0 ? (
              <p className={s.empty}>해당 기간에 되돌리기가 없어요</p>
            ) : (
              <ul className={s.detailList}>
                {data.repair_list.map((r, i) => (
                  <li key={`rep-${r.lot_no}-${i}`} className={s.detailItem}>
                    <span className={s.dTime}>{fmtDateTime(r.at)}</span>
                    <div className={s.dMain}>
                      <div className={s.dTop}>
                        <span className={s.dLot}>{r.lot_no}</span>
                        {r.phi && r.motor_type && (
                          <span
                            className={s.dModelTag}
                            style={{ background: modelColor(r.phi, r.motor_type) }}
                          >
                            Φ{r.phi} {r.motor_type === 'inner' ? '내전' : '외전'}
                          </span>
                        )}
                        <span className={s.dProc}>
                          다시 작업: <b>{procLabel(r.to_process) || '?'}</b>
                        </span>
                      </div>
                      <div className={s.dReason}>
                        {r.reason || <i className={s.reasonNone}>사유 없음</i>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* 상세 — FAIL */}
          <Section
            label={
              <span className={s.sectionLabelRow}>
                FAIL 상세
                <span className={s.countTag}>{data.fail_list?.length || 0}</span>
              </span>
            }
          >
            {(data.fail_list?.length || 0) === 0 ? (
              <p className={s.empty}>해당 기간에 FAIL이 없어요</p>
            ) : (
              <ul className={s.detailList}>
                {data.fail_list.map((f, i) => (
                  <li key={`fail-${f.lot_so_no || f.serial_no}-${i}`} className={s.detailItem}>
                    <span className={s.dTime}>{fmtDateTime(f.at)}</span>
                    <div className={s.dMain}>
                      <div className={s.dTop}>
                        <span className={s.dLot}>
                          {f.serial_no || f.lot_so_no || '-'}
                        </span>
                        {f.phi && f.motor_type && (
                          <span
                            className={s.dModelTag}
                            style={{ background: modelColor(f.phi, f.motor_type) }}
                          >
                            {f.model_label}
                          </span>
                        )}
                        {f.appearance === 'NG' && (
                          <span className={s.dBadgeFail}>외관 NG</span>
                        )}
                      </div>
                      <div className={s.dMeasures}>
                        <span>R: <b>{fmtNumber(f.r_value)}</b> Ω</span>
                        <span>L: <b>{fmtNumber(f.l_value)}</b> {f.l_unit}</span>
                        <span>Kt: <b>{fmtNumber(f.kt_value)}</b></span>
                        {f.insulation != null && (
                          <span>I.T.: <b>{fmtNumber(f.insulation, 0)}</b></span>
                        )}
                      </div>
                      {f.remark && <div className={s.dReason}>{f.remark}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* 상세 — 폐기 */}
          <Section
            label={
              <span className={s.sectionLabelRow}>
                폐기 상세
                <span className={s.countTag}>{data.discard_list?.length || 0}</span>
              </span>
            }
          >
            {(data.discard_list?.length || 0) === 0 ? (
              <p className={s.empty}>해당 기간에 폐기가 없어요</p>
            ) : (
              <ul className={s.detailList}>
                {data.discard_list.map((d, i) => (
                  <li key={`dis-${d.lot_no}-${i}`} className={s.detailItem}>
                    <span className={s.dTime}>{fmtDateTime(d.at)}</span>
                    <div className={s.dMain}>
                      <div className={s.dTop}>
                        <span className={s.dLot}>{d.lot_no}</span>
                        {d.phi && d.motor_type && (
                          <span
                            className={s.dModelTag}
                            style={{ background: modelColor(d.phi, d.motor_type) }}
                          >
                            Φ{d.phi} {d.motor_type === 'inner' ? '내전' : '외전'}
                          </span>
                        )}
                        <span className={s.dProc}>
                          <b>{procLabel(d.process)}</b>
                        </span>
                        <span className={s.dQty}>{d.quantity}개</span>
                      </div>
                      <div className={s.dReason}>
                        {d.reason || <i className={s.reasonNone}>사유 없음</i>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
