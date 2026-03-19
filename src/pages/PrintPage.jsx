import { useState, useEffect } from 'react'
import { FaradayLogo } from '@/components/FaradayLogo'
import { CountModal } from '@/components/CountModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { usePrint } from '@/hooks/usePrint'
import s from './PrintPage.module.css'

export function PrintPage({ user, onLogout, onBack }) {
  const [lotNo, setLotNo] = useState('')
  const [printCount, setPrintCount] = useState(null)
  const [step, setStep] = useState(null) // 'count' | 'confirm'
  const { printing, done, error, print, reset } = usePrint()

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => {
      setStep(null)
      setLotNo('')
      setPrintCount(null)
      reset()
    }, 1200)
    return () => clearTimeout(t)
  }, [done])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => {
      setStep(null)
      setPrintCount(null)
      reset()
    }, 1500)
    return () => clearTimeout(t)
  }, [error])

  const handlePrintClick = () => {
    if (!lotNo.trim()) return
    reset()
    setStep('count')
  }

  const handleCountSelect = (count) => {
    setPrintCount(count)
    setStep('confirm')
  }

  const handleConfirm = () => print(lotNo, printCount)

  const handleCancel = () => {
    if (printing) return
    setStep(null)
    setPrintCount(null)
    reset()
  }

  return (
    <div className={s.pageCenter}>
      <div className={s.card}>
        <div className={s.header}>
          {/* 로고가 버튼 영역 침범 방지 */}
          <FaradayLogo size="lg" style={{ flexShrink: 1, minWidth: 0 }} />
          <div className={s.headerBtns}>
            {onBack && (
              <button className={s.logoutBtn} onClick={onBack}>이전으로</button>
            )}
            <button className={s.logoutBtn} onClick={onLogout}>로그아웃</button>
          </div>
        </div>
        <div className={s.fieldGroup}>
          <label className={s.label}>LOT No 입력</label>
          <input
            className={s.input}
            type="text"
            value={lotNo}
            onChange={e => setLotNo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePrintClick()}
            placeholder="LOT No를 입력하세요"
            autoFocus
          />
        </div>
        <button
          className={s.primaryBtn}
          onClick={handlePrintClick}
          disabled={!lotNo.trim()}
        >
          LOT No 인쇄
        </button>
      </div>

      {step === 'count' && (
        <CountModal lotNo={lotNo} onSelect={handleCountSelect} onCancel={handleCancel} />
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={lotNo}
          printCount={printCount}
          printing={printing}
          done={done}
          error={error}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          unit='개' 
        />
      )}
    </div>
  )
}