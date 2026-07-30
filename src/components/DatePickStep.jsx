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
import PageHeader from '@/components/common/PageHeader'
import { toInputDate, toYYMMDD } from '@/utils/dateConvert'
import s from './DatePickStep.module.css'

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
}) {
  return (
    <div className="page-flat">
      <PageHeader title={title} subtitle={subtitle} onBack={onBack} />
      <div className="process-content-inner">
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
        {lotPreview && <p className={s.lotPreview}>LOT: {lotPreview}</p>}
        <button className="btn-primary btn-lg btn-full" onClick={onNext}>{nextLabel}</button>
      </div>
    </div>
  )
}
