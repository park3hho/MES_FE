// pages/cert/sheet/ModelButton.jsx
// 결합 도면 버튼 — ST + RT 합성, RT 만 회전 (외전형은 바깥 RT, 내전형은 가운데 RT).
// 봉인지 띠는 모델 카드 직접 클릭 OR 산하 UB 중 하나라도 열렸으면 사라짐 (CertFlow 분할, 2026-05-08).

import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSeals } from '../SealsContext'
import { drawingSrc, PHI_PAIR } from '../lib/boxLayout'
import { SealBand, randomRotateDelta } from './SealBand'
import s from '../CertFlow.module.css'

// ubLotNos: 이 mb 안 같은 phi/motor 의 UB lot_no 배열 (2026-05-08).
//   모델 카드 직접 클릭 OR 그 안 UB 중 하나라도 열렸으면 SEALED 사라짐 — 일관성.
export default function ModelButton({
  phi, motor, label, color, mbLotNo, ubLotNos = [], selected, onSelect,
}) {
  // BE seal_key 규약 — 'mb:{mb}:{phi}_{motor}' (Phase D 확장, 2026-05-02)
  const sealKey = `mb:${mbLotNo}:${phi}_${motor}`
  const { isOpen, openSeal: openSealRaw } = useSeals()
  // 모델 직접 열림 OR 산하 UB 중 하나라도 열림 — 둘 중 하나라도 true 면 봉인 해제 표시
  const opened = isOpen(sealKey) || ubLotNos.some((u) => isOpen(`ub:${u}`))
  const openSeal = useCallback(() => openSealRaw(sealKey), [openSealRaw, sealKey])
  const [rotation, setRotation] = useState(0)

  // motor_type 별 ST/RT 자리 결정. legacy 빈 값 → inner 가정
  const motorEff = motor || 'inner'
  const isOuter = motorEff === 'outer'
  // SVG 전환 (2026-05-04) — drawingSrc 와 일치
  const rotorSrc = drawingSrc(phi, motorEff, 'rotor')
  const statorSrc = drawingSrc(phi, motorEff, 'stator')

  // 안쪽 도면 (작은 쪽) 의 너비 % — PHI_PAIR 비율
  const base = parseFloat(phi) || 70
  const pair = PHI_PAIR[phi] || base * 0.76
  const innerSizePct = (pair / base) * 100

  const handleClick = () => {
    setRotation((r) => r + randomRotateDelta())
    if (!opened) openSeal()
    onSelect?.()
  }
  const handleHover = () => {
    setRotation((r) => r + randomRotateDelta() * 0.3)
  }

  // 회전 도면: motor 따라 outer/inner 자리 swap
  const RotorImg = (
    <motion.img
      src={rotorSrc}
      alt=""
      className={isOuter ? s.modelLayerOuter : s.modelLayerInner}
      style={isOuter ? undefined : { width: `${innerSizePct}%`, height: `${innerSizePct}%` }}
      animate={{ rotate: rotation }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      draggable="false"
    />
  )
  const StatorImg = (
    <img
      src={statorSrc}
      alt=""
      className={isOuter ? s.modelLayerInner : s.modelLayerOuter}
      style={isOuter ? { width: `${innerSizePct}%`, height: `${innerSizePct}%` } : undefined}
      onError={(e) => {
        e.currentTarget.style.opacity = '0.25'
      }}
      draggable="false"
    />
  )

  return (
    <button
      type="button"
      className={`${s.modelBtn} ${selected ? s.modelBtnSelected : ''}`}
      onClick={handleClick}
      onMouseEnter={handleHover}
      style={{ '--model-color': color }}
    >
      <div className={s.modelDrawing}>
        {/* 바깥 → 안 순서로 z-index 쌓기 */}
        {isOuter ? (
          <>
            {RotorImg}
            {StatorImg}
          </>
        ) : (
          <>
            {StatorImg}
            {RotorImg}
          </>
        )}
        {/* 봉인지 띠 — 안 열렸을 때만 */}
        <AnimatePresence>{!opened && <SealBand color={color} />}</AnimatePresence>
      </div>
      <div className={s.modelLabel}>{label}</div>
    </button>
  )
}
