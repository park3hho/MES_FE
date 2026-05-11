// SeedChainPage — Toss flat 스타일 (2026-04-16 개편)
// 카드 제거 · PageHeader/Section 사용 · 하단 sticky CTA
// 2026-05-06 — 모델 선택을 ModelRegistry 등록 조합으로 제한 (하드코딩 phi×motor 8조합 → 등록된 것만)

import { useState, useMemo } from 'react'
import { seedChain } from '@/api'
import { PHI_SPECS } from '@/constants/processConst'
import { useModels } from '@/hooks/useModels'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import s from './SeedChainPage.module.css'

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
  const { models } = useModels()

  // ModelRegistry 등록 조합만 칩으로 노출 — 같은 phi+motor 의 다른 rt_st_type 은 dedupe (시딩은 phi/motor 만 사용).
  // 정렬: phi desc (87→20) → motor (outer→inner)
  const phiMotorOptions = useMemo(() => {
    const seen = new Map() // key → 첫 model (color/label 우선)
    for (const m of models || []) {
      if (!m.phi) continue
      const key = `${m.phi}|${m.motor_type || ''}`
      if (!seen.has(key)) seen.set(key, m)
    }
    return [...seen.values()].sort((a, b) => {
      const pd = Number(b.phi) - Number(a.phi)
      if (pd !== 0) return pd
      return (a.motor_type || '').localeCompare(b.motor_type || '')
    })
  }, [models])

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

  // 모델 칩 라벨/색 — ModelRegistry label 우선, 없으면 `Φ{phi} {Inner|Outer}` 자동
  const modelLabel = (m) => m.label || `Φ${m.phi}${m.motor_type ? ` ${m.motor_type[0].toUpperCase()}${m.motor_type.slice(1)}` : ''}`
  const modelColor = (m) => m.color_hex || PHI_SPECS[m.phi]?.color || '#9CA3AF'

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

      {/* 제품 모델 — ModelRegistry 등록 조합만 노출 (2026-05-06).
          phi+motor 한 번에 선택. 같은 phi+motor 의 다른 rt_st_type 은 dedupe (시딩은 phi/motor 만 사용). */}
      <Section label="제품 모델 (등록된 조합만 선택 가능)">
        {phiMotorOptions.length === 0 ? (
          <p className={s.error} style={{ color: 'var(--color-text-sub, #5f6b7a)' }}>
            등록된 모델이 없습니다. /admin/models 에서 모델을 먼저 등록해 주세요.
          </p>
        ) : (
          <div className={s.chipRow}>
            {phiMotorOptions.map((m) => {
              const active = phi === m.phi && motorType === (m.motor_type || '')
              const color = modelColor(m)
              return (
                <button
                  key={`${m.phi}|${m.motor_type || ''}`}
                  type="button"
                  className={`${s.chip} ${active ? s.chipActive : ''}`}
                  style={active ? { backgroundColor: color, borderColor: color, color: '#fff' } : {}}
                  onClick={() => {
                    setPhi(m.phi)
                    setMotorType(m.motor_type || '')
                  }}
                >
                  {modelLabel(m)}
                </button>
              )
            })}
          </div>
        )}
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
