// 모터 종류 선택 섹션 — 라벨은 MOTOR_LABEL 중앙화 사용 (2026-05-02)
//   motor_type 목록은 ModelRegistry 에서 이 phi 에 등록된 것만 동적 노출 (하드코딩 outer/inner 대신, 2026-07-14).
//   axial 등 신규 motor_type 이 등록되면 자동으로 뜸. 미로드/미등록 시 전체(inner/outer/axial) fallback.
import { MOTOR_LABEL } from '@/constants/processConst'
import { useModels } from '@/hooks/useModels'
import s from '../InspectionForm.module.css'

const cx = (...classes) => classes.filter(Boolean).join(' ')
const ALL_MOTORS = Object.keys(MOTOR_LABEL)   // inner / outer / axial
const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x)

export default function MotorTypeSection({ phi, motor, setMotor, noMotorType }) {
  const { models } = useModels()
  const forPhi = [...new Set(
    (models || [])
      .filter((m) => m.is_active !== false && String(m.phi) === String(phi))
      .map((m) => m.motor_type)
      .filter(Boolean),
  )]
  const motorTypes = forPhi.length ? forPhi : ALL_MOTORS
  return (
    <div className={s.section}>
      <span className={s.label}>모터 종류</span>
      <div className={s.row}>
        {motorTypes.map((mt) => (
          <button
            key={mt}
            className={cx(s.btn, motor === mt && s.btnActive)}
            onClick={() => setMotor(mt)}
          >
            {cap(mt)} ({MOTOR_LABEL[mt] || mt})
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
