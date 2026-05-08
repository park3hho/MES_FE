// src/components/InspectionForm/ModelChangeModal.jsx
// OQ 검사 시 발견된 모델 (phi/motor_type) 잘못 입력 정정 모달 (2026-05-08)
// 컬러 카드 그리드 — ModelRegistry 의 color_hex 활용. Toss flat.

import { useState } from 'react'
import { useModels } from '@/hooks/useModels'
import { correctLotModel } from '@/api'
import { MOTOR_LABEL } from '@/constants/processConst'
import s from './ModelChangeModal.module.css'

export default function ModelChangeModal({
  lotNo,                  // 정정 대상 LOT (보통 SO LOT)
  currentPhi,
  currentMotor,
  onClose,
  onChanged,              // (newPhi, newMotor) → void — 부모가 spec 재계산
}) {
  const { models } = useModels()
  const [selected, setSelected] = useState(null)   // 선택된 모델 dict
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // 활성 모델 — Provider 가 active_only=true 라 활성만. display_order 정렬은 Context 에서 이미.
  const visible = (models || []).filter((m) => m.is_active)

  const isCurrent = (m) =>
    m.phi === String(currentPhi) && m.motor_type === currentMotor

  const handleConfirm = async () => {
    if (!selected) return
    if (selected.phi === String(currentPhi) && selected.motor_type === currentMotor) {
      setError('현재와 같은 모델입니다.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await correctLotModel(lotNo, selected.phi, selected.motor_type)
      const aff = result.affected || {}
      const total = Object.values(aff).reduce((a, b) => a + b, 0)
      onChanged?.(selected.phi, selected.motor_type, total)
    } catch (e) {
      setError(e.message || '정정 실패')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={s.overlay} onClick={() => !submitting && onClose?.()}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <div>
            <h2 className={s.title}>모델 변경</h2>
            <p className={s.subtitle}>
              {lotNo} · 현재 Φ{currentPhi || '?'} {MOTOR_LABEL[currentMotor] || currentMotor || '?'}
            </p>
          </div>
          <button
            type="button"
            className={s.closeBtn}
            onClick={onClose}
            disabled={submitting}
            aria-label="닫기"
          >✕</button>
        </div>

        <p className={s.warn}>
          ⚠ chain 전체 (재고 / LOT / 검사) 일괄 갱신됩니다. 신중히 선택해주세요.
        </p>

        <div className={s.grid}>
          {visible.map((m) => {
            const isCur = isCurrent(m)
            const isSel = selected?.id === m.id
            return (
              <button
                key={m.id}
                type="button"
                className={`${s.card} ${isSel ? s.cardSelected : ''} ${isCur ? s.cardCurrent : ''}`}
                onClick={() => !isCur && setSelected(m)}
                disabled={submitting || isCur}
                title={isCur ? '현재 모델' : ''}
              >
                <span
                  className={s.colorDot}
                  style={{ background: m.color_hex || '#9ca3af' }}
                />
                <span className={s.label}>{m.label}</span>
                <span className={s.meta}>
                  Φ{m.phi} · {MOTOR_LABEL[m.motor_type] || m.motor_type}
                </span>
                {isCur && <span className={s.currentBadge}>현재</span>}
              </button>
            )
          })}
        </div>

        {error && <p className={s.errMsg}>⚠ {error}</p>}

        <div className={s.footer}>
          <button
            type="button"
            className="btn-secondary btn-md"
            onClick={onClose}
            disabled={submitting}
          >취소</button>
          <button
            type="button"
            className="btn-primary btn-md"
            onClick={handleConfirm}
            disabled={!selected || submitting}
          >{submitting ? '정정 중...' : '변경'}</button>
        </div>
      </div>
    </div>
  )
}
