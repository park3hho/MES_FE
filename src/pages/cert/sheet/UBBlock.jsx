// pages/cert/sheet/UBBlock.jsx
// UB 페이지 본체 — 박스 frame + ST/RT 시트 + prev/next 네비 (CertFlow 분할, 2026-05-08)

import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { getBoxLayout } from '../lib/boxLayout'
import BoxFrame from './BoxFrame'
import { STDataSheet, RTDataSheet } from './DataSheets'
import s from '../CertFlow.module.css'

export default function UBBlock({ ub, highlight, mbToken, initialFP, prevUB, nextUB, onNavigate }) {
  const [open, _setOpen] = useState(highlight)
  // initialFP — URL `/{token}/{ub}/{fp}` 진입 시 자동으로 그 ST 카드 펼침. URL 변경 시 reset.
  const [selectedSerial, setSelectedSerial] = useState(initialFP || null)
  useEffect(() => {
    setSelectedSerial(initialFP || null)
  }, [initialFP, ub.lot_no])

  // UB 페이지 진입 시 (highlight=true) 최근 본 UB 이력에 푸시 — localStorage FIFO 5개
  // RecentFab 열린 상태에서도 즉시 갱신되게 custom event 발행 (2026-04-29)
  useEffect(() => {
    if (!highlight || !mbToken) return
    try {
      const list = JSON.parse(localStorage.getItem('cert_recent_ubs') || '[]')
      const filtered = list.filter((it) => !(it.mb === mbToken && it.ub === ub.lot_no))
      filtered.unshift({
        mb: mbToken,
        ub: ub.lot_no,
        phi: ub.model_breakdown?.[0]?.phi || '',
        st_count: ub.st_count,
        at: Date.now(),
      })
      const next = filtered.slice(0, 5)
      localStorage.setItem('cert_recent_ubs', JSON.stringify(next))
      // 같은 탭의 RecentFab 에게 갱신 알림 (storage 이벤트는 같은 탭에선 안 발생)
      window.dispatchEvent(new CustomEvent('cert_recent_updated', { detail: next }))
    } catch {
      /* 차단 환경 무시 */
    }
  }, [highlight, mbToken, ub.lot_no])

  // selectedSerial 이 ST 또는 RT 매칭. RT 는 ub.rts (BoxUB 의 RT 시리얼) 에서 (2026-04-29)
  const selectedSt = ub.sts.find((st) => st.serial_no === selectedSerial)
  const selectedRt = !selectedSt
    ? (ub.rts || []).find((rt) => rt.serial_no === selectedSerial)
    : null

  // 박스 레이아웃 — phi + motor_type 기반 (박스 사이즈 통일, ST/RT 직경은 motor 따라 swap)
  const phi = ub.model_breakdown?.[0]?.phi
  const motor = ub.model_breakdown?.[0]?.motor_type
  const layout = getBoxLayout(phi, motor)
  const stOnRight = motor === 'outer' // 외전형: RT 좌(큰쪽) / ST 우(작은쪽)

  // ST 자리: 채워진 시리얼 + capacity 까지 빈 자리
  const stSlots = [
    ...ub.sts.slice(0, layout.cols),
    ...Array(Math.max(0, layout.cols - ub.sts.length)).fill(null),
  ]
  // RT 자리: BE 응답의 ub.rts (UB 박스에 담긴 RT 시리얼) + 빈 자리 (2026-04-29)
  const rtData = ub.rts || []
  const rtSlots = [
    ...rtData.slice(0, layout.cols),
    ...Array(Math.max(0, layout.cols - rtData.length)).fill(null),
  ]

  return (
    <section className={`${s.ub} ${highlight ? s.ubHighlight : ''}`}>
      <header className={s.ubHeader}>
        {/* ◀ Back to MB 버튼 제거 (2026-05-07) — 상단 통합 바의 ← MB 버튼으로 일원화 */}
        {/* chevron 제거 — UB 페이지에서는 항상 펼쳐짐, 토글 시각 표시 불필요 (사용자 정책 2026-04-29) */}
        <div className={s.ubHeaderBtn}>
          <span className={s.ubLot}>{ub.lot_no}</span>
          <span className={s.ubCount}>ST {ub.st_count}</span>
        </div>
        {/* prev/next UB 이동 — UB 페이지 진입(highlight=true) 시만 노출 (사용자 정책 H) */}
        {highlight && onNavigate && (prevUB || nextUB) && (
          <div className={s.ubNavBtns}>
            <button
              type="button"
              className={s.ubNavBtn}
              onClick={() => prevUB && onNavigate(prevUB.lot_no)}
              disabled={!prevUB}
              aria-label="Previous UB"
              title={prevUB ? prevUB.lot_no : 'No previous'}
            >
              ‹
            </button>
            <button
              type="button"
              className={s.ubNavBtn}
              onClick={() => nextUB && onNavigate(nextUB.lot_no)}
              disabled={!nextUB}
              aria-label="Next UB"
              title={nextUB ? nextUB.lot_no : 'No next'}
            >
              ›
            </button>
          </div>
        )}
        {/* DownloadGroup 제거 — 사용자 정책 J: MB 헤더에만 유지 (2026-04-29) */}
      </header>
      {/* phi chip 제거 — 내부 인덱싱이라 외부 노출 불필요 (2026-04-27 v3) */}
      {open && (
        <>
          <BoxFrame
            layout={layout}
            phi={phi}
            motor={motor}
            stSlots={stSlots}
            rtSlots={rtSlots}
            stOnRight={stOnRight}
            selectedSerial={selectedSerial}
            onSelect={(serial) => setSelectedSerial((cur) => (cur === serial ? null : serial))}
          />
          <AnimatePresence mode="wait">
            {selectedSt && <STDataSheet key={`st:${selectedSt.serial_no}`} st={selectedSt} />}
            {selectedRt && <RTDataSheet key={`rt:${selectedRt.serial_no}`} rt={selectedRt} />}
          </AnimatePresence>
        </>
      )}
    </section>
  )
}
