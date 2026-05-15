// pages/cert/sheet/BoxFrame.jsx
// 박스 outline + 안 ST/RT 동그라미 (CertFlow 분할, 2026-05-08).
// 박스 가로 = 100% 기준, 동그라미 width = (지름/박스가로) × 100%.
// compact 박스 (Φ70/Φ87) — ST + RT 가로 한 줄.
// 다중 자리 (Φ45/Φ20) — ST 행 + RT 행 (위/아래).

import { useEffect, useState } from 'react'
import { motion, useMotionValue, animate as fmAnimate } from 'framer-motion'
import { drawingSrc } from '../lib/boxLayout'
import s from '../CertFlow.module.css'

// 박스 안 채움 자리 (ST, 양품) — 클릭 시 datasheet 토글
// SVG 도면 있으면 표시, 없으면 회색 dot fallback
function BoxItemFilled({ st, sizePct, selected, onClick, phi, motor }) {
  const [imgError, setImgError] = useState(false)
  const src = drawingSrc(phi, motor, 'stator')
  const hasImg = src && !imgError
  return (
    <button
      type="button"
      className={`${s.stItem} ${s.stItemFilled} ${selected ? s.stItemSelected : ''}`}
      style={{
        width: `${sizePct}%`,
        background: hasImg ? 'transparent' : undefined,
        borderColor: hasImg ? 'transparent' : undefined,
      }}
      onClick={onClick}
      title={st.serial_no}
    >
      {hasImg ? (
        <img
          src={src}
          alt=""
          className={s.stItemImg}
          onError={() => setImgError(true)}
          draggable="false"
        />
      ) : (
        <span className={s.stItemDot} />
      )}
    </button>
  )
}

// 박스 안 빈 자리 — RT 자리는 도면 시도, ST 빈 자리는 점선 placeholder
function BoxItemEmpty({ kind, sizePct, phi, motor, filled = false, selected = false, onClick }) {
  // filled — RT 자리 실제 시리얼 매핑된 경우 (2026-04-29). onClick 있으면 button 으로 렌더.
  const [imgError, setImgError] = useState(false)
  const [hovered, setHovered] = useState(false)
  // RT 도면은 "실제 RT 시리얼이 매핑된 경우(filled)" 에만 표시 (2026-05-11).
  //   빈 RT 자리는 ST 빈 자리와 동일하게 점선 placeholder → "없음" 이 시각적으로 명확.
  //   (이전: filled 무관하게 항상 흐린 회전자 도면 → 빈 자리도 있는 것처럼 보임)
  const src = (kind === 'rt' && filled) ? drawingSrc(phi, motor, 'rotor') : null
  const hasImg = src && !imgError
  const Tag = onClick ? motion.button : 'span'

  // RT 도면 회전 — useMotionValue 로 직접 제어 (감속 정지 자연스럽게, 2026-04-29)
  //   selected ON  → 1500 deg/s 무한 회전 (= 250 RPM)
  //   selected OFF → 현재 각도에서 +540° 더 돌고 ease-out 으로 천천히 정지
  //   hover         → selected 아닐 때만 살짝 (+18°) 돌아감
  const rotate = useMotionValue(0)
  const isRotor = kind === 'rt' && filled
  useEffect(() => {
    if (!isRotor) return
    let controls
    if (selected) {
      // 무한 회전 — 큰 target 으로 사실상 무한 (linear)
      controls = fmAnimate(rotate, rotate.get() + 100000, {
        duration: 100000 / 1500, // deg/s = 1500 → 250 RPM
        ease: 'linear',
      })
    } else if (hovered) {
      controls = fmAnimate(rotate, rotate.get() + 18, {
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
      })
    } else {
      // selected 해제 — 감속 (현재 각도에서 +540° 추가, easeOutQuint)
      controls = fmAnimate(rotate, rotate.get() + 540, {
        duration: 1.6,
        ease: [0.16, 1, 0.3, 1],
      })
    }
    return () => controls?.stop()
  }, [selected, hovered, isRotor, rotate])

  const commonProps = {
    className: `${s.stItem} ${s.stItemEmpty} ${kind === 'rt' ? s.stItemRt : ''} ${selected ? s.stItemSelected : ''}`,
    style: {
      width: `${sizePct}%`,
      background: hasImg ? 'transparent' : undefined,
      border: hasImg ? 'none' : undefined,
      cursor: onClick ? 'pointer' : undefined,
    },
    onClick,
    onMouseEnter: onClick ? () => setHovered(true) : undefined,
    onMouseLeave: onClick ? () => setHovered(false) : undefined,
    'aria-hidden': onClick ? undefined : 'true',
    title: onClick ? 'Rotor' : undefined,
  }
  return (
    <Tag {...(onClick ? { type: 'button' } : {})} {...commonProps}>
      {hasImg && (
        <motion.img
          src={src}
          alt=""
          className={`${s.stItemImg} ${filled ? '' : s.stItemImgMuted}`}
          style={isRotor ? { rotate } : undefined}
          onError={() => setImgError(true)}
          draggable="false"
        />
      )}
    </Tag>
  )
}

// BoxFrame — 박스 외곽 + 안 슬롯 배치
export default function BoxFrame({ layout, phi, motor, stSlots, rtSlots, stOnRight, selectedSerial, onSelect }) {
  const aspect = `${layout.boxW} / ${layout.boxH}`
  const stPct = (layout.stD / layout.boxW) * 100
  const rtPct = (layout.rtD / layout.boxW) * 100

  if (layout.compact) {
    // ST + RT 한 줄. stOnRight 면 RT 먼저, ST 뒤
    const ordered = stOnRight
      ? [
          { kind: 'rt', list: rtSlots },
          { kind: 'st', list: stSlots },
        ]
      : [
          { kind: 'st', list: stSlots },
          { kind: 'rt', list: rtSlots },
        ]
    return (
      <div className={s.boxFrame} style={{ aspectRatio: aspect }}>
        <div className={s.boxFrameLine}>
          {ordered.flatMap(({ kind, list }) =>
            list.map((slot, i) => {
              const sizePct = kind === 'st' ? stPct : rtPct
              return kind === 'st' && slot ? (
                <BoxItemFilled
                  key={`${kind}-${slot.serial_no}`}
                  st={slot}
                  sizePct={sizePct}
                  selected={selectedSerial === slot.serial_no}
                  onClick={() => onSelect(slot.serial_no)}
                  phi={phi}
                  motor={motor}
                />
              ) : kind === 'rt' && slot ? (
                // RT 채워짐 — 도면 명확히 표시 + 클릭 가능 (RTDataSheet 표시, 2026-04-29)
                <BoxItemEmpty
                  key={`rt-${slot.serial_no}`}
                  kind="rt"
                  sizePct={sizePct}
                  phi={phi}
                  motor={motor}
                  filled
                  selected={selectedSerial === slot.serial_no}
                  onClick={() => onSelect(slot.serial_no)}
                />
              ) : (
                <BoxItemEmpty
                  key={`${kind}-empty-${i}`}
                  kind={kind}
                  sizePct={sizePct}
                  phi={phi}
                  motor={motor}
                />
              )
            }),
          )}
        </div>
      </div>
    )
  }

  // 다중 자리 — ST 행 위, RT 행 아래
  return (
    <div className={s.boxFrame} style={{ aspectRatio: aspect }}>
      <div className={s.boxFrameLine}>
        {stSlots.map((slot, i) =>
          slot ? (
            <BoxItemFilled
              key={`st-${slot.serial_no}`}
              st={slot}
              sizePct={stPct}
              selected={selectedSerial === slot.serial_no}
              onClick={() => onSelect(slot.serial_no)}
              phi={phi}
              motor={motor}
            />
          ) : (
            <BoxItemEmpty key={`st-empty-${i}`} kind="st" sizePct={stPct} phi={phi} motor={motor} />
          ),
        )}
      </div>
      <div className={s.boxFrameLine}>
        {rtSlots.map((slot, i) => (
          <BoxItemEmpty
            key={slot ? `rt-${slot.serial_no}` : `rt-empty-${i}`}
            kind="rt"
            sizePct={rtPct}
            phi={phi}
            motor={motor}
            filled={!!slot}
            selected={!!slot && selectedSerial === slot.serial_no}
            onClick={slot ? () => onSelect(slot.serial_no) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
