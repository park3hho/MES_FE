// SeedChainPage — Toss flat 스타일 (2026-04-16 개편)
// 카드 제거 · PageHeader/Section 사용 · 하단 sticky CTA

import { useState } from 'react'
import { seedChain } from '@/api'
import { PHI_SPECS } from '@/constants/processConst'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
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
      setError('최소 하나 이상의 LOT 번호를 입력해주세요.')
      return
    }
    if (!phi) {
      setError('파이 스펙을 선택해주세요. (EA~SO가 없으면 아무거나 선택)')
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
    <div className="page-flat">
      <PageHeader
        title="LOT 체인 시딩"
        subtitle="입력된 공정만 lot / inventory / snbt 생성 (중복 안전)"
        onBack={onBack}
      />

      {/* LOT 입력 */}
      <Section label="LOT 번호 입력 (없는 공정은 빈칸으로)">
        <div className={s.fieldList}>
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
      </Section>

      {/* 파이 스펙 */}
      <Section label="파이 스펙 (EA 이상 공정 inventory group_key)">
        <div className={s.chipRow}>
          {PHI_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              className={`${s.chip} ${phi === p ? s.chipActive : ''}`}
              style={phi === p ? { backgroundColor: PHI_SPECS[p].color, borderColor: PHI_SPECS[p].color, color: '#fff' } : {}}
              onClick={() => setPhi(p)}
            >
              {PHI_SPECS[p].label}
            </button>
          ))}
        </div>
      </Section>

      {/* Motor Type */}
      <Section label="Motor Type (EA 이상 공정 inventory에 저장)">
        <div className={s.chipRow}>
          {['outer', 'inner'].map((mt) => (
            <button
              key={mt}
              type="button"
              className={`${s.chip} ${motorType === mt ? s.chipActive : ''}`}
              style={motorType === mt ? { backgroundColor: 'var(--color-judgment-ok)', borderColor: 'var(--color-judgment-ok)', color: '#fff' } : {}}
              onClick={() => setMotorType(mt)}
            >
              {mt.charAt(0).toUpperCase() + mt.slice(1)}
            </button>
          ))}
        </div>
      </Section>

      {/* 수량 */}
      <Section label="재고 수량">
        <div className={s.field}>
          <input
            className="form-input"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            min={1}
          />
        </div>
      </Section>

      {/* 에러 */}
      {error && <p className={s.error}>{error}</p>}

      {/* 결과 */}
      {result && (
        <Section label={`시딩 완료 (${result.length}개 공정)`}>
          <div className={s.result}>
            {result.map((r) => <div key={r}>{r}</div>)}
          </div>
        </Section>
      )}

      {/* 액션 — 초기화 + 시딩 (sticky 하단 CTA 영역에서 떨어진 일반 영역) */}
      <div className={s.actions}>
        <button
          type="button"
          className="btn-ghost btn-md"
          onClick={handleReset}
          disabled={loading}
        >
          초기화
        </button>
        <button
          type="button"
          className="btn-primary btn-lg"
          onClick={handleSubmit}
          disabled={loading || filledCount === 0}
          style={{ flex: 1 }}
        >
          {loading ? '시딩 중...' : `시딩 실행 (${filledCount}개 공정)`}
        </button>
      </div>
    </div>
  )
}
