import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PHI_SPECS } from '@/constants/processConst'
import PageHeader from '@/components/common/PageHeader'
import s from './SpecListStep.module.css'

// 파이별 고정 motor_type (20파이만 선택 가능)
const DEFAULT_MOTOR = { '87': 'outer', '70': 'inner', '45': 'inner', '20': 'outer' }
const FIXED_MOTOR = { '87': true, '70': true, '45': true, '20': false }

// 산출물(파이별 묶음) 입력 — motor_type(outer/inner)도 항목별 선택
export default function SpecListStep({ onConfirm, onBack }) {
  const [eaList,  setEaList]  = useState([])
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  const handleAddSpec = (spec) => {
    setEaList(prev => [...prev, { id: Date.now(), spec, quantity: 1, motor_type: DEFAULT_MOTOR[spec] || 'outer' }])
  }

  const handleQtyChange = (id, val) => {
    const num = parseInt(val)
    if (isNaN(num) || num < 0) return
    setEaList(prev => prev.map(item => item.id === id ? { ...item, quantity: num } : item))
  }

  const handleMotorToggle = (id, mt) => {
    setEaList(prev => prev.map(item =>
      item.id === id ? { ...item, motor_type: mt } : item
    ))
  }

  const handleRemove = (id) => {
    setEaList(prev => prev.filter(item => item.id !== id))
  }

  const handleNext = async () => {
    if (eaList.length === 0) { setError('산출물을 1개 이상 추가하세요.'); return }
    const hasEmptyQty = eaList.some(item => item.quantity === '' || parseFloat(item.quantity) <= 0)
    if (hasEmptyQty) { setError('묶음 수를 입력하세요.'); return }
    const hasNoMotor = eaList.some(item => !item.motor_type)
    if (hasNoMotor) { setError('모터 타입을 선택하세요.'); return }
    setLoading(true)
    try {
      await onConfirm(eaList.map(item => ({
        spec: item.spec,
        quantity: parseFloat(item.quantity),
        motor_type: item.motor_type,
      })))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const totalQty = eaList.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0)

  return (
    <div className="page-flat">
      <PageHeader
        title="산출물을 추가해 주세요"
        subtitle="파이를 탭하면 목록에 추가돼요"
        onBack={onBack}
      />

      {/* ── 파이 선택 그리드 ── */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionLabel}>파이 선택</span>
          <span className={s.legend}>
            <b>O</b> 외전 <em>·</em> <b>I</b> 내전
          </span>
        </div>
        <div className={s.specGrid}>
          {Object.entries(PHI_SPECS).map(([spec, { color }]) => (
            <button
              key={spec}
              type="button"
              className={s.specCard}
              onClick={() => handleAddSpec(spec)}
              aria-label={`${spec}파이 추가`}
            >
              <span className={s.specDot} style={{ background: color }} />
              <span className={s.specNum}>Φ{spec}</span>
              <span className={s.specAdd}>＋</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── 추가된 산출물 리스트 ── */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionLabel}>
            산출물 {eaList.length > 0 && <span className={s.countBadge}>{eaList.length}</span>}
          </span>
          {totalQty > 0 && (
            <span className={s.totalQty}>총 <b>{totalQty}</b> 묶음</span>
          )}
        </div>

        {eaList.length === 0 ? (
          <div className={s.empty}>
            위에서 파이를 탭해 추가해 주세요
          </div>
        ) : (
          <div className={s.list}>
            <AnimatePresence>
              {eaList.map((item) => {
                const itemColor = PHI_SPECS[item.spec]?.color || '#ccc'
                const canToggleMotor = !FIXED_MOTOR[item.spec]
                return (
                  <motion.div
                    key={item.id}
                    className={s.itemCard}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    layout
                  >
                    {/* 좌: phi 뱃지 */}
                    <div className={s.itemPhi} style={{ background: itemColor }}>
                      Φ{item.spec}
                    </div>

                    {/* 중: 모터 토글 + 수량 */}
                    <div className={s.itemBody}>
                      <div className={s.motorToggle}>
                        {canToggleMotor ? (
                          <>
                            <button
                              type="button"
                              className={`${s.motorBtn} ${item.motor_type === 'outer' ? s.motorBtnOn : ''}`}
                              onClick={() => handleMotorToggle(item.id, 'outer')}
                            >
                              O · 외전
                            </button>
                            <button
                              type="button"
                              className={`${s.motorBtn} ${item.motor_type === 'inner' ? s.motorBtnOn : ''}`}
                              onClick={() => handleMotorToggle(item.id, 'inner')}
                            >
                              I · 내전
                            </button>
                          </>
                        ) : (
                          <span className={s.motorFixed}>
                            {item.motor_type === 'outer' ? 'O · 외전' : 'I · 내전'}
                          </span>
                        )}
                      </div>
                      <div className={s.qtyRow}>
                        <input
                          className={s.qtyInput}
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => handleQtyChange(item.id, e.target.value)}
                          inputMode="numeric"
                        />
                        <span className={s.qtyUnit}>묶음</span>
                      </div>
                    </div>

                    {/* 우: 삭제 */}
                    <button
                      type="button"
                      className={s.removeBtn}
                      onClick={() => handleRemove(item.id)}
                      aria-label="삭제"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {error && <div className={s.errorMsg}>{error}</div>}

      {/* ── 하단 sticky CTA ── */}
      <div className="sticky-cta">
        <div className="sticky-cta-inner">
          <button
            type="button"
            className={s.confirmBtn}
            disabled={eaList.length === 0 || loading}
            onClick={handleNext}
          >
            {loading ? '처리 중…' : eaList.length === 0 ? '파이를 추가해 주세요' : '다음'}
          </button>
        </div>
      </div>
    </div>
  )
}
