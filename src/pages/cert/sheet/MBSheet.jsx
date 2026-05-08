// pages/cert/sheet/MBSheet.jsx
// MB 페이지 본체 (CertFlow 분할, 2026-05-08)
//   - 헤더: phi 별 통계 (NN ea / MM box) + total
//   - 모델 결합 버튼 (ST + RT 도면 합성, RT 만 회전, 봉인지 띠 → 클릭 시 찢어짐)
//   - 선택된 모델의 UB 그리드 (UBCard)
//   - UBCard 클릭 → /{mb_token}/{ub_lot} 로 navigate

import { Fragment, useMemo, useState } from 'react'
import ModelButton from './ModelButton'
import UBCard from './UBCard'
import s from '../CertFlow.module.css'

export default function MBSheet({ mb, onSelectUB }) {
  const [selectedModel, setSelectedModel] = useState(null) // {phi, motor} | null

  // 모델 미선택 = 모든 UB. 선택 시 그 모델 UB 만.
  const filteredUbs = useMemo(() => {
    if (!mb?.ubs) return []
    if (!selectedModel) return mb.ubs
    return mb.ubs.filter((ub) => {
      const m = ub.model_breakdown?.[0]
      return m?.phi === selectedModel.phi && m?.motor_type === selectedModel.motor
    })
  }, [mb?.ubs, selectedModel])

  if (!mb) return null

  return (
    <section className={s.mbSheet}>
      {/* phi 별 통계 — grid 로 칼럼 정렬 (2026-05-01) */}
      <div
        className={s.mbStats}
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto auto',
          columnGap: 14,
          rowGap: 4,
          alignItems: 'baseline',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {(mb.models || []).map((m) => (
          <Fragment key={`${m.phi}-${m.motor_type}`}>
            <span style={{ color: m.color_hex, fontSize: '0.85em' }}>●</span>
            <span style={{ fontWeight: 600 }}>{m.label}</span>
            <span style={{ textAlign: 'right' }}>{m.st_count} ea</span>
            <span style={{ textAlign: 'right', color: 'var(--color-text-sub, #5f6b7a)' }}>
              {m.ub_count} box
            </span>
          </Fragment>
        ))}
        {/* Total — 윗 행과 얇은 구분선 */}
        <div
          style={{
            gridColumn: '1 / -1',
            borderTop: '1px solid #e5e7eb',
            marginTop: 4,
            marginBottom: 0,
          }}
        />
        <span />
        <span style={{ fontWeight: 700 }}>Total</span>
        <span style={{ textAlign: 'right', fontWeight: 700 }}>{mb.st_count} ea</span>
        <span
          style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-text-sub, #5f6b7a)' }}
        >
          {mb.ub_count} box
        </span>
      </div>

      {/* 모델 결합 버튼 행 */}
      <div className={s.modelRow}>
        {(mb.models || []).map((m) => {
          // 이 모델 (phi/motor) 에 속한 UB lot_no 들 — 카드 SEALED 판정 시 같이 본다 (2026-05-08)
          const ubLotNos = (mb.ubs || [])
            .filter((ub) => {
              const um = ub.model_breakdown?.[0]
              return um?.phi === m.phi && um?.motor_type === m.motor_type
            })
            .map((ub) => ub.lot_no)
          return (
            <ModelButton
              key={`${m.phi}-${m.motor_type}`}
              phi={m.phi}
              motor={m.motor_type}
              label={m.label}
              color={m.color_hex}
              mbLotNo={mb.lot_no}
              ubLotNos={ubLotNos}
              selected={selectedModel?.phi === m.phi && selectedModel?.motor === m.motor_type}
              onSelect={() =>
                setSelectedModel((prev) =>
                  prev?.phi === m.phi && prev?.motor === m.motor_type
                    ? null
                    : { phi: m.phi, motor: m.motor_type },
                )
              }
            />
          )
        })}
      </div>

      {/* UB 그리드 */}
      <div className={s.ubGrid}>
        {filteredUbs.map((ub) => (
          <UBCard key={ub.lot_no} ub={ub} onClick={onSelectUB} />
        ))}
      </div>
    </section>
  )
}
