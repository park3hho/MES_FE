// components/QcWizard.jsx
// 토스형 wizard 프리미티브 — 한 화면 한 질문 (2026-06-01)
//   IQ/IPQ 검사 입력에서 공용. 큰 헤드라인 + 선택 즉시 진행 + 하단 풀폭 버튼.
//
// 구성:
//   <WizardShell>  — 상단 진행바 + 누적 답변 칩 + 본문 슬롯
//   <Question>     — 큰 질문 헤드라인 + 컨트롤 + (선택) 하단 footer
//   <BigChoice>    — 큰 선택 버튼 리스트 (탭 즉시 onPick)
//   <BigInput>     — 큰 인라인 입력
//   <PrimaryButton>/<GhostButton> — 하단 액션
import s from './QcWizard.module.css'


// 전체 셸 — 진행바 + 답변 칩 + 본문
export function WizardShell({ stepIndex, total, onBack, chips = [], children }) {
  const pct = total > 1 ? (stepIndex / (total - 1)) * 100 : 0
  return (
    <div className={s.shell}>
      <div className={s.top}>
        <button className={s.back} onClick={onBack} aria-label="뒤로">←</button>
        <div className={s.progress}>
          <div className={s.progressFill} style={{ width: `${pct}%` }} />
        </div>
        <span className={s.counter}>{stepIndex + 1}/{total}</span>
      </div>

      {chips.length > 0 && (
        <div className={s.chips}>
          {chips.map((c) => (
            <button key={c.key} className={s.chip} onClick={c.onClick} title="이 단계로 이동">
              <span className={s.chipLabel}>{c.label}</span>
              <span className={s.chipValue}>{c.value}</span>
            </button>
          ))}
        </div>
      )}

      <div className={s.body}>{children}</div>
    </div>
  )
}


// 한 질문 — 큰 헤드라인 + 컨트롤 + 하단 footer
export function Question({ title, sub, children, footer }) {
  return (
    <div className={s.question}>
      <div className={s.qHead}>
        <h1 className={s.qTitle}>{title}</h1>
        {sub && <p className={s.qSub}>{sub}</p>}
      </div>
      <div className={s.qControl}>{children}</div>
      {footer && <div className={s.footer}>{footer}</div>}
    </div>
  )
}


// 선택 리스트 — 탭 즉시 onPick (자동 진행)
// options: ['a','b'] 또는 [{value,label,desc}]
export function BigChoice({ options, value, onPick }) {
  return (
    <div className={s.choices}>
      {options.map((o) => {
        const val = o.value ?? o
        const label = o.label ?? o
        const on = value === val
        return (
          <button
            key={val}
            type="button"
            className={`${s.choice} ${on ? s.choiceOn : ''}`}
            onClick={() => onPick(val)}
          >
            <span className={s.choiceLabel}>{label}</span>
            {o.desc && <span className={s.choiceDesc}>{o.desc}</span>}
            <span className={s.choiceArrow}>{on ? '✓' : '›'}</span>
          </button>
        )
      })}
    </div>
  )
}


// 큰 인라인 입력 (텍스트/숫자/날짜)
export function BigInput(props) {
  return <input className={s.bigInput} {...props} />
}


// 하단 풀폭 기본 버튼
export function PrimaryButton({ children, ...props }) {
  return <button type="button" className={s.primary} {...props}>{children}</button>
}


// 건너뛰기/보조 텍스트 버튼
export function GhostButton({ children, ...props }) {
  return <button type="button" className={s.ghost} {...props}>{children}</button>
}
