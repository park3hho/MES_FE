// pages/process/manage/IPQInspectPage.jsx
// IPQ (공정검사) — 토스형 한 화면 한 질문 wizard (2026-06-01 IQ 패턴으로 리빌딩)
//
// 진입 흐름:
//   1) 진입 시 풀스크린 QRScanner — 우리 LOT 만 (시스템에 없으면 차단)
//   2) 스캔 후 wizard 진입 — meta 자동채움 결과 확인하며 단계 진행
//
// 질문 시퀀스 (LOT 는 스캔으로 잡혔으니 wizard 에서 제외, IQ 와 달리 category/received_date/supplier 없음):
//   product_type → inspection_target → size → qty → [NG 블록] → remark
// 메타 autofill 로 채워진 step 은 시퀀스에서 자동 제거 (질문 자체 생략).
//
// IPQ vs IQ:
//   · process_category = '공정' 자동 고정 (사용자 선택 없음)
//   · received_date / supplier 불필요 — 내부 공정검사
//   · LOT '-' 불가 — 우리 LOT 만
import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import QRScanner from '@/components/QRScanner'
import {
  WizardShell,
  Question,
  BigChoice,
  BigInput,
  PrimaryButton,
  GhostButton,
} from '@/components/QcWizard'
import {
  QC_TYPE,
  PROCESS_CATEGORY,
  PRODUCT_TYPE,
  QC_JUDGMENT,
  RESPONSIBLE,
  HANDLE_METHOD,
  QC_UNITS_DEFAULT,
} from '@/constants/qcConst'
// 불량사유 선택지 — etcConst.REPAIR_CATEGORIES 재사용 (적층/낱장/변형/낙하/단선/...).
import { REPAIR_CATEGORIES } from '@/constants/etcConst'
// NG 후속 액션은 OQ 패턴 통일 — LotManagePage(/admin/manage) 로 navigate (2026-06-01).
// 거기서 사유/카테고리 입력 후 repairLot()/discardLot() 호출 + 이전 공정 라벨 자동 프린트.
// → IPQ inline 에서는 sendQcRepair/markQcNonconforming 직접 호출 안 함 (중복 진입점 제거).
import { createQcInspection, getQcLotMeta } from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import { computeRate, computeJudgment, TODAY } from './qcInspectShared'

// LOT prefix → 공정 코드 추론 (검증용)
function inferProcessFromLot(lotNo) {
  if (!lotNo) return ''
  const s = lotNo.toUpperCase().trim()
  const TWO_CHAR = ['EA', 'HT', 'BO', 'EC', 'WI', 'SO', 'OQ', 'UB', 'MB', 'OB']
  const head2 = s.slice(0, 2)
  if (TWO_CHAR.includes(head2)) return head2
  if (['SR', 'ST'].includes(head2)) return 'MP'
  if (/^[A-Z]{2}-[A-Z]{2}-/.test(s)) return 'RM'
  return ''
}

// 질문 시퀀스 — LOT 은 스캔 단계에서 잡힘. IPQ 는 category/received_date/supplier 없음 (2026-06-01).
const SEQ_HEAD = ['product_type', 'inspection_target', 'size', 'qty']
const SEQ_NG = ['defect_detail', 'responsible', 'responsible_qty', 'handle_method']
const SEQ_TAIL = ['remark']

// step key → form key (autofill-skip 매핑).
// 메타 autofill 로 채워진 항목은 wizard 에서 재질문하지 않고 건너뜀.
const STEP_TO_FORM_KEY = {
  product_type: 'product_type',
  inspection_target: 'inspection_target',
  size: 'size',
}

// 칩 라벨 + 값 포맷
const CHIP_META = {
  product_type: { label: '제품구분', fmt: (f) => f.product_type },
  inspection_target: { label: '검사 대상', fmt: (f) => f.inspection_target },
  size: { label: '사이즈', fmt: (f) => f.size },
  qty: {
    label: '검사/양품/불량',
    fmt: (f) => `${f.inspection_qty || '-'}/${f.good_qty || 0}/${f.defect_qty || 0}`,
  },
  defect_detail: { label: '불량내용', fmt: (f) => f.defect_detail },
  responsible: { label: '귀책', fmt: (f) => f.responsible },
  responsible_qty: { label: '귀책수량', fmt: (f) => f.responsible_qty },
  handle_method: { label: '처리방법', fmt: (f) => f.handle_method },
}

export default function IPQInspectPage({ user, onBack }) {
  const navigate = useNavigate()
  // 진입 시 풀스크린 QR 스캐너 (IQ/OQ 패턴, 2026-06-01)
  const [step, setStep] = useState('scan')
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState({
    detected_process: '',
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
  const [metaLoading, setMetaLoading] = useState(false)
  const [metaInfo, setMetaInfo] = useState(null)
  const [autofilledKeys, setAutofilledKeys] = useState([])

  const judgment = useMemo(() => computeJudgment(form.defect_qty), [form.defect_qty])
  const rate = useMemo(
    () => computeRate(form.inspection_qty, form.defect_qty),
    [form.inspection_qty, form.defect_qty],
  )
  const isNg = judgment === QC_JUDGMENT.NG

  // 동적 시퀀스 — qty 입력으로 NG 면 NG 블록 삽입.
  // autofill 로 채워진 step 은 시퀀스에서 완전히 제거 (질문 자체가 없음).
  const sequence = useMemo(() => {
    const base = isNg ? [...SEQ_HEAD, ...SEQ_NG, ...SEQ_TAIL] : [...SEQ_HEAD, ...SEQ_TAIL]
    return base.filter((k) => {
      const fk = STEP_TO_FORM_KEY[k]
      return !(fk && autofilledKeys.includes(fk))
    })
  }, [isNg, autofilledKeys])
  const total = sequence.length
  const key = sequence[stepIndex]

  // stepIndex 가 줄어든 sequence 길이 넘으면 보정
  useEffect(() => {
    if (stepIndex >= sequence.length && sequence.length > 0) {
      setStepIndex(sequence.length - 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence.length])

  // LOT 입력 → debounced 메타 조회 (IPQ 는 우리 LOT 만, '-' 불가)
  useEffect(() => {
    const lot = form.lot_no.trim()
    if (!lot) {
      setMetaInfo(null)
      setAutofilledKeys([])
      return
    }
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
            if (!prev.product_type && meta.suggested?.product_type) {
              next.product_type = meta.suggested.product_type
              filled.push('product_type')
            }
            if (!prev.inspection_target && meta.suggested?.inspection_target) {
              next.inspection_target = meta.suggested.inspection_target
              filled.push('inspection_target')
            }
            // 규격(size) — BE 가 공정별로 size_hint 산출 (EA→phi, RM→thickness, MP→width)
            if (!prev.size && meta.size_hint) {
              next.size = meta.size_hint
              filled.push('size')
            }
            // 검사수량 + 양품/불량 default — 전수 양품 가정 (NG 시 사용자가 수정)
            if (prev.inspection_qty === '' && meta.quantity != null) {
              next.inspection_qty = String(meta.quantity)
              if (prev.good_qty === '') next.good_qty = String(meta.quantity)
              if (prev.defect_qty === '') next.defect_qty = '0'
              filled.push('inspection_qty')
            }
            return next
          })
        }
        setAutofilledKeys(filled)
      } catch {
        /* 무시 */
      } finally {
        setMetaLoading(false)
      }
    }, 500)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.lot_no])

  // ── 네비게이션 ──
  const goNext = () => {
    if (stepIndex < total - 1) setStepIndex(stepIndex + 1)
  }
  const goBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1)
    else setStep('scan')
  }
  const jumpTo = (i) => setStepIndex(i)

  // 선택형 — 탭 즉시 set + 진행
  const pickAndNext = (k, v) => {
    set(k, v)
    setTimeout(goNext, 120)
  }

  // 칩 — LOT 항상 prepend (스캔으로 잡혀서 wizard 단계 밖).
  const lotChip = form.lot_no
    ? {
        key: 'lot',
        label: 'LOT',
        value: form.lot_no,
        onClick: () => setStep('scan'),
      }
    : null
  const chips = [
    ...(lotChip ? [lotChip] : []),
    ...sequence
      .slice(0, stepIndex)
      .map((k, i) => ({ k, i }))
      .filter(({ k }) => CHIP_META[k] && CHIP_META[k].fmt(form))
      .map(({ k, i }) => ({
        key: k,
        label: CHIP_META[k].label,
        value: String(CHIP_META[k].fmt(form)),
        onClick: () => jumpTo(i),
      })),
  ]

  // ── 저장 ──
  const onSave = async () => {
    if (!form.inspector.trim()) {
      emitToast('검사자 정보가 없습니다.', 'error')
      return
    }
    if (!form.lot_no.trim()) {
      emitToast('LOT 번호가 없습니다.', 'error')
      return
    }
    if (!form.detected_process) {
      emitToast('LOT 형식에서 공정 코드를 감지할 수 없습니다.', 'error')
      return
    }
    setSaving(true)
    try {
      const body = {
        inspection_type: QC_TYPE.IPQ,
        process_category: PROCESS_CATEGORY.PROCESS, // IPQ 는 '공정' 자동
        inspection_date: TODAY(),
        received_date: null,
        supplier: '',
        inspector: form.inspector,
        product_type: form.product_type,
        inspection_target: form.inspection_target,
        size: form.size,
        lot_no: form.lot_no,
        unit: form.unit,
        inspection_qty: form.inspection_qty === '' ? null : parseFloat(form.inspection_qty),
        good_qty: parseFloat(form.good_qty || 0),
        defect_qty: parseFloat(form.defect_qty || 0),
        defect_detail: form.defect_detail,
        responsible: form.responsible,
        responsible_qty: form.responsible_qty === '' ? null : parseFloat(form.responsible_qty),
        handle_method: form.handle_method,
        remark: form.remark,
      }
      const res = await createQcInspection(body)
      const ins = res.inspection
      setSaved(ins)
      // is_internal 체크 제거 (2026-06-01) — IPQ scan 가드가 이미 우리 LOT 만 허용. NG 후속은 LotManagePage.
      emitToast(
        ins.judgment === QC_JUDGMENT.NG ? '검사 저장됨 — 불합격(NG)' : '검사 저장됨 (합격)',
        ins.judgment === QC_JUDGMENT.NG ? 'warning' : 'success',
      )
    } catch (e) {
      emitToast(e.message || '저장 실패', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onResetAll = () => {
    setForm({
      detected_process: '',
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
    setSaved(null)
    setStepIndex(0)
    setMetaInfo(null)
    setAutofilledKeys([])
    setStep('scan')
  }

  // NG 후속 — OQ 패턴 통일 (2026-06-01).
  // /admin/manage 에서 사유/카테고리 입력 → repairLot()/discardLot() + 이전 공정 라벨 자동 프린트.
  const goRepair  = () => navigate('/admin/manage', { state: { mode: 'repair',  lotNo: saved.lot_no } })
  const goDiscard = () => navigate('/admin/manage', { state: { mode: 'discard', lotNo: saved.lot_no } })

  // ── 스캔 화면 — 공정 LOT 만 (RM/EC 등 IQ 대상 차단, 2026-06-01) ──
  // IPQ 진입 가능: MP, EA, HT, BO, WI, SO (= PROCESS 또는 가변)
  // 차단: RM/EC (입고검사 IQ 로) · OQ/UB/MB/OB (출하·박스, IPQ 대상 아님)
  if (step === 'scan' && !saved) {
    const IPQ_ALLOWED = new Set(['MP', 'EA', 'HT', 'BO', 'WI', 'SO'])
    return (
      <QRScanner
        processLabel="IPQ — 공정검사"
        onScan={async (val) => {
          const v = (val || '').trim()
          if (!v) throw new Error('빈 값입니다.')
          if (v === '-') throw new Error("IPQ 는 우리 공정 LOT 만 가능합니다 ('-' 불가).")
          const proc = inferProcessFromLot(v)
          if (!proc) throw new Error(`LOT 형식에서 공정 코드를 감지할 수 없습니다: ${v}`)
          if (!IPQ_ALLOWED.has(proc)) {
            if (proc === 'RM') throw new Error('원자재(RM) LOT 는 입고검사(IQ) 대상입니다.')
            if (proc === 'EC') throw new Error('외주(EC) LOT 는 입고검사(IQ) 대상입니다.')
            throw new Error(`${proc} LOT 는 공정검사(IPQ) 대상이 아닙니다.`)
          }
          try {
            const res = await getQcLotMeta(v)
            if (!res?.meta?.found) {
              throw new Error(`시스템에 없는 LOT 입니다: ${v}`)
            }
          } catch (e) {
            if (e instanceof Error) throw e
            throw new Error('LOT 메타 조회 실패 — 잠시 후 다시 시도하세요.')
          }
          set('lot_no', v)
          set('detected_process', proc)
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
          saved={saved}
          onRepair={goRepair}
          onDiscard={goDiscard}
          onReset={onResetAll}
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
            footer={
              <PrimaryButton onClick={goNext} disabled={!form.inspection_target.trim()}>
                다음
              </PrimaryButton>
            }
          >
            <BigInput
              type="text"
              value={form.inspection_target}
              autoFocus
              placeholder="검사 대상"
              onChange={(e) => set('inspection_target', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && form.inspection_target.trim() && goNext()}
            />
          </Question>
        )

      case 'size':
        return (
          <Question
            title="사이즈/규격은?"
            sub="예: 87, 95 (없으면 건너뛰기)"
            footer={
              <>
                <PrimaryButton onClick={goNext}>다음</PrimaryButton>
                <GhostButton
                  onClick={() => {
                    set('size', '')
                    goNext()
                  }}
                >
                  건너뛰기
                </GhostButton>
              </>
            }
          >
            <BigInput
              type="text"
              value={form.size}
              autoFocus
              placeholder="사이즈"
              onChange={(e) => set('size', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && goNext()}
            />
          </Question>
        )

      case 'qty':
        return (
          <Question
            title="검사 수량을 입력하세요"
            sub="검사수량 비우면 단일 LOT. 양품·불량 입력 시 자동 판정"
            footer={
              <PrimaryButton onClick={goNext} disabled={!qtyValid()}>
                다음
              </PrimaryButton>
            }
          >
            <QtyBlock form={form} set={set} rate={rate} judgment={judgment} />
          </Question>
        )

      case 'defect_detail':
        return (
          <Question title="불량 내용은?" sub="해당하는 불량 항목을 선택하세요">
            <BigChoice
              options={REPAIR_CATEGORIES.map((c) => c.label)}
              value={form.defect_detail.split('|')[0]}
              onPick={(v) => {
                if (v === '기타') {
                  set('defect_detail', '기타')
                } else {
                  pickAndNext('defect_detail', v)
                }
              }}
            />
            {form.defect_detail.startsWith('기타') && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <BigInput
                  type="text"
                  value={form.defect_detail.includes('|') ? form.defect_detail.split('|')[1] : ''}
                  autoFocus
                  placeholder="기타 사유 (선택)"
                  onChange={(e) => set('defect_detail', `기타|${e.target.value}`)}
                  onKeyDown={(e) => e.key === 'Enter' && goNext()}
                />
                <PrimaryButton onClick={goNext}>다음</PrimaryButton>
              </div>
            )}
          </Question>
        )

      case 'responsible':
        // IPQ 는 process_category='공정' → 내부 가공이라 자체 귀책만 가능 (2026-06-01).
        return (
          <Question
            title="귀책 대상은?"
            footer={
              <GhostButton
                onClick={() => {
                  set('responsible', '')
                  goNext()
                }}
              >
                건너뛰기
              </GhostButton>
            }
          >
            <BigChoice
              options={[RESPONSIBLE.SELF]}
              value={form.responsible}
              onPick={(v) => pickAndNext('responsible', v)}
            />
          </Question>
        )

      case 'responsible_qty':
        return (
          <Question
            title="귀책 수량은?"
            footer={
              <>
                <PrimaryButton onClick={goNext}>다음</PrimaryButton>
                <GhostButton
                  onClick={() => {
                    set('responsible_qty', '')
                    goNext()
                  }}
                >
                  건너뛰기
                </GhostButton>
              </>
            }
          >
            <BigInput
              type="number"
              inputMode="numeric"
              min="0"
              max={form.defect_qty || undefined}
              step="any"
              value={form.responsible_qty}
              autoFocus
              placeholder="0"
              onChange={(e) => {
                // 귀책 수량은 불량 수량 초과 불가
                const v = e.target.value
                const max = parseFloat(form.defect_qty)
                const num = parseFloat(v)
                if (!isNaN(num) && !isNaN(max) && num > max) {
                  set('responsible_qty', String(max))
                } else {
                  set('responsible_qty', v)
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && goNext()}
            />
            {form.defect_qty && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-sub, #6b7280)' }}>
                최대 {form.defect_qty} (불량 수량)
              </div>
            )}
          </Question>
        )

      case 'handle_method':
        return (
          <Question
            title="처리 방법은?"
            footer={
              <GhostButton
                onClick={() => {
                  set('handle_method', '')
                  goNext()
                }}
              >
                건너뛰기
              </GhostButton>
            }
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
            footer={
              <PrimaryButton onClick={onSave} disabled={saving}>
                {saving ? '저장 중…' : '저장하기'}
              </PrimaryButton>
            }
          >
            <BigInput
              type="text"
              value={form.remark}
              autoFocus
              placeholder="특이사항"
              onChange={(e) => set('remark', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !saving && onSave()}
            />
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
    if (!isNaN(insp) && good + defect > insp) return false
    return true
  }
}

// ── 수량 블록 (qty 단계 — 한 화면에 검사/양품/불량 + 자동판정 + 가드) ──
function QtyBlock({ form, set, rate, judgment }) {
  const ng = judgment === QC_JUDGMENT.NG
  const insp = parseFloat(form.inspection_qty)
  const good = parseFloat(form.good_qty || 0)
  const defect = parseFloat(form.defect_qty || 0)
  const overflow = !isNaN(insp) && good + defect > insp
  const overSum = good + defect
  const cell = { display: 'flex', flexDirection: 'column', gap: 6 }
  const lbl = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-sub, var(--color-gray))' }
  const inp = {
    border: '1px solid var(--color-border)',
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 18,
    fontWeight: 600,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
  }
  const inpErr = { ...inp, border: '1px solid #fca5a5', background: '#fff5f5' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ ...cell, flex: '0 0 90px' }}>
          <span style={lbl}>단위</span>
          <select style={inp} value={form.unit} onChange={(e) => set('unit', e.target.value)}>
            {QC_UNITS_DEFAULT.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...cell, flex: 1 }}>
          <span style={lbl}>검사수량</span>
          <input
            style={inp}
            type="number"
            inputMode="numeric"
            min="0"
            step="any"
            placeholder="-"
            value={form.inspection_qty}
            onChange={(e) => set('inspection_qty', e.target.value)}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ ...cell, flex: 1 }}>
          <span style={lbl}>양품수량</span>
          <input
            style={overflow ? inpErr : inp}
            type="number"
            inputMode="numeric"
            min="0"
            step="any"
            autoFocus
            value={form.good_qty}
            onChange={(e) => set('good_qty', e.target.value)}
          />
        </label>
        <label style={{ ...cell, flex: 1 }}>
          <span style={lbl}>불량수량</span>
          <input
            style={overflow ? inpErr : inp}
            type="number"
            inputMode="numeric"
            min="0"
            step="any"
            value={form.defect_qty}
            onChange={(e) => set('defect_qty', e.target.value)}
          />
        </label>
      </div>
      {overflow && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: '#fff5f5',
            border: '1px solid #fca5a5',
            fontSize: 13,
            color: '#991b1b',
            fontWeight: 600,
          }}
        >
          ⚠ 양품 {good} + 불량 {defect} = {overSum} 이 검사수량 {insp} 을 초과합니다.
        </div>
      )}
      {!overflow && (form.good_qty !== '' || form.defect_qty !== '') && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderRadius: 12,
            background: ng ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${ng ? '#fecaca' : '#bbf7d0'}`,
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--color-text-sub, var(--color-gray))' }}>
            불량률{' '}
            <b style={{ color: 'var(--color-text)' }}>
              {rate == null ? '—' : `${rate.toFixed(2)}%`}
            </b>
          </span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: '0.04em',
              color: ng ? '#991b1b' : '#166534',
            }}
          >
            {judgment}
          </span>
        </div>
      )}
    </div>
  )
}

// ── 저장 후 결과 화면 ──
function ResultScreen({ saved, onRepair, onDiscard, onReset }) {
  const ng = saved.judgment === QC_JUDGMENT.NG
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '32px 8px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            background: ng ? '#fee2e2' : '#dcfce7',
          }}
        >
          {ng ? '✕' : '✓'}
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: ng ? '#991b1b' : '#166534' }}>
          {ng ? '불합격 (NG)' : '합격 (OK)'}
        </h1>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 13,
            color: 'var(--color-text-sub, var(--color-gray))',
          }}
        >
          검사 #{saved.id}
          {saved.lot_no && ` · ${saved.lot_no}`}
        </p>
      </div>

      {ng && (
        // NG → OQ 패턴 통일 (2026-06-01). /admin/manage 의 mode=repair / discard 로 라우팅.
        // repair = 이전 공정으로 되돌리기 + 이전 LOT/새 LOT 라벨 자동 2장 프린트.
        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn-primary btn-md" onClick={onRepair}>
            🔧 공정 되돌리기
          </button>
          <button className="btn-danger btn-md" onClick={onDiscard}>
            🗑 폐기 처리
          </button>
        </div>
      )}

      <button className="btn-primary btn-md" style={{ width: '100%' }} onClick={onReset}>
        새 검사 시작
      </button>
    </div>
  )
}
