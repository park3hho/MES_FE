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
// 공정 정의 / 재공정 가능 공정 — LotManagePage 와 동일 진실의 원천 (2026-06-01).
import { PROCESS_LIST, REPAIR_PROCESSES } from '@/constants/processConst'
// NG 후속 액션 분기 (2026-06-01):
//   handle_method='재작업' → NCR 우회 (BE 가 자동격리 안 함) + IPQ wizard 가 즉시 repair_lot + 라벨 (공정 되돌리기 흡수)
//   그 외 (폐기/조건부출하/반품/미정) → BE 가 NCR 자동 생성 + Inventory 격리. 처분은 부적합품 관리에서.
import { createQcInspection, getQcLotMeta, repairLotWithLabels } from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import { computeRate, computeJudgment, TODAY } from './qcInspectShared'

// 문제 공정 후보 — 현재 LOT 의 공정 이하 + REPAIR_PROCESSES (BO/EC/WI/SO) 교집합.
// LotManagePage:20 getProblemProcesses 와 동일 로직.
function getProblemProcesses(process) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === process)
  if (idx <= 0) return []
  return PROCESS_LIST.slice(0, idx + 1).filter((p) => REPAIR_PROCESSES.includes(p.key))
}
// 문제 공정 → 실제 도착 공정 (직전 공정). LotManagePage:27 getActualDest 와 동일.
function getActualDest(problemProcess) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === problemProcess)
  return idx > 0 ? PROCESS_LIST[idx - 1].key : null
}

// REPAIR_CATEGORIES label → code 매핑 (BE 는 code 받음)
const LABEL_TO_CODE = Object.fromEntries(REPAIR_CATEGORIES.map((c) => [c.label, c.code]))

// 로컬 prefix 추론 제거 (2026-06-01) — BE meta.process 만 신뢰 (TWO_CHAR 누락/OCR 오인식 차단점 제거).

// 질문 시퀀스 — LOT 은 스캔 단계에서 잡힘. IPQ 는 category/received_date/supplier 없음 (2026-06-01).
const SEQ_HEAD = ['product_type', 'inspection_target', 'size', 'qty']
// problem_process 는 handle_method='재작업' 일 때만 시퀀스에 들어감 (sequence useMemo 에서 필터).
const SEQ_NG = ['defect_detail', 'responsible', 'responsible_qty', 'handle_method', 'problem_process']
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
  problem_process: { label: '문제공정', fmt: (f) => f.problem_process },
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
  // autofill 로 채워진 step 은 시퀀스에서 완전히 제거 (질문 자체가 없음).
  const sequence = useMemo(() => {
    const base = isNg ? [...SEQ_HEAD, ...SEQ_NG, ...SEQ_TAIL] : [...SEQ_HEAD, ...SEQ_TAIL]
    return base.filter((k) => {
      // problem_process step — handle_method='재작업' 일 때만 노출 (LotManagePage 와 일관).
      // 다른 처분(폐기/조건부출하/반품)은 어차피 NCR 격리되므로 problem_process 불필요.
      if (k === 'problem_process' && form.handle_method !== HANDLE_METHOD.REWORK) return false
      const fk = STEP_TO_FORM_KEY[k]
      return !(fk && autofilledKeys.includes(fk))
    })
  }, [isNg, autofilledKeys, form.handle_method])
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
      emitToast(
        ins.judgment === QC_JUDGMENT.NG ? '검사 저장됨 — 불합격(NG)' : '검사 저장됨 (합격)',
        ins.judgment === QC_JUDGMENT.NG ? 'warning' : 'success',
      )

      // ── NG + handle_method 자동 후속 (2026-06-01) ──
      // LotManagePage 의 executeRepair 가 하던 동작을 IPQ wizard 안에서 그대로 수행.
      if (ins.judgment === QC_JUDGMENT.NG && ins.lot_no) {
        const dlabel = (form.defect_detail || '').split('|')[0] || ''
        const dcode = LABEL_TO_CODE[dlabel] || 'etc'
        const reasonText =
          form.remark?.trim()
          || form.defect_detail?.replace('|', ' — ')
          || '공정검사 NG'

        if (form.handle_method === HANDLE_METHOD.REWORK) {
          // 사용자가 wizard 에서 선택한 problem_process 의 직전 공정으로 되돌림 (LotManagePage 와 동일).
          const dest = getActualDest(form.problem_process)
          if (!form.problem_process) {
            emitToast('문제 공정을 선택해주세요.', 'error')
          } else if (!dest) {
            emitToast(`${form.problem_process} 는 재공정 대상이 아닙니다.`, 'error')
          } else {
            try {
              // 공정되돌리기와 동일 진입점 — repairLot + 라벨 2장 통합 호출 (api/index.js::repairLotWithLabels).
              // 라벨 출력 실패는 toast 로 보임 (silent fail 방지).
              const result = await repairLotWithLabels(
                form.lot_no, dest,
                { reason: reasonText, category: dcode },
                { onLabelError: (msg) => emitToast(`라벨 출력 실패 — ${msg}`, 'warning') },
              )
              setSaved((prev) => ({ ...prev, repair_lot_no: result.new_lot_no || '' }))
              emitToast(`재공정 LOT 발급: ${result.new_lot_no || '(?)'}`, 'success')
            } catch (re) {
              emitToast(re.message || '재공정 실패', 'error')
            }
          }
        }
        // 폐기/조건부출하/반품 등은 BE 가 이미 NCR 생성 + Inventory 격리. ResultScreen 이 NCR 번호 안내.
      }
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

  // NG 후속 — OQ 패턴 통일 (2026-06-01).
  // /admin/manage 에서 사유/카테고리 입력 → repairLot()/discardLot() + 이전 공정 라벨 자동 프린트.
  const goRepair  = () => navigate('/admin/manage', { state: { mode: 'repair',  lotNo: saved.lot_no } })
  const goDiscard = () => navigate('/admin/manage', { state: { mode: 'discard', lotNo: saved.lot_no } })

  // ── 스캔 화면 — 공정 되돌리기(LotManagePage)와 동일 조건 + EC 만 제외 (2026-06-01) ──
  // 조건: BE meta 의 status ∈ {in_stock, in_inspection} + quantity > 0
  //       process ≠ 'EC' (외주는 수입검사 IQ 대상)
  //       '-' 차단 (우리 LOT 만)
  // ※ LotManagePage 의 status 가드 그대로 차용 — 진실의 원천 통일. IPQ 는 검사 입력값(수량/판정)이 추가될 뿐.
  if (step === 'scan' && !saved) {
    const ALLOWED_STATUSES = new Set(['in_stock', 'in_inspection'])
    const STATUS_MSG = {
      consumed: '이미 다음 공정으로 진행된 LOT입니다.',
      discarded: '이미 폐기 처리된 LOT입니다.',
      repair: '이미 수리 접수된 LOT입니다.',
      shipped: '이미 출하 완료된 LOT입니다.',
      nonconforming: '부적합품 격리 상태입니다.',
    }
    return (
      <QRScanner
        processLabel="IPQ — 공정검사"
        onScan={async (val) => {
          const v = (val || '').trim()
          if (!v) throw new Error('빈 값입니다.')
          if (v === '-') throw new Error("IPQ 는 우리 공정 LOT 만 가능합니다 ('-' 불가).")
          let meta
          try {
            const res = await getQcLotMeta(v)
            if (!res?.meta?.found) {
              throw new Error(`시스템에 없는 LOT 입니다: ${v}`)
            }
            meta = res.meta
          } catch (e) {
            if (e instanceof Error) throw e
            throw new Error('LOT 메타 조회 실패 — 잠시 후 다시 시도하세요.')
          }
          if (!ALLOWED_STATUSES.has(meta.status)) {
            throw new Error(
              STATUS_MSG[meta.status] || `처리할 수 없는 상태입니다 (${meta.status})`,
            )
          }
          if (meta.quantity != null && meta.quantity <= 0) {
            throw new Error('재고 수량이 0입니다.')
          }
          if (meta.process === 'EC') {
            throw new Error('외주(EC) LOT 는 수입검사(IQ) 대상입니다.')
          }
          set('lot_no', v)
          set('detected_process', meta.process)
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

      case 'problem_process': {
        // handle_method='재작업' 일 때만 시퀀스에 포함됨. LotManagePage 와 동일 후보 산출.
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
        // NG 분기 (2026-06-01) — 다이어그램 흐름:
        //  · 재작업 → 공정 되돌리기 + 라벨 자동 (NCR 우회) → saved.repair_lot_no 표시
        //  · 그 외 (폐기/조건부출하/반품/미정) → NCR 생성됨 → 부적합품 관리에서 처분
        <div style={{ marginBottom: 20 }}>
          {saved.repair_lot_no ? (
            <p style={{ textAlign: 'center', color: '#166534', fontWeight: 600, fontSize: 14 }}>
              ✅ 재공정 LOT 발급: <b>{saved.repair_lot_no}</b>
              <br />
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-sub, var(--color-gray))' }}>
                라벨 2장 자동 출력 (책임추적용 옛 LOT + 재공정용 새 LOT)
              </span>
            </p>
          ) : saved.nc_no ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#991b1b', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                📋 부적합품 등록 (NCR: <b>{saved.nc_no}</b>)
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-sub, var(--color-gray))', marginBottom: 12 }}>
                Inventory 격리됨 — 폐기/조건부출하/반품 등 처분은{' '}
                <a href="/admin/qc-nonconforming" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
                  부적합품 관리
                </a>{' '}
                에서.
              </p>
              {saved.handle_method && saved.handle_method !== '재작업' && (
                <p style={{ fontSize: 11, color: 'var(--color-text-muted, #9ca3af)' }}>
                  선택한 처리방법: {saved.handle_method} (참고용 — 부적합품 관리에서 최종 처분)
                </p>
              )}
            </div>
          ) : (
            // NCR 생성 실패 fallback — 수동 버튼
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ textAlign: 'center', fontSize: 12, color: '#991b1b' }}>
                ⚠ NCR 생성 실패 — 수동 후속 액션:
              </p>
              <button className="btn-primary btn-md" onClick={onRepair}>
                🔧 공정 되돌리기
              </button>
              <button className="btn-danger btn-md" onClick={onDiscard}>
                🗑 폐기 처리
              </button>
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
