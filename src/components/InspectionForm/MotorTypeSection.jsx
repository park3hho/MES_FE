// 모터 종류 (Outer/Inner) 선택 섹션
// 라벨은 MOTOR_LABEL 중앙화 사용 (2026-05-02)
import { MOTOR_LABEL } from '@/constants/processConst'
import s from '../InspectionForm.module.css'

const cx = (...classes) => classes.filter(Boolean).join(' ')

// OQ 검사 단계는 outer/inner 두 종류만 지원 (axial 은 미정의 — 추후 확장 시 phi 별 motorOptions 동적화 검토)
const MOTOR_TYPES = ['outer', 'inner']

export default function MotorTypeSection({ motor, setMotor, noMotorType }) {
  return (
    <div className={s.section}>
      <span className={s.label}>모터 종류 ({MOTOR_LABEL.outer}/{MOTOR_LABEL.inner})</span>
      <div className={s.row}>
        {MOTOR_TYPES.map((mt) => (
          <button
            key={mt}
            className={cx(s.btn, motor === mt && s.btnActive)}
            onClick={() => setMotor(mt)}
          >
            {mt === 'outer' ? 'Outer' : 'Inner'} ({MOTOR_LABEL[mt]})
          </button>
        ))}
      </div>
      {noMotorType && (
        <p style={{ color: 'var(--color-danger)', fontSize: 11, marginTop: 4 }}>
          미지정 시 R/L/K_T 기준값 없이 진행됩니다
        </p>
      )}
    </div>
  )
}
