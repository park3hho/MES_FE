import s from './OptionButtons.module.css'

export function OptionButtons({ options, onSelect, etc, onEtcChange, onEtcSubmit, size = 'md' }) {
  const btnClass = size === 'sm' ? s.btnSm : s.btn

  return (
    <>
      <div className={size === 'sm' ? s.gridSm : s.grid}>
        {options.map((opt) => {
          const label = typeof opt === 'object' ? opt.label : opt
          const value = typeof opt === 'object' ? opt.value : opt
          const num = parseInt(value)
          const isExternal  = !isNaN(num) && num >= 61
          const isOutsource = !isNaN(num) && num >= 31 && num < 61

          // 조건별 색상 — hover는 onMouseEnter/Leave로 유지 (CSS Module에서 동적 색상 처리 어려움)
          const base  = isExternal ? '#7c6fcd' : isOutsource ? '#c9732e' : '#1a2f6e'
          const hover = isExternal ? '#9688e0' : isOutsource ? '#e0854a' : '#2a3f8e'

          return (
            <button
              key={value}
              onClick={() => onSelect(value)}
              className={btnClass}
              style={{ background: base }}
              onMouseEnter={e => e.currentTarget.style.background = hover}
              onMouseLeave={e => e.currentTarget.style.background = base}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className={s.etcRow}>
        <input
          type="text"
          placeholder="직접 입력 (ETC)"
          value={etc}
          onChange={e => onEtcChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onEtcSubmit()}
          className={s.input}
        />
        {/* hover는 CSS .etcBtn:hover로 처리 — onMouseEnter/Leave 제거 */}
        <button onClick={onEtcSubmit} className={s.etcBtn}>
          확인
        </button>
      </div>
    </>
  )
}