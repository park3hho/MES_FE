import { useState, useEffect } from 'react'
import { FaradayLogo } from '@/components/FaradayLogo'
import { ConfirmModal } from '@/components/ConfirmModal'
import { seedHT } from '@/api'
import { PHI_SPECS } from '@/constants/processConst'
import s from './SeedHTPage.module.css'

const PHI_OPTIONS = Object.keys(PHI_SPECS) // ["87", "70", "45", "20"]

export default function SeedHTPage({ onLogout, onBack }) {
  const [lotRm, setLotRm] = useState('VA-CO-35')
  const [lotMp, setLotMp] = useState('ST0135-01')
  const [lotEa, setLotEa] = useState('')
  const [lotHt, setLotHt] = useState('')
  const [vendor, setVendor] = useState('')
  const [phi, setPhi] = useState('')
  const [motorType, setMotorType] = useState('')  // 'outer' | 'inner'
  const [count, setCount] = useState(1)

  const [step, setStep] = useState(null) // null | 'confirm'
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [resultLots, setResultLots] = useState([])

  // 성공 자동 리셋
  useEffect(() => {
    if (!done) return
    const t = setTimeout(handleReset, 1200)
    return () => clearTimeout(t)
  }, [done])

  // 에러 자동 리셋
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => {
      setStep(null)
      setError(null)
    }, 1500)
    return () => clearTimeout(t)
  }, [error])

  const canSubmit =
    lotRm.trim() && lotMp.trim() && lotEa.trim() && vendor.trim() && phi && motorType && count > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    setStep('confirm')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      const res = await seedHT(lotRm.trim(), lotMp.trim(), lotEa.trim(), vendor.trim(), phi, motorType, count, lotHt.trim() || null)
      setResultLots(res.lot_nums || [])
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setStep(null)
    setPrinting(false)
    setDone(false)
    setError(null)
    setResultLots([])
    // 입력값은 유지 (같은 RM/MP/EA로 추가 시딩 가능)
  }

  const handleCancel = () => {
    if (printing) return
    setStep(null)
    setError(null)
  }

  return (
    <div className="page">
      <div className={s.card}>
        <div className={s.header}>
          <div>
            <div className={s.title}>HT 시딩</div>
            <div className={s.subtitle}>RM/MP/EA LOT 입력 → HT 라벨 출력</div>
          </div>
          <div className={s.headerBtns}>
            {onBack && (
              <button className="btn-ghost btn-sm" onClick={onBack}>
                이전으로
              </button>
            )}
            <button className="btn-ghost btn-sm" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        </div>

        {/* RM/MP/EA 입력 */}
        <div className={s.section}>
          <div className={s.sectionLabel}>이전 공정 LOT 번호</div>
          <div className={s.field}>
            <label className="form-label">RM (원자재)</label>
            <input
              className="form-input"
              value={lotRm}
              onChange={(e) => setLotRm(e.target.value)}
              placeholder="예: VA-CO-35"
            />
          </div>
          <div className={s.field}>
            <label className="form-label">MP (자재준비)</label>
            <input
              className="form-input"
              value={lotMp}
              onChange={(e) => setLotMp(e.target.value)}
              placeholder="예: SR023520260310-01"
            />
          </div>
          <div className={s.field}>
            <label className="form-label">EA (낱장가공)</label>
            <input
              className="form-input"
              value={lotEa}
              onChange={(e) => setLotEa(e.target.value)}
              placeholder="예: ED01260310-01"
            />
          </div>
          <div className={s.field}>
            <label className="form-label">HT 번호 (직접 입력, 비우면 자동 채번)</label>
            <input
              className="form-input"
              value={lotHt}
              onChange={(e) => setLotHt(e.target.value)}
              placeholder="비우면 자동 생성"
            />
          </div>
        </div>

        {/* HT 설정 */}
        <div className={s.section}>
          <div className={s.sectionLabel}>HT 열처리 설정</div>
          <div className={s.field}>
            <label className="form-label">파이 스펙</label>
            <div className={s.phiRow}>
              {PHI_OPTIONS.map((p) => (
                <button
                  key={p}
                  className={`btn-secondary btn-sm ${phi === p ? s.phiActive : ''}`}
                  style={
                    phi === p
                      ? {
                          backgroundColor: PHI_SPECS[p].color,
                          color: '#fff',
                          borderColor: PHI_SPECS[p].color,
                        }
                      : {}
                  }
                  onClick={() => setPhi(p)}
                >
                  {PHI_SPECS[p].label}
                </button>
              ))}
            </div>
          </div>
          <div className={s.field}>
            <label className="form-label">Motor Type</label>
            <div className={s.phiRow}>
              {['outer', 'inner'].map((mt) => (
                <button
                  key={mt}
                  className={`btn-secondary btn-sm ${motorType === mt ? s.phiActive : ''}`}
                  style={motorType === mt ? { backgroundColor: '#1a9e75', color: '#fff', borderColor: '#1a9e75' } : {}}
                  onClick={() => setMotorType(mt)}
                >
                  {mt.charAt(0).toUpperCase() + mt.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className={s.row}>
            <div className={s.field}>
              <label className="form-label">업체코드</label>
              <input
                className="form-input"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="01~31"
                maxLength={2}
              />
            </div>
            <div className={s.field}>
              <label className="form-label">출력 장수</label>
              <input
                className="form-input"
                type="number"
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                min={1}
                max={50}
              />
            </div>
          </div>
        </div>

        <button
          className={`btn-primary btn-full ${s.submitBtn}`}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          HT 시딩 시작 ({count}장)
        </button>

        {/* 마지막 결과 표시 */}
        {resultLots.length > 0 && !step && (
          <div className={s.result}>
            <div className={s.resultTitle}>마지막 생성 LOT</div>
            <div className={s.resultLot}>
              {resultLots.map((lot) => (
                <div key={lot}>{lot}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {step === 'confirm' && (
        <ConfirmModal
          lotNo={lotHt.trim() || `HT${vendor.padStart(2, '0')}...`}
          printCount={count}
          unit="장"
          printing={printing}
          done={done}
          error={error}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}
