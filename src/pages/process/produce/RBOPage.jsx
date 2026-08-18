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
import DatePickStep from '@/components/DatePickStep'
import FlowSteps from '@/components/FlowSteps'
import RotorBond2Flow from './RotorBond2Flow'
import { useDate } from '@/utils/useDate'
import { workTimeBody } from '@/utils/workTime'
import { RBO_STEPS, autoWorkerCode } from '@/constants/processConst'
import { Feature, canAccess } from '@/constants/permissions'

// A 바인딩 (2026-07-18) — 맨 앞 'po' 스텝: 생산오더 선택 시 그 PO 로 소비·집계.
//   "PO 없이"면 기존 'rotor'(회전자 Item 직접 선택) 흐름 = 폴백/무회귀.
//   'preflight'(2026-07-20): 회전자/PO 선택 직후 자석 재고 사전점검.
// 'qty' = 요크 배치 LOT 1개 스캔 후 '만들 회전자 수(k)' 입력 → 배치에서 k개 부분 소비 (2026-07-28)
// 'date_pick' = 작업일 선택 (2026-07-28) — MaterialSelector 가 auto step(date)을 렌더링하지 않아
//   RBO_STEPS 에 date 가 있어도 화면에 안 떴음. 밀린 작업을 실제 작업일로 발급하려면 필요.
// 'mode' = 맨 앞 진입 선택 (2026-07-30): 'po'(생산오더 기준, 기존) vs 'quick'(요크 스캔 → 정합성만 확인 → 바로 작업자).
//   quick 은 po/rotor/preflight 를 건너뛰고 scan 부터 — rotor_item·po 없이 (phi,motor) 폴백으로 소비.
const STEP_ORDER = ['mode', 'po', 'rotor', 'preflight', 'scan', 'qty', 'selector', 'date_pick', 'confirm']

// 흐름 레벨 스텝 인디케이터 (2026-07-30) — 스캔→수량→작업자→작업일 을 화면마다 일관 표시.
//   mode/po/rotor/preflight(진입·셋업)와 confirm(발급)은 카운트 제외 — 실제 본딩 입력 4스텝만.
const RBO_FLOW_LABELS = ['요크 스캔', '수량', '작업자', '작업일']
const RBO_FLOW_INDEX = { scan: 0, qty: 1, selector: 2, date_pick: 3 }

// 상세 세션 날짜 변환 — YYMMDD(내부) ↔ 'YYYY-MM-DD'(<input type=date>)
const toDateInput = (yy) => (yy && yy.length === 6 ? `20${yy.slice(0, 2)}-${yy.slice(2, 4)}-${yy.slice(4, 6)}` : '')
const fromDateInput = (inp) => (inp ? inp.slice(2).replace(/-/g, '') : '')

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
  const [yokeLots, setYokeLots] = useState([])        // 스캔한 요크 배치(REA) LOT — [배치LOT 1개] (2026-07-28 배치)
  const [boQty, setBoQty] = useState('')              // 이 배치에서 만들 회전자 수 k (배치 부분 소비)
  const [batchQty, setBatchQty] = useState(null)      // 스캔한 요크 배치 LOT 의 총 잔량(요크 수) — yoke_check 반환 (2026-07-30)
  const [ipqWarn, setIpqWarn] = useState(null)        // 요크 IPQ 소프트 경고 {status, msg} — 미검사/불량/미판정 시 (비차단, 2026-08-05)
  const [detailMode, setDetailMode] = useState(false) // 수량 스텝: 간단(단일) vs 상세(세션 표) — 다중 작업자·날짜 (2026-07-30)
  const [sessions, setSessions] = useState([])        // 상세 세션 [{worker, date(YYMMDD), count}]
  const [magnetOverrides, setMagnetOverrides] = useState(null)   // 자석 대체품 선택 {primary item_id: 대체 item_id}
  const [selections, setSelections] = useState(null)
  const [overrideDate, setOverrideDate] = useState(null)   // 작업일 수동 지정 (null = 오늘)
  // 작업일지 구간 (2026-08-12) — 작업일 STEP 이 서버 제안으로 채우고, 필요하면 작업자가 미세조정
  const [workTime, setWorkTime] = useState({ start: '', end: '' })
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState(null)              // 'po'(기존) | 'quick'(빠른 스캔). null = 아직 선택 전
  const [step, setStep] = useState('mode')
  const [direction, setDirection] = useState(1)

  const goTo = (next) => {
    const cur = STEP_ORDER.indexOf(step)
    setDirection(STEP_ORDER.indexOf(next) > cur ? 1 : -1)
    setStep(next)
  }

  const handleReset = () => {
    setPo(null); setRotorItem(null); setYokeLots([]); setBoQty(''); setBatchQty(null); setIpqWarn(null); setMagnetOverrides(null); setSelections(null)
    setOverrideDate(null); setMode(null); setDetailMode(false); setSessions([])
    setPrinting(false); setDone(false); setError(null)
    setDirection(1); setStep('mode')
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

  // 선택한 작업일 우선 — LOT 채번·라벨·미리보기 전부 이 값을 써야 한다 (date 직접 참조 금지)
  const effectiveDate = overrideDate || date

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      // 자석 스캔 없음 — PO 선택 시 그 PO 의 동결 구성품, 없으면 회전자 BOM 기준으로 자석 자동 차감.
      const common = {
        selected_process: 'BO',
        line: 'rotor',
        prev_lot_no: yokeLots[0] || null,   // 요크 배치 LOT 1개 — BE 가 배치에서 부분 소비
        rotor_item_id: rotorItem?.item_id ?? null,
        po_id: po?.id ?? null,   // A 바인딩 — 있으면 BE 가 동결 BOM 으로 소비·집계
        magnet_overrides: (magnetOverrides && Object.keys(magnetOverrides).length) ? magnetOverrides : null,
        shape: 'BM',
      }
      if (detailMode) {
        // 세션 순차 발급 — 각 세션 worker/date/count. LOT 번호·작업일 모두 세션 날짜 기준 (2026-08-18).
        //   한 세션 실패해도 앞 세션은 확정(실물 본딩 불가역) — 에러는 그대로 표기.
        for (const sxn of sessions) {
          await printLot(`BM${sxn.worker}${sxn.date}`, sxn.count, {
            // 세션마다 작업일이 다르므로 LOT 번호·시퀀스도 그 세션 날짜 기준 (2026-08-18)
            ...common, worker: sxn.worker, work_date: sxn.date, override_date: sxn.date,
          })
        }
      } else {
        const k = parseInt(boQty, 10) || 0
        await printLot(`${selections.shape}${selections.worker}${effectiveDate}`, k, {
          ...common, ...selections, work_date: effectiveDate,
          override_date: effectiveDate,   // LOT 번호·시퀀스도 작업일 기준 (2026-08-18)
          ...workTimeBody(workTime),   // 작업일지 구간
        })
      }
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const flowIdx = RBO_FLOW_INDEX[step] ?? -1   // 흐름 인디케이터 현재 인덱스 (그 외 스텝은 -1)

  // 2차 본딩 — 완전 별개 흐름(작업자·날짜 → BO 다중 스캔, Print 없음). 1차 상태머신과 분리.
  if (mode === 'bond2') {
    return <RotorBond2Flow user={user} onLogout={onLogout} onBack={handleReset} />
  }

  const rotorLabel = mode === 'quick'
    ? '빠른 스캔'
    : po
      ? `PO ${po.po_no}`
      : rotorItem ? `${rotorItem.name} (Φ${rotorItem.phi} ${rotorItem.motor_type})` : 'BOM 검증 없이 진행'

  return (
    <AnimatePresence mode="wait" custom={direction}>
      {step === 'mode' && (
        <motion.div key="mode" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <div className="page-flat">
            <PageHeader title="로터본딩 진행 방식" subtitle="작업 방식에 맞는 진행 방법을 고르세요" onBack={onBack} />
            <div className="process-content-inner">
              <button type="button" className="btn-primary btn-lg btn-full" style={{ marginBottom: 12, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
                onClick={() => { setMode('po'); goTo('po') }}>
                <strong>1차 본딩 (PO 기준)</strong>
                <span style={{ fontSize: 12.5, fontWeight: 400, opacity: 0.85 }}>생산오더 선택 → 스펙 확인 → 요크 스캔</span>
              </button>
              <button type="button" className="btn-secondary btn-lg btn-full" style={{ marginBottom: 12, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
                onClick={() => { setMode('quick'); setPo(null); setRotorItem(null); setMagnetOverrides(null); goTo('scan') }}>
                <strong>1차 본딩 (빠른 스캔)</strong>
                <span style={{ fontSize: 12.5, fontWeight: 400, opacity: 0.85 }}>요크 스캔</span>
              </button>
              <button type="button" className="btn-secondary btn-lg btn-full" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
                onClick={() => setMode('bond2')}>
                <strong>2차 본딩</strong>
                <span style={{ fontSize: 12.5, fontWeight: 400, opacity: 0.85 }}>BO 연속 스캔 → 2차 정보 기록 (발급 없음)</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}

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
            onBack={() => goTo('mode')}
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
            onProceed={(overrides) => { setMagnetOverrides(overrides || null); goTo('scan') }}
            onBack={() => goTo(po ? 'po' : 'rotor')}
          />
        </motion.div>
      )}

      {step === 'scan' && (
        <QRScanner
          key="scan"
          processLabel="로터본딩 · 요크 배치 스캔"
          banner={
            <div>
              <FlowSteps steps={RBO_FLOW_LABELS} current={flowIdx} />
              <p style={{ color: 'var(--color-text-sub)', margin: 0 }}>
                회전자 <strong>{rotorLabel}</strong> — 만들 <strong>요크 배치 LOT</strong>을 스캔하세요 (다음에 수량 입력)
              </p>
            </div>
          }
          // 스캔 시점에 요크 검증(존재·소진·BOM 게이트) — 무효면 throw → QRScanner 가 스캔 거부 (2026-07-22)
          //   배치 소비(2026-07-28): 배치 LOT 1개 스캔 → 수량 스텝으로. (기존 다중 스캔 → 배치 단일 스캔)
          onScan={async (val) => {
            const res = await checkYoke({ lot_no: val, rotor_item_id: rotorItem?.item_id ?? null, po_id: po?.id ?? null })
            setYokeLots([val])
            setBatchQty(Number.isFinite(res?.quantity) ? res.quantity : null)   // 배치 총 요크 수 (수량 스텝 상한·표시)
            setIpqWarn(res?.ipq_warn ? { status: res.ipq_status, msg: res.ipq_msg } : null)   // IPQ 소프트 경고 (비차단)
            goTo('qty')
          }}
          onLogout={onLogout}
          onBack={() => goTo(mode === 'quick' ? 'mode' : ((po || rotorItem) ? 'preflight' : 'rotor'))}
        />
      )}

      {step === 'qty' && (
        <motion.div key="qty" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <div className="page-flat">
            <PageHeader
              title="만들 회전자 수량"
              subtitle={`요크 배치 ${yokeLots[0] || ''}${batchQty != null ? ` · 총 ${batchQty}개` : ''} 에서 몇 개 본딩할지 입력`}
              onBack={() => goTo('scan')} />
            <div className="process-content-inner">
              {/* IPQ 소프트 경고 (비차단) — 미검사/불량/미판정 요크를 본딩하려 할 때 상기 (2026-08-05) */}
              {ipqWarn && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', marginBottom: 14,
                  borderRadius: 8, background: 'rgba(230, 126, 34, 0.1)',
                  border: '1px solid var(--color-warning, #e67e22)',
                }}>
                  <span style={{ fontSize: 16, lineHeight: '20px' }}>⚠</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-warning, #e67e22)' }}>{ipqWarn.msg}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--color-text-sub)' }}>
                      IPQ 검사 없이 본딩을 진행합니다. 계속하려면 수량을 입력하세요.
                    </p>
                  </div>
                </div>
              )}
              {/* 간단(단일 작업자/날짜) vs 상세(여러 작업자·날짜 세션) */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button type="button" className={`${detailMode ? 'btn-secondary' : 'btn-primary'} btn-full`}
                  onClick={() => setDetailMode(false)}>간단</button>
                <button type="button" className={`${detailMode ? 'btn-primary' : 'btn-secondary'} btn-full`}
                  onClick={() => setDetailMode(true)}>상세 (여러 작업자·날짜)</button>
              </div>

              {!detailMode ? (
                <>
                  <FlowSteps steps={RBO_FLOW_LABELS} current={flowIdx} />
                  <p style={{ color: 'var(--color-text-sub)', marginBottom: 12 }}>
                    {batchQty != null
                      ? <>이 배치에 요크가 <strong>총 {batchQty}개</strong> 있어요. <strong>k개</strong>를 본딩하면 회전자 k개 발급 + 요크 잔량 k개 차감돼요.</>
                      : <>이 배치에서 <strong>k개</strong>를 본딩하면 회전자 k개 발급 + 요크 잔량 k개 차감돼요.</>}
                  </p>
                  {(() => {
                    const k = parseInt(boQty, 10)
                    const over = batchQty != null && k > batchQty
                    const valid = k > 0 && !over
                    return <>
                      <input type="text" inputMode="numeric" value={boQty} autoFocus
                        onChange={(e) => { const v = e.target.value; if (v !== '' && !/^\d+$/.test(v)) return; setBoQty(v) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && valid) goTo('selector') }}
                        placeholder={batchQty != null ? `수량 (개) · 최대 ${batchQty}` : '수량 (개)'}
                        style={{ width: '100%', padding: 14, fontSize: 18, textAlign: 'center', borderRadius: 8, border: `1.5px solid ${over ? 'var(--color-danger)' : 'var(--color-border)'}`, marginBottom: over ? 8 : 16 }} />
                      {over && (
                        <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>
                          배치 잔량({batchQty}개)보다 많이 본딩할 수 없어요. 요크를 더 만들거나 수량을 줄여주세요.
                        </p>
                      )}
                      <button type="button" className="btn-primary btn-lg btn-full"
                        disabled={!valid} onClick={() => goTo('selector')}>
                        다음
                      </button>
                    </>
                  })()}
                </>
              ) : (
                <RboSessionTable
                  batchQty={batchQty}
                  sessions={sessions}
                  setSessions={setSessions}
                  defaultWorker={autoWorkerCode(user) || ''}
                  defaultDate={effectiveDate}
                  onNext={() => goTo('confirm')}
                />
              )}
            </div>
          </div>
        </motion.div>
      )}

      {step === 'selector' && (
        <motion.div key="selector" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <MaterialSelector
            steps={RBO_STEPS}
            autoValues={{ date: effectiveDate, seq: '00', worker: autoWorkerCode(user) }}
            stepHeader={<FlowSteps steps={RBO_FLOW_LABELS} current={flowIdx} />}
            onSubmit={(sel) => { setSelections({ ...sel, shape: 'BM' }); goTo('date_pick') }}
            onLogout={onLogout}
            onBack={() => goTo('qty')}
          />
        </motion.div>
      )}

      {step === 'date_pick' && (
        <motion.div key="date_pick" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <DatePickStep
            today={date}
            value={effectiveDate}
            onPick={setOverrideDate}
            topSlot={<FlowSteps steps={RBO_FLOW_LABELS} current={flowIdx} />}
            workTime={workTime}
            onWorkTime={setWorkTime}
            worker={selections?.worker || autoWorkerCode(user) || ''}
            lotPreview={`${selections?.shape || 'BM'}${selections?.worker || ''}${effectiveDate}-00`}
            onNext={() => goTo('confirm')}
            onBack={() => goTo('selector')}
          />
        </motion.div>
      )}

      {step === 'confirm' && detailMode && (() => {
        const total = sessions.reduce((a, s) => a + s.count, 0)
        return (
          <ConfirmModal
            lotNo={`다중 세션 ${sessions.length}건`}
            printCount={total}
            producedUnit="개"
            extraInfo={`요크 배치 ${yokeLots[0] || ''} → 회전자 ${total}개 · 자석 BOM 자동 차감\n` +
              sessions.map((s) => `${s.worker} · ${s.date} · ${s.count}개`).join('  /  ')}
            printing={printing}
            done={done}
            error={error}
            errorFix={errorFix}
            onConfirm={handleConfirm}
            onCancel={() => goTo('qty')}
          />
        )
      })()}

      {step === 'confirm' && !detailMode && (
        <ConfirmModal
          lotNo={`${selections.shape}${selections.worker}${effectiveDate}-00`}
          printCount={parseInt(boQty, 10) || 0}
          producedUnit="개"
          extraInfo={`회전자 ${rotorLabel} · 요크 배치 ${yokeLots[0] || ''} → 회전자 ${parseInt(boQty, 10) || 0}개 · 자석 BOM 자동 차감`}
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


// 상세 세션 표 — 한 배치를 여러 (작업자·작업일·개수) 세션으로 나눠 발급 (2026-07-30)
//   LOT 번호도 세션별 작업일 기준으로 채번된다(override_date). 2026-08-18 이전엔 발급 당일로 굳어 있었다.
function RboSessionTable({ batchQty, sessions, setSessions, defaultWorker, defaultDate, onNext }) {
  const [draft, setDraft] = useState({ worker: defaultWorker, date: defaultDate, count: '' })
  const total = sessions.reduce((a, s) => a + s.count, 0)
  const over = batchQty != null && total > batchQty
  const canAdd = (draft.worker || '').trim() && parseInt(draft.count, 10) > 0 && draft.date

  const add = () => {
    if (!canAdd) return
    setSessions((prev) => [...prev, { worker: draft.worker.trim(), date: draft.date, count: parseInt(draft.count, 10) }])
    setDraft((d) => ({ ...d, count: '' }))
  }
  const remove = (i) => setSessions((prev) => prev.filter((_, idx) => idx !== i))

  return (
    <div>
      <p style={{ color: 'var(--color-text-sub)', marginBottom: 10 }}>
        여러 작업자·날짜로 나눠 본딩했으면 세션을 추가하세요.
        {batchQty != null && <> 합계 <strong>{total}</strong> / 배치 {batchQty}.</>}
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <input type="text" value={draft.worker} placeholder="작업자"
          onChange={(e) => setDraft((d) => ({ ...d, worker: e.target.value.trim() }))}
          style={{ flex: '1 1 90px', padding: 10, borderRadius: 8, border: '1.5px solid var(--color-border)' }} />
        <input type="date" value={toDateInput(draft.date)}
          onChange={(e) => setDraft((d) => ({ ...d, date: fromDateInput(e.target.value) }))}
          style={{ flex: '1 1 130px', padding: 10, borderRadius: 8, border: '1.5px solid var(--color-border)' }} />
        <input type="text" inputMode="numeric" value={draft.count} placeholder="개수"
          onChange={(e) => { const v = e.target.value; if (v !== '' && !/^\d+$/.test(v)) return; setDraft((d) => ({ ...d, count: v })) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) add() }}
          style={{ flex: '0 1 80px', padding: 10, textAlign: 'center', borderRadius: 8, border: '1.5px solid var(--color-border)' }} />
        <button type="button" className="btn-secondary" disabled={!canAdd} onClick={add}>추가</button>
      </div>
      {sessions.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
          {sessions.map((s, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ flex: 1 }}><strong>{s.worker}</strong> · {s.date} · {s.count}개</span>
              <button type="button" className="btn-text" onClick={() => remove(i)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {over && (
        <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>
          합계({total}개)가 배치 잔량({batchQty}개)을 초과합니다. 개수를 줄여주세요.
        </p>
      )}
      <button type="button" className="btn-primary btn-lg btn-full"
        disabled={sessions.length === 0 || over} onClick={onNext}>
        다음 (총 {total}개)
      </button>
    </div>
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
function PoPickStep({ onPick, onSkip, onBack }) {
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
            진행 가능한 로터 생산오더가 없습니다 — [관리 &gt; 생산오더]에서 수주(SO)를 선택해 “생산오더 생성”으로 만들거나, 아래 “PO 없이”로 진행하세요.
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
  const [sel, setSel] = useState({})   // 라인별 소비 선택 {primary item_id: 선택 item_id}

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

  // 기본 선택 = 서버 제안(suggested) — primary 충분하면 primary, 부족하면 가용 대체품
  useEffect(() => {
    if (!result?.lines) return
    const init = {}
    for (const l of result.lines) {
      if (l.item_id != null) init[l.item_id] = l.suggested_item_id ?? l.item_id
    }
    setSel(init)
  }, [result])

  // override = primary 아닌 선택만 (BE 는 미지정 라인을 primary 로 소비)
  const buildOverrides = () => {
    const ov = {}
    for (const l of (result?.lines || [])) {
      if (l.item_id == null) continue
      const chosen = sel[l.item_id] ?? l.item_id
      if (chosen !== l.item_id) ov[l.item_id] = chosen
    }
    return ov
  }

  // 현재 '선택한' 후보가 개봉재고 부족이면 진행 차단(발급 422 방지) — 서버 ok 는 제안 기준이라 별도 검사
  const selBlocked = (result?.lines || []).some((l) => {
    if (l.item_id == null) return false
    const chosen = sel[l.item_id] ?? l.suggested_item_id ?? l.item_id
    const cand = (l.candidates || []).find((c) => c.item_id === chosen)
    return cand ? cand.opened < l.need : false
  })

  return (
    <div className="page-flat">
      <PageHeader title="자석 재고 사전점검" subtitle={`${label} — 소비 전에 개봉 재고를 확인해요`} onBack={onBack} />
      <div className="process-content-inner">
        {loading ? (
          <p style={{ color: 'var(--color-text-sub)' }}>확인 중…</p>
        ) : err ? (
          <>
            <p style={{ color: 'var(--color-warning, #e67e22)', fontWeight: 600 }}>⚠ 사전점검을 하지 못했습니다: {err}</p>
            <button type="button" className="btn-ghost btn-md" style={{ marginTop: 12 }} onClick={() => onProceed()}>
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
                {result.lines.map((l, i) => {
                  const chosen = l.item_id != null ? (sel[l.item_id] ?? l.suggested_item_id ?? l.item_id) : null
                  const cand = (l.candidates || []).find((c) => c.item_id === chosen)
                  const isSub = cand ? !cand.is_primary : false
                  const shownOpen = cand ? cand.opened : l.opened
                  const enough = shownOpen >= l.need
                  const hasChoice = (l.candidates || []).length > 1
                  return (
                    <div key={i} style={{
                      display: 'flex', flexDirection: 'column', gap: 6,
                      padding: '8px 12px', borderRadius: 8,
                      border: `1px solid ${isSub ? 'var(--color-warning, #e67e22)' : (enough ? 'var(--color-border)' : 'var(--color-danger, #d23f3f)')}`,
                      background: 'var(--color-bg-input)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>
                          {l.label} · {l.pole}극
                          {isSub && (
                            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                              background: 'var(--color-warning, #e67e22)', color: 'var(--color-white, #fff)' }}>
                              ⚠ 대체품
                            </span>
                          )}
                        </span>
                        <span style={{ color: enough ? 'var(--color-success, #27ae60)' : 'var(--color-danger, #d23f3f)', fontWeight: 700 }}>
                          개봉 {shownOpen} / 필요 {l.need} {enough ? '✓' : '✕'}
                        </span>
                      </div>
                      {hasChoice && (
                        <select
                          value={String(chosen)}
                          onChange={(e) => setSel((m) => ({ ...m, [l.item_id]: Number(e.target.value) }))}
                          style={{ padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-white, #fff)' }}
                        >
                          {l.candidates.map((c) => (
                            <option key={c.item_id} value={String(c.item_id)}>
                              {c.is_primary ? '[정품] ' : '[대체] '}{c.name} · 개봉 {c.opened}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {result.ok ? (
              <>
                <button type="button" className="btn-primary btn-lg" disabled={selBlocked}
                  onClick={() => onProceed(buildOverrides())}>
                  자석 재고 확인됨 · 다음 (요크 스캔)
                </button>
                {selBlocked && (
                  <p style={{ fontSize: 12, color: 'var(--color-danger, #d23f3f)', margin: '8px 0 0' }}>
                    선택한 자석 중 개봉 재고가 부족한 항목이 있습니다 — 재고 있는 후보로 바꾸거나 창고에서 개봉하세요.
                  </p>
                )}
              </>
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
