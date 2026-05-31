// pages/process/manage/QcRecordPage.jsx
// QC (품질검사) 통합 입력 — IQ / IPQ (2026-05-30)
// OQ 는 기존 OQPage 유지 (단품-측정값 시스템).
// 동작 규약: docs/qc-workflow + WORK_STATE 2026-05-30 노트 참조.
//
// 핵심 UX:
//   1) 검사구분(IQ/IPQ) 탭 — URL ?type=IQ|IPQ 동기.
//   2) 입고일/입고업체 = 공정구분 ∈ {외주, 원자재} 일 때만 노출.
//   3) 검사수량 빈 = 단일 LOT 안전 케이스 (엑셀 "-").
//   4) 양품/불량 입력 시 불량률·합부 자동 산출 (read-only 표시).
//   5) 저장 후 NG 면 결과 카드에 "재공정 보내기" / "부적합품 처리" 버튼.
//      재공정 버튼은 LOT 가 우리 시스템 내부에 있을 때만 노출 (is-internal 조회).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageHeader from '@/components/common/PageHeader'
import {
  QC_TYPE, QC_TYPE_LABELS,
  PROCESS_CATEGORY, INCOMING_DATE_CATEGORIES,
  PRODUCT_TYPE,
  QC_JUDGMENT,
  RESPONSIBLE,
  HANDLE_METHOD,
  QC_UNITS_DEFAULT,
  defaultProcessCategory,
} from '@/constants/qcConst'
import {
  createQcInspection, isQcInternalLot,
  sendQcRepair, markQcNonconforming,
} from '@/api'

// LOT 번호에서 공정 코드 추론 (RM/MP/EA/HT/BO/EC/WI/SO/OQ/UB/MB/OB)
// 예: 'EC01260507-07' → 'EC' / 'SR023520260310-01' → 'MP' / 'VA-CO-35' → 'RM'
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
import { emitToast } from '@/contexts/ToastContext'
import s from './QcRecordPage.module.css'

const TODAY = () => new Date().toISOString().slice(0, 10)

function emptyForm(type) {
  return {
    inspection_type: type,
    inspection_date: TODAY(),
    received_date: '',
    inspector: '',
    process_category: '',
    product_type: '',
    supplier: '',
    product_name: '',
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
  }
}

// 불량률 자동 산출 — BE compute_defect_rate 와 동일 로직
function computeRate(insp, defect) {
  const i = parseFloat(insp), d = parseFloat(defect) || 0
  if (!i || i <= 0) return null
  return Math.round((d / i) * 10000) / 100   // 0.00 ~ 100.00
}

// 합부 자동 마킹 — BE compute_judgment 와 동일
function computeJudgment(defect) {
  return (parseFloat(defect) || 0) > 0 ? QC_JUDGMENT.NG : QC_JUDGMENT.OK
}


export default function QcRecordPage({ user, onBack }) {
  const [sp, setSp] = useSearchParams()
  const navigate = useNavigate()
  const tabType = sp.get('type') === QC_TYPE.IQ ? QC_TYPE.IQ : QC_TYPE.IPQ   // 기본 IPQ
  const [form, setForm] = useState(() => emptyForm(tabType))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)         // 저장 직후 응답 (NG 결과 카드 노출용)
  const [savedInternal, setSavedInternal] = useState(null)   // {lot_no, is_internal}
  const [actionBusy, setActionBusy] = useState(false)
  const [ncMarked, setNcMarked] = useState(false)   // 부적합품 격리됨 — 폐기 확정 대기 상태

  // URL ?type 변경 시 폼 리셋 (탭 전환)
  useEffect(() => {
    setForm((prev) => ({ ...emptyForm(tabType), inspector: prev.inspector }))
    setSaved(null)
    setSavedInternal(null)
    setNcMarked(false)
  }, [tabType])

  const showIncoming = INCOMING_DATE_CATEGORIES.has(form.process_category)
  const rate = useMemo(
    () => computeRate(form.inspection_qty, form.defect_qty),
    [form.inspection_qty, form.defect_qty],
  )
  const judgment = useMemo(
    () => computeJudgment(form.defect_qty),
    [form.defect_qty],
  )

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }))

  // LOT 입력 시 공정 코드 추론 → 공정구분 자동 마킹 (사용자가 이미 골랐으면 건드리지 않음).
  // RM/EC 는 무조건. MP/EA 는 가변(=null 반환) — 사용자 선택 유지. 그 외 = '공정' fallback.
  const onLotChange = (v) => {
    setForm((prev) => {
      const next = { ...prev, lot_no: v }
      if (!prev.process_category) {
        const proc = inferProcessFromLot(v)
        const cat = defaultProcessCategory(proc)
        if (cat) next.process_category = cat
      }
      return next
    })
  }

  const validate = () => {
    if (!form.inspector.trim()) return '검사자를 입력해주세요.'
    if (!form.process_category) return '공정구분을 선택해주세요.'
    if (!form.product_type) return '제품구분을 선택해주세요.'
    if (!form.product_name.trim()) return '제품명을 입력해주세요.'
    if (showIncoming && !form.received_date) return '외주/원자재 검사는 입고일이 필수입니다.'
    const insp = parseFloat(form.inspection_qty || 'NaN')
    const good = parseFloat(form.good_qty || 0)
    const defect = parseFloat(form.defect_qty || 0)
    if (!isNaN(insp) && (good + defect) > insp) {
      return `양품(${good}) + 불량(${defect}) 이 검사수량(${insp})을 초과합니다.`
    }
    return null
  }

  const onSave = async () => {
    const err = validate()
    if (err) { emitToast(err, 'error'); return }
    setSaving(true)
    try {
      const body = {
        ...form,
        received_date: form.received_date || null,
        inspection_qty: form.inspection_qty === '' ? null : parseFloat(form.inspection_qty),
        good_qty: parseFloat(form.good_qty || 0),
        defect_qty: parseFloat(form.defect_qty || 0),
        responsible_qty: form.responsible_qty === '' ? null : parseFloat(form.responsible_qty),
      }
      const res = await createQcInspection(body)
      const ins = res.inspection
      setSaved(ins)
      // FAIL → LOT 내부 여부 조회해서 버튼 분기
      if (ins.judgment === QC_JUDGMENT.NG && ins.lot_no) {
        try {
          const chk = await isQcInternalLot(ins.lot_no)
          setSavedInternal({ lot_no: ins.lot_no, is_internal: !!chk.is_internal })
        } catch {
          setSavedInternal({ lot_no: ins.lot_no, is_internal: false })
        }
      } else {
        setSavedInternal(null)
      }
      emitToast(
        ins.judgment === QC_JUDGMENT.NG ? '검사 저장됨 — 불합격(NG). 후속 조치를 선택하세요.' : '검사 저장됨 (합격).',
        ins.judgment === QC_JUDGMENT.NG ? 'warning' : 'success',
      )
    } catch (e) {
      emitToast(e.message || '저장 중 오류', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onReset = () => {
    setForm((prev) => ({ ...emptyForm(tabType), inspector: prev.inspector }))
    setSaved(null)
    setSavedInternal(null)
    setNcMarked(false)
  }

  const onSendRepair = async () => {
    if (!saved) return
    const reason = window.prompt('재공정 사유를 입력하세요.', form.defect_detail || '')
    if (!reason) return
    setActionBusy(true)
    try {
      const res = await sendQcRepair(saved.id, reason)
      emitToast(`재공정 LOT 생성: ${res.repair_lot || '(?)'}`, 'success')
      setSaved({ ...saved, repair_lot_no: res.repair_lot || '', handle_method: HANDLE_METHOD.REWORK })
    } catch (e) {
      emitToast(e.message || '재공정 전송 실패', 'error')
    } finally {
      setActionBusy(false)
    }
  }

  const onMarkNonconforming = async () => {
    if (!saved) return
    const reason = window.prompt('부적합 사유를 입력하세요.', form.defect_detail || '')
    if (!reason) return
    setActionBusy(true)
    try {
      const res = await markQcNonconforming(saved.id, reason)
      emitToast(
        res.affected_inventory_rows
          ? `부적합품 격리됨 (재고 ${res.affected_inventory_rows}행). 다음 단계: 폐기 확정.`
          : '부적합품 기록 저장 (재고 없음). 다음 단계: 폐기 확정.',
        'warning',
      )
      // handle_method 자동 마킹 X — 폐기 확정 단계까지 가야 "폐기" 로 마킹됨
      setNcMarked(true)
    } catch (e) {
      emitToast(e.message || '부적합품 처리 실패', 'error')
    } finally {
      setActionBusy(false)
    }
  }

  // 부적합품 → 폐기/되살리기는 별도 페이지(부적합품 관리, /admin/qc-nonconforming) 에서 처리. (2026-05-31)
  // QC 결과 화면은 격리 마킹까지만 — 후속 처분은 검토 후 별도 결정.

  const switchTab = (type) => setSp({ type })

  return (
    <div className="page-flat">
      <PageHeader title="품질검사 입력 (QC)" onBack={onBack} />

      {/* ── 탭: IQ / IPQ (OQ 는 기존 OQ 페이지로) ── */}
      <div className={s.tabs}>
        <button
          className={`${s.tab} ${tabType === QC_TYPE.IQ ? s.tabActive : ''}`}
          onClick={() => switchTab(QC_TYPE.IQ)}
        >
          {QC_TYPE_LABELS.IQ} (IQ)
        </button>
        <button
          className={`${s.tab} ${tabType === QC_TYPE.IPQ ? s.tabActive : ''}`}
          onClick={() => switchTab(QC_TYPE.IPQ)}
        >
          {QC_TYPE_LABELS.IPQ} (IPQ)
        </button>
        <button
          className={s.tab}
          onClick={() => navigate('/process/OQ')}
          title="OQ 는 기존 단품-측정값 시스템 사용"
        >
          {QC_TYPE_LABELS.OQ} (OQ) →
        </button>
      </div>

      {/* ── 폼 (엑셀 양식 grid 모방) ── */}
      <div className={s.grid}>
        {/* 날짜 / 검사자 행 */}
        <Field label="검사일" required>
          <input type="date" className="form-input" value={form.inspection_date}
                 onChange={(e) => set('inspection_date', e.target.value)} />
        </Field>
        <Field label="검사자" required>
          <input type="text" className="form-input" value={form.inspector}
                 onChange={(e) => set('inspector', e.target.value)} placeholder="이름" />
        </Field>
        <Field label="공정구분" required>
          <select className="form-input" value={form.process_category}
                  onChange={(e) => set('process_category', e.target.value)}>
            <option value="">선택</option>
            {Object.values(PROCESS_CATEGORY).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="제품구분" required>
          <select className="form-input" value={form.product_type}
                  onChange={(e) => set('product_type', e.target.value)}>
            <option value="">선택</option>
            {Object.values(PRODUCT_TYPE).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>

        {/* 입고 정보 (조건부) */}
        {showIncoming && (
          <>
            <Field label="입고일" required>
              <input type="date" className="form-input" value={form.received_date}
                     onChange={(e) => set('received_date', e.target.value)} />
            </Field>
            <Field label="입고업체">
              <input type="text" className="form-input" value={form.supplier}
                     onChange={(e) => set('supplier', e.target.value)} placeholder="업체명" />
            </Field>
          </>
        )}

        {/* 검사 대상 */}
        <Field label="제품명/소재명" required>
          <input type="text" className="form-input" value={form.product_name}
                 onChange={(e) => set('product_name', e.target.value)} placeholder="예: 고정자, 낱장" />
        </Field>
        <Field label="사이즈/규격">
          <input type="text" className="form-input" value={form.size}
                 onChange={(e) => set('size', e.target.value)} placeholder="예: 87, 95" />
        </Field>
        <Field label="LOT No" hint="공정 코드 자동 감지">
          <input type="text" className="form-input" value={form.lot_no}
                 onChange={(e) => onLotChange(e.target.value)} placeholder="LOT 번호 (예: EC01260507-07)" />
        </Field>
        <Field label="단위">
          <select className="form-input" value={form.unit}
                  onChange={(e) => set('unit', e.target.value)}>
            {QC_UNITS_DEFAULT.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>

        {/* 수량 / 자동산출 */}
        <Field label="검사수량" hint="비우면 단일 LOT (엑셀 “-”)">
          <input type="number" min="0" step="any" className="form-input" value={form.inspection_qty}
                 onChange={(e) => set('inspection_qty', e.target.value)} placeholder="-" />
        </Field>
        <Field label="양품수량">
          <input type="number" min="0" step="any" className="form-input" value={form.good_qty}
                 onChange={(e) => set('good_qty', e.target.value)} />
        </Field>
        <Field label="불량수량">
          <input type="number" min="0" step="any" className="form-input" value={form.defect_qty}
                 onChange={(e) => set('defect_qty', e.target.value)} />
        </Field>
        <Field label="불량률 (자동)">
          <input type="text" className="form-input" readOnly
                 value={rate == null ? '—' : `${rate.toFixed(2)}%`} />
        </Field>
        <Field label="합/부 판정 (자동)">
          <span className={`${s.badge} ${judgment === QC_JUDGMENT.NG ? s.badgeNg : s.badgeOk}`}>
            {judgment}
          </span>
        </Field>

        {/* 불량 후속 (NG 일 때만) */}
        {judgment === QC_JUDGMENT.NG && (
          <>
            <Field label="불량내용" wide>
              <input type="text" className="form-input" value={form.defect_detail}
                     onChange={(e) => set('defect_detail', e.target.value)} placeholder="불량 사유 상세" />
            </Field>
            <Field label="귀책대상">
              <select className="form-input" value={form.responsible}
                      onChange={(e) => set('responsible', e.target.value)}>
                <option value="">선택</option>
                {Object.values(RESPONSIBLE).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="귀책 수량">
              <input type="number" min="0" step="any" className="form-input" value={form.responsible_qty}
                     onChange={(e) => set('responsible_qty', e.target.value)} />
            </Field>
            <Field label="처리방법">
              <select className="form-input" value={form.handle_method}
                      onChange={(e) => set('handle_method', e.target.value)}>
                <option value="">선택</option>
                {Object.values(HANDLE_METHOD).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
          </>
        )}

        {/* 비고 — 항상 마지막 */}
        <Field label="비고" wide>
          <input type="text" className="form-input" value={form.remark}
                 onChange={(e) => set('remark', e.target.value)} />
        </Field>
      </div>

      {/* ── 액션 ── */}
      <div className={s.actions}>
        <button className="btn-secondary btn-md" onClick={onReset} disabled={saving || actionBusy}>
          초기화
        </button>
        <button className="btn-primary btn-md" onClick={onSave} disabled={saving || actionBusy}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>

      {/* ── 저장 결과 (NG 일 때만 후속 액션 노출) ── */}
      {saved && saved.judgment === QC_JUDGMENT.NG && (
        <div className={s.resultPanel}>
          <h3 className={s.resultTitle}>
            검사 #{saved.id} 저장됨 — <span className={s.resultNg}>NG</span>
            {saved.lot_no && <span className={s.resultLot}>LOT: {saved.lot_no}</span>}
          </h3>
          <p className={s.resultHint}>
            불량 {saved.defect_qty} / 검사 {saved.inspection_qty ?? '-'} ({saved.defect_rate ?? '-'}%)
          </p>

          {saved.repair_lot_no ? (
            <p className={s.resultDone}>✅ 재공정 LOT: <b>{saved.repair_lot_no}</b></p>
          ) : ncMarked ? (
            <p className={s.resultHint}>
              ⚠ 부적합품 격리됨 — 폐기/되살리기는{' '}
              <a href="/admin/qc-nonconforming" className={s.resultLink}>부적합품 관리</a>{' '}
              에서 처리하세요.
            </p>
          ) : (
            <div className={s.resultBtns}>
              {savedInternal?.is_internal ? (
                <button className="btn-primary btn-md" onClick={onSendRepair} disabled={actionBusy}>
                  재공정 보내기 (내부 LOT)
                </button>
              ) : (
                <button className="btn-text" disabled title="외부 LOT 또는 우리 시스템에 없는 LOT">
                  재공정 불가 (외부/없음)
                </button>
              )}
              <button className="btn-danger btn-md" onClick={onMarkNonconforming} disabled={actionBusy}>
                부적합품 처리
              </button>
            </div>
          )}
        </div>
      )}
      {saved && saved.judgment === QC_JUDGMENT.OK && (
        <div className={s.resultPanel}>
          <h3 className={s.resultTitle}>검사 #{saved.id} 저장 — <span className={s.resultOk}>OK</span></h3>
        </div>
      )}
    </div>
  )
}

// ── 작은 Field 래퍼 (라벨 + 컨트롤 + 힌트) ──
function Field({ label, required, hint, wide, children }) {
  return (
    <label className={`${s.field} ${wide ? s.fieldWide : ''}`}>
      <span className={s.label}>
        {label}{required && <span className={s.req}> *</span>}
        {hint && <span className={s.hint}> ({hint})</span>}
      </span>
      {children}
    </label>
  )
}
