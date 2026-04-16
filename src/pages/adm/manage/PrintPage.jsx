import { useState, useEffect } from 'react'
import { CountModal } from '@/components/CountModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { usePrint } from '@/hooks/usePrint'

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
    <div className="page-flat" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ padding: '12px var(--space-lg)' }}>
        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-dark)', display: 'flex', alignItems: 'center' }}>
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        )}
      </div>
      <div style={{ flex: 1, padding: '20px var(--space-xl) 0', maxWidth: 480, width: '100%', margin: '0 auto' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-dark)', marginBottom: 8 }}>인쇄할 LOT 번호를 입력해 주세요</h1>
        <p style={{ color: 'var(--color-text-sub)', fontSize: 14, marginBottom: 28 }}>
          LOT 번호를 입력하면 라벨을 인쇄할 수 있습니다
        </p>
        <div className="form-group">
          <input
            className="form-input"
            type="text"
            value={lotNo}
            onChange={e => setLotNo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePrintClick()}
            placeholder="LOT No를 입력하세요"
            autoFocus
            style={{ fontSize: 16, padding: 16, borderRadius: 12 }}
          />
        </div>
        <button
          className="btn-primary btn-lg btn-full"
          onClick={handlePrintClick}
          disabled={!lotNo.trim()}
          style={{ marginTop: 8 }}
        >
          인쇄
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
