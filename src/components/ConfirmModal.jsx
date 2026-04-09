import { motion, AnimatePresence } from 'framer-motion'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './ConfirmModal.module.css'

const formatQty = (num, unit) => unit === 'kg'
  ? Math.round(num * 1000) / 1000
  : Math.floor(num)

// SVG 체크마크 — 선이 그려지는 애니메이션
function CheckMark() {
  return (
    <motion.svg
      width="48" height="48" viewBox="0 0 48 48"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <motion.circle
        cx="24" cy="24" r="22"
        stroke="#27ae60" strokeWidth="2.5"
        fill="#eafaf1"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
      <motion.path
        d="M14 24.5L20.5 31L34 17"
        stroke="#27ae60" strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut', delay: 0.15 }}
      />
    </motion.svg>
  )
}

// 로딩 스피너
function Spinner() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
    >
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%' }}
      />
      인쇄 중...
    </motion.div>
  )
}

export function ConfirmModal({ lotNo, printCount, totalWeight, items = [], consumedQty, printing, done, error, onConfirm, onCancel, producedUnit, consumedUnit, unit, extraInfo, doneMessage }) {
  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <div className={s.logoWrap}>
          <FaradayLogo size="md" />
        </div>
        <div className={s.lotDisplay}>
          <span className={s.lotLabel}>LOT No</span>
          <span className={s.lotValue}>{lotNo}</span>

          {totalWeight != null ? (
            <div style={{ marginTop: 12, textAlign: 'left' }}>
              <div className={s.listHeader}>
                <span className={s.listHeaderNo}>No</span>
                <span className={s.listHeaderLot}>LOT</span>
                <span>무게</span>
              </div>
              {items.map(item => (
                <div key={item.seq} className={s.listRow}>
                  <span className={s.listRowNo}>{item.seq}</span>
                  <span>{item.weight} {producedUnit}</span>
                </div>
              ))}
              <div className={s.listTotal}>
                <span>총 {items.length}개</span>
                <span>{totalWeight} {producedUnit}</span>
              </div>
            </div>

          ) : consumedQty != null ? (
            <div className={s.qtyRow}>
              <div className={s.qtyBlock}>
                <span className={s.lotLabel}>투입량</span>
                <span className={s.qtyValue}>
                  {formatQty(consumedQty, consumedUnit)} {consumedUnit}
                </span>
              </div>
              <span className={s.arrow}>→</span>
              <div className={s.qtyBlock}>
                <span className={s.lotLabel}>생산량</span>
                <span className={s.qtyValue}>
                  {formatQty(printCount, producedUnit)} {producedUnit}
                </span>
              </div>
            </div>

          ) : printCount != null && (
            <span className={s.lotLabel} style={{ marginTop: 8 }}>
              {formatQty(printCount, unit)} {unit || '개'}
            </span>
          )}
        </div>

        {/* 버튼 영역 — 상태에 따라 전환 */}
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              className={s.doneMsg}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <CheckMark />
              <span>{doneMessage || '인쇄 완료'}</span>
            </motion.div>

          ) : error ? (
            <motion.div
              key="error"
              className={s.failMsg}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              ✕ {error}
            </motion.div>

          ) : (
            <motion.div
              key="buttons"
              className={s.btnRow}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <button className={s.secondaryBtn} onClick={onCancel} disabled={printing}>
                취소
              </button>
              {/* 확인 버튼 — 클릭 시 스피너로 교체 */}
              <motion.button
                className={s.primaryBtn}
                onClick={onConfirm}
                disabled={printing}
                whileTap={{ scale: 0.97 }}
              >
                <AnimatePresence mode="wait">
                  {printing ? (
                    <Spinner key="spinner" />
                  ) : (
                    <motion.span
                      key="label"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      확인 및 출력
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}