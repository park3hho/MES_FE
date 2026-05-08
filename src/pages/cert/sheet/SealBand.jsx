// pages/cert/sheet/SealBand.jsx
// 봉인지 띠 + 회전 헬퍼 + seal hook (CertFlow 분할, 2026-05-08)
//
// useSeal — 회사 단위 DB 동기 (Phase D, 2026-05-02). 호출처: ModelButton, UBCard.
// SealBand — 안 열린 모델/박스 위에 띄우는 띠. 호출처: ModelButton.

import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { useSeals } from '../SealsContext'
import s from '../CertFlow.module.css'

// 봉인지 영속 — 회사 단위 DB (Phase D 확장, 2026-05-02).
// key 형식: 'mb:{mb}:{phi}_{motor}' 또는 'ub:{ub_lot_no}' (BE seal_key 와 동일).
export function useSeal(key) {
  const { isOpen, openSeal } = useSeals()
  const opened = isOpen(key)
  const open = useCallback(() => {
    openSeal(key)
  }, [openSeal, key])
  return [opened, open]
}

// 호버/클릭 시 RT 회전 — 누적식. 매번 ±60°~±240° 랜덤 추가.
export function randomRotateDelta() {
  const sign = Math.random() < 0.5 ? -1 : 1
  return sign * (60 + Math.random() * 180)
}

// 봉인지 띠 — 단순 fade (초기 버전 복원, 2026-04-29)
export function SealBand({ color }) {
  return (
    <motion.div
      className={s.sealBand}
      initial={{ scaleX: 1, opacity: 1 }}
      animate={{ scaleX: 1, opacity: 1 }}
      exit={{ scaleX: 0, opacity: 0 }}
      transition={{ duration: 0.55, ease: [0.55, 0, 0.65, 0.5] }}
      style={{ background: color }}
    >
      <span className={s.sealText}>SEALED</span>
    </motion.div>
  )
}
