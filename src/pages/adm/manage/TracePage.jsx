import { useState, useEffect } from 'react'
import { traceLot } from '@/api'
import QRScanner from '@/components/QRScanner'
import { FaradayLogo } from '@/components/FaradayLogo'
import LotTimeline from '@/components/LotTimeline'
import s from './TracePage.module.css'

export default function TracePage({ onLogout, onBack }) {
  const [result,      setResult]      = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [step,        setStep]        = useState('qr')
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    if (result) {
      const t = setTimeout(() => setShowContent(true), 100)
      return () => clearTimeout(t)
    }
    setShowContent(false)
  }, [result])

  const handleScan = async (val) => {
    setLoading(true)
    try {
      const data = await traceLot(val)
      setResult(data)
      setStep('result')
    } catch (e) {
      throw new Error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setResult(null); setShowContent(false); setStep('qr')
  }

  if (step === 'qr') {
    return <QRScanner processLabel="LOT 이력 조회" onScan={handleScan} onLogout={onLogout} onBack={onBack} />
  }

  return (
    <div className="page-top">
      <div className={s.card}>
        <div className={s.header}>
          <FaradayLogo size="md" />
          <p className={s.title}>LOT 이력 조회</p>
        </div>

        {/* opacity/transform — showContent 애니메이션 동적값 */}
        <div
          className={s.searchedLot}
          style={{
            opacity:   showContent ? 1 : 0,
            transform: showContent ? 'translateY(0)' : 'translateY(-10px)',
          }}
        >
          <span className={s.searchLabel}>조회</span>
          <span className={s.searchValue}>{result?.lot_no}</span>
          {result?.scanned_process && (
            <span className={s.searchProcess}>{result.scanned_process}</span>
          )}
        </div>

        {result?.timeline?.length > 0 ? (
          <div className={s.timeline}>
            <LotTimeline timeline={result.timeline} searchedLotNo={result.lot_no} animated={true} />
          </div>
        ) : (
          <div className={s.empty}>이력이 없습니다.</div>
        )}

        {/* opacity — showContent 애니메이션 동적값 */}
        <div className={s.btnRow} style={{ opacity: showContent ? 1 : 0 }}>
          <button className="btn-primary btn-full" onClick={handleReset}>다시 조회</button>
          <button className="btn-text" onClick={onBack ?? onLogout}>
            {onBack ? '이전으로' : '로그아웃'}
          </button>
        </div>
      </div>
    </div>
  )
}