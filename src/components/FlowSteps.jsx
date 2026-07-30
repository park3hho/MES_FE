// components/FlowSteps.jsx
// 흐름 단계 인디케이터 (2026-07-30) — 여러 컴포넌트로 흩어진 스텝을 하나로 세어 표시.
//   각 스텝이 독립 화면이라도 이걸 공통으로 얹어 "N번째 / 전체 M" 를 일관되게 보여줌.
//   steps: string[] (스텝 라벨), current: number (0-based 현재 인덱스; 범위 밖이면 강조 없음)
import { Fragment } from 'react'
import s from './FlowSteps.module.css'

export default function FlowSteps({ steps, current }) {
  if (!steps || steps.length === 0) return null
  return (
    <div className={s.wrap} role="list" aria-label="진행 단계">
      {steps.map((label, i) => {
        const state = i === current ? s.current : i < current ? s.done : s.future
        return (
          <Fragment key={i}>
            <div className={`${s.step} ${state}`} role="listitem"
              aria-current={i === current ? 'step' : undefined}>
              <span className={s.dot}>{i < current ? '✓' : i + 1}</span>
              <span className={s.label}>{label}</span>
            </div>
            {i < steps.length - 1 && <span className={s.sep} aria-hidden="true" />}
          </Fragment>
        )
      })}
    </div>
  )
}
