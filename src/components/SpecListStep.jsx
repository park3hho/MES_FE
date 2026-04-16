import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PHI_SPECS } from '@/constants/processConst'
import s from './SpecListStep.module.css'

// 파이별 고정 motor_type (20파이만 선택 가능)
const DEFAULT_MOTOR = { '87': 'outer', '70': 'inner', '45': 'inner', '20': 'outer' }
const FIXED_MOTOR = { '87': true, '70': true, '45': true, '20': false }

// 산출물(파이별 묶음) 입력 — motor_type(outer/inner)도 항목별 선택
export default function SpecListStep({ onConfirm, onBack }) {
  const [eaList,   setEaList]   = useState([])
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

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
      item.id === id ? { ...item, motor_type: item.motor_type === mt ? '' : mt } : item
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

  return (
    <div className={s.page}>
      {/* 상단 뒤로가기 */}
      <div className={s.topBar}>
        <button className={s.backBtn} onClick={onBack} aria-label="뒤로가기">
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <div className={s.card}>
        <h1 className={s.question}>산출물을 추가해 주세요</h1>
        <p className={s.subLabel}>파이를 탭하면 목록에 추가돼요</p>

        <p className={s.sectionTitle}>파이 선택</p>
        <p style={{ fontSize: 11, color: 'var(--color-text-sub)', marginBottom: 8, alignSelf: 'flex-start' }}>
          O = Outer(외전) &nbsp;|&nbsp; I = Inner(내전)
        </p>
        <div className={s.specBtns}>
          {Object.entries(PHI_SPECS).map(([spec, { color }]) => (
            <button key={spec} className={s.specBtn} onClick={() => handleAddSpec(spec)}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 3, background: color, borderRadius: '0 8px 0 0' }} />
              <div style={{ position: 'absolute', top: 0, right: 0, width: 3, height: 10, background: color, borderRadius: '0 8px 0 0' }} />
              {spec}파이
            </button>
          ))}
        </div>

        {eaList.length > 0 && (
          <div className={s.listWrap}>
            <div className={s.listHeader}>
              <span className={s.col} style={{ flex: 0.5 }}>번호</span>
              <span className={s.col} style={{ flex: 1.5 }}>파이</span>
              <span className={s.col} style={{ flex: 2.5 }}>모터</span>
              <span className={s.col} style={{ flex: 1.5 }}>묶음</span>
              <span className={s.col} style={{ flex: 0.5 }}></span>
            </div>
            <AnimatePresence>
              {eaList.map((item, idx) => {
                const itemColor = PHI_SPECS[item.spec]?.color || '#ccc'
                return (
                  <motion.div
                    key={item.id}
                    className={s.listRow}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className={s.col} style={{ flex: 0.5 }}>{idx + 1}</span>
                    <span className={s.specCell} style={{ flex: 1.5 }}>
                      <span className={s.specDot} style={{ background: itemColor }} />
                      {item.spec}
                    </span>
                    <span style={{ flex: 2.5, display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {FIXED_MOTOR[item.spec] ? (
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>
                          {item.motor_type === 'outer' ? 'O (외전)' : 'I (내전)'}
                        </span>
                      ) : (
                        <>
                          <button
                            className={s.motorBtn}
                            style={item.motor_type === 'outer'
                              ? { background: 'var(--color-primary)', color: '#fff', border: '1.5px solid var(--color-primary)' }
                              : { background: '#fff', color: 'var(--color-gray)', border: '1.5px solid var(--color-border-dark)' }}
                            onClick={() => handleMotorToggle(item.id, 'outer')}
                          >O</button>
                          <button
                            className={s.motorBtn}
                            style={item.motor_type === 'inner'
                              ? { background: 'var(--color-primary)', color: '#fff', border: '1.5px solid var(--color-primary)' }
                              : { background: '#fff', color: 'var(--color-gray)', border: '1.5px solid var(--color-border-dark)' }}
                            onClick={() => handleMotorToggle(item.id, 'inner')}
                          >I</button>
                        </>
                      )}
                    </span>
                    <input
                      className={s.qtyInput}
                      style={{ flex: 1.5 }}
                      type="number" min={1}
                      value={item.quantity}
                      onChange={e => handleQtyChange(item.id, e.target.value)}
                      placeholder="0"
                    />
                    <button className={s.removeBtn} onClick={() => handleRemove(item.id)}>✕</button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}

        {error && <div className={s.errorMsg}>{error}</div>}

        <button
          className={s.confirmBtn}
          disabled={eaList.length === 0 || loading}
          onClick={handleNext}
        >
          {loading ? '처리 중...' : '다음'}
        </button>
      </div>
    </div>
  )
}
