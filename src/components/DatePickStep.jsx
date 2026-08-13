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
import { useEffect, useRef } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { getWorkTimeSuggest } from '@/api'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import s from './DatePickStep.module.css'

const STEP_MIN = 15

const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}
const toHHMM = (min) => {
  const v = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}
const spanText = (start, end) => {
  const a = toMin(start); const b = toMin(end)
  if (a == null || b == null) return ''
  const d = b - a
  if (d <= 0) return '종료가 시작보다 빨라요'
  return d >= 60 ? `${Math.floor(d / 60)}시간 ${d % 60}분` : `${d}분`
}

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
  workTime = null,                                // { start:'HH:MM', end:'HH:MM' } — 작업일지 구간
  onWorkTime = null,                              // (next) => void. 넘기면 시간 구간 UI 가 켜진다
  worker = '',                                    // 시작시각 제안 조회용 작업자 코드
}) {
  const showTime = typeof onWorkTime === 'function'
  const askedRef = useRef(false)

  // 서버 제안으로 프리필 — 직전 작업 종료(없으면 근무 시작시각) ~ 지금. 1회만.
  useEffect(() => {
    if (!showTime || askedRef.current || (workTime && workTime.start)) return
    askedRef.current = true
    let alive = true
    getWorkTimeSuggest({ worker })
      .then((r) => { if (alive) onWorkTime({ start: r.start, end: r.end, source: r.source }) })
      .catch(() => { /* 제안 실패해도 발급은 계속 — BE 가 자동 추정한다 */ })
    return () => { alive = false }
  }, [showTime, workTime, onWorkTime, worker])

  const bump = (key, delta) => {
    const cur = toMin(workTime?.[key])
    if (cur == null) return
    onWorkTime({ ...workTime, [key]: toHHMM(cur + delta * STEP_MIN) })
  }
  const set = (key, v) => onWorkTime({ ...workTime, [key]: v })

  const span = showTime && workTime ? spanText(workTime.start, workTime.end) : ''
  const invalid = showTime && workTime && toMin(workTime.end) <= toMin(workTime.start)

  return (
    <div className="page-flat">
      <PageHeader title={title} subtitle={subtitle} onBack={onBack} />
      <div className="process-content-inner">
        {topSlot}
        <input
          type="date"
          className={s.dateInput}
          defaultValue={toInputDate(value)}
          onChange={(e) => {
            const yy = toYYMMDD(e.target.value)
            // 오늘로 되돌리면 null → 호출부의 override 상태가 풀려 useDate() 값을 다시 따라감
            onPick(yy === today ? null : yy)
          }}
        />

        {showTime && workTime && (
          <div className={s.timeBox}>
            <div className={s.timeHead}>
              <span className={s.timeLabel}>작업 시간</span>
              <span className={`${s.timeSpan} ${invalid ? s.timeBad : ''}`}>{span}</span>
            </div>
            {['start', 'end'].map((key) => (
              <div key={key} className={s.timeRow}>
                <span className={s.timeCap}>{key === 'start' ? '시작' : '종료'}</span>
                <button type="button" className={s.stepBtn}
                  aria-label={`${key === 'start' ? '시작' : '종료'} 15분 앞으로`}
                  onClick={() => bump(key, -1)}>−</button>
                <input type="time" className={s.timeInput}
                  value={workTime[key] || ''} onChange={(e) => set(key, e.target.value)} />
                <button type="button" className={s.stepBtn}
                  aria-label={`${key === 'start' ? '시작' : '종료'} 15분 뒤로`}
                  onClick={() => bump(key, 1)}>＋</button>
              </div>
            ))}
            <p className={s.timeHint}>
              {workTime.source === 'shift'
                ? '오늘 첫 작업이라 근무 시작시각부터 잡았어요'
                : '직전 작업이 끝난 시각부터 잡았어요'}
              {' · 틀리면 ± 15분 또는 직접 입력'}
            </p>
          </div>
        )}

        {lotPreview && <p className={s.lotPreview}>LOT: {lotPreview}</p>}
        <button className="btn-primary btn-lg btn-full" onClick={onNext} disabled={invalid}>
          {nextLabel}
        </button>
      </div>
    </div>
  )
}
