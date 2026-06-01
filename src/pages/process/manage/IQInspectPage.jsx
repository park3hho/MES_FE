// pages/process/manage/IQInspectPage.jsx
// IQ (수입검사) — 토스형 한 화면 한 질문 wizard (2026-06-01)
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
// 공정 정의 / 재공정 가능 공정 — LotManagePage 와 동일 진실의 원천 (2026-06-01).
import { PROCESS_LIST, REPAIR_PROCESSES } from '@/constants/processConst'
// NG 후속 액션 분기 (2026-06-01):
//   handle_method='재작업' + 우리 LOT → NCR 우회 (BE 가 자동격리 안 함) + 즉시 repair_lot + 라벨
//   그 외 (폐기/조건부출하/반품/미정) 또는 외부 자재(-) → BE 가 NCR 자동 생성 (외부 LOT 도 LOT-less NCR 등록)
import { createQcInspection, getQcLotMeta, repairLotWithLabels, patchQcInspection } from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import { computeRate, computeJudgment, TODAY } from './qcInspectShared'

const IQ_CATEGORIES = [PROCESS_CATEGORY.OUTSOURCE, PROCESS_CATEGORY.RAW]

// 문제 공정 후보 / 직전 공정 — LotManagePage 와 동일 (IPQ 와 동일 로직).
function getProblemProcesses(process) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === process)
  if (idx <= 0) return []
  return PROCESS_LIST.slice(0, idx + 1).filter((p) => REPAIR_PROCESSES.includes(p.key))
}
function getActualDest(problemProcess) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === problemProcess)
  return idx > 0 ? PROCESS_LIST[idx - 1].key : null
}
// REPAIR_CATEGORIES label → code 매핑 (BE 는 code 받음)
const LABEL_TO_CODE = Object.fromEntries(REPAIR_CATEGORIES.map((c) => [c.label, c.code]))

// 질문 시퀀스 — LOT 은 스캔 단계에서 잡혀서 wizard 에 없음 (2026-06-01)
const SEQ_HEAD = [
  'category',
  'received_date',
  'supplier',
  'product_type',
  'inspection_target',
  'size',
  'qty',
]
// problem_process 는 handle_method='재작업' + 우리 LOT 일 때만 시퀀스에 포함 (sequence useMemo 필터).
const SEQ_NG = [
  'defect_detail',
  'responsible',
  'responsible_qty',
  'handle_method',
  'problem_process',
]
const SEQ_TAIL = ['remark']

// step key → form key (autofill-skip 매핑, 2026-06-01).
// LOT 메타 autofill 로 채워진 항목은 wizard 에서 재질문하지 않고 건너뜀.
// qty 는 inspection_qty 만 autofill — 양품/불량 수량은 여전히 사용자 입력 필요해서 제외.
const STEP_TO_FORM_KEY = {
  category: 'process_category',
  received_date: 'received_date',
  product_type: 'product_type',
  inspection_target: 'inspection_target',
  size: 'size', // 메타 size_hint 로 채워지면 step 생략 (2026-06-01)
}

// 칩 라벨 + 값 포맷
const CHIP_META = {
  category: { label: '공정구분', fmt: (f) => f.process_category },
  received_date: { label: '입고일', fmt: (f) => f.received_date },
  supplier: { label: '입고업체', fmt: (f) => f.supplier },
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
  problem_process: { label: '문제공정', fmt: (f) => f.problem_process },
}

export default function IQInspectPage({ user, onBack }) {
  const navigate = useNavigate()
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
    detected_process: '',
    unit: 'ea',
    inspection_qty: '',
    good_qty: '',
    defect_qty: '',
    defect_detail: '',
    responsible: '',
    responsible_qty: '',
    handle_method: '',
    problem_process: '',
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
  // autofill 로 채워진 step 은 시퀀스에서 **완전히 제거** (질문 자체가 없음, 2026-06-01).
  // → 진행바 카운트(total)·chip 목록·다음/이전 인덱스 전부 자연스럽게 줄어듦.
  const sequence = useMemo(() => {
    const base = isNg ? [...SEQ_HEAD, ...SEQ_NG, ...SEQ_TAIL] : [...SEQ_HEAD, ...SEQ_TAIL]
    return base.filter((k) => {
      // problem_process — handle_method='재작업' + 우리 LOT (detected_process 있음) 일 때만.
      // 외부 자재(-)는 detected_process 없어서 자동으로 제외 (재공정 dest 없음).
      if (k === 'problem_process') {
        if (form.handle_method !== HANDLE_METHOD.REWORK) return false
        if (!form.detected_process) return false
      }
      const fk = STEP_TO_FORM_KEY[k]
      return !(fk && autofilledKeys.includes(fk))
    })
  }, [isNg, autofilledKeys, form.handle_method, form.detected_process])
  const total = sequence.length
  const key = sequence[stepIndex]

  // stepIndex 가 줄어든 sequence 길이를 넘으면 마지막 step 으로 보정 (2026-06-01).
  // autofill 로 시퀀스 자체가 짧아지는 경우 (예: 7→3) stale stepIndex 방어.
  useEffect(() => {
    if (stepIndex >= sequence.length && sequence.length > 0) {
      setStepIndex(sequence.length - 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence.length])

  // responsible_qty default = defect_qty (2026-06-01).
  // 해당 step 에 진입할 때 비어있으면 불량 수량으로 미리 채움 → 일반적 케이스(전수 귀책) 한번에 진행.
  useEffect(() => {
    if (sequence[stepIndex] === 'responsible_qty' && form.responsible_qty === '' && form.defect_qty) {
      set('responsible_qty', String(form.defect_qty))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, sequence])

  // LOT 입력 → debounced 메타 조회
  useEffect(() => {
    const lot = form.lot_no.trim()
    if (!lot || lot === '-') {
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
            // detected_process — BE Inventory.process (재공정 dest 결정에 사용, 2026-06-01)
            next.detected_process = meta.process || ''
            // 공정구분 — meta.suggested.process_category (PROCESS_TO_CATEGORY 매핑)
            if (!prev.process_category && meta.suggested?.process_category) {
              next.process_category = meta.suggested.process_category
              filled.push('process_category')
            }
            // 입고일 — meta.received_date (Inventory.created_at, 2026-06-01)
            if (meta.received_date) {
              next.received_date = meta.received_date
              filled.push('received_date')
            }
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
            // 검사수량 + 양품/불량 default (2026-06-01).
            //   기본 가정: "전수 양품" → good_qty = inspection_qty, defect_qty = 0.
            //   사용자가 qty 단계에서 불량 입력하면 그대로 덮어쓰기 가능 (NG 자동 판정도 정상 동작).
            //   inspection_qty step 은 autofill 로 시퀀스에서 제거되지만 qty step (good/defect) 은
            //   유지 — 사용자가 화면에서 양품·불량 한번 확인 후 진행 (전수 양품 가정 검토).
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
  // 첫 단계에서 뒤로가기 = 스캐너로 복귀 (LOT 다시 스캔)
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

  // 칩 — LOT 은 항상 prepend (스캔으로 잡혔으니 wizard 단계 밖). 나머지는 지나온 단계 중 값 있는 것.
  const lotChip = form.lot_no
    ? {
        key: 'lot',
        label: 'LOT',
        value: form.lot_no === '-' ? '(없음)' : form.lot_no,
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

  // ── 저장 (IPQ 와 동일 자동 처리 패턴, 2026-06-01) ──
  const onSave = async () => {
    if (!form.inspector.trim()) {
      emitToast('검사자 정보가 없습니다.', 'error')
      return
    }
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
      emitToast(
        ins.judgment === QC_JUDGMENT.NG ? '검사 저장됨 — 불합격(NG)' : '검사 저장됨 (합격)',
        ins.judgment === QC_JUDGMENT.NG ? 'warning' : 'success',
      )

      // ── NG + 재작업 자동 후속 (LOT 있을 때만 — 외부 자재는 NCR 흐름) ──
      if (
        ins.judgment === QC_JUDGMENT.NG &&
        ins.lot_no &&
        form.handle_method === HANDLE_METHOD.REWORK
      ) {
        const dlabel = (form.defect_detail || '').split('|')[0] || ''
        const dcode = LABEL_TO_CODE[dlabel] || 'etc'
        const reasonText =
          form.remark?.trim() || form.defect_detail?.replace('|', ' — ') || '수입검사 NG'
        const dest = getActualDest(form.problem_process)
        if (!form.problem_process) {
          emitToast('문제 공정을 선택해주세요.', 'error')
        } else if (!dest) {
          emitToast(`${form.problem_process} 는 재공정 대상이 아닙니다.`, 'error')
        } else {
          try {
            const result = await repairLotWithLabels(
              ins.lot_no,
              dest,
              { reason: reasonText, category: dcode },
              { onLabelError: (msg) => emitToast(`라벨 출력 실패 — ${msg}`, 'warning') },
            )
            const newLot = result.new_lot_no || ''
            if (newLot) {
              try {
                const newRemark = ins.remark
                  ? `[재공정 LOT: ${newLot}] ${ins.remark}`
                  : `[재공정 LOT: ${newLot}]`
                await patchQcInspection(ins.id, { repair_lot_no: newLot, remark: newRemark })
                setSaved((prev) => ({ ...prev, repair_lot_no: newLot, remark: newRemark }))
              } catch (pe) {
                console.warn('검사 이력 업데이트 실패:', pe?.message)
                setSaved((prev) => ({ ...prev, repair_lot_no: newLot }))
              }
            }
            emitToast(`재공정 LOT 발급: ${newLot || '(?)'}`, 'success')
          } catch (re) {
            emitToast(re.message || '재공정 실패', 'error')
          }
        }
      }
    } catch (e) {
      emitToast(e.message || '저장 실패', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onResetAll = () => {
    setForm({
      process_category: '',
      received_date: TODAY(),
      supplier: '',
      product_type: '',
      inspection_target: '',
      size: '',
      lot_no: '',
      detected_process: '',
      unit: 'ea',
      inspection_qty: '',
      good_qty: '',
      defect_qty: '',
      defect_detail: '',
      responsible: '',
      responsible_qty: '',
      handle_method: '',
      problem_process: '',
      remark: '',
      inspector: user?.id || '',
    })
    setSaved(null)
    setStepIndex(0)
    setMetaInfo(null)
    setAutofilledKeys([])
    setStep('scan')
  }

  // NG 후속 fallback (자동 처리 실패 / NCR 미생성 케이스) — OQ 패턴.
  const goRepair = () =>
    navigate('/admin/manage', { state: { mode: 'repair', lotNo: saved.lot_no } })
  const goDiscard = () =>
    navigate('/admin/manage', { state: { mode: 'discard', lotNo: saved.lot_no } })

  // ── 스캔 화면 (진입 시) — QRScanner 풀스크린 (2026-06-01) ──
  // 시스템에 없는 LOT 는 wizard 진입 차단 (2026-06-01).
  //   - meta.found===false 면 throw → QRScanner 가 에러 메시지 노출 + 스캔 화면 유지
  //   - 수기 입력 '-' 은 예외 (LOT 모름 케이스 — 외부 자재 즉석 입고)
  // IQ 진입 가능: RM, EC, MP, EA (= RAW/OUTSOURCE/가변) + 외부 자재 '-' (라벨 미발급)
  // 차단: HT/BO/WI/SO (공정검사 IPQ 로) · OQ/UB/MB/OB (출하·박스)
  if (step === 'scan' && !saved) {
    const IQ_ALLOWED = new Set(['RM', 'EC', 'MP', 'EA'])
    return (
      <QRScanner
        processLabel="IQ — 수입검사"
        onScan={async (val) => {
          const v = (val || '').trim()
          if (!v) throw new Error('빈 값입니다.')
          if (v !== '-') {
            let meta
            try {
              const res = await getQcLotMeta(v)
              if (!res?.meta?.found) {
                throw new Error(
                  `시스템에 없는 LOT 입니다: ${v}\n(라벨 발급 안 된 외부 자재면 '-' 로 진입하세요)`,
                )
              }
              meta = res.meta
            } catch (e) {
              if (e instanceof Error) throw e
              throw new Error('LOT 메타 조회 실패 — 잠시 후 다시 시도하세요.')
            }
            // LOT 분리 가드 (2026-06-01) — 공정 LOT (HT/BO/WI/SO) 은 IPQ 로
            if (meta.process && !IQ_ALLOWED.has(meta.process)) {
              throw new Error(
                `${meta.process} 공정 LOT 는 입고검사 대상이 아닙니다.\n공정검사(IPQ) 를 사용하세요.`,
              )
            }
          }
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
          saved={saved}
          onRepair={goRepair}
          onDiscard={goDiscard}
          onReset={onResetAll}
        />
      </div>
    )
  }

  // ── wizard 본문 ──
  // ScanMetaPanel 제거 (2026-06-01) — autofill 결과는 chip + 시퀀스 자동 단축으로 충분히
  // 시각화돼서 메타 패널 별도 노출은 시각적 잡음. autofill 동작 자체는 유지.
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
        // 주의: ScanMetaPanel 은 wizard 상단(stepIndex===0)에서 렌더링 — 여기 중복 X (2026-06-01).
        return (
          <Question title="어떤 입고인가요?" sub="외주 가공 입고 또는 신규 원자재 입고">
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
            footer={
              <PrimaryButton onClick={goNext} disabled={!form.received_date}>
                다음
              </PrimaryButton>
            }
          >
            <BigInput
              type="date"
              value={form.received_date}
              onChange={(e) => set('received_date', e.target.value)}
            />
          </Question>
        )

      case 'supplier':
        return (
          <Question
            title="어느 업체에서 왔나요?"
            sub="입고업체명을 입력하세요"
            footer={
              <PrimaryButton onClick={goNext} disabled={!form.supplier.trim()}>
                다음
              </PrimaryButton>
            }
          >
            <BigInput
              type="text"
              value={form.supplier}
              autoFocus
              placeholder="업체명"
              onChange={(e) => set('supplier', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && form.supplier.trim() && goNext()}
            />
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
        // 사전정의된 REPAIR_CATEGORIES 목록에서 클릭 선택 (2026-06-01).
        // 자유 텍스트 입력 → 클릭 옵션으로 통일 — NCR/통계 집계용 정형화.
        // '기타' 선택 시 자유텍스트 입력칸이 함께 노출되어 메모 가능.
        return (
          <Question title="불량 내용은?" sub="해당하는 불량 항목을 선택하세요">
            <BigChoice
              options={REPAIR_CATEGORIES.map((c) => c.label)}
              value={form.defect_detail.split('|')[0]} // '기타|메모' → '기타'
              onPick={(v) => {
                if (v === '기타') {
                  // 기타는 메모 필요 — 일단 '기타' 만 set 하고 자동진행 X.
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
              // 공정구분 별 귀책 후보 분기 (2026-06-01):
              //   외주(EC) → 자체 + 외주업체 (공급업체는 무관)
              //   원자재(RM) → 자체 + 공급업체 (외주업체는 무관)
              //   그 외(공정) → 자체만 (내부 가공)
              options={(() => {
                if (form.process_category === PROCESS_CATEGORY.OUTSOURCE)
                  return [RESPONSIBLE.SELF, RESPONSIBLE.OUTSOURCE]
                if (form.process_category === PROCESS_CATEGORY.RAW)
                  return [RESPONSIBLE.SELF, RESPONSIBLE.SUPPLIER]
                return [RESPONSIBLE.SELF]
              })()}
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
                // 귀책 수량은 불량 수량을 초과할 수 없음 (2026-06-01).
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

      case 'problem_process': {
        // handle_method='재작업' + 우리 LOT 일 때만 시퀀스에 들어감 (외부 자재는 자동 제외).
        const candidates = getProblemProcesses(form.detected_process)
        return (
          <Question
            title="어느 공정에서 문제가 발생했나요?"
            sub="문제 공정의 직전 공정으로 되돌립니다 (예: BO 선택 → HT 로 되돌리기)"
          >
            {candidates.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#991b1b', fontSize: 13 }}>
                현재 공정({form.detected_process}) 은 재공정 대상이 없습니다.
              </p>
            ) : (
              <BigChoice
                options={candidates.map((p) => p.key)}
                value={form.problem_process}
                onPick={(v) => pickAndNext('problem_process', v)}
              />
            )}
          </Question>
        )
      }

      case 'remark':
        return (
          <Question
            title="비고가 있나요?"
            sub="특이사항 (선택). 입력 후 저장하세요"
            footer={
              <>
                <PrimaryButton onClick={onSave} disabled={saving}>
                  {saving ? '저장 중…' : '저장하기'}
                </PrimaryButton>
              </>
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

// ── 수량 블록 (qty 단계 — 한 화면에 검사/양품/불량 + 자동판정) ──
function QtyBlock({ form, set, rate, judgment }) {
  const ng = judgment === QC_JUDGMENT.NG
  // 즉시 가드 — 양품+불량 > 검사수량 (검사수량 명시일 때만, 2026-06-01)
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
            onChange={(e) => {
              // 자동 보완 (2026-06-01) — 검사수량 명시 + 한쪽 입력 시 반대쪽 자동 산출.
              //   양품 0 → 불량 = 검사수량. 양품 N → 불량 = 검사수량 − N.
              //   초과/음수면 보완 안 함 (overflow 경고로 사용자에게 표시).
              const v = e.target.value
              set('good_qty', v)
              const n = parseFloat(v)
              if (!isNaN(insp) && !isNaN(n) && n >= 0 && n <= insp) {
                set('defect_qty', String(insp - n))
              }
            }}
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
            onChange={(e) => {
              // 반대 방향 자동 보완 (불량 N → 양품 = 검사수량 − N)
              const v = e.target.value
              set('defect_qty', v)
              const n = parseFloat(v)
              if (!isNaN(insp) && !isNaN(n) && n >= 0 && n <= insp) {
                set('good_qty', String(insp - n))
              }
            }}
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
        // NG 분기 (IPQ 와 동일 패턴, 2026-06-01):
        //  · 재작업 성공 → saved.repair_lot_no 표시
        //  · 그 외 처분 → saved.nc_no (NCR 발급, 부적합품 관리 안내)
        //  · 자동 실패 fallback → 수동 버튼 (LotManagePage 라우팅)
        <div style={{ marginBottom: 20 }}>
          {saved.repair_lot_no ? (
            <p style={{ textAlign: 'center', color: '#166534', fontWeight: 600, fontSize: 14 }}>
              ✅ 재공정 LOT 발급: <b>{saved.repair_lot_no}</b>
              <br />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 400,
                  color: 'var(--color-text-sub, var(--color-gray))',
                }}
              >
                라벨 2장 자동 출력 (책임추적용 옛 LOT + 재공정용 새 LOT)
              </span>
            </p>
          ) : saved.nc_no ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#991b1b', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                📋 부적합품 등록 (NCR: <b>{saved.nc_no}</b>)
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-sub, var(--color-gray))' }}>
                Inventory 격리됨 — 처분은{' '}
                <a
                  href="/admin/qc-nonconforming"
                  style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
                >
                  부적합품 관리
                </a>{' '}
                에서.
              </p>
            </div>
          ) : saved.lot_no ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ textAlign: 'center', fontSize: 12, color: '#991b1b' }}>
                ⚠ 자동 처리 실패 — 수동 후속 액션:
              </p>
              <button className="btn-primary btn-md" onClick={onRepair}>
                🔧 공정 되돌리기
              </button>
              <button className="btn-danger btn-md" onClick={onDiscard}>
                🗑 폐기 처리
              </button>
            </div>
          ) : (
            // 외부 자재 (LOT 없음) — 재공정/폐기 라우팅 불가. NCR 안내만.
            <p style={{ textAlign: 'center', fontSize: 13, color: '#991b1b' }}>
              ⚠ 외부 자재 NG — LOT 없음. 부적합품 관리에서 수동 처분 (반품/폐기).
            </p>
          )}
        </div>
      )}

      <button className="btn-primary btn-md" style={{ width: '100%' }} onClick={onReset}>
        새 검사 시작
      </button>
    </div>
  )
}
