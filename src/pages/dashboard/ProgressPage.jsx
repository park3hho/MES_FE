// src/pages/dashboard/ProgressPage.jsx
// 포장 현황 — 대시보드 '포장' 뷰
// BottomNav long-press 팝오버, SideNav 서브메뉴에서 진입
//
// ★ 리디자인 2026-08-21 — 화면의 축을 '조(set) 맞춤' 으로 전환.
//   모터 1조 = ST 1 + RT 1 (2026-05-11 도메인 규칙) 이므로 ST/RT 를 따로 두 줄로 나열하지 않고
//   한 모델 = 한 줄로 합치고, 막대를 3구간으로 나눈다:
//       완성 = min(ST,RT)   ·   한쪽만 = |ST-RT|   ·   남음 = 나머지
//   → "고정자는 다 됐는데 회전자가 없어 못 나간다" 가 즉시 읽힌다.
//   이전 디자인은 ST 게이지·RT 게이지가 각각 100% 를 향해 달려서, 둘 다 90% 여도
//   짝이 안 맞으면 출하 못 한다는 사실이 화면 어디에도 없었다.
//
// 규약:
//   - PHI_SPECS / DB ModelRegistry 사용 (하드코딩 금지)
//   - 진행률 색은 progressColor() 회색→초록 그라데이션 (2026-07-28 요청)
//   - framer-motion 으로 카드 페이드+스태거, 막대 구간 fill

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'

import { getInvoiceProgress } from '@/api'
// MODEL_KEYS / findModel 제거: DB ModelRegistry 로 이관 (2026-04-24 PR-7)
import { MOTOR_LABEL, PHI_SPECS } from '@/constants/processConst'
import { useModels } from '@/hooks/useModels'
import { fmtKstDate } from '@/utils/dateConvert'

import s from './ProgressPage.module.css'

// 진행률(0~100) → 회색에서 연두·초록으로 자연스러운 그라데이션 (2026-07-28).
//   hue 는 초록(140) 고정, 채도·명도를 진행률에 선형 보간:
//   0%   = hsl(140, 0%, 84%)  밝은 회색 (채도 0 → 색 없음)
//   50%  = hsl(140, 34%, 62%) 연두
//   100% = hsl(140, 68%, 40%) 진초록
const progressColor = (pct) => {
  const p = Math.max(0, Math.min(100, pct)) / 100
  const sat = Math.round(p * 68)
  const light = Math.round(84 - p * 44)
  return `hsl(140, ${sat}%, ${light}%)`
}

const pctOf = (cur, target) => (target > 0 ? (cur / target) * 100 : 0)

// 송장 항목(계약) 라인 → 모델 타입 (2026-06-10)
//   st → ST만 / rt → RT만 / both → 둘 다 / none(레거시) → 둘 다(기존 동작 유지)
const L2T = { rotor: 'rt', stator: 'st' }
const COUNTS_ST = (t) => ['st', 'both', 'none'].includes(t)
const COUNTS_RT = (t) => ['rt', 'both', 'none'].includes(t)

// ── 송장 items → 모델별 '조' 행 ──────────────────────────────
// ★ (phi, motor) 로 묶는다. 고정자 항목과 회전자 항목은 별개 InvoiceItem 이지만
//   현장에선 같은 모델의 한 조라서, 화면에선 한 줄이어야 한다.
// ★ BE 의 current/current_rt 는 '항목별' 이 아니라 '(phi,motor) 집계' 라
//   같은 그룹에 여러 줄이 있어도 더하면 안 된다 (중복 카운트). 목표(quantity)만 합산.
function buildSetRows(items, models) {
  const specials = []
  const map = new Map()

  for (const it of items || []) {
    if (it.is_special) { specials.push(it); continue }   // 예외 납품 — 진척 롤업 제외 (2026-07-27)

    const model = models.find((m) =>
      (it.model_registry_id && it.model_registry_id === m.id) ||
      (!it.model_registry_id && it.phi === m.phi && it.motor_type === m.motor_type
        && (L2T[it.line] || 'none') === (m.rt_st_type || 'none')),
    ) || models.find((m) =>
      it.phi === m.phi && it.motor_type === m.motor_type,   // 라벨·색상용 폴백
    )

    const key = `${it.phi}|${it.motor_type}`
    if (!map.has(key)) {
      map.set(key, {
        key, phi: it.phi, motor: it.motor_type, model: null,
        stTarget: 0, stCur: 0, rtTarget: 0, rtCur: 0, hasSt: false, hasRt: false,
      })
    }
    const g = map.get(key)
    if (model && !g.model) g.model = model

    const type = it.rt_st_type || model?.rt_st_type || 'none'
    const q = it.quantity || 0
    if (COUNTS_ST(type)) {
      g.hasSt = true
      g.stTarget += q
      g.stCur = Math.max(g.stCur, it.current || 0)
    }
    if (COUNTS_RT(type)) {
      g.hasRt = true
      g.rtTarget += q
      g.rtCur = Math.max(g.rtCur, it.current_rt || 0)
    }
  }

  const rows = [...map.values()].map((g) => {
    const paired = g.hasSt && g.hasRt
    const target = Math.max(g.stTarget, g.rtTarget)
    // 짝이 있는 모델은 적은 쪽이 출하 가능분. 한쪽만 계약된 모델은 그 쪽이 곧 진척.
    const done = Math.min(paired ? Math.min(g.stCur, g.rtCur) : (g.hasSt ? g.stCur : g.rtCur), target)
    // 한쪽만 포장된 분 — 남은 계약분을 넘길 수 없다 (한쪽 과포장이 '부족'을 부풀리지 않게)
    const half = paired ? Math.max(0, Math.min(Math.abs(g.stCur - g.rtCur), target - done)) : 0
    const lag = !paired || g.stCur === g.rtCur ? null : (g.stCur < g.rtCur ? 'st' : 'rt')
    return {
      ...g,
      target,
      done,
      half,
      lag,
      shortage: done >= target ? 0 : half,
      complete: target > 0 && done >= target,
      label: g.model?.label || `Φ${g.phi}${MOTOR_LABEL[g.motor] ? ` ${MOTOR_LABEL[g.motor]}` : ''}`,
      color: g.model?.color_hex || PHI_SPECS[g.phi]?.color || '#6b7585',
    }
  })

  return { rows, specials }
}

// 스태거 variants
const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: -8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
}
const barEase = { duration: 0.5, ease: 'easeOut' }

// 3구간 막대 — [완성][한쪽만][남음(트랙)]
function SetBar({ done, half, target, tall, pct }) {
  return (
    <div className={tall ? `${s.bar} ${s.barTall}` : s.bar}>
      <motion.div
        className={s.segDone}
        initial={{ flexBasis: '0%' }}
        animate={{ flexBasis: `${pctOf(done, target)}%` }}
        transition={barEase}
        style={{ background: progressColor(pct) }}
      />
      <motion.div
        className={s.segHalf}
        initial={{ flexBasis: '0%' }}
        animate={{ flexBasis: `${pctOf(half, target)}%` }}
        transition={{ ...barEase, delay: 0.08 }}
      />
    </div>
  )
}

// ST / RT 실측 한 쌍 — 뒤처진 쪽만 주황으로 지목
function SideStat({ tag, cls, cur, target, lagging }) {
  const over = target > 0 && cur > target
  return (
    <span className={`${s.side} ${lagging ? s.sideLag : ''}`}>
      <i className={`${s.tag} ${cls}`}>{tag}</i>
      <b>{cur}</b>
      <span className={s.sepDim}> / </span>
      <span>{target}</span>
      {over && <span className={s.overMark} title="계약 수량 초과">⚠</span>}
    </span>
  )
}

// 인보이스 한 건 카드
function InvoiceProgressCard({ invoice }) {
  const { models } = useModels()
  const { rows, specials } = buildSetRows(invoice.items, models)

  const totalTarget = rows.reduce((a, r) => a + r.target, 0)
  const totalDone = rows.reduce((a, r) => a + r.done, 0)
  const totalHalf = rows.reduce((a, r) => a + r.half, 0)
  const totalRest = Math.max(0, totalTarget - totalDone - totalHalf)
  const totalPct = pctOf(totalDone, totalTarget)
  const stTargetAll = rows.reduce((a, r) => a + r.stTarget, 0)
  const rtTargetAll = rows.reduce((a, r) => a + r.rtTarget, 0)

  // 다음 할 일 — 부족한 쪽(고정자/회전자)별로 모델·수량을 그대로 나열
  const shortLines = [
    { side: 'rt', name: '회전자', list: rows.filter((r) => r.lag === 'rt' && r.shortage > 0) },
    { side: 'st', name: '고정자', list: rows.filter((r) => r.lag === 'st' && r.shortage > 0) },
  ].filter((g) => g.list.length > 0)

  return (
    <motion.div className={s.card} variants={cardVariants}>
      {/* ── 송장 + 전체 진척 ── */}
      <div className={s.head}>
        <div className={s.headTop}>
          <div className={s.headLeft}>
            <p className={s.eyebrow}>출하 포장</p>
            <h2 className={s.invoiceNo}>
              {invoice.invoice_no}
              <span className={s.pill}>MB {invoice.mb_count}박스</span>
            </h2>
            <p className={s.invoiceMeta}>
              {fmtKstDate(invoice.created_at)}
              {totalTarget > 0 && <> · 계약 {totalTarget}</>}
              {stTargetAll > 0 && rtTargetAll > 0 && (
                <span className={s.metaDim}> (ST {stTargetAll} + RT {rtTargetAll})</span>
              )}
              {invoice.title && <span className={s.metaDim}> · {invoice.title}</span>}
            </p>
          </div>
          <div className={s.big}>
            <div className={s.bigNum}>
              {totalDone}<em> / {totalTarget}</em>
            </div>
            <span className={s.bigK}>출하 가능</span>
          </div>
        </div>

        <SetBar done={totalDone} half={totalHalf} target={totalTarget} pct={totalPct} tall />

        <div className={s.legend}>
          <span>
            <i className={s.sw} style={{ background: progressColor(totalPct) }} />
            완성 <b>{totalDone}</b>
          </span>
          <span><i className={`${s.sw} ${s.swHalf}`} />한쪽만 <b>{totalHalf}</b></span>
          <span><i className={`${s.sw} ${s.swRest}`} />남음 <b>{totalRest}</b></span>
        </div>
      </div>

      {/* ── 모델별 — ST/RT 를 한 줄로 통합 ── */}
      <div className={s.models}>
        {rows.length === 0 ? (
          <p className={s.noItems}>요구 항목 미설정 — 송장 관리에서 설정</p>
        ) : (
          <>
            <div className={s.secHead}>
              <h3 className={s.secTitle}>모델별 포장</h3>
              <span className={s.secNote}>고정자·회전자 짝이 맞아야 출하</span>
            </div>

            {rows.map((r) => (
              <div key={r.key} className={s.row}>
                <div className={s.rowTop}>
                  <span className={s.dot} style={{ background: r.color }} aria-hidden="true" />
                  <span className={s.mName}>{r.label}</span>
                  {r.complete && <span className={s.chk}>✓ 완료</span>}
                  <span className={s.mDone}>
                    {r.done}<small> / {r.target}</small>
                  </span>
                </div>

                <SetBar done={r.done} half={r.half} target={r.target} pct={pctOf(r.done, r.target)} />

                <div className={s.sides}>
                  {r.hasSt && (
                    <SideStat tag="ST" cls={s.tagSt} cur={r.stCur} target={r.stTarget} lagging={r.lag === 'st'} />
                  )}
                  {r.hasRt && (
                    <SideStat tag="RT" cls={s.tagRt} cur={r.rtCur} target={r.rtTarget} lagging={r.lag === 'rt'} />
                  )}
                  {r.shortage > 0 && (
                    <span className={s.lagNote}>
                      {r.lag === 'rt' ? '회전자' : '고정자'} {r.shortage}개 부족
                    </span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {specials.length > 0 && (
          <p className={s.specialNote}>예외 납품 {specials.length}건 · 진척 집계 제외</p>
        )}
      </div>

      {shortLines.length > 0 && (
        <div className={s.todo}>
          <span className={s.todoK}>다음 할 일</span>
          <span className={s.todoT}>
            {shortLines.map((g) => {
              const sum = g.list.reduce((a, r) => a + r.shortage, 0)
              return (
                <span key={g.side} className={s.todoLine}>
                  <b>{g.name}가 모자랍니다.</b>{' '}
                  {g.list.map((r) => `${r.label} ${r.shortage}개`).join(', ')}
                  {' — 채우면 '}<b>{sum}개</b>를 더 출하할 수 있습니다.
                </span>
              )
            })}
          </span>
        </div>
      )}
    </motion.div>
  )
}

export default function ProgressPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // silent=true 면 loading 토글 없이 조용히 데이터만 업데이트 — 폴링 시 애니메이션 재생 방지
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const d = await getInvoiceProgress()
      setData(d)
    } catch (e) {
      setError(e.message || '진척률 조회 실패')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // 폴링 — 10초마다, 탭이 hidden일 때는 쉬기 (불필요 트래픽/BE 로그 절약)
  // 최초 load만 loading 토글 → 스켈레톤 1회 + 애니메이션 1회
  // 폴링은 silent=true → 리스트 unmount 없이 숫자/바만 부드럽게 업데이트
  useEffect(() => {
    load()  // 최초 1회는 loading 토글
    let id = null
    const start = () => {
      if (id != null) return
      id = setInterval(() => load(true), 10000)
    }
    const stop = () => {
      if (id == null) return
      clearInterval(id); id = null
    }
    start()
    const onVisible = () => {
      if (document.visibilityState === 'visible') { load(true); start() } else stop()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const invoices = data?.invoices || []

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.title}>포장 현황</h1>
          <p className={s.subtitle}>
            활성 인보이스 {invoices.length}건 · 고정자·회전자 짝이 맞아야 출하됩니다
          </p>
        </div>
      </div>

      {loading && <p className={s.info}>로딩 중...</p>}
      {error && <p className={s.errorMsg}>⚠ {error}</p>}

      {!loading && !error && invoices.length === 0 && (
        <div className={s.empty}>
          활성 인보이스가 없습니다.<br />
          송장 관리 페이지에서 인보이스를 업로드하고 요구 항목을 설정하세요.
        </div>
      )}

      {!loading && invoices.length > 0 && (
        <motion.div
          className={s.list}
          variants={listVariants}
          initial="hidden"
          animate="show"
        >
          {invoices.map((inv) => (
            <InvoiceProgressCard key={inv.id} invoice={inv} />
          ))}
        </motion.div>
      )}
    </div>
  )
}
