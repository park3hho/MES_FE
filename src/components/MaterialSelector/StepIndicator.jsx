import s from './StepIndicator.module.css'

// 스텝 상태별 색상 — 동적이라 CSS로 못 빼고 객체로 정의
const STATE = {
  current: { background: 'var(--color-primary)', color: 'var(--color-white)', fontWeight: 700 },
  past:    { background: 'var(--color-border-dark)', color: 'var(--color-gray)', fontWeight: 500 },
  future:  { background: 'var(--color-border)', color: 'var(--color-gray-light)', fontWeight: 500 },
}

export function StepIndicator({ steps, currentStep, selections, autoValues = {} }) {
  return (
    <div className={s.container}>
      {steps.map((step, i) => {
        const state = i === currentStep ? 'current' : i < currentStep ? 'past' : 'future'
        return (
          <div key={step.key} className={s.item}>
            <span className={s.label} style={STATE[state]}>
              {autoValues[step.key] ?? selections[step.key] ?? step.label}
            </span>
            {i < steps.length - 1 && <span className={s.separator}>–</span>}
          </div>
        )
      })}
    </div>
  )
}