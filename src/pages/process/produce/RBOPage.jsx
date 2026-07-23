// pages/process/produce/RBOPage.jsx
// 로터 본딩 (2026-06-12, Phase 2 / 2026-07-17 배치화) —
//   ① 회전자 Item(모델) 선택 → ①' 자석 사전점검 → ② 요크 QR 스캔 → ③ 방식/작업자 → ④ N개 1:1 발급.
//   자석은 스캔하지 않음 (2026-07-16) — 선택한 회전자 BOM 의 자석 Item 을 개봉(in_use) 박스에서 자동 차감.
//   BOM 게이트: 스캔 요크·자석이 그 회전자 BOM 구성품이어야 함 (BOM 미셋업이면 Φ+극성 폴백).
//   자석 사전점검(2026-07-20): 선택 직후 개봉재고/수량/사양을 미리 확인 — 부족 시 진행 차단 + 수정 화면 이동.
//   BE 프로토콜: selected_process='BO' + line='rotor' + consumed_list(요크 N개) → 회전자 N개.
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAutoReset } from '@/hooks/useAutoReset'
import { printLot, getRotorLineItems, getProductionOrders, magnetPreflight, checkYoke } from '@/api'
import MaterialSelector from '@/components/MaterialSelector'
import QRScanner from '@/components/QRScanner'
import { ConfirmModal } from '@/components/ConfirmModal'
import PageHeader from '@/components/common/PageHeader'
import { useDate } from '@/utils/useDate'
import { RBO_STEPS } from '@/constants/processConst'
import { Feature, canAccess } from '@/constants/permissions'

// A 바인딩 (2026-07-18) — 맨 앞 'po' 스텝: 생산오더 선택 시 그 PO 로 소비·집계.
//   "PO 없이"면 기존 'rotor'(회전자 Item 직접 선택) 흐름 = 폴백/무회귀.
//   'preflight'(2026-07-20): 회전자/PO 선택 직후 자석 재고 사전점검.
const STEP_ORDER = ['po', 'rotor', 'preflight', 'scan', 'selector', 'confirm']

// 수정화면 라우트 → 필요 feature (RBAC 게이트, 2026-07-20). 없는 라우트(warehouse)는 전원 접근 가능.
//   현장 작업자(team_winding 등)가 team_rnd 전용 화면 버튼을 눌러 홈으로 무통보 튕기는 것 방지.
const FIX_FEATURE = {
  '/admin/manage/models': Feature.ADMIN_MODEL_REGISTRY,
  '/admin/bom': Feature.ADMIN_BOM,
}
const canGoFix = (user, route) => !FIX_FEATURE[route] || canAccess(user, FIX_FEATURE[route])

const pageVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir * -40 }),
}

export default function RBOPage({ user, onLogout, onBack }) {
  const date = useDate()
  const nav = useNavigate()
  const [po, setPo] = useState(null)                  // 선택한 생산오더 (A 바인딩). null = 오더리스(폴백)
  const [rotorItem, setRotorItem] = useState(null)    // 선택한 회전자 Item (BOM 앵커). PO 선택 시 PO 제품에서 파생
  const [yokeLots, setYokeLots] = useState([])        // 스캔한 요크(REA) LOT 목록 (1:1 → 회전자 N개)
  const [selections, setSelections] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('po')
  const [direction, setDirection] = useState(1)

  const goTo = (next) => {
    const cur = STEP_ORDER.indexOf(step)
    setDirection(STEP_ORDER.indexOf(next) > cur ? 1 : -1)
    setStep(next)
  }

  const handleReset = () => {
    setPo(null); setRotorItem(null); setYokeLots([]); setSelections(null)
    setPrinting(false); setDone(false); setError(null)
    setDirection(1); setStep('po')
  }
  // 성공 시에만 자동 리셋(다음 개체) — 에러 자동복귀는 제거(사용자가 읽고 수정 화면으로 이동, 2026-07-20).
  //   useAutoReset 의 error 인자에 null 을 주면 error 자동리셋만 꺼지고 done 자동리셋은 유지됨.
  useAutoReset(null, done, handleReset)

  // 에러 메시지 → 관련 수정 화면 이동 버튼 (2026-07-20). 사전점검이 못 잡은 최종 소비 에러 대비.
  const errorFix = useMemo(() => {
    if (!error) return null
    // 순서 주의: pole_pairs 미등록 메시지가 '자석 개수'라 '자석'을 포함 → 극쌍수를 자석보다 먼저 검사(리뷰 반영 2026-07-20).
    let route = null, label = null
    if (/극쌍수|pole_pairs/i.test(error)) { route = '/admin/manage/models'; label = '모델 관리로 이동 (극쌍수 등록)' }
    else if (/BOM/.test(error)) { route = '/admin/bom'; label = 'BOM 관리로 이동' }
    else if (/개봉|자석/.test(error)) { route = '/admin/warehouse'; label = '창고 관리로 이동 (자석 개봉)' }
    // 권한 없는 롤이 눌러 홈으로 무통보 튕기는 것 방지 — 접근 가능할 때만 버튼 노출
    if (!route || !canGoFix(user, route)) return null
    return { label, onClick: () => nav(route) }
  }, [error, user, nav])

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      // 자석 스캔 없음 — PO 선택 시 그 PO 의 동결 구성품, 없으면 회전자 BOM 기준으로 자석 자동 차감.
      // 요크 N개 → 회전자 N개 1:1. consumed_list 로 요크 목록 전달.
      await printLot(`${selections.shape}${selections.worker}${date}`, 1, {
        selected_process: 'BO',
        line: 'rotor',
        consumed_list: yokeLots.map((lot) => ({ lot_no: lot, quantity: 1 })),
        rotor_item_id: rotorItem?.item_id ?? null,
        po_id: po?.id ?? null,   // A 바인딩 — 있으면 BE 가 동결 BOM 으로 소비·집계
        ...selections,
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const rotorLabel = po
    ? `PO ${po.po_no}`
    : rotorItem ? `${rotorItem.name} (Φ${rotorItem.phi} ${rotorItem.motor_type})` : 'BOM 검증 없이 진행'

  return (
    <AnimatePresence mode="wait" custom={direction}>
      {step === 'po' && (
        <motion.div key="po" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <PoPickStep
            onPick={(p) => {
              // PO 선택 — 그 PO 제품(회전자 Item)을 앵커로. 사전점검으로.
              setPo(p)
              setRotorItem(p.product_item_id ? { item_id: p.product_item_id, name: `PO ${p.po_no}`, phi: '', motor_type: '' } : null)
              goTo('preflight')
            }}
            onSkip={() => { setPo(null); goTo('rotor') }}
            onDiscard={() => nav('/process/rotor-discard')}
            onBack={onBack}
          />
        </motion.div>
      )}

      {step === 'rotor' && (
        <motion.div key="rotor" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <RotorPickStep
            // 회전자 Item 선택 → 사전점검. "선택 안 함"(null)은 phi/motor 미상이라 점검 생략하고 스캔으로.
            onPick={(r) => { setRotorItem(r); goTo(r ? 'preflight' : 'scan') }}
            onBack={() => goTo('po')}
          />
        </motion.div>
      )}

      {step === 'preflight' && (
        <motion.div key="preflight" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <MagnetPreflight
            user={user}
            phi={rotorItem?.phi || ''}
            motorType={rotorItem?.motor_type || ''}
            rotorItemId={rotorItem?.item_id ?? null}
            poId={po?.id ?? null}
            label={rotorLabel}
            onProceed={() => goTo('scan')}
            onBack={() => goTo(po ? 'po' : 'rotor')}
          />
        </motion.div>
      )}

      {step === 'scan' && (
        <QRScanner
          key="scan"
          processLabel="로터본딩 · 요크 스캔"
          showList={true}
          defaultQty={1}
          unit="개"
          unit_type="개수"
          nextLabel="완료 → 다음"
          banner={
            <p style={{ color: 'var(--color-text-sub)', margin: 0 }}>
              회전자 <strong>{rotorLabel}</strong> — 만들 요크를 모두 스캔하세요
            </p>
          }
          // 스캔 시점에 요크 검증(존재·소진·BOM 게이트) — 무효면 throw → QRScanner 가 스캔 거부(발급까지 헛동작 방지, 2026-07-22)
          onScan={async (val) => {
            await checkYoke({ lot_no: val, rotor_item_id: rotorItem?.item_id ?? null, po_id: po?.id ?? null })
            return { quantity: 1, lot_chain: null, created_at: null }
          }}
          onScanList={(list) => {
            setYokeLots(list.map((i) => i.lot_no))
            goTo('selector')
          }}
          onLogout={onLogout}
          onBack={() => goTo((po || rotorItem) ? 'preflight' : 'rotor')}
        />
      )}

      {step === 'selector' && (
        <motion.div key="selector" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <MaterialSelector
            steps={RBO_STEPS}
            autoValues={{ date, seq: '00' }}
            onSubmit={(sel) => { setSelections({ ...sel, shape: 'BM' }); goTo('confirm') }}
            onLogout={onLogout}
            onBack={() => goTo('scan')}
          />
        </motion.div>
      )}

      {step === 'confirm' && (
        <ConfirmModal
          lotNo={`${selections.shape}${selections.worker}${date}-00`}
          printCount={yokeLots.length}
          producedUnit="개"
          extraInfo={`회전자 ${rotorLabel} · 요크 ${yokeLots.length}개 → 회전자 ${yokeLots.length}개 · 자석 BOM 자동 차감`}
          printing={printing}
          done={done}
          error={error}
          errorFix={errorFix}
          onConfirm={handleConfirm}
          onCancel={() => goTo('selector')}
        />
      )}
    </AnimatePresence>
  )
}


// 회전자 Item 선택 — Rotor 분류 + RotorSpec 등록된 Item (BOM 앵커). 미선택 시 Φ+극성 폴백 (2026-07-16)
function RotorPickStep({ onPick, onBack }) {
  const [rotors, setRotors] = useState([])
  useEffect(() => {
    getRotorLineItems('rotor').then(setRotors).catch(() => setRotors([]))
  }, [])

  return (
    <div className="page-flat">
      <PageHeader title="회전자 품목을 선택해 주세요" subtitle="이 BOM 기준으로 요크·자석이 검증돼요" onBack={onBack} />
      <div className="process-content-inner">
        {rotors.length === 0 && (
          <p style={{ color: 'var(--color-text-sub)' }}>
            등록된 회전자 품목이 없습니다 — 품목관리에서 Rotor 분류로 회전자 Item + BOM 을 등록하세요.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {rotors.map((r) => (
            <button key={r.item_id} type="button" className="btn-secondary btn-md" onClick={() => onPick(r)}>
              {r.name} (Φ{r.phi} {r.motor_type})
            </button>
          ))}
          {/* BOM 미셋업 전환기 — 선택 없이 진행 시 Φ+극성 폴백 (BOM 검증 없음) */}
          <button type="button" className="btn-ghost btn-md" onClick={() => onPick(null)}>
            선택 안 함 (BOM 검증 없이 진행)
          </button>
        </div>
      </div>
    </div>
  )
}


// 생산오더(PO) 선택 — line=rotor + 진행가능(OPEN/IN_PROGRESS). 선택 시 그 PO 동결 BOM 으로 소비·집계.
//   "PO 없이"면 기존 회전자 직접 선택 흐름으로 폴백 (A 바인딩, 2026-07-18).
function PoPickStep({ onPick, onSkip, onDiscard, onBack }) {
  const [pos, setPos] = useState([])
  useEffect(() => {
    getProductionOrders('rotor')
      .then((list) => setPos((list || []).filter((p) => p.status === 'OPEN' || p.status === 'IN_PROGRESS')))
      .catch(() => setPos([]))
  }, [])

  return (
    <div className="page-flat">
      <PageHeader title="생산오더(PO)를 선택해 주세요" subtitle="PO 선택 시 그 오더의 동결 BOM으로 소비·집계돼요" onBack={onBack} />
      <div className="process-content-inner">
        {pos.length === 0 && (
          <p style={{ color: 'var(--color-text-sub)' }}>
            진행 가능한 로터 생산오더가 없습니다 — [관리 &gt; 송장관리]의 요구 항목에서 완제품 Item·라인(회전자) 지정 후 “생산오더 생성”으로 만들거나, 아래 “PO 없이”로 진행하세요.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, marginBottom: 16 }}>
          {pos.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn-secondary btn-md"
              style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 3, height: 'auto', padding: '10px 14px' }}
              onClick={() => onPick(p)}
            >
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{p.po_no}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: p.status === 'OPEN' ? 'var(--color-primary)' : 'var(--color-text-sub)' }}>{p.status}</span>
              </span>
              <span style={{ fontSize: 13 }}>{p.product_name || '제품 미지정'}{p.product_spec ? ` · ${p.product_spec}` : ''}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>
                계획 {p.planned_qty}개 · 양품 {p.produced_qty}/{p.planned_qty}
                {p.due_date ? ` · 납기 ${p.due_date}` : ''}
                {p.invoice_id ? ` · 송장 #${p.invoice_id}` : ''}
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="btn-ghost btn-md" onClick={onSkip}>
          PO 없이 진행 (회전자 직접 선택)
        </button>
        {onDiscard && (
          <button type="button" className="btn-text" style={{ marginTop: 8, color: 'var(--color-danger, #d23f3f)' }} onClick={onDiscard}>
            요크 폐기 (자석 붙인 채 폐기 →)
          </button>
        )}
      </div>
    </div>
  )
}


// 자석 사전점검 — 회전자/PO 선택 직후 개봉재고·수량·사양을 소비 전에 확인 (헛동작 방지, 2026-07-20).
//   blocker 있으면 진행 차단 + 수정 화면 이동. 사전점검 호출 자체가 실패하면 '그래도 진행' 허용.
function MagnetPreflight({ user, phi, motorType, rotorItemId, poId, label, onProceed, onBack }) {
  const nav = useNavigate()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr(''); setResult(null)
    magnetPreflight({
      phi: phi || '', motor_type: motorType || '',
      rotor_item_id: rotorItemId ?? null, po_id: poId ?? null,
    })
      .then((r) => { if (!cancelled) setResult(r) })
      .catch((e) => { if (!cancelled) setErr(e.message || '사전점검 실패') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [phi, motorType, rotorItemId, poId])

  return (
    <div className="page-flat">
      <PageHeader title="자석 재고 사전점검" subtitle={`${label} — 소비 전에 개봉 재고를 확인해요`} onBack={onBack} />
      <div className="process-content-inner">
        {loading ? (
          <p style={{ color: 'var(--color-text-sub)' }}>확인 중…</p>
        ) : err ? (
          <>
            <p style={{ color: 'var(--color-warning, #e67e22)', fontWeight: 600 }}>⚠ 사전점검을 하지 못했습니다: {err}</p>
            <button type="button" className="btn-ghost btn-md" style={{ marginTop: 12 }} onClick={onProceed}>
              그래도 진행 (점검 생략)
            </button>
          </>
        ) : result && (
          <>
            {result.note && (
              <p style={{ fontSize: 13, color: 'var(--color-text-sub)', marginBottom: 12 }}>ℹ {result.note}</p>
            )}
            {result.lines?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {result.lines.map((l, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 12,
                    padding: '8px 12px', borderRadius: 8,
                    border: `1px solid ${l.ok ? 'var(--color-border)' : 'var(--color-danger, #d23f3f)'}`,
                    background: 'var(--color-bg-input)',
                  }}>
                    <span style={{ fontWeight: 600 }}>{l.label} · {l.pole}극</span>
                    <span style={{ color: l.ok ? 'var(--color-success, #27ae60)' : 'var(--color-danger, #d23f3f)', fontWeight: 700 }}>
                      개봉 {l.opened} / 필요 {l.need} {l.ok ? '✓' : '✕'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {result.ok ? (
              <button type="button" className="btn-primary btn-lg" onClick={onProceed}>
                자석 재고 확인됨 · 다음 (요크 스캔)
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.blockers?.map((b, i) => {
                  const gated = b.fix && !canGoFix(user, b.fix.route)
                  return (
                    <div key={i} style={{
                      padding: '10px 12px', borderRadius: 8,
                      background: 'var(--color-danger-bg, #fdecec)', color: 'var(--color-danger, #d23f3f)',
                    }}>
                      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>⚠ {b.message}</p>
                      {b.fix && !gated && (
                        <button type="button" className="btn-primary btn-md" onClick={() => nav(b.fix.route)}>
                          {b.fix.label}로 이동
                        </button>
                      )}
                      {b.fix && gated && (
                        <p style={{ margin: 0, fontSize: 12 }}>
                          권한이 없어 이동 불가 — 관리자에게 “{b.fix.label}” 등록을 요청하세요.
                        </p>
                      )}
                    </div>
                  )
                })}
                <p style={{ fontSize: 12, color: 'var(--color-text-sub)', margin: 0 }}>
                  재고를 갖춘 뒤 뒤로 가서 다시 선택하면 재점검됩니다. (헛발급 방지를 위해 여기서 막았어요)
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
