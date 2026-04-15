import s from './TextInput.module.css'

export function TextInput({ value, onChange, onSubmit }) {
  return (
    <div className={s.row}>
      <input
        type="text"
        placeholder="값을 입력하세요"
        value={value}
        // 작업자/벤더/두께 등 코드성 입력 — 소문자 입력해도 자동 대문자 변환
        onChange={e => onChange(e.target.value.toUpperCase())}
        onKeyDown={e => e.key === 'Enter' && onSubmit()}
        className={s.input}
        autoCapitalize="characters"
      />
      {/* hover는 CSS .btn:hover로 처리 */}
      <button onClick={onSubmit} className={s.btn}>
        확인
      </button>
    </div>
  )
}