// pages/process/manage/qcInspectShared.jsx
// IQ/IPQ/OQ 페이지 공통 유틸 — 진행형 섹션 래퍼, 자동 산출, 저장 로직 (2026-05-31)
// 2026-06-01: NgFollowupWizard 추가 — OQ FAIL 후속 단계 wizard (IQ/IPQ 와 동일한 NG 흐름).

import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  WizardShell,
  Question,
  BigChoice,
  BigInput,
  PrimaryButton,
  GhostButton,
} from '@/components/QcWizard'
import { QC_JUDGMENT, RESPONSIBLE, HANDLE_METHOD } from '@/constants/qcConst'
import { REPAIR_CATEGORIES, JUDGMENT_LABELS } from '@/constants/etcConst'
import { PROCESS_LIST, REPAIR_PROCESSES } from '@/constants/processConst'

// 한 섹션 fade-in 래퍼. `show=true` 면 노출 + 부드럽게 등장.
export function Section({ show, children, title, hint }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '14px 16px',
            background: 'var(--color-white, #fff)',
            marginBottom: 12,
          }}
        >
          {title && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--color-text-sub, var(--color-gray))',
                marginBottom: 10,
                display: 'flex',
                gap: 6,
                alignItems: 'baseline',
              }}
            >
              <span>{title}</span>
              {hint && (
                <span style={{ fontWeight: 400, fontSize: 10.5, color: 'var(--color-text-muted)' }}>
                  · {hint}
                </span>
              )}
            </div>
          )}
          {children}
        </motion.section>
      )}
    </AnimatePresence>
  )
}

// 한 줄 라벨+컨트롤. 라벨 위/아래 단순.
export function Field({ label, required, hint, children, wide }) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        flex: wide ? '1 1 100%' : '1 1 180px',
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: 'var(--color-text-sub, var(--color-gray))',
          display: 'flex',
          gap: 4,
          alignItems: 'baseline',
        }}
      >
        {label}
        {required && <span style={{ color: '#c0392b' }}>*</span>}
        {hint && (
          <span style={{ fontWeight: 400, fontSize: 10.5, color: 'var(--color-text-muted)' }}>
            ({hint})
          </span>
        )}
      </span>
      {children}
    </label>
  )
}

// 한 섹션 안에서 flex row 로 묶어주는 컨테이너
export function Row({ children }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{children}</div>
}

// 합/부 배지 (display only)
export function JudgmentBadge({ value }) {
  const ng = value === QC_JUDGMENT.NG
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 32,
        padding: '4px 14px',
        borderRadius: 6,
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: '0.04em',
        background: ng ? '#fee2e2' : '#dcfce7',
        color: ng ? '#991b1b' : '#166534',
      }}
    >
      {value}
    </span>
  )
}

// ─────────────────────────────────────────
// 자동 산출 — BE/QcRecordPage 동일 로직
// ─────────────────────────────────────────
export function computeRate(insp, defect) {
  const i = parseFloat(insp),
    d = parseFloat(defect) || 0
  if (!i || i <= 0) return null
  return Math.round((d / i) * 10000) / 100
}
export function computeJudgment(defect) {
  return (parseFloat(defect) || 0) > 0 ? QC_JUDGMENT.NG : QC_JUDGMENT.OK
}

export const TODAY = () => new Date().toISOString().slice(0, 10)

// REPAIR_CATEGORIES label → code 매핑 (BE 는 code 받음)
export const REPAIR_LABEL_TO_CODE = Object.fromEntries(
  REPAIR_CATEGORIES.map((c) => [c.label, c.code]),
)

// 문제 공정 후보 — 현재 process 위치에서 되돌아갈 수 있는 후보들 (LotManagePage 동일).
export function getProblemProcessOptions(process) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === process)
  if (idx <= 0) return []
  return PROCESS_LIST.slice(0, idx + 1).filter((p) => REPAIR_PROCESSES.includes(p.key))
}
// 문제공정 의 실제 destination (한 단계 전 공정) — repair_lot 호출 시 사용
export function getActualRepairDest(problemProcess) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === problemProcess)
  return idx > 0 ? PROCESS_LIST[idx - 1].key : null
}

// ═════════════════════════════════════════════════════════════════════════
// NG step 공통 렌더러 (2026-06-01) — IQ/IPQ/OQ wizard 가 모두 같은 NG 단계 UI 사용.
//
// 사용 패턴:
//   case 'defect_detail':
//     return renderNgStep('defect_detail', {
//       value: form.defect_detail, setValue: (v) => set('defect_detail', v),
//       goNext, pickAndNext: (v) => pickAndNext('defect_detail', v),
//     })
//
// 각 step 마다 필요한 props 가 다르니 ctx 객체로 통합. ctx 안 모르는 key 는 ignore.
// ═════════════════════════════════════════════════════════════════════════
export function renderNgStep(stepKey, ctx) {
  switch (stepKey) {
    case 'defect_detail':
      return (
        <Question title="불량 내용은?" sub="해당하는 불량 항목을 선택하세요">
          <BigChoice
            options={REPAIR_CATEGORIES.map((c) => c.label)}
            value={(ctx.value || '').split('|')[0]}
            onPick={(v) => {
              if (v === '기타') ctx.setValue('기타')
              else ctx.pickAndNext?.(v) ?? (ctx.setValue(v), ctx.goNext?.())
            }}
          />
          {(ctx.value || '').startsWith('기타') && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <BigInput
                type="text"
                value={(ctx.value || '').includes('|') ? ctx.value.split('|')[1] : ''}
                autoFocus
                placeholder="기타 사유 (선택)"
                onChange={(e) => ctx.setValue(`기타|${e.target.value}`)}
                onKeyDown={(e) => e.key === 'Enter' && ctx.goNext?.()}
              />
              <PrimaryButton onClick={ctx.goNext}>다음</PrimaryButton>
            </div>
          )}
        </Question>
      )

    case 'responsible':
      // ctx.options 가 있으면 그걸 쓰고, 없으면 전체 3개
      return (
        <Question
          title="귀책 대상은?"
          footer={
            <GhostButton
              onClick={() => {
                ctx.setValue('')
                ctx.goNext?.()
              }}
            >
              건너뛰기
            </GhostButton>
          }
        >
          <BigChoice
            options={ctx.options || [RESPONSIBLE.SELF, RESPONSIBLE.SUPPLIER, RESPONSIBLE.OUTSOURCE]}
            value={ctx.value}
            onPick={(v) => ctx.pickAndNext?.(v) ?? (ctx.setValue(v), ctx.goNext?.())}
          />
        </Question>
      )

    case 'responsible_qty':
      return (
        <Question
          title="귀책 수량은?"
          footer={
            <>
              <PrimaryButton onClick={ctx.goNext}>다음</PrimaryButton>
              <GhostButton
                onClick={() => {
                  ctx.setValue('')
                  ctx.goNext?.()
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
            max={ctx.maxQty || undefined}
            step="any"
            value={ctx.value}
            autoFocus
            placeholder="0"
            onChange={(e) => {
              const v = e.target.value
              const max = ctx.maxQty
              const n = parseFloat(v)
              if (!isNaN(n) && !isNaN(max) && n > max) ctx.setValue(String(max))
              else ctx.setValue(v)
            }}
            onKeyDown={(e) => e.key === 'Enter' && ctx.goNext?.()}
          />
          {ctx.maxQty > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-sub, #6b7280)' }}>
              최대 {ctx.maxQty} (불량 수량)
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
                ctx.setValue('')
                ctx.goNext?.()
              }}
            >
              건너뛰기
            </GhostButton>
          }
        >
          <BigChoice
            options={Object.values(HANDLE_METHOD)}
            value={ctx.value}
            onPick={(v) => ctx.pickAndNext?.(v) ?? (ctx.setValue(v), ctx.goNext?.())}
          />
        </Question>
      )

    case 'problem_process': {
      const opts = getProblemProcessOptions(ctx.detectedProcess).map((p) => `${p.key} (${p.label})`)
      const toKey = (label) => label.split(' ')[0]
      return (
        <Question
          title="어느 공정에서 문제가 발생했나요?"
          sub="재작업 LOT 가 그 공정 직전으로 되돌아갑니다"
        >
          <BigChoice
            options={opts}
            value={ctx.value ? `${ctx.value} ` : ''}
            onPick={(label) => {
              const k = toKey(label)
              ctx.pickAndNext?.(k) ?? (ctx.setValue(k), ctx.goNext?.())
            }}
          />
        </Question>
      )
    }

    default:
      return null
  }
}

// ═════════════════════════════════════════════════════════════════════════
// NgFollowupWizard — NG/FAIL 검사 후속 단계 wizard (2026-06-01)
//
// 사용처: OQ FAIL overlay (메인). 추후 IQ/IPQ 의 인라인 NG 케이스도 이걸로 이행 가능.
//
// 시퀀스: defect_detail → responsible → responsible_qty → handle_method
//           → [재작업+우리 LOT 일 때만] problem_process → remark
//
// props:
//   lotNo               : 검사 대상 LOT 번호 (표시용)
//   detectedProcess     : 우리 LOT 의 공정 코드 (problem_process step 활성 조건). 외부 자재면 '' 또는 null.
//   defectQty           : 불량 수량 (responsible_qty max + default). 기본 1 (OQ 단품).
//   responsibleOptions  : 귀책 옵션 배열 (예: [RESPONSIBLE.SELF, RESPONSIBLE.SUPPLIER]).
//                         null/생략 시 전체 (자체/공급업체/외주업체).
//   initial             : 초기값 (수정 모드 — { defect_detail, responsible, ... }). 생략 시 빈값.
//   onSubmit(ngForm)    : 마지막 step (remark) 통과 후 호출. ngForm = { defect_detail, responsible,
//                         responsible_qty, handle_method, problem_process, remark }.
//                         호출자가 createQcInspection / repair_lot / NCR 등 후속 처리 담당.
//   onCancel()          : 사용자가 wizard 종료 (뒤로가기 첫 step) 시 호출.
//   saving              : 외부에서 저장 중 상태 — 마지막 step 버튼 비활성 + 라벨 변경.
//   submitLabel         : 마지막 step 버튼 라벨 (기본 '저장').
// ═════════════════════════════════════════════════════════════════════════
const NG_SEQ_BASE = [
  'defect_detail',
  'responsible',
  'responsible_qty',
  'handle_method',
  'problem_process',
  'remark',
]
const NG_CHIP_META = {
  defect_detail: { label: '불량내용', fmt: (f) => (f.defect_detail || '').split('|')[0] },
  responsible: { label: '귀책', fmt: (f) => f.responsible },
  responsible_qty: { label: '귀책수량', fmt: (f) => f.responsible_qty },
  handle_method: { label: '처리방법', fmt: (f) => f.handle_method },
  problem_process: { label: '문제공정', fmt: (f) => f.problem_process },
}

export function NgFollowupWizard({
  lotNo = '',
  detectedProcess = '',
  defectQty = 1,
  responsibleOptions = null,
  initial = null,
  onSubmit,
  onCancel,
  saving = false,
  submitLabel = '저장',
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [ngForm, setNgForm] = useState(() => ({
    defect_detail: initial?.defect_detail || '',
    responsible: initial?.responsible || '',
    responsible_qty: initial?.responsible_qty != null ? String(initial.responsible_qty) : '',
    handle_method: initial?.handle_method || '',
    problem_process: initial?.problem_process || '',
    remark: initial?.remark || '',
  }))
  const set = (k, v) => setNgForm((p) => ({ ...p, [k]: v }))

  // 시퀀스 — problem_process 는 handle_method=재작업 + 우리 LOT 일 때만
  const sequence = useMemo(
    () =>
      NG_SEQ_BASE.filter((k) => {
        if (k === 'problem_process') {
          if (ngForm.handle_method !== HANDLE_METHOD.REWORK) return false
          if (!detectedProcess) return false
        }
        return true
      }),
    [ngForm.handle_method, detectedProcess],
  )

  const total = sequence.length
  const key = sequence[stepIndex]

  // stepIndex stale 보정
  useEffect(() => {
    if (stepIndex >= sequence.length && sequence.length > 0) setStepIndex(sequence.length - 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence.length])

  // responsible_qty default = defectQty
  useEffect(() => {
    if (key === 'responsible_qty' && ngForm.responsible_qty === '' && defectQty > 0) {
      set('responsible_qty', String(defectQty))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, sequence])

  const goNext = () => {
    if (stepIndex < total - 1) setStepIndex(stepIndex + 1)
  }
  const goBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1)
    else onCancel?.()
  }
  const jumpTo = (i) => setStepIndex(i)
  const pickAndNext = (k, v) => {
    set(k, v)
    setTimeout(goNext, 120)
  }

  // chips — 지나온 step 중 값 있는 것
  const lotChip = lotNo
    ? { key: 'lot', label: 'LOT', value: lotNo, onClick: () => onCancel?.() }
    : null
  const chips = [
    ...(lotChip ? [lotChip] : []),
    ...sequence
      .slice(0, stepIndex)
      .map((k, i) => ({ k, i }))
      .filter(({ k }) => NG_CHIP_META[k] && NG_CHIP_META[k].fmt(ngForm))
      .map(({ k, i }) => ({
        key: k,
        label: NG_CHIP_META[k].label,
        value: String(NG_CHIP_META[k].fmt(ngForm)),
        onClick: () => jumpTo(i),
      })),
  ]

  // responsible 옵션 — props 로 받거나 전체
  const respOpts = responsibleOptions || [
    RESPONSIBLE.SELF,
    RESPONSIBLE.SUPPLIER,
    RESPONSIBLE.OUTSOURCE,
  ]

  // 문제 공정 후보 (재작업 + 우리 LOT 일 때만 노출되니까 안전하게 계산)
  const problemProcessOpts = getProblemProcessOptions(detectedProcess).map(
    (p) => `${p.key} (${p.label})`,
  )
  const problemProcessKey = (label) => label.split(' ')[0] // 'EA (낱장가공)' → 'EA'

  const handleSubmit = () => onSubmit?.({ ...ngForm, defect_qty: defectQty })

  return (
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
          {renderStep()}
        </motion.div>
      </AnimatePresence>
    </WizardShell>
  )

  function renderStep() {
    // NG step 5종 (defect_detail/responsible/responsible_qty/handle_method/problem_process) 은
    // IQ/IPQ 와 동일한 renderNgStep 호출로 통일 (2026-06-01).
    // remark 만 wizard 전용 (저장 버튼이 마지막에 와야 해서 별도 처리).
    if (key === 'remark') {
      return (
        <Question
          title="비고가 있나요?"
          sub="특이사항 (선택). 입력 후 저장하세요"
          footer={
            <PrimaryButton onClick={handleSubmit} disabled={saving}>
              {saving ? '저장 중…' : submitLabel}
            </PrimaryButton>
          }
        >
          <BigInput
            type="text"
            value={ngForm.remark}
            autoFocus
            placeholder="특이사항"
            onChange={(e) => set('remark', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !saving && handleSubmit()}
          />
        </Question>
      )
    }
    // 공통 NG step 렌더러 — IQ/IPQ 와 picture-perfect 동일 UI 보장
    const ctx = {
      value: ngForm[key],
      setValue: (v) => set(key, v),
      pickAndNext: (v) => pickAndNext(key, v),
      goNext,
    }
    if (key === 'responsible') ctx.options = respOpts
    if (key === 'responsible_qty') ctx.maxQty = defectQty || 0
    if (key === 'problem_process') ctx.detectedProcess = detectedProcess
    return renderNgStep(key, ctx)
  }
}

// ─────────────────────────────────────────
// 스캔 결과 패널 — meta endpoint 응답을 시각화 (2026-05-31)
// 사용처: IQ / IPQ 공통.
// props:
//   loading: 조회 중
//   meta: { lot_no, found, is_internal, process, phi, motor_type, quantity, status, repair_suffix, suggested }
//   autofilledKeys: ['product_type', 'inspection_target', 'size', 'inspection_qty'] — 폼에 실제 주입된 키들
// ─────────────────────────────────────────

// 자동 입력 키 → 한글 라벨 (2026-06-01) — wizard 가 영문 form 키 그대로 표시하면
// 한국어 UI 에 이질감. 사용자에게는 무조건 한글 라벨로 노출.
const AUTOFILL_LABEL_KO = {
  process_category: '공정구분',
  received_date: '입고일',
  supplier: '입고업체',
  product_type: '제품구분',
  inspection_target: '검사 대상',
  size: '사이즈',
  inspection_qty: '검사수량',
}
export function ScanMetaPanel({ loading, meta, autofilledKeys = [] }) {
  if (loading) {
    return (
      <div style={panelStyle('#fafafa', '#e5e7eb')}>
        <span style={{ color: '#6b7280', fontSize: 12 }}>📡 조회 중…</span>
      </div>
    )
  }
  if (!meta) return null
  const found = meta.found
  return (
    <div style={panelStyle(found ? '#f0fdf4' : '#fff7f7', found ? '#bbf7d0' : '#fecaca')}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          fontSize: 12.5,
          fontWeight: 600,
        }}
      >
        {found ? (
          <span style={{ color: '#166534' }}>✓ 시스템 LOT 조회됨</span>
        ) : (
          <span style={{ color: '#991b1b' }}>⚠ 시스템에 없는 LOT</span>
        )}
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 11.5,
            color: 'var(--color-primary)',
            padding: '1px 6px',
            background: 'rgba(56, 104, 249, 0.08)',
            borderRadius: 4,
          }}
        >
          {meta.lot_no}
        </span>
      </div>

      {/* 데이터 grid — found 면 Inventory + 추론, !found 면 추론만 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '6px 14px',
          fontSize: 11.5,
        }}
      >
        <MetaRow label="공정" value={meta.process} />
        {found && <MetaRow label="파이" value={meta.phi ? `Φ${meta.phi}` : ''} />}
        {found && <MetaRow label="모터" value={meta.motor_type} />}
        {found && <MetaRow label="검사수량" value={meta.quantity != null ? meta.quantity : ''} />}
        {found && <MetaRow label="상태" value={meta.status} mono />}
        {found && meta.received_date && <MetaRow label="입고일" value={meta.received_date} />}
        {meta.repair_suffix && <MetaRow label="재공정" value={meta.repair_suffix} />}
        {meta.suggested?.process_category && (
          <MetaRow label="공정구분" value={meta.suggested.process_category} suggested />
        )}
        {meta.suggested?.product_type && (
          <MetaRow label="제품구분" value={meta.suggested.product_type} suggested />
        )}
        {meta.suggested?.inspection_target && (
          <MetaRow label="검사 대상" value={meta.suggested.inspection_target} suggested />
        )}
      </div>

      {autofilledKeys.length > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px dashed #d1d5db',
            fontSize: 11.5,
            color: '#374151',
            lineHeight: 1.55,
            fontFamily: 'inherit',
          }}
        >
          ↳ 자동 입력됨 (확인 후 다음 단계 자동 진행):{' '}
          <b style={{ color: '#0f766e' }}>
            {autofilledKeys.map((k) => AUTOFILL_LABEL_KO[k] || k).join(' · ')}
          </b>
        </div>
      )}
    </div>
  )
}

function MetaRow({ label, value, mono, suggested }) {
  if (value === '' || value == null) return null
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ color: '#6b7280', fontSize: 10.5, minWidth: 42 }}>{label}</span>
      <span
        style={{
          fontWeight: 600,
          fontFamily: mono ? 'monospace' : 'inherit',
          color: suggested ? '#0891b2' : 'var(--color-text)',
        }}
      >
        {String(value)}
      </span>
    </div>
  )
}

function panelStyle(bg, border) {
  return {
    marginTop: 10,
    padding: '10px 12px',
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 8,
  }
}
