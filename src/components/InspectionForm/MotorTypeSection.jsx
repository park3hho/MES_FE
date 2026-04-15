// 모터 종류 (Outer/Inner) 선택 섹션
import s from '../InspectionForm.module.css'

const cx = (...classes) => classes.filter(Boolean).join(' ')

export default function MotorTypeSection({ motor, setMotor, noMotorType }) {
  return (
    <div className={s.section}>
      <span className={s.label}>모터 종류 (Outer/Inner)</span>
      <div className={s.row}>
        <button
          className={cx(s.btn, motor === 'outer' && s.btnActive)}
          onClick={() => setMotor('outer')}
        >
          Outer (외전)
        </button>
        <button
          className={cx(s.btn, motor === 'inner' && s.btnActive)}
          onClick={() => setMotor('inner')}
        >
          Inner (내전)
        </button>
      </div>
      {noMotorType && (
        <p style={{ color: 'var(--color-danger)', fontSize: 11, marginTop: 4 }}>
          미지정 시 R/L/K_T 기준값 없이 진행됩니다
        </p>
      )}
    </div>
  )
}
