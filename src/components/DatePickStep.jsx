// components/DatePickStep.jsx
// 작업일 선택 step — 밀린 작업을 실제 작업일자로 발급하기 위한 공용 화면 (2026-07-28).
//
// ⚠️ 왜 별도 step 이 필요한가:
//   `MaterialSelector` 는 `steps.filter((step) => !step.auto)` 로 **auto step 을 렌더링하지 않는다**.
//   EA_STEPS/BO_STEPS 의 date 는 `auto: true, editable: true` 인데 editable 을 해석하는 로직이 없어서,
//   STEPS 에 날짜가 정의돼 있어도 화면에는 절대 나오지 않는다. 그래서 날짜 변경은 이 step 으로 제공.
//
// EAPage 의 기존 date_pick 마크업을 컴포넌트화한 것 — REA/RBO(로터 라인)에 적용.
//   (EA/BO 는 동작 중인 인라인 구현을 그대로 둠. 나중에 이 컴포넌트로 통합 가능.)
//
// ★ 2026-08-12 작업시간 추가 — 작업일지(work_log)의 구간을 여기서 확정한다.
//   `onWorkTime` 을 넘긴 페이지에만 시간 구간이 뜬다(안 넘기면 기존 화면 그대로 = 무회귀).
//   값은 서버 제안(직전 작업 종료 ~ 지금)으로 미리 채워지고, 필요할 때만 손대면 된다.
//
// ★ 2026-08-13 시각에 날짜 포함 + 역전 차단
//   · 시각을 HH:MM 만 받으면 야간(전날 22:00 → 당일 01:00) 작업을 표현할 방법이 없다 → datetime-local.
//   · 작업일을 바꾸면 시작·종료의 날짜도 같이 따라간다(시간은 유지) — 두 곳을 따로 고치게 하지 않는다.
//   · 종료 < 시작 이 '되지 않게' 한다. 경고를 띄우는 게 아니라 **입력 자체를 최소 1분 간격으로 clamp**.
import { useEffect, useRef } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { getWorkTimeSuggest } from '@/api'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import { dtLocalToMs, msToDtLocal, reDate, spanText, MIN_SPAN_MS } from '@/utils/workTime'
import s from './DatePickStep.module.css'

const STEP_MS = 15 * 60 * 1000

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
  workTime = null,                                // { start, end } — 'YYYY-MM-DDTHH:MM' (datetime-local)
  onWorkTime = null,                              // (next) => void. 넘기면 시간 구간 UI 가 켜진다
  worker = '',                                    // 시작시각 제안 조회용 작업자 코드
}) {
  const showTime = typeof onWorkTime === 'function'
  const askedRef = useRef(false)

  // 서버 제안으로 프리필 — 직전 작업 종료(없으면 근무 시작시각) ~ 지금. 1회만.
  useEffect(() => {
    if (!showTime || askedRef.current || workTime?.start) return
    askedRef.current = true
    let alive = true
    getWorkTimeSuggest({ worker })
      .then((r) => { if (alive) onWorkTime({ start: r.start, end: r.end, source: r.source }) })
      .catch(() => { /* 제안 실패해도 발급은 계속 — BE 가 자동 추정한다 */ })
    return () => { alive = false }
  }, [showTime, workTime, onWorkTime, worker])

  // 종료 < 시작 이 아예 안 되게 clamp — 어느 쪽을 건드렸든 최소 1분 간격을 남긴다
  const commit = (key, ms) => {
    if (ms == null) return
    const other = dtLocalToMs(workTime?.[key === 'start' ? 'end' : 'start'])
    let next = ms
    if (other != null) {
      if (key === 'start') next = Math.min(next, other - MIN_SPAN_MS)
      else next = Math.max(next, other + MIN_SPAN_MS)
    }
    onWorkTime({ ...workTime, [key]: msToDtLocal(next) })
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
      onWorkTime({
        ...workTime,
        start: reDate(workTime.start, isoDay),
        end: reDate(workTime.end, isoDay),
      })
    }
  }

  const span = showTime ? spanText(workTime?.start, workTime?.end) : ''

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

        {showTime && workTime?.start && (
          <div className={s.timeBox}>
            <div className={s.timeHead}>
              <span className={s.timeLabel}>작업 시간</span>
              <span className={s.timeSpan}>{span}</span>
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
              {' · 틀리면 ± 15분 또는 직접 입력 (야간 작업이면 날짜도 바꿔요)'}
            </p>
          </div>
        )}

        {lotPreview && <p className={s.lotPreview}>LOT: {lotPreview}</p>}
        <button className="btn-primary btn-lg btn-full" onClick={onNext}>{nextLabel}</button>
      </div>
    </div>
  )
}
