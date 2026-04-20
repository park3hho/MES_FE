// OQ Test 2: K_T 측정 섹션
// 정책 (2026-04-20): P5(2000 RPM) 필수 + P1~P4 선택 (드롭다운)
// 계산: calcKT가 null 포인트 자동 스킵 → 입력된 포인트만으로 선형회귀
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import s from '../InspectionForm.module.css'

const cx = (...classes) => classes.filter(Boolean).join(' ')

function checkOverLimit(value, refValue) {
  if (value === null || !refValue) return null
  const pct = ((value - refValue) / refValue) * 100
  return pct > 15 ? Math.round(pct * 10) / 10 : null
}

const FIELD_ORDER = ['freq', 'peak1', 'peak2', 'rms']
const FIELD_LABEL = { freq: 'Freq', peak1: 'Peak1', peak2: 'Peak2', rms: 'RMS' }
const FIELD_UNIT = { freq: 'Hz', peak1: 'V', peak2: 'V', rms: 'V' }

// 한 행 렌더 — P5(index=4)는 필수 표시, P1~P4는 optional
function KtRowView({ row, index, openKtCell, isRequired }) {
  return (
    <div className={s.ktRow}>
      <span
        className={s.ktCol}
        style={{ flex: 0.7, color: isRequired ? 'var(--color-primary)' : '#8a93a8', fontWeight: isRequired ? 700 : 500 }}
      >
        P{index + 1}{isRequired ? ' ★' : ''}
      </span>
      {FIELD_ORDER.map((field, fi) => {
        const tabIdx = index * 4 + fi + 100
        return (
          <div
            key={field}
            className={cx(s.ktCell, row[field] !== null && s.ktCellFilled)}
            tabIndex={tabIdx}
            onClick={() => openKtCell(index, field, FIELD_LABEL[field], FIELD_UNIT[field])}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openKtCell(index, field, FIELD_LABEL[field], FIELD_UNIT[field])
              }
            }}
          >
            {row[field] !== null ? row[field] : '-'}
          </div>
        )
      })}
    </div>
  )
}

export default function KtSection({
  ktRows,
  openKtCell,
  ktP5Filled,
  ktCalc,
  ktRef,
  ktFail,
  polePairs,
}) {
  const [optionalOpen, setOptionalOpen] = useState(false)
  const optionalFilledCount = ktRows
    .slice(0, 4)
    .filter((r) => r.freq !== null || r.peak1 !== null || r.peak2 !== null || r.rms !== null).length

  return (
    <div className={s.section}>
      <span className={s.label}>
        K_T 측정 — P5 (2000 RPM) 필수{polePairs ? ` · Pole pairs: ${polePairs}` : ''}
      </span>
      {!polePairs && (
        <p style={{ color: 'var(--color-danger)', fontSize: 11, margin: '0 0 6px' }}>
          pole pairs 미설정 — K_T 자동 계산 불가 (데이터만 수집)
        </p>
      )}

      {/* Optional 포인트 드롭다운 (P1~P4) — P5 위에 위치 */}
      <button
        type="button"
        onClick={() => setOptionalOpen(!optionalOpen)}
        style={{
          width: '100%',
          marginBottom: 6,
          padding: '5px 10px',
          background: 'var(--color-bg-input)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 11,
          color: '#6b7585',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>
          정밀 측정 (P1~P4, 선택)
          {optionalFilledCount > 0 && (
            <span style={{ marginLeft: 6, color: 'var(--color-primary)', fontWeight: 700 }}>
              {optionalFilledCount}/4
            </span>
          )}
        </span>
        <motion.span
          animate={{ rotate: optionalOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: 'inline-block', lineHeight: 1 }}
        >
          ▾
        </motion.span>
      </button>

      {/* P1~P4 애니메이션 펼침 */}
      <AnimatePresence initial={false}>
        {optionalOpen && (
          <motion.div
            key="optional"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className={s.ktTable} style={{ marginBottom: 8 }}>
              <div className={s.ktHeader}>
                <span className={s.ktCol} style={{ flex: 0.7 }}>#</span>
                <span className={s.ktCol}>Freq</span>
                <span className={s.ktCol}>Peak1</span>
                <span className={s.ktCol}>Peak2</span>
                <span className={s.ktCol}>RMS</span>
              </div>
              {ktRows.slice(0, 4).map((row, i) => (
                <KtRowView key={i} row={row} index={i} openKtCell={openKtCell} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* P5 필수 행 */}
      <div className={s.ktTable}>
        <div className={s.ktHeader}>
          <span className={s.ktCol} style={{ flex: 0.7 }}>#</span>
          <span className={s.ktCol}>Freq</span>
          <span className={s.ktCol}>Peak1</span>
          <span className={s.ktCol}>Peak2</span>
          <span className={s.ktCol}>RMS</span>
        </div>
        <KtRowView row={ktRows[4]} index={4} openKtCell={openKtCell} isRequired />
      </div>

      {/* 결과 (P5만 채워져도 표시) */}
      {ktP5Filled && (
        <div className={s.ktResult}>
          <div className={s.ktResultRow}>
            <span>K_e(RMS): {ktCalc.keRms ?? '-'}</span>
            <span className={ktFail ? s.ktFail : ''}>K_T(RMS): {ktCalc.ktRms ?? '-'}</span>
          </div>
          <div className={s.ktResultRow}>
            <span>K_e(PEAK): {ktCalc.kePeak ?? '-'}</span>
            <span>K_T(PEAK): {ktCalc.ktPeak ?? '-'}</span>
          </div>
          {ktRef && (
            <div className={s.ktResultRow}>
              <span style={{ fontSize: 11, color: '#8a93a8' }}>기준값: {ktRef}</span>
              {ktFail && <span className={s.ktFail}>⚠ 기준 미달 (FAIL)</span>}
              {checkOverLimit(ktCalc.ktRms, ktRef) !== null && (
                <span className={s.warning}>⚠ 15% 초과 (의심 값)</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
