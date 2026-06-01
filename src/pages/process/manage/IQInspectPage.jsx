// pages/process/manage/IQInspectPage.jsx
// IQ (입고검사) — 토스형 한 화면 한 질문 wizard (2026-06-01)
//
// 진입 흐름:
//   1) 진입 시 풀스크린 QRScanner — LOT 스캔 or 수기 입력 ('-' 가능)
//   2) 스캔/입력 후 wizard 진입 — meta 자동채움 결과 확인하며 단계 진행
// 질문 시퀀스 (LOT 는 스캔으로 이미 잡혔으니 wizard 에서 제외):
//   category → received_date → supplier → product_type → inspection_target
//   → size → qty → [NG: defect_detail → responsible → responsible_qty → handle_method] → remark
// 선택형(category/product_type/responsible/handle_method)은 탭 즉시 다음.
// 텍스트/숫자형은 하단 풀폭 버튼 또는 Enter.
// qty 입력으로 OK/NG 가 정해지면 NG 단계가 시퀀스에 동적 삽입됨.
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRScanner from '@/components/QRScanner'
import {
  WizardShell, Question, BigChoice, BigInput, PrimaryButton, GhostButton,
} from '@/components/QcWizard'
import {
  QC_TYPE, PROCESS_CATEGORY, PRODUCT_TYPE, QC_JUDGMENT,
  RESPONSIBLE, HANDLE_METHOD, QC_UNITS_DEFAULT,
} from '@/constants/qcConst'
import {
  createQcInspection, isQcInternalLot,
  sendQcRepair, markQcNonconforming, getQcLotMeta,
} from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import { ScanMetaPanel, computeRate, computeJudgment, TODAY } from './qcInspectShared'


const IQ_CATEGORIES = [PROCESS_CATEGORY.OUTSOURCE, PROCESS_CATEGORY.RAW]

// 질문 시퀀스 — LOT 은 스캔 단계에서 잡혀서 wizard 에 없음 (2026-06-01)
const SEQ_HEAD = ['category', 'received_date', 'supplier', 'product_type', 'inspection_target', 'size', 'qty']
const SEQ_NG = ['defect_detail', 'responsible', 'responsible_qty', 'handle_method']
const SEQ_TAIL = ['remark']

// step key → form key (autofill-skip 매핑, 2026-06-01).
// LOT 메타 autofill 로 채워진 항목은 wizard 에서 재질문하지 않고 건너뜀.
// qty 는 inspection_qty 만 autofill — 양품/불량 수량은 여전히 사용자 입력 필요해서 제외.
const STEP_TO_FORM_KEY = {
  category:          'process_category',
  received_date:     'received_date',
  product_type:      'product_type',
  inspection_target: 'inspection_target',
}

// 칩 라벨 + 값 포맷
const CHIP_META = {
  category:        { label: '공정구분', fmt: (f) => f.process_category },
  received_date:   { label: '입고일',   fmt: (f) => f.received_date },
  supplier:        { label: '입고업체', fmt: (f) => f.supplier },
  product_type:    { label: '제품구분', fmt: (f) => f.product_type },
  inspection_target:    { label: '검사 대상', fmt: (f) => f.inspection_target },
  size:            { label: '사이즈',   fmt: (f) => f.size },
  qty:             { label: '검사/양품/불량', fmt: (f) => `${f.inspection_qty || '-'}/${f.good_qty || 0}/${f.defect_qty || 0}` },
  defect_detail:   { label: '불량내용', fmt: (f) => f.defect_detail },
  responsible:     { label: '귀책',     fmt: (f) => f.responsible },
  responsible_qty: { label: '귀책수량', fmt: (f) => f.responsible_qty },
  handle_method:   { label: '처리방법', fmt: (f) => f.handle_method },
}


export default function IQInspectPage({ user, onBack }) {
  // 진입 시 풀스크린 QR 스캐너 (OQ/IPQ 패턴, 2026-06-01). 스캔/수기 후 'form' 으로 전환.
  const [step, setStep] = useState('scan')
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState({
    process_category: '',
    received_date: TODAY(),
    supplier: '',
    product_type: '',
    inspection_target: '',
    size: '',
    lot_no: '',
    unit: 'ea',
    inspection_qty: '',
    good_qty: '',
    defect_qty: '',
    defect_detail: '',
    responsible: '',
    responsible_qty: '',
    handle_method: '',
    remark: '',
    inspector: user?.id || '',
  })
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }))

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const [savedInternal, setSavedInternal] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [ncMarked, setNcMarked] = useState(false)
  const [metaLoading, setMetaLoading] = useState(false)
  const [metaInfo, setMetaInfo] = useState(null)
  const [autofilledKeys, setAutofilledKeys] = useState([])

  const judgment = useMemo(() => computeJudgment(form.defect_qty), [form.defect_qty])
  const rate     = useMemo(() => computeRate(form.inspection_qty, form.defect_qty), [form.inspection_qty, form.defect_qty])
  const isNg     = judgment === QC_JUDGMENT.NG

  // 동적 시퀀스 — qty 입력으로 NG 면 NG 블록 삽입 (qty 까지 인덱스 고정이라 stepIndex 안전)
  const sequence = useMemo(
    () => (isNg ? [...SEQ_HEAD, ...SEQ_NG, ...SEQ_TAIL] : [...SEQ_HEAD, ...SEQ_TAIL]),
    [isNg],
  )
  const total = sequence.length
  const key = sequence[stepIndex]

  // autofill 결과로 채워진 step 자동 건너뛰기 (2026-06-01)
  // - 시나리오: LOT 스캔 → meta autofill → 'category/received_date/product_type/inspection_target'
  //   같은 step 의 form 값이 이미 채워졌다면 wizard 가 그 step 을 다시 묻지 않고 다음으로 진행.
  // - 현재 stepIndex 부터 앞으로 연속해서 채워진 step 만 스킵 (사용자가 chip 으로 되돌아갔다면 거기서 멈춤).
  useEffect(() => {
    if (autofilledKeys.length === 0) return
    let i = stepIndex
    while (i < sequence.length) {
      const k = sequence[i]
      const fk = STEP_TO_FORM_KEY[k]
      if (fk && form[fk] && autofilledKeys.includes(fk)) i++
      else break
    }
    if (i > stepIndex) setStepIndex(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofilledKeys])

  // LOT 입력 → debounced 메타 조회
  useEffect(() => {
    const lot = form.lot_no.trim()
    if (!lot || lot === '-') { setMetaInfo(null); setAutofilledKeys([]); return }
    const handle = setTimeout(async () => {
      setMetaLoading(true)
      try {
        const res = await getQcLotMeta(lot)
        const meta = res.meta
        setMetaInfo(meta)
        const filled = []
        if (meta.found) {
          setForm((prev) => {
            const next = { ...prev }
            // 공정구분 — meta.suggested.process_category (PROCESS_TO_CATEGORY 매핑)
            if (!prev.process_category && meta.suggested?.process_category) { next.process_category = meta.suggested.process_category; filled.push('process_category') }
            // 입고일 — meta.received_date (Inventory.created_at, 2026-06-01)
            if (meta.received_date) { next.received_date = meta.received_date; filled.push('received_date') }
            if (!prev.product_type && meta.suggested?.product_type) { next.product_type = meta.suggested.product_type; filled.push('product_type') }
            if (!prev.inspection_target && meta.suggested?.inspection_target) { next.inspection_target = meta.suggested.inspection_target; filled.push('inspection_target') }
            // 규격(size) — BE 가 공정별로 size_hint 산출 (EA→phi, RM→thickness, MP→width)
            if (!prev.size && meta.size_hint) { next.size = meta.size_hint; filled.push('size') }
            if (prev.inspection_qty === '' && meta.quantity != null) { next.inspection_qty = String(meta.quantity); filled.push('inspection_qty') }
            return next
          })
        }
        setAutofilledKeys(filled)
      } catch { /* 무시 */ }
      finally { setMetaLoading(false) }
    }, 500)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.lot_no])

  // ── 네비게이션 ──
  const goNext = () => { if (stepIndex < total - 1) setStepIndex(stepIndex + 1) }
  // 첫 단계에서 뒤로가기 = 스캐너로 복귀 (LOT 다시 스캔)
  const goBack = () => { if (stepIndex > 0) setStepIndex(stepIndex - 1); else setStep('scan') }
  const jumpTo = (i) => setStepIndex(i)

  // 선택형 — 탭 즉시 set + 진행
  const pickAndNext = (k, v) => { set(k, v); setTimeout(goNext, 120) }

  // 칩 — LOT 은 항상 prepend (스캔으로 잡혔으니 wizard 단계 밖). 나머지는 지나온 단계 중 값 있는 것.
  const lotChip = form.lot_no ? {
    key: 'lot',
    label: 'LOT',
    value: form.lot_no === '-' ? '(없음)' : form.lot_no,
    onClick: () => setStep('scan'),
  } : null
  const chips = [
    ...(lotChip ? [lotChip] : []),
    ...sequence.slice(0, stepIndex)
      .map((k, i) => ({ k, i }))
      .filter(({ k }) => CHIP_META[k] && CHIP_META[k].fmt(form))
      .map(({ k, i }) => ({
        key: k,
        label: CHIP_META[k].label,
        value: String(CHIP_META[k].fmt(form)),
        onClick: () => jumpTo(i),
      })),
  ]

  // ── 저장 / FAIL 후속 ──
  const onSave = async () => {
    if (!form.inspector.trim()) { emitToast('검사자 정보가 없습니다.', 'error'); return }
    setSaving(true)
    try {
      const body = {
        ...form,
        inspection_type: QC_TYPE.IQ,
        inspection_date: TODAY(),
        received_date: form.received_date || null,
        lot_no: form.lot_no === '-' ? '' : form.lot_no,
        inspection_qty: form.inspection_qty === '' ? null : parseFloat(form.inspection_qty),
        good_qty: parseFloat(form.good_qty || 0),
        defect_qty: parseFloat(form.defect_qty || 0),
        responsible_qty: form.responsible_qty === '' ? null : parseFloat(form.responsible_qty),
      }
      const res = await createQcInspection(body)
      const ins = res.inspection
      setSaved(ins)
      if (ins.judgment === QC_JUDGMENT.NG && ins.lot_no) {
        try {
          const chk = await isQcInternalLot(ins.lot_no)
          setSavedInternal({ lot_no: ins.lot_no, is_internal: !!chk.is_internal })
        } catch { setSavedInternal({ lot_no: ins.lot_no, is_internal: false }) }
      }
      emitToast(ins.judgment === QC_JUDGMENT.NG ? '검사 저장됨 — 불합격(NG)' : '검사 저장됨 (합격)',
        ins.judgment === QC_JUDGMENT.NG ? 'warning' : 'success')
    } catch (e) {
      emitToast(e.message || '저장 실패', 'error')
    } finally { setSaving(false) }
  }

  const onResetAll = () => {
    setForm({
      process_category: '', received_date: TODAY(), supplier: '',
      product_type: '', inspection_target: '', size: '', lot_no: '', unit: 'ea',
      inspection_qty: '', good_qty: '', defect_qty: '',
      defect_detail: '', responsible: '', responsible_qty: '', handle_method: '', remark: '',
      inspector: user?.id || '',
    })
    setSaved(null); setSavedInternal(null); setNcMarked(false); setStepIndex(0)
    setMetaInfo(null); setAutofilledKeys([])
    setStep('scan')   // 초기화 = 스캐너로 복귀
  }

  const onSendRepair = async () => {
    if (!saved) return
    const reason = window.prompt('재공정 사유:', form.defect_detail || '')
    if (!reason) return
    setActionBusy(true)
    try {
      const res = await sendQcRepair(saved.id, reason)
      emitToast(`재공정 LOT 생성: ${res.repair_lot || '(?)'}`, 'success')
      setSaved({ ...saved, repair_lot_no: res.repair_lot || '', handle_method: HANDLE_METHOD.REWORK })
    } catch (e) { emitToast(e.message || '재공정 실패', 'error') }
    finally { setActionBusy(false) }
  }

  const onMarkNonconforming = async () => {
    if (!saved) return
    const reason = window.prompt('부적합 사유:', form.defect_detail || '')
    if (!reason) return
    setActionBusy(true)
    try {
      const res = await markQcNonconforming(saved.id, reason)
      emitToast(res.affected_inventory_rows ? `부적합품 격리됨 (재고 ${res.affected_inventory_rows}행)` : '부적합품 기록 저장 (외부 자재)', 'warning')
      setNcMarked(true)
    } catch (e) { emitToast(e.message || '부적합품 처리 실패', 'error') }
    finally { setActionBusy(false) }
  }

  // ── 스캔 화면 (진입 시) — QRScanner 풀스크린 (2026-06-01) ──
  if (step === 'scan' && !saved) {
    return (
      <QRScanner
        processLabel="IQ — 입고검사"
        onScan={async (val) => {
          const v = (val || '').trim()
          if (!v) throw new Error('빈 값입니다.')
          set('lot_no', v)
          setStepIndex(0)
          setStep('form')
        }}
        onBack={onBack}
      />
    )
  }

  // ── 저장 후 결과 화면 ──
  if (saved) {
    return (
      <div className="page-flat">
        <ResultScreen
          saved={saved} ncMarked={ncMarked} savedInternal={savedInternal} actionBusy={actionBusy}
          onSendRepair={onSendRepair} onMarkNonconforming={onMarkNonconforming} onReset={onResetAll}
        />
      </div>
    )
  }

  // ── wizard 본문 ──
  return (
    <div className="page-flat">
      <WizardShell stepIndex={stepIndex} total={total} onBack={goBack} chips={chips}>
        <AnimatePresence mode="wait">
          <motion.div
            key={key}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.16 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          >
            {renderQuestion()}
          </motion.div>
        </AnimatePresence>
      </WizardShell>
    </div>
  )

  // ── 질문별 렌더 ──
  function renderQuestion() {
    switch (key) {
      case 'category':
        return (
          <Question title="어떤 입고인가요?" sub="외주 가공 입고 또는 신규 원자재 입고">
            {(metaLoading || metaInfo) && (
              <ScanMetaPanel loading={metaLoading} meta={metaInfo} autofilledKeys={autofilledKeys} />
            )}
            <BigChoice
              options={IQ_CATEGORIES}
              value={form.process_category}
              onPick={(v) => pickAndNext('process_category', v)}
            />
          </Question>
        )

      case 'received_date':
        return (
          <Question
            title="입고일은 언제인가요?"
            footer={<PrimaryButton onClick={goNext} disabled={!form.received_date}>다음</PrimaryButton>}
          >
            <BigInput type="date" value={form.received_date}
                      onChange={(e) => set('received_date', e.target.value)} />
          </Question>
        )

      case 'supplier':
        return (
          <Question
            title="어느 업체에서 왔나요?"
            sub="입고업체명을 입력하세요"
            footer={<PrimaryButton onClick={goNext} disabled={!form.supplier.trim()}>다음</PrimaryButton>}
          >
            <BigInput type="text" value={form.supplier} autoFocus placeholder="업체명"
                      onChange={(e) => set('supplier', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && form.supplier.trim() && goNext()} />
          </Question>
        )

      case 'product_type':
        return (
          <Question title="제품 구분은?">
            <BigChoice
              options={Object.values(PRODUCT_TYPE)}
              value={form.product_type}
              onPick={(v) => pickAndNext('product_type', v)}
            />
          </Question>
        )

      case 'inspection_target':
        return (
          <Question
            title="검사 대상은?"
            sub="예: 낱장, 고정자"
            footer={<PrimaryButton onClick={goNext} disabled={!form.inspection_target.trim()}>다음</PrimaryButton>}
          >
            <BigInput type="text" value={form.inspection_target} autoFocus placeholder="검사 대상"
                      onChange={(e) => set('inspection_target', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && form.inspection_target.trim() && goNext()} />
          </Question>
        )

      case 'size':
        return (
          <Question
            title="사이즈/규격은?"
            sub="예: 87, 95 (없으면 건너뛰기)"
            footer={<>
              <PrimaryButton onClick={goNext}>다음</PrimaryButton>
              <GhostButton onClick={() => { set('size', ''); goNext() }}>건너뛰기</GhostButton>
            </>}
          >
            <BigInput type="text" value={form.size} autoFocus placeholder="사이즈"
                      onChange={(e) => set('size', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && goNext()} />
          </Question>
        )

      case 'qty':
        return (
          <Question
            title="검사 수량을 입력하세요"
            sub="검사수량 비우면 단일 LOT. 양품·불량 입력 시 자동 판정"
            footer={<PrimaryButton onClick={goNext} disabled={!qtyValid()}>다음</PrimaryButton>}
          >
            <QtyBlock form={form} set={set} rate={rate} judgment={judgment} />
          </Question>
        )

      case 'defect_detail':
        return (
          <Question
            title="불량 내용은?"
            sub="불량 사유를 상세히"
            footer={<PrimaryButton onClick={goNext}>다음</PrimaryButton>}
          >
            <BigInput type="text" value={form.defect_detail} autoFocus placeholder="불량 사유 상세"
                      onChange={(e) => set('defect_detail', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && goNext()} />
          </Question>
        )

      case 'responsible':
        return (
          <Question
            title="귀책 대상은?"
            footer={<GhostButton onClick={() => { set('responsible', ''); goNext() }}>건너뛰기</GhostButton>}
          >
            <BigChoice
              options={Object.values(RESPONSIBLE)}
              value={form.responsible}
              onPick={(v) => pickAndNext('responsible', v)}
            />
          </Question>
        )

      case 'responsible_qty':
        return (
          <Question
            title="귀책 수량은?"
            footer={<>
              <PrimaryButton onClick={goNext}>다음</PrimaryButton>
              <GhostButton onClick={() => { set('responsible_qty', ''); goNext() }}>건너뛰기</GhostButton>
            </>}
          >
            <BigInput type="number" inputMode="numeric" min="0" step="any" value={form.responsible_qty} autoFocus placeholder="0"
                      onChange={(e) => set('responsible_qty', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && goNext()} />
          </Question>
        )

      case 'handle_method':
        return (
          <Question
            title="처리 방법은?"
            footer={<GhostButton onClick={() => { set('handle_method', ''); goNext() }}>건너뛰기</GhostButton>}
          >
            <BigChoice
              options={Object.values(HANDLE_METHOD)}
              value={form.handle_method}
              onPick={(v) => pickAndNext('handle_method', v)}
            />
          </Question>
        )

      case 'remark':
        return (
          <Question
            title="비고가 있나요?"
            sub="특이사항 (선택). 입력 후 저장하세요"
            footer={<>
              <PrimaryButton onClick={onSave} disabled={saving}>{saving ? '저장 중…' : '저장하기'}</PrimaryButton>
            </>}
          >
            <BigInput type="text" value={form.remark} autoFocus placeholder="특이사항"
                      onChange={(e) => set('remark', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !saving && onSave()} />
          </Question>
        )

      default:
        return null
    }
  }

  function qtyValid() {
    if (form.good_qty === '' && form.defect_qty === '') return false
    const insp = parseFloat(form.inspection_qty)
    const good = parseFloat(form.good_qty || 0)
    const defect = parseFloat(form.defect_qty || 0)
    if (!isNaN(insp) && (good + defect) > insp) return false
    return true
  }
}


// ── 수량 블록 (qty 단계 — 한 화면에 검사/양품/불량 + 자동판정) ──
function QtyBlock({ form, set, rate, judgment }) {
  const ng = judgment === QC_JUDGMENT.NG
  // 즉시 가드 — 양품+불량 > 검사수량 (검사수량 명시일 때만, 2026-06-01)
  const insp = parseFloat(form.inspection_qty)
  const good = parseFloat(form.good_qty || 0)
  const defect = parseFloat(form.defect_qty || 0)
  const overflow = !isNaN(insp) && (good + defect) > insp
  const overSum = good + defect
  const cell = { display: 'flex', flexDirection: 'column', gap: 6 }
  const lbl = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-sub, var(--color-gray))' }
  const inp = {
    border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px',
    fontSize: 18, fontWeight: 600, fontFamily: 'inherit', outline: 'none', width: '100%',
  }
  const inpErr = { ...inp, border: '1px solid #fca5a5', background: '#fff5f5' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ ...cell, flex: '0 0 90px' }}>
          <span style={lbl}>단위</span>
          <select style={inp} value={form.unit} onChange={(e) => set('unit', e.target.value)}>
            {QC_UNITS_DEFAULT.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label style={{ ...cell, flex: 1 }}>
          <span style={lbl}>검사수량</span>
          <input style={inp} type="number" inputMode="numeric" min="0" step="any" placeholder="-"
                 value={form.inspection_qty} onChange={(e) => set('inspection_qty', e.target.value)} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ ...cell, flex: 1 }}>
          <span style={lbl}>양품수량</span>
          <input style={overflow ? inpErr : inp} type="number" inputMode="numeric" min="0" step="any" autoFocus
                 value={form.good_qty} onChange={(e) => set('good_qty', e.target.value)} />
        </label>
        <label style={{ ...cell, flex: 1 }}>
          <span style={lbl}>불량수량</span>
          <input style={overflow ? inpErr : inp} type="number" inputMode="numeric" min="0" step="any"
                 value={form.defect_qty} onChange={(e) => set('defect_qty', e.target.value)} />
        </label>
      </div>
      {overflow && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: '#fff5f5', border: '1px solid #fca5a5',
          fontSize: 13, color: '#991b1b', fontWeight: 600,
        }}>
          ⚠ 양품 {good} + 불량 {defect} = {overSum} 이 검사수량 {insp} 을 초과합니다.
        </div>
      )}
      {!overflow && (form.good_qty !== '' || form.defect_qty !== '') && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderRadius: 12,
          background: ng ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${ng ? '#fecaca' : '#bbf7d0'}`,
        }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-sub, var(--color-gray))' }}>
            불량률 <b style={{ color: 'var(--color-text)' }}>{rate == null ? '—' : `${rate.toFixed(2)}%`}</b>
          </span>
          <span style={{
            fontSize: 16, fontWeight: 800, letterSpacing: '0.04em',
            color: ng ? '#991b1b' : '#166534',
          }}>
            {judgment}
          </span>
        </div>
      )}
    </div>
  )
}


// ── 저장 후 결과 화면 ──
function ResultScreen({ saved, ncMarked, savedInternal, actionBusy, onSendRepair, onMarkNonconforming, onReset }) {
  const ng = saved.judgment === QC_JUDGMENT.NG
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '32px 8px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, background: ng ? '#fee2e2' : '#dcfce7',
        }}>
          {ng ? '✕' : '✓'}
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: ng ? '#991b1b' : '#166534' }}>
          {ng ? '불합격 (NG)' : '합격 (OK)'}
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-text-sub, var(--color-gray))' }}>
          검사 #{saved.id}{saved.lot_no && ` · ${saved.lot_no}`}
        </p>
      </div>

      {ng && (
        <div style={{ marginBottom: 20 }}>
          {saved.repair_lot_no ? (
            <p style={{ textAlign: 'center', color: '#166534', fontWeight: 500 }}>✅ 재공정 LOT: <b>{saved.repair_lot_no}</b></p>
          ) : ncMarked ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-sub, var(--color-gray))', fontSize: 13 }}>
              ⚠ 부적합품 격리됨 — 폐기/되살리기는{' '}
              <a href="/admin/qc-nonconforming" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>부적합품 관리</a> 에서.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {savedInternal?.is_internal ? (
                <button className="btn-primary btn-md" onClick={onSendRepair} disabled={actionBusy}>재공정 보내기</button>
              ) : (
                <button className="btn-text" disabled>재공정 불가 (외부 LOT)</button>
              )}
              <button className="btn-danger btn-md" onClick={onMarkNonconforming} disabled={actionBusy}>부적합품 처리</button>
            </div>
          )}
        </div>
      )}

      <button className="btn-primary btn-md" style={{ width: '100%' }} onClick={onReset}>
        새 검사 시작
      </button>
    </div>
  )
}
