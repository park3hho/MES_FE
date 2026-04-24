import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PHI_SPECS } from '@/constants/processConst'
import { useModels } from '@/hooks/useModels'
import PageHeader from '@/components/common/PageHeader'
import s from './SpecListStep.module.css'

// DEFAULT_MOTOR / FIXED_MOTOR 제거: DB ModelRegistry 로 이관 (2026-04-24 PR-7)

// 산출물(파이별 묶음) 입력 — motor_type(outer/inner)도 항목별 선택
export default function SpecListStep({ onConfirm, onBack }) {
  // color: DB ModelRegistry 로 이관 (2026-04-24 PR-6)
  const { models, findModel } = useModels()
  const resolveColor = (phi, motor) =>
    findModel(phi, motor)?.color_hex ??
    findModel(phi, 'inner')?.color_hex ??
    findModel(phi, 'outer')?.color_hex ??
    PHI_SPECS[phi]?.color ??
    '#9CA3AF'

  // phi 별 motor_type 옵션 목록 (is_active 만) — DB ModelRegistry 기준
  // 기존 DEFAULT_MOTOR/FIXED_MOTOR 로직을 대체. 신규 모델 추가 시 자동 반영.
  const motorOptionsByPhi = useMemo(() => {
    const m = {}
    for (const mod of models) {
      if (!mod.is_active) continue
      if (!m[mod.phi]) m[mod.phi] = new Set()
      m[mod.phi].add(mod.motor_type)
    }
    return Object.fromEntries(
      Object.entries(m).map(([phi, set]) => [phi, Array.from(set)]),
    )
  }, [models])

  const defaultMotorFor = (spec) => (motorOptionsByPhi[spec] || [])[0] || 'outer'

  // 파이 그리드 목록 — DB ModelRegistry 기준 (2026-04-24 추가 보완)
  // 신규 phi 등록 시 자동 반영. display_order 오름차순 정렬 (같은 phi 는 중복 제거)
  // DB 가 비어있거나 로딩 중이면 기존 PHI_SPECS 키로 fallback
  const phiList = useMemo(() => {
    const seen = new Map()  // phi -> display_order (first seen)
    for (const mod of models) {
      if (!mod.is_active) continue
      if (!seen.has(mod.phi)) {
        seen.set(mod.phi, mod.display_order ?? 999)
      }
    }
    if (seen.size === 0) {
      return Object.keys(PHI_SPECS)
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([phi]) => phi)
  }, [models])

  const [eaList,  setEaList]  = useState([])
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  const handleAddSpec = (spec) => {
    setEaList(prev => [...prev, { id: Date.now(), spec, quantity: 1, motor_type: defaultMotorFor(spec) }])
  }

  const handleQtyChange = (id, val) => {
    // 빈 문자열("") 허용 — 사용자가 지우고 다시 입력하는 패턴 지원
    // 숫자 외 문자만 차단. 최종 유효성(빈값/0 이하)은 handleNext에서 검사
    if (val !== '' && !/^\d+$/.test(val)) return
    setEaList(prev => prev.map(item => item.id === id ? { ...item, quantity: val } : item))
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
    <div className={`page-flat ${s.pageFlex}`}>
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
          {phiList.map((spec) => {
            // color: DB ModelRegistry 로 이관 (2026-04-24 PR-6, PR-7) — motor 미정 → default motor 로 조회
            // phi 목록: DB 기반 동적 렌더 (2026-04-24 추가 보완) — 신규 모델 등록 시 자동 반영
            const color = resolveColor(spec, defaultMotorFor(spec))
            return (
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
            )
          })}
        </div>
      </section>

      {/* ── 추가된 산출물 리스트 — 이 섹션만 내부 스크롤 ── */}
      <section className={`${s.section} ${s.listSection}`}>
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
          <div className={`${s.list} ${s.scrollableList}`}>
            <AnimatePresence>
              {eaList.map((item) => {
                // color: DB ModelRegistry 로 이관 (2026-04-24 PR-6)
                const itemColor = resolveColor(item.spec, item.motor_type)
                // FIXED_MOTOR 제거: DB ModelRegistry 로 이관 (2026-04-24 PR-7)
                // motor 옵션이 2개 이상인 phi 만 토글 노출 (1개면 고정 표시)
                const motorOptions = motorOptionsByPhi[item.spec] || []
                const canToggleMotor = motorOptions.length >= 2
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
