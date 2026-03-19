import { useState } from 'react'
import { FaradayLogo } from '@/components/FaradayLogo'
import { PHI_COLORS } from '@/constants/styleConst'
import s from './SpecListStep.module.css'

// 산출물(파이별 묶음) 입력만 담당
// confirm은 부모(EAPage)에서 처리
export default function SpecListStep({ onConfirm, onBack }) {
  const [eaList,   setEaList]   = useState([])
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  const handleAddSpec = (spec) => {
    setEaList(prev => [...prev, { id: Date.now(), spec, quantity: '' }])
  }

  const handleQtyChange = (id, val) => {
    const num = parseInt(val)
    if (isNaN(num) || num < 0) return
    setEaList(prev => prev.map(item => item.id === id ? { ...item, quantity: num } : item))
  }

  const handleRemove = (id) => {
    setEaList(prev => prev.filter(item => item.id !== id))
  }

  const handleNext = async () => {
    if (eaList.length === 0) { setError('산출물을 1개 이상 추가하세요.'); return }
    const hasEmpty = eaList.some(item => item.quantity === '' || parseFloat(item.quantity) <= 0)
    if (hasEmpty) { setError('수량을 입력하세요.'); return }
    setLoading(true)
    try {
      // 부모에게 목록 전달 — 부모가 다음 스텝(소모량 입력) 으로 이동
      await onConfirm(eaList.map(item => ({ spec: item.spec, quantity: parseFloat(item.quantity) })))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.header}>
          <FaradayLogo size="md" />
          <p className={s.processLabel}>EA, 낱장가공 - 산출물 입력</p>
          <p className={s.subLabel}>화덕에 넣는 묶음 단위로 입력해주세요</p>
        </div>

        <p className={s.sectionTitle}>파이 선택</p>
        <div className={s.specBtns}>
          {PHI_COLORS.map(({ spec, color }) => (
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
              <span className={s.col} style={{ flex: 2 }}>파이</span>
              <span className={s.col} style={{ flex: 2 }}>개수</span>
              <span className={s.col} style={{ flex: 0.5 }}></span>
            </div>
            {eaList.map((item, idx) => {
              const itemColor = PHI_COLORS.find(o => o.spec === item.spec)?.color || '#ccc'
              return (
                <div key={item.id} className={s.listRow}>
                  <span className={s.col} style={{ flex: 0.5 }}>{idx + 1}</span>
                  <span className={s.specCell}>
                    <span className={s.specDot} style={{ background: itemColor }} />
                    {item.spec}파이
                  </span>
                  <input
                    className={s.qtyInput}
                    type="number" min={0}
                    value={item.quantity}
                    onChange={e => handleQtyChange(item.id, e.target.value)}
                    placeholder="0"
                  />
                  <button className={s.removeBtn} onClick={() => handleRemove(item.id)}>✕</button>
                </div>
              )
            })}
          </div>
        )}

        {error && <div className={s.errorMsg}>{error}</div>}

        {/* 다음 — 소모량 입력으로 이동 */}
        <button
          className={s.confirmBtn}
          disabled={eaList.length === 0 || loading}
          onClick={handleNext}
        >
          {loading ? '처리 중...' : '다음 → 소모량 입력'}
        </button>
        <button className={s.textBtn} onClick={onBack}>이전으로</button>
      </div>
    </div>
  )
}