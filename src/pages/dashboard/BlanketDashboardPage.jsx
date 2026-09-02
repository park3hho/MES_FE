// pages/dashboard/BlanketDashboardPage.jsx
// Blanket 계약 진행현황 대시보드 (2026-08-19) — 계약 총량 대비 출하 누계 + 월별 계획/실적.
//
// ★ 화면이 답하는 3가지
//   ① 얼마나 소진했나 — 소진 스파인(계약 기간 = 가로축)
//   ② 페이스가 괜찮나 — 계획선 대비 부족분을 '갭'(빗금)으로. 계획이 없으면 필요량 vs 최근평균
//   ③ 뭘 해야 하나   — 월별 계획 편집 + 잔여 대비 미배정 물량 안내
//
// ★ 계획선은 '기간 경과율' 이 아니라 사용자가 잡은 월 계획의 누계다.
//   경과율(선형)은 하계휴가·설 연휴를 반영 못 해 부족분을 과대 계상한다. BE 가 안분까지 계산해 준다.
import { useState, useEffect, useCallback, useMemo } from 'react'

import PageHeader from '@/components/common/PageHeader'
import { listSalesOrders, getBlanketDashboard, saveBlanketPlan } from '@/api'
import { SO_STATUS_LABELS } from '@/constants/soConst'
import { MOTOR_LABEL } from '@/constants/processConst'
import s from './BlanketDashboardPage.module.css'

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const fmt = (v) => num(v).toLocaleString()
const pct = (cur, total) => (!total ? 0 : Math.min(100, (num(cur) / num(total)) * 100))
const monthLabel = (key) => `${Number(key.slice(5, 7))}월`

// presenting — 보기 전용: 편집·뒤로가기 등 조작 UI 를 감춘다.
// fitScreen  — 한 화면(100vh)에 눌러 담는 압축 레이아웃.
//   ★ 둘을 나눈 이유 (2026-09-02): 내 대시보드 위젯으로 임베드될 땐 조작 UI 는 없애야 하지만
//     100vh 로 잠그면 자기 슬롯을 무시하고 화면 전체를 먹는다. 라우트 단독 표시일 때만 둘 다 켠다.
export default function BlanketDashboardPage({ onBack, presenting = false, fitScreen = false }) {
  const [sos, setSos] = useState([])
  const [soId, setSoId] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Blanket 부모 목록 — 셀렉터용. 자식(릴리스)은 대시보드 대상이 아니라 제외.
  //   ★ 인자 키는 camelCase `soType` — api/index.js 가 그 이름만 읽어 so_type 쿼리로 바꾼다.
  //     snake 로 주면 undefined 라 withQs 가 통째로 버리고 STANDARD 까지 전부 내려온다 (2026-09-02 수정).
  //     응답에도 so_type 이 실려오므로 여기서 한 번 더 거른다 — 같은 유실이 다시 나도 목록은 안 오염된다.
  useEffect(() => {
    let alive = true
    listSalesOrders({ soType: 'BLANKET' })
      .then((r) => {
        if (!alive) return
        const parents = (r.items || []).filter((x) => x.so_type === 'BLANKET' && !x.parent_id)
        setSos(parents)
        if (parents.length) setSoId((prev) => prev ?? parents[0].id)
        else { setLoading(false); setError('Blanket 계약이 없습니다 — 수주 관리에서 먼저 등록하세요.') }
      })
      .catch((e) => { if (alive) { setLoading(false); setError(e.message || '계약 목록 조회 실패') } })
    return () => { alive = false }
  }, [])

  const load = useCallback(async () => {
    if (!soId) return
    setLoading(true); setError(null)
    try {
      setData(await getBlanketDashboard(soId))
    } catch (e) {
      setData(null)
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [soId])

  useEffect(() => { load() }, [load])

  return (
    // 보기 전용(현황판) — 전체화면이면 한 화면에 눌러 담고 조작 UI 를 감춘다 (2026-09-02)
    <div className={`page-flat ${fitScreen ? s.present : ''}`}>
      <PageHeader
        title="계약이 얼마나 진행됐나요?"
        subtitle={presenting ? '' : 'Blanket 포괄계약 진행 현황 · 월별 생산계획 대비 실적'}
        onBack={presenting ? undefined : onBack}
      />
      <div className={`page-content ${fitScreen ? s.presentBody : ''}`}>
        {sos.length > 1 && (
          <div className={s.picker}>
            {sos.map((so) => (
              <button
                key={so.id}
                type="button"
                className={`${s.pick} ${so.id === soId ? s.pickOn : ''}`}
                onClick={() => setSoId(so.id)}
              >
                {so.so_no}
              </button>
            ))}
          </div>
        )}

        {loading && <p className={s.msg}>불러오는 중…</p>}
        {error && <p className={s.err}>{error}</p>}
        {!loading && !error && data && <Dashboard data={data} onSaved={load} presenting={presenting} fitScreen={fitScreen} />}
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════
// 본문
// ══════════════════════════════════════════════
function Dashboard({ data, onSaved, presenting, fitScreen }) {
  const { so, summary: sm, lines, months } = data

  // 계획 누계 위치(%) — 스파인·라인 틱이 공유하는 세로 기준선
  const planPct = sm.has_plan ? num(sm.plan_pct) : null
  const shipPct = num(sm.shipped_pct)
  const gapW = planPct != null ? Math.max(0, planPct - shipPct) : 0

  return (
    <>
      {/* ── 계약 헤더 ── */}
      <section className={s.panel}>
        <div className={s.contract}>
          <div className={s.cid}>
            <p className={s.eyebrow}>BLANKET 포괄계약</p>
            <h2 className={s.soNo}>
              {so.so_no}
              <span className={s.badge}>{SO_STATUS_LABELS[so.status] || so.status}</span>
            </h2>
            <p className={s.period}>
              {so.valid_from} ~ {so.valid_to}
              {sm.days_left > 0 && ` · 남은 기간 ${sm.days_left}일`}
            </p>
          </div>
          <div className={s.figures}>
            <div><span className={s.figK}>계약</span><span className={s.figV}>{fmt(sm.total_qty)}<small> 개</small></span></div>
            <div><span className={s.figK}>출하</span><span className={s.figV}>{fmt(sm.shipped_qty)}<small> 개</small></span></div>
            <div><span className={s.figK}>잔여</span><span className={s.figV}>{fmt(sm.remaining_qty)}<small> 개</small></span></div>
          </div>
        </div>
      </section>

      {/* ── 히어로: 소진 스파인 ── */}
      <section className={s.panel}>
        <div className={s.spine}>
          <div className={s.spineHead}>
            <div>
              <p className={s.eyebrow}>계약 진행률</p>
              <div className={s.pctWrap}>
                <span className={s.pct}>{shipPct.toFixed(1)}<span className={s.pctSign}>%</span></span>
                <span className={s.pctSub}>
                  {sm.has_plan
                    ? <>계획 <b>{num(sm.plan_pct).toFixed(1)}%</b> 대비 {sm.deficit > 0 ? <>· <b>{fmt(sm.deficit)}개</b> 부족</> : <b>충족</b>}</>
                    : <>잔여 <b>{fmt(sm.remaining_qty)}개</b></>}
                </span>
              </div>
            </div>
            <Verdict sm={sm} />
          </div>

          <div className={s.bar}>
            <div className={s.barFill} style={{ width: `${shipPct}%` }} />
            {gapW > 0 && <div className={s.barGap} style={{ left: `${shipPct}%`, width: `${gapW}%` }} />}
            {planPct != null && (
              <div className={s.planline} style={{ left: `${planPct}%` }}>
                <span className={s.planTag}>계획 {planPct.toFixed(1)}%</span>
              </div>
            )}
          </div>
          <div className={s.axis}>
            <span>{so.valid_from}</span>
            <span>오늘 {sm.today}</span>
            <span>{so.valid_to}</span>
          </div>

          <div className={s.legend}>
            <span><i className={`${s.sw} ${s.swDone}`} />출하 완료 {fmt(sm.shipped_qty)}개</span>
            {sm.deficit > 0 && <span><i className={`${s.sw} ${s.swGap}`} />계획 대비 부족 {fmt(sm.deficit)}개</span>}
            <span><i className={`${s.sw} ${s.swRest}`} />잔여 {fmt(sm.remaining_qty)}개</span>
          </div>
        </div>
      </section>

      {/* ── 품목별 소진 ── */}
      <section className={`${s.panel} ${fitScreen ? s.grow : ''}`}>
        <div className={s.lines}>
          <div className={s.secHead}>
            <h3 className={s.secTitle}>품목별 진행률</h3>
            {planPct != null && <span className={s.secNote}>세로선 = 오늘까지 계획 누계 ({planPct.toFixed(1)}%)</span>}
          </div>
          {lines.length === 0
            ? <p className={s.msg}>계약 품목이 없습니다.</p>
            : lines.map((ln) => <LineRow key={ln.id} ln={ln} planPct={planPct} />)}
        </div>
      </section>

      {/* ── 월별 생산계획 ── */}
      <PlanSection so={so} months={months} summary={sm} onSaved={onSaved} presenting={presenting} />
    </>
  )
}


function Verdict({ sm }) {
  const cls = sm.verdict === 'late' ? s.vLate : sm.verdict === 'done' ? s.vDone : s.vOk
  const mark = sm.verdict === 'late' ? '▲ 지연' : sm.verdict === 'done' ? '✓ 완료' : '✓ 정상'
  return (
    <div className={`${s.verdict} ${cls}`}>
      <span className={s.vMark}>{mark}</span>
      <span className={s.vTxt}>
        {sm.verdict === 'done'
          ? <>계약 수량을 모두 출하했습니다.</>
          : sm.months_left > 0
            ? <>잔여 소화에 월 <b>{fmt(sm.need_per_month)}개</b> 필요 — 최근 3개월 평균 <b>{fmt(sm.recent_avg)}개</b></>
            : <>계약 기간이 끝났습니다 — 잔여 <b>{fmt(sm.remaining_qty)}개</b></>}
      </span>
    </div>
  )
}


function LineRow({ ln, planPct }) {
  const p = pct(ln.shipped_qty, ln.total_qty)
  const done = ln.total_qty > 0 && ln.shipped_qty >= ln.total_qty
  // 계획선 대비 ±5%p 를 '정상' 밴드로 — 그보다 앞서면 앞섬, 처지면 지연
  const diff = planPct == null ? 0 : p - planPct
  const state = done ? 'done' : planPct == null ? 'none' : diff >= 5 ? 'ahead' : diff <= -5 ? 'late' : 'on'
  const fillCls = done ? s.lfDone : state === 'ahead' ? s.lfAhead : state === 'late' ? s.lfLate : ''
  const gap = planPct != null && !done ? Math.max(0, planPct - p) : 0

  return (
    <div className={s.row}>
      <span className={s.tag}>{ln.line === 'rotor' ? 'RT' : 'ST'}</span>
      <span className={s.name}>Φ{ln.phi} {MOTOR_LABEL[ln.motor_type] || ln.motor_type}</span>
      <div className={s.lbar}>
        <div className={`${s.lbarFill} ${fillCls}`} style={{ width: `${p}%` }} />
        {gap > 0 && <div className={s.lbarGap} style={{ left: `${p}%`, width: `${gap}%` }} />}
        {planPct != null && <div className={s.tick} style={{ left: `${planPct}%` }} />}
      </div>
      <span className={s.qty}><b>{fmt(ln.shipped_qty)}</b> / {fmt(ln.total_qty)}</span>
      <span className={`${s.state} ${s['st_' + state]}`}>
        {done ? '완료' : state === 'ahead' ? '앞섬' : state === 'late' ? '지연' : state === 'on' ? '정상' : '—'}
      </span>
    </div>
  )
}


// ── 월별 계획 vs 실적 (편집) ──
function PlanSection({ so, months, summary: sm, onSaved, presenting }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const maxVal = useMemo(
    () => Math.max(1, ...months.map((m) => Math.max(num(m.plan), num(m.actual)))),
    [months],
  )
  const curKey = sm.today.slice(0, 7)

  const start = () => {
    setDraft(Object.fromEntries(months.map((m) => [m.key, String(m.plan || '')])))
    setMsg(null)
    setEditing(true)
  }
  const cancel = () => { setEditing(false); setDraft({}); setMsg(null) }

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const items = months.map((m) => ({
        period_key: m.key,
        planned_qty: Math.max(0, Math.floor(num(draft[m.key]))),
      }))
      await saveBlanketPlan(so.id, items)
      setEditing(false); setDraft({})
      await onSaved()
    } catch (e) {
      setMsg(e.message || '저장 실패')
    } finally { setBusy(false) }
  }

  // 잔여 대비 남은 달 계획 합 — 미배정 물량이 있으면 알려준다
  const futurePlan = months
    .filter((m) => m.key >= curKey)
    .reduce((a, m) => a + num(m.plan), 0)
  const unassigned = sm.has_plan ? num(sm.remaining_qty) - futurePlan : 0

  return (
    <section className={s.panel}>
      <div className={s.plan}>
        <div className={s.secHead}>
          <h3 className={s.secTitle}>월별 생산 계획</h3>
          {/* 보기 전용에선 편집 진입 자체를 감춘다 (2026-09-02) */}
          {presenting ? null : editing ? (
            <span className={s.btnRow}>
              <button type="button" className={s.btnGhost} disabled={busy} onClick={cancel}>취소</button>
              <button type="button" className={s.btnSave} disabled={busy} onClick={save}>
                {busy ? '저장 중…' : '저장'}
              </button>
            </span>
          ) : (
            <button type="button" className={s.btnEdit} onClick={start}>✎ 계획 편집</button>
          )}
        </div>

        {msg && <p className={s.err}>{msg}</p>}

        {/* 계획(점선 윤곽) vs 실적(채움) — 겹쳐 그려 초과·미달이 즉시 읽힘 */}
        <div className={s.chart} style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
          {months.map((m) => {
            const ph = (num(m.plan) / maxVal) * 100
            const ah = (num(m.actual) / maxVal) * 100
            const over = num(m.actual) >= num(m.plan) && num(m.plan) > 0
            const isNow = m.key === curKey
            return (
              <div key={m.key} className={s.col} title={`${monthLabel(m.key)} 계획 ${fmt(m.plan)} / 실적 ${fmt(m.actual)}`}>
                {num(m.plan) > 0 && <div className={s.pOut} style={{ height: `${ph}%` }} />}
                {num(m.actual) > 0 && (
                  <div
                    className={`${s.pAct} ${isNow ? s.pNow : over ? s.pOver : s.pUnder}`}
                    style={{ height: `${ah}%` }}
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className={s.months} style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
          {months.map((m) => (
            <span key={m.key} className={`${s.m} ${m.key === curKey ? s.mNow : ''}`}>{monthLabel(m.key)}</span>
          ))}
        </div>

        <p className={s.rowK}>계획</p>
        <div className={s.prow} style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
          {months.map((m) => (
            editing ? (
              <input
                key={m.key}
                className={s.pIn}
                inputMode="numeric"
                value={draft[m.key] ?? ''}
                placeholder="0"
                disabled={busy}
                onChange={(e) => setDraft((d) => ({ ...d, [m.key]: e.target.value.replace(/[^0-9]/g, '') }))}
              />
            ) : (
              <span key={m.key} className={s.pCell}>{m.plan ? fmt(m.plan) : '—'}</span>
            )
          ))}
        </div>

        <p className={s.rowK}>실적</p>
        <div className={s.prow} style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
          {months.map((m) => (
            <span key={m.key} className={`${s.pCell} ${s.pAcCell}`}>{m.actual ? fmt(m.actual) : '—'}</span>
          ))}
        </div>

        <div className={s.planLegend}>
          <span><i className={`${s.chip} ${s.cPlan}`} />계획</span>
          <span><i className={`${s.chip} ${s.cOver}`} />계획 달성</span>
          <span><i className={`${s.chip} ${s.cUnder}`} />계획 미달</span>
        </div>

        {!sm.has_plan && !editing && !presenting && (
          <div className={s.todo}>
            <span className={s.todoK}>다음 할 일</span>
            <span className={s.todoT}>
              <b>월별 계획이 없습니다.</b> 계획을 잡으면 기간 경과율이 아니라 실제 일정(휴무·성수기)을
              반영한 계획선으로 지연 여부를 판정합니다.
            </span>
          </div>
        )}
        {sm.has_plan && unassigned > 0 && (
          <div className={s.todo}>
            <span className={s.todoK}>다음 할 일</span>
            <span className={s.todoT}>
              남은 달 계획 합이 <b>{fmt(futurePlan)}개</b>인데 잔여는 <b>{fmt(sm.remaining_qty)}개</b> —
              <b> {fmt(unassigned)}개</b>가 계획에 안 잡혀 있습니다. 계획 재수립 또는 증산이 필요합니다.
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
