// pages/cert/sheet/UBCard.jsx
// UB 그리드 카드 — UB 번호 + Φ × N + 봉인 테이프 (CertFlow 분할, 2026-05-08).
//   - 호버: 좌측이 살짝 뜯어진 듯 약간 회전
//   - 클릭: 테이프 완전히 뜯어지며 카드가 살짝 떠오름 (박스 열리는 느낌) → navigate

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSeal } from './SealBand'
import s from '../CertFlow.module.css'

export default function UBCard({ ub, onClick }) {
  // BE seal_key 규약 — 'ub:{ub_lot_no}' (Phase D 확장, 2026-05-02)
  const sealKey = `ub:${ub.lot_no}`
  const [opened, openSeal] = useSeal(sealKey)
  const [hovered, setHovered] = useState(false)
  // 두 상태 분리:
  //   tearing — 봉인지 뜯어지는 애니. 안 열린 박스 첫 클릭만.
  //   opening — 박스 오픈 모션. 클릭마다 항상 (열린 박스 재클릭도).
  const [tearing, setTearing] = useState(false)
  const [opening, setOpening] = useState(false)
  const m = ub.model_breakdown?.[0]
  const phi = m?.phi || ''
  const color = m?.color_hex || '#9CA3AF'

  const handleClick = () => {
    if (opening) return // 더블 클릭 방지
    setOpening(true)
    // 봉인지는 안 열린 박스에만 — 첫 클릭만 적용
    if (!opened) setTearing(true)
    const delay = opened ? 220 : 480
    setTimeout(() => {
      if (!opened) openSeal()
      onClick?.(ub.lot_no)
    }, delay)
  }

  // 테이프 motion — 단순 fade (초기 버전 복원, 2026-04-29)
  //   tearing: scaleX 0 + opacity 0
  //   hover:   좌측 살짝 들림
  //   idle:    평평
  const tapeAnimate = tearing
    ? { scaleX: 0, opacity: 0 }
    : hovered
      ? { rotate: -4, y: -1, opacity: 1 }
      : { rotate: 0, y: 0, opacity: 1 }
  const tapeTransition = tearing
    ? { duration: 0.45, ease: [0.55, 0, 0.65, 0.5] }
    : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }

  return (
    <motion.button
      type="button"
      className={s.ubCard}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // 박스 오픈 모션 — 매 클릭마다 (opened 여부 무관)
      animate={opening ? { y: -4, scale: 1.02 } : { y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={s.ubCardLot}>{ub.lot_no}</div>
      <div className={s.ubCardSpec}>{phi ? `Φ${phi} × ${ub.st_count}` : `ST ${ub.st_count}`}</div>

      {/* 봉인 테이프 — 안 열린 박스만 표시. 단순 fade (초기 버전) */}
      <AnimatePresence>
        {!opened && (
          <motion.div
            className={s.ubCardTape}
            initial={{ scaleX: 1, rotate: 0, y: 0, opacity: 1 }}
            animate={tapeAnimate}
            exit={{ scaleX: 0, opacity: 0 }}
            transition={tapeTransition}
            style={{ background: color }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
    </motion.button>
  )
}
