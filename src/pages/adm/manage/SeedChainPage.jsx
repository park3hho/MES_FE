import { useState } from 'react'
import { FaradayLogo } from '@/components/FaradayLogo'
import { seedChain } from '@/api'
import { PHI_SPECS } from '@/constants/processConst'
import s from './SeedChainPage.module.css'

const PHI_OPTIONS = Object.keys(PHI_SPECS) // ["87","70","45","20"]

const FIELDS = [
  { key: 'lot_rm_no', label: 'RM (원자재)',     placeholder: '예: VA-CO-35' },
  { key: 'lot_mp_no', label: 'MP (자재준비)',    placeholder: '예: SR023520260310-01' },
  { key: 'lot_ea_no', label: 'EA (낱장가공)',    placeholder: '예: ED01260310-01' },
  { key: 'lot_ht_no', label: 'HT (열처리)',      placeholder: '예: HT01260310-01' },
  { key: 'lot_bo_no', label: 'BO (본딩)',        placeholder: '예: BM01260310-01' },
  { key: 'lot_ec_no', label: 'EC (전착도장)',    placeholder: '예: EC01260310-01' },
  { key: 'lot_wi_no', label: 'WI (권선)',        placeholder: '예: WI01260310-01' },
  { key: 'lot_so_no', label: 'SO (중성점)',      placeholder: '예: SM01260310-01' },
]

export default function SeedChainPage({ onLogout, onBack }) {
  const DEFAULTS = { lot_rm_no: 'VA-CO-35', lot_mp_no: 'ST0135' }
  const [lots, setLots] = useState(
    Object.fromEntries(FIELDS.map((f) => [f.key, DEFAULTS[f.key] || '']))
  )
  const [phi, setPhi] = useState('')
  const [motorType, setMotorType] = useState('')  // 'outer' | 'inner'
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const filledCount = Object.values(lots).filter((v) => v.trim()).length

  const handleChange = (key, val) => setLots((prev) => ({ ...prev, [key]: val }))

  const handleSubmit = async () => {
    if (filledCount === 0) {
      setError('최소 하나 이상의 LOT 번호를 입력하세요.')
      return
    }
    if (!phi) {
      setError('파이 스펙을 선택하세요. (EA~SO가 없으면 아무거나 선택)')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await seedChain({ ...lots, phi, motor_type: motorType, quantity })
      setResult(res.seeded || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setLots(Object.fromEntries(FIELDS.map((f) => [f.key, ''])))
    setPhi('')
    setMotorType('')
    setQuantity(1)
    setResult(null)
    setError(null)
  }

  return (
    <div className="page">
      <div className={s.card}>
        {/* 헤더 */}
        <div className={s.header}>
          <div>
            <div className={s.title}>LOT 체인 시딩</div>
            <div className={s.subtitle}>입력된 공정만 lot / inventory / snbt 생성 (중복 안전)</div>
          </div>
          <div className={s.headerBtns}>
            {onBack && (
              <button className="btn-ghost btn-sm" onClick={onBack}>← 이전</button>
            )}
          </div>
        </div>

        {/* LOT 입력 */}
        <div className={s.section}>
          <div className={s.sectionLabel}>LOT 번호 입력 (없는 공정은 빈칸으로)</div>
          {FIELDS.map((f) => (
            <div className={s.field} key={f.key}>
              <label className="form-label">{f.label}</label>
              <input
                className="form-input"
                value={lots[f.key]}
                onChange={(e) => handleChange(f.key, e.target.value)}
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>

        {/* 파이 스펙 */}
        <div className={s.section}>
          <div className={s.sectionLabel}>파이 스펙 (EA 이상 공정 inventory group_key)</div>
          <div className={s.phiRow}>
            {PHI_OPTIONS.map((p) => (
              <button
                key={p}
                className={`btn-secondary btn-sm ${phi === p ? s.phiActive : ''}`}
                style={phi === p ? { backgroundColor: PHI_SPECS[p].color, color: '#fff', borderColor: PHI_SPECS[p].color } : {}}
                onClick={() => setPhi(p)}
              >
                {PHI_SPECS[p].label}
              </button>
            ))}
          </div>
        </div>

        {/* Motor Type */}
        <div className={s.section}>
          <div className={s.sectionLabel}>Motor Type (EA 이상 공정 inventory에 저장)</div>
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

        {/* 수량 */}
        <div className={s.section}>
          <div className={s.field}>
            <label className="form-label">재고 수량 (개)</label>
            <input
              className="form-input"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
            />
          </div>
        </div>

        {/* 에러 */}
        {error && (
          <div style={{ color: 'var(--color-danger)', fontSize: 'var(--font-sm)', marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* 버튼 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn-primary btn-full ${s.submitBtn}`}
            onClick={handleSubmit}
            disabled={loading || filledCount === 0}
            style={{ flex: 3 }}
          >
            {loading ? '시딩 중...' : `시딩 실행 (${filledCount}개 공정)`}
          </button>
          <button
            className="btn-ghost btn-md"
            onClick={handleReset}
            disabled={loading}
            style={{ flex: 1 }}
          >
            초기화
          </button>
        </div>

        {/* 결과 */}
        {result && (
          <div className={s.result}>
            <div className={s.resultTitle}>✅ 시딩 완료 ({result.length}개 공정)</div>
            <div className={s.resultLot}>
              {result.map((r) => <div key={r}>{r}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
