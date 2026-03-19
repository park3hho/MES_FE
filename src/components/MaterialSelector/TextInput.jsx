import s from './TextInput.module.css'

export function TextInput({ value, onChange, onSubmit }) {
  return (
    <div className={s.row}>
      <input
        type="text"
        placeholder="값을 입력하세요"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSubmit()}
        className={s.input}
      />
      {/* hover는 CSS .btn:hover로 처리 */}
      <button onClick={onSubmit} className={s.btn}>
        확인
      </button>
    </div>
  )
}