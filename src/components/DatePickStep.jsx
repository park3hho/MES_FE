// components/DatePickStep.jsx
// 작업일 선택 step — 밀린 작업을 실제 작업일자로 발급하기 위한 공용 화면 (2026-07-28).
//
// ⚠️ 왜 별도 step 이 필요한가:
//   `MaterialSelector` 는 `steps.filter((step) => !step.auto)` 로 **auto step 을 렌더링하지 않는다**.
//   EA_STEPS/BO_STEPS 의 date 는 `auto: true, editable: true` 인데 editable 을 해석하는 로직이 없어서,
//   STEPS 에 날짜가 정의돼 있어도 화면에는 절대 나오지 않는다. 그래서 날짜 변경은 이 step 으로 제공.
//
// ★ 2026-08-13 작업시간 + 정지(비가동) — 작업일지(work_log)를 여기서 전부 확정한다.
//   가동시간 = 작업시간 − 정지 합. 이 뺄셈만 맞으면 되므로 그 세 값을 한 화면에서 보여주고 확인시킨다.
//   · 시각은 datetime-local — 시각만 받으면 야간(전날 22:00 → 당일 01:00)을 표현할 수 없다.
//   · 종료 < 시작 이 '되지 않게' 입력 자체를 최소 1분 간격으로 clamp (경고가 아니라 차단).
//   · 등록된 휴게시간과 겹치는 만큼은 정지 목록에 **자동으로** 들어간다(점선 표시). 안 쉬었으면 지우면 됨.
//   · 정지는 '몇 분'이 아니라 **몇 시부터 몇 시까지**로 받는다 (2026-08-18). 분만 받으면 LOT N행에
//     균등 분배할 수밖에 없어 실제로 멈춘 행이 어디였는지가 사라진다.
//   · `onWorkTime` 을 넘긴 페이지에만 이 영역이 뜬다(안 넘기면 기존 화면 그대로 = 무회귀).
import { useEffect, useRef, useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { getWorkTimeSuggest, getWorkTimeBaseline } from '@/api'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import {
  dtLocalToMs, msToDtLocal, reDate, spanText, minText, MIN_SPAN_MS,
  autoBreakStops, mergeAutoStops, totalStopMin, runMinutes, newStopKey,
  stopMinutes, stopOutside, stopRangeText, nextStopStart, overlappingStop,
} from '@/utils/workTime'
import s from './DatePickStep.module.css'

const STEP_MS = 15 * 60 * 1000
const STOP_STEP_MS = 15 * 60 * 1000      // 새 정지의 기본 길이

export default function DatePickStep({
  today,                                          // useDate() 값 (YYMMDD) — 오늘 기준일
  value,                                          // 화면에 표시/적용 중인 날짜 (YYMMDD)
  onPick,                                         // (yymmdd | null) => void — 오늘과 같으면 null(override 해제)
  lotPreview = '',                                // 발급될 LOT 미리보기 (선택)
  onNext,
  onBack,
  title = '작업일을 선택해 주세요',
  subtitle = '밀린 작업이면 실제 작업 날짜를 선택하세요',
  nextLabel = '다음',
  topSlot = null,                                 // ReactNode: 콘텐츠 상단 슬롯 (흐름 인디케이터 등, 2026-07-30)
  workTime = null,                                // { start, end, stops, breaks, groups, autoGroup, source }
  onWorkTime = null,                              // (next) => void. 넘기면 작업시간·정지 영역이 켜진다
  worker = '',                                    // 시작시각 제안 조회용 작업자 코드
  line = '',                                      // 라인 ('회전자'|'고정자'). 근무 시작시각·휴게가 라인별이라
                                                  //   빠뜨리면 BE 기본값(회전자) 설정으로 프리필된다 (2026-09-02)
  timeGuard = null,                               // { process, product_code, phi, motor_type, qty } — 넘기면
                                                  //   개당 작업시간이 제품×공정 평균 ±20% 벗어날 때 발급 전 1회 경고(소프트)
}) {
  const showTime = typeof onWorkTime === 'function'
  const askedRef = useRef(false)
  const [adding, setAdding] = useState(false)
  // ── 이상치 경고 (2026-08-24) — 개당 작업시간(작업시간÷수량)이 제품×공정 과거 평균 대비 ±20% 벗어나면
  //   '다음' 을 한 번 막고 재확인시킨다. 기준치 조회 실패·표본 부족은 경고 없이 통과(발급을 막지 않는다).
  const [baseline, setBaseline] = useState(null)  // { avg_per_unit_min, dev_pct, n } | null
  const [warn, setWarn] = useState(null)          // { perUnit, avg, dev } | null

  const gp = timeGuard?.process || ''
  const gpc = timeGuard?.product_code || ''
  const gphi = timeGuard?.phi || ''
  const gmt = timeGuard?.motor_type || ''
  const gqty = Number(timeGuard?.qty) || 0
  useEffect(() => {
    if (!gp || gqty <= 0) { setBaseline(null); return }
    let alive = true
    // worker 는 이 발급에 기록될 작업자 코드와 같아야 그 작업자 이력으로 평균이 잡힌다(개인 페이스 반영).
    getWorkTimeBaseline({ process: gp, product_code: gpc, phi: gphi, motor_type: gmt, worker, line })
      .then((r) => { if (alive) setBaseline(r) })
      .catch(() => { if (alive) setBaseline(null) })   // 조회 실패 → 경고 생략
    return () => { alive = false }
  }, [gp, gpc, gphi, gmt, gqty, worker, line])

  // 서버 제안으로 프리필 — 시작(직전 종료 or 근무 시작시각) ~ 지금 + 휴게구간·사유목록. 1회만.
  useEffect(() => {
    if (!showTime || askedRef.current || workTime?.start) return
    askedRef.current = true
    let alive = true
    getWorkTimeSuggest({ worker, line })
      .then((r) => {
        if (!alive) return
        const autoGroup = r.auto_group || 'planned'
        onWorkTime({
          start: r.start, end: r.end, source: r.source,
          breaks: r.breaks || [], groups: r.stop_groups || {}, autoGroup,
          noteRequired: r.stop_note_required || [],   // 사유 메모 필수 카테고리 (BE 가 정함)
          stops: autoBreakStops(r.start, r.end, r.breaks, autoGroup),
        })
      })
      .catch(() => { /* 제안 실패해도 발급은 계속 — BE 가 자동 추정한다 */ })
    return () => { alive = false }
  }, [showTime, workTime, onWorkTime, worker])

  // 구간이 바뀌면 자동(휴게) 정지만 다시 계산 — 사람이 넣은 정지는 그대로 둔다
  const applyInterval = (next) => {
    onWorkTime({
      ...next,
      stops: mergeAutoStops(
        next.stops, autoBreakStops(next.start, next.end, next.breaks, next.autoGroup),
      ),
    })
  }

  // 종료 < 시작 이 아예 안 되게 clamp — 어느 쪽을 건드렸든 최소 1분 간격을 남긴다
  const commit = (key, ms) => {
    if (ms == null) return
    const other = dtLocalToMs(workTime?.[key === 'start' ? 'end' : 'start'])
    let next = ms
    if (other != null) {
      next = key === 'start' ? Math.min(next, other - MIN_SPAN_MS) : Math.max(next, other + MIN_SPAN_MS)
    }
    applyInterval({ ...workTime, [key]: msToDtLocal(next) })
  }

  const bump = (key, dir) => {
    const cur = dtLocalToMs(workTime?.[key])
    if (cur != null) commit(key, cur + dir * STEP_MS)
  }

  // 작업일을 바꾸면 시각의 날짜도 같이 옮긴다 (시간은 유지) — 두 곳을 따로 고치게 하지 않는다
  const pickDate = (isoDay) => {
    const yy = toYYMMDD(isoDay)
    onPick(yy === today ? null : yy)
    if (showTime && workTime?.start) {
      applyInterval({
        ...workTime,
        start: reDate(workTime.start, isoDay),
        end: reDate(workTime.end, isoDay),
      })
    }
  }

  const addStop = (st) => {
    onWorkTime({ ...workTime, stops: [...(workTime.stops || []), { key: newStopKey(), ...st }] })
    setAdding(false)
  }
  const removeStop = (key) =>
    onWorkTime({ ...workTime, stops: (workTime.stops || []).filter((x) => x.key !== key) })

  const ready = showTime && workTime?.start
  const workMin = ready ? Math.round((dtLocalToMs(workTime.end) - dtLocalToMs(workTime.start)) / 60000) : 0
  const stopMin = ready ? totalStopMin(workTime.stops, workTime.start, workTime.end) : 0
  const runMin = ready ? runMinutes(workTime.start, workTime.end, workTime.stops) : 0

  // 개당 작업시간(작업시간÷수량)이 제품×공정 평균 ±기준% 벗어나면 경고 정보 반환, 아니면 null.
  const evalGuard = () => {
    const avg = baseline?.avg_per_unit_min
    if (!gp || gqty <= 0 || !ready || !avg || avg <= 0) return null
    const perUnit = workMin / gqty
    const dev = ((perUnit - avg) / avg) * 100
    return Math.abs(dev) > (baseline?.dev_pct ?? 20) ? { perUnit, avg, dev } : null
  }
  // 소프트 차단 — 1차 시도는 경고 모달로 막고, '그대로 진행' 재확인 시 통과시킨다.
  //   기준치가 아직 로딩 중(baseline=null)이면 경고 없이 통과한다 — 발급을 절대 막지 않는다.
  const handleNext = () => {
    const g = evalGuard()
    if (g) { setWarn(g); return }
    onNext()
  }

  return (
    <div className="page-flat">
      <PageHeader title={title} subtitle={subtitle} onBack={onBack} />
      <div className="process-content-inner">
        {topSlot}
        <input
          type="date"
          className={s.dateInput}
          defaultValue={toInputDate(value)}
          onChange={(e) => pickDate(e.target.value)}
        />

        {ready && (
          <div className={s.timeBox}>
            <div className={s.timeHead}>
              <span className={s.timeLabel}>작업시간</span>
              <span className={s.timeSpan}>{spanText(workTime.start, workTime.end)}</span>
            </div>
            {['start', 'end'].map((key) => (
              <div key={key} className={s.timeRow}>
                <span className={s.timeCap}>{key === 'start' ? '시작' : '종료'}</span>
                <button type="button" className={s.stepBtn}
                  aria-label={`${key === 'start' ? '시작' : '종료'} 15분 앞으로`}
                  onClick={() => bump(key, -1)}>−</button>
                <input type="datetime-local" className={s.timeInput}
                  value={workTime[key] || ''}
                  onChange={(e) => commit(key, dtLocalToMs(e.target.value))} />
                <button type="button" className={s.stepBtn}
                  aria-label={`${key === 'start' ? '시작' : '종료'} 15분 뒤로`}
                  onClick={() => bump(key, 1)}>＋</button>
              </div>
            ))}
            <p className={s.timeHint}>
              {workTime.source === 'shift'
                ? '오늘 첫 작업이라 근무 시작시각부터 잡았어요'
                : '직전 작업이 끝난 시각부터 잡았어요'}
              {' · ± 15분 또는 직접 입력 (야간이면 날짜도 바꿔요)'}
            </p>

            {/* ── 정지(비가동) — 구간으로 기록한다 ── */}
            <div className={s.stopList}>
              {(workTime.stops || []).map((st) => {
                const out = stopOutside(st, workTime.start, workTime.end)
                return (
                  <div key={st.key}
                    className={`${s.stopItem} ${st.auto ? s.stopAuto : ''} ${out ? s.stopOut : ''}`}>
                    <span className={s.stopName}>
                      {st.note || st.category}
                      {st.auto && <em className={s.autoTag}>자동</em>}
                      <em className={s.stopRange}>{stopRangeText(st)}</em>
                    </span>
                    <span className={s.stopMin}>
                      {minText(stopMinutes(st, dtLocalToMs(workTime.start), dtLocalToMs(workTime.end)))}
                    </span>
                    <button type="button" className={s.stopDel}
                      aria-label="정지 삭제" onClick={() => removeStop(st.key)}>×</button>
                  </div>
                )
              })}
              {(workTime.stops || []).some((st) => stopOutside(st, workTime.start, workTime.end)) && (
                <p className={s.stopWarn}>회색 항목은 작업시간 밖이라 그만큼은 빠지지 않습니다.</p>
              )}
            </div>

            {adding ? (
              <StopPicker groups={workTime.groups} stops={workTime.stops}
                noteRequired={workTime.noteRequired}
                workStart={workTime.start} workEnd={workTime.end}
                defaultStart={nextStopStart(workTime.start, workTime.end, workTime.stops)}
                onAdd={addStop} onCancel={() => setAdding(false)} />
            ) : (
              <button type="button" className={s.addStop} onClick={() => setAdding(true)}>
                ＋ 비가동 시간 추가
              </button>
            )}

            {/* ── 요약 — 발급 전에 눈으로 한 번 더 확인시키는 자리 ── */}
            {/* 정지는 작업시간 안으로 잘려 합집합으로 세므로 비가동 > 작업시간 은 나올 수 없다 */}
            <div className={s.sumBox}>
              <div className={s.sumRow}><span>작업시간</span><b>{minText(workMin)}</b></div>
              <div className={s.sumRow}><span>비가동</span><b>{minText(stopMin)}</b></div>
              <div className={`${s.sumRow} ${s.sumMain}`}><span>가동시간</span><b>{minText(runMin)}</b></div>
            </div>
          </div>
        )}

        {lotPreview && <p className={s.lotPreview}>LOT: {lotPreview}</p>}
        <button className="btn-primary btn-lg btn-full" onClick={handleNext}>
          {nextLabel}
        </button>
      </div>

      {warn && (
        <div className="overlay" onClick={() => setWarn(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className={s.warnH}>⚠ 작업시간을 확인하세요</h3>
            <p className={s.warnText}>
              개당 작업시간이 <b>{minText(Math.round(warn.perUnit))}</b> 으로,
              이 작업자·제품·공정 평균 <b>{minText(Math.round(warn.avg))}</b> 대비{' '}
              <b className={warn.dev > 0 ? s.warnHi : s.warnLo}>
                {warn.dev > 0 ? '평소보다 깁니다' : '평소보다 짧습니다'} ({warn.dev > 0 ? '+' : ''}{Math.round(warn.dev)}%)
              </b>.
            </p>
            <p className={s.warnSub}>
              시간이 맞으면 그대로 진행하고, 잘못 입력했다면 작업시간을 다시 확인하세요.
            </p>
            <div className={s.warnBtns}>
              <button type="button" className="btn-secondary btn-md" onClick={() => setWarn(null)}>
                다시 확인
              </button>
              <button type="button" className="btn-primary btn-md"
                onClick={() => { setWarn(null); onNext() }}>
                그대로 진행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════
// 정지 사유 선택 — 그룹 → 사유 → 구간. 사유 목록은 서버(STOP_GROUPS)가 준다.
//   기본 구간은 '마지막 정지가 끝난 시각부터 15분' — 대개 그대로 두거나 종료만 밀면 된다.
// ══════════════════════════════════════════════════
function StopPicker({ groups, stops, noteRequired, workStart, workEnd, defaultStart, onAdd, onCancel }) {
  const keys = Object.keys(groups || {})
  const [group, setGroup] = useState(keys[0] || '')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [start, setStart] = useState(defaultStart || workStart || '')
  const [end, setEnd] = useState(() => {
    const a = dtLocalToMs(defaultStart || workStart)
    const b = dtLocalToMs(workEnd)
    if (a == null) return ''
    return msToDtLocal(b == null ? a + STOP_STEP_MS : Math.min(a + STOP_STEP_MS, b))
  })

  const items = groups?.[group]?.items || []
  const spanMin = stopMinutes({ start, end })
  // 겹치면 BE 가 뒤엣것을 도려내 사유가 통째로 사라질 수 있다 — 여기서 막는다
  const clash = overlappingStop(stops, start, end)
  // '기타' 같은 뭉뚱그린 사유는 메모가 있어야 나중에 무슨 일이었는지 복원된다 (목록은 BE 가 준다)
  const needNote = (noteRequired || []).includes(category)
  const ok = group && category && spanMin > 0 && !clash && (!needNote || note.trim())

  // 종료 < 시작 이 안 되게 clamp — 작업시간 입력과 같은 규칙
  const setSpan = (key, v) => {
    const ms = dtLocalToMs(v)
    if (ms == null) return
    if (key === 'start') {
      setStart(v)
      const e = dtLocalToMs(end)
      if (e != null && e <= ms) setEnd(msToDtLocal(ms + MIN_SPAN_MS))
    } else {
      const a = dtLocalToMs(start)
      setEnd(a != null && ms <= a ? msToDtLocal(a + MIN_SPAN_MS) : v)
    }
  }

  return (
    <div className={s.picker}>
      {/* 중분류 = 세그먼트 탭 (한 줄에 붙여 '탭'으로 보이게) — 소분류 칩과 형태 자체를 다르게 해
          계층을 눈으로 구분한다. 이전엔 둘 다 같은 pill 이라 어느 쪽이 상위인지 안 보였음 (2026-08-14) */}
      <div className={s.gTabs} role="tablist">
        {keys.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={group === g}
            className={`${s.gTab} ${group === g ? s.gTabOn : ''}`}
            onClick={() => { setGroup(g); setCategory('') }}>{groups[g].label}</button>
        ))}
      </div>

      {/* 소분류 = 선택된 중분류에 속한 사유. 라벨 + 들여쓰기로 하위임을 명시 */}
      <div className={s.cWrap}>
        <span className={s.cLabel}>{groups[group]?.label || ''} 사유</span>
        <div className={s.cRow}>
          {items.map((c) => (
            <button key={c} type="button"
              className={`${s.cBtn} ${category === c ? s.cOn : ''}`}
              aria-pressed={category === c}
              onClick={() => { setCategory(c); setNote('') }}>{c}</button>
          ))}
        </div>
      </div>
      {needNote && (
        <label className={s.noteRow}>
          <span className={s.cLabel}>사유 (필수)</span>
          <input className={s.noteInput} value={note} maxLength={100} autoFocus
            placeholder="예: 정전으로 라인 정지"
            onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      <div className={s.spanWrap}>
        {['start', 'end'].map((key) => (
          <label key={key} className={s.spanRow}>
            <span className={s.spanCap}>{key === 'start' ? '정지' : '재개'}</span>
            <input type="datetime-local" className={s.spanInput}
              value={key === 'start' ? start : end}
              onChange={(e) => setSpan(key, e.target.value)} />
          </label>
        ))}
        <span className={`${s.spanMin} ${clash ? s.spanBad : ''}`}>
          {clash
            ? `'${clash.note || clash.category}' 와 겹칩니다 (${stopRangeText(clash)})`
            : (spanMin > 0 ? minText(spanMin) : '구간을 확인해 주세요')}
        </span>
      </div>
      <div className={s.pickBottom}>
        <button type="button" className={s.pickCancel} onClick={onCancel}>취소</button>
        <button type="button" className={s.pickAdd} disabled={!ok}
          onClick={() => onAdd({ group, category, start, end, auto: false, note: note.trim() })}>
          추가
        </button>
      </div>
    </div>
  )
}
