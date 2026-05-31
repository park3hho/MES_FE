// pages/process/manage/IQInspectPage.jsx
// IQ (입고검사) 입력 — 외주/원자재 입고 검사 (2026-05-31)
//
// Progressive disclosure:
//   1) 공정구분 (외주 or 원자재) 선택 — 입고일/업체 카테고리 분기
//   2) 입고일 + 입고업체
//   3) 제품 정보 (제품구분 + 제품명 + 사이즈)
//   4) LOT (외주 복귀 시 우리 LOT, 신규 입고는 외부 LOT)
//   5) 검사 수량 (검사수량 비우면 단일 LOT 안전, 양품/불량 직접 입력)
//   6) 양품/불량 → 자동 불량률 + 합/부 판정
//   7) NG 시 불량 후속 (불량내용 + 귀책 + 처리방법)
//   8) 비고
//   9) 저장 → NG → "재공정 보내기"(LOT 내부일 때만) / "부적합품 처리"
import { useState, useMemo } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  QC_TYPE, PROCESS_CATEGORY, PRODUCT_TYPE, QC_JUDGMENT,
  RESPONSIBLE, HANDLE_METHOD, QC_UNITS_DEFAULT,
} from '@/constants/qcConst'
import {
  createQcInspection, isQcInternalLot,
  sendQcRepair, markQcNonconforming,
} from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import {
  Section, Field, Row, JudgmentBadge,
  computeRate, computeJudgment, TODAY,
} from './qcInspectShared'


const IQ_CATEGORIES = [PROCESS_CATEGORY.OUTSOURCE, PROCESS_CATEGORY.RAW]


export default function IQInspectPage({ user, onBack }) {
  const [form, setForm] = useState({
    process_category: '',
    received_date: TODAY(),
    supplier: '',
    product_type: '',
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
    inspector: user?.id || '',
  })
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }))

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const [savedInternal, setSavedInternal] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [ncMarked, setNcMarked] = useState(false)

  // ── 진행 조건 (progressive disclosure) ──
  const showIncoming     = !!form.process_category
  const showProductInfo  = !!form.received_date && !!form.supplier.trim()
  const showLotSection   = !!form.product_type && !!form.product_name.trim()
  const showQtySection   = !!form.lot_no.trim() || form.lot_no === '-'  // LOT 명시 or '-' 로 skip
  const hasQtyInput      = form.good_qty !== '' || form.defect_qty !== ''
  const judgment         = useMemo(() => computeJudgment(form.defect_qty), [form.defect_qty])
  const rate             = useMemo(() => computeRate(form.inspection_qty, form.defect_qty), [form.inspection_qty, form.defect_qty])
  const showNgSection    = hasQtyInput && judgment === QC_JUDGMENT.NG
  const showRemarkSection= hasQtyInput && (judgment === QC_JUDGMENT.OK || !!form.handle_method)

  // ── 검증 ──
  const validate = () => {
    if (!form.process_category) return '공정구분을 선택해주세요.'
    if (!form.received_date) return '입고일은 필수입니다.'
    if (!form.supplier.trim()) return '입고업체를 입력해주세요.'
    if (!form.product_type) return '제품구분을 선택해주세요.'
    if (!form.product_name.trim()) return '제품명을 입력해주세요.'
    if (!form.inspector.trim()) return '검사자 정보가 없습니다.'
    const insp = parseFloat(form.inspection_qty)
    const good = parseFloat(form.good_qty || 0)
    const defect = parseFloat(form.defect_qty || 0)
    if (!isNaN(insp) && (good + defect) > insp) {
      return `양품(${good}) + 불량(${defect}) 이 검사수량(${insp})을 초과합니다.`
    }
    return null
  }

  // ── 저장 ──
  const onSave = async () => {
    const err = validate()
    if (err) { emitToast(err, 'error'); return }
    setSaving(true)
    try {
      const body = {
        ...form,
        inspection_type: QC_TYPE.IQ,
        inspection_date: TODAY(),
        received_date: form.received_date || null,
        lot_no: form.lot_no === '-' ? '' : form.lot_no,   // '-' 는 빈 LOT 의미
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
        } catch {
          setSavedInternal({ lot_no: ins.lot_no, is_internal: false })
        }
      }
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

  const onReset = () => {
    setForm({
      process_category: '', received_date: TODAY(), supplier: '',
      product_type: '', product_name: '', size: '',
      lot_no: '', unit: 'ea',
      inspection_qty: '', good_qty: '', defect_qty: '',
      defect_detail: '', responsible: '', responsible_qty: '', handle_method: '',
      remark: '',
      inspector: user?.id || '',
    })
    setSaved(null); setSavedInternal(null); setNcMarked(false)
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
    } catch (e) {
      emitToast(e.message || '재공정 실패', 'error')
    } finally { setActionBusy(false) }
  }

  const onMarkNonconforming = async () => {
    if (!saved) return
    const reason = window.prompt('부적합 사유:', form.defect_detail || '')
    if (!reason) return
    setActionBusy(true)
    try {
      const res = await markQcNonconforming(saved.id, reason)
      emitToast(
        res.affected_inventory_rows
          ? `부적합품 격리됨 (재고 ${res.affected_inventory_rows}행)`
          : '부적합품 기록 저장 (재고 외부 자재)',
        'warning',
      )
      setNcMarked(true)
    } catch (e) {
      emitToast(e.message || '부적합품 처리 실패', 'error')
    } finally { setActionBusy(false) }
  }

  return (
    <div className="page-flat">
      <PageHeader title="IQ — 입고검사" subtitle="외주/원자재 입고 시 검사" onBack={onBack} />

      {/* Step 1: 공정구분 */}
      <Section show={true} title="① 공정 구분">
        <Row>
          <Field label="공정구분" required hint="외주 or 원자재">
            <select className="form-input" value={form.process_category}
                    onChange={(e) => set('process_category', e.target.value)}>
              <option value="">선택</option>
              {IQ_CATEGORIES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
        </Row>
      </Section>

      {/* Step 2: 입고 정보 */}
      <Section show={showIncoming} title="② 입고 정보">
        <Row>
          <Field label="입고일" required>
            <input type="date" className="form-input" value={form.received_date}
                   onChange={(e) => set('received_date', e.target.value)} />
          </Field>
          <Field label="입고업체" required>
            <input type="text" className="form-input" value={form.supplier}
                   onChange={(e) => set('supplier', e.target.value)} placeholder="업체명" />
          </Field>
        </Row>
      </Section>

      {/* Step 3: 제품 정보 */}
      <Section show={showProductInfo} title="③ 제품 정보">
        <Row>
          <Field label="제품구분" required>
            <select className="form-input" value={form.product_type}
                    onChange={(e) => set('product_type', e.target.value)}>
              <option value="">선택</option>
              {Object.values(PRODUCT_TYPE).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="제품명/소재명" required>
            <input type="text" className="form-input" value={form.product_name}
                   onChange={(e) => set('product_name', e.target.value)} placeholder="예: 낱장, 고정자" />
          </Field>
          <Field label="사이즈/규격">
            <input type="text" className="form-input" value={form.size}
                   onChange={(e) => set('size', e.target.value)} placeholder="예: 87, 95" />
          </Field>
        </Row>
      </Section>

      {/* Step 4: LOT */}
      <Section show={showLotSection} title="④ LOT" hint="외주 복귀면 우리 LOT, 신규 입고면 외부 LOT 번호 / 없으면 '-'">
        <Row>
          <Field label="LOT No" required wide>
            <input type="text" className="form-input" value={form.lot_no}
                   onChange={(e) => set('lot_no', e.target.value)} placeholder="LOT 번호 또는 '-'" />
          </Field>
        </Row>
      </Section>

      {/* Step 5+6: 수량 / 자동 판정 */}
      <Section show={showQtySection} title="⑤ 검사 수량 / 합부">
        <Row>
          <Field label="단위">
            <select className="form-input" value={form.unit}
                    onChange={(e) => set('unit', e.target.value)}>
              {QC_UNITS_DEFAULT.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="검사수량" hint="비우면 단일 LOT (엑셀 '-')">
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
        </Row>
        {hasQtyInput && (
          <Row>
            <Field label="불량률 (자동)">
              <input type="text" readOnly className="form-input"
                     value={rate == null ? '—' : `${rate.toFixed(2)}%`} />
            </Field>
            <Field label="합/부 판정 (자동)">
              <JudgmentBadge value={judgment} />
            </Field>
          </Row>
        )}
      </Section>

      {/* Step 7: NG 후속 */}
      <Section show={showNgSection} title="⑥ 불량 후속" hint="NG 일 때만 노출">
        <Row>
          <Field label="불량내용" wide>
            <input type="text" className="form-input" value={form.defect_detail}
                   onChange={(e) => set('defect_detail', e.target.value)} placeholder="불량 사유 상세" />
          </Field>
        </Row>
        <Row>
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
        </Row>
      </Section>

      {/* Step 8: 비고 */}
      <Section show={showRemarkSection} title="⑦ 비고">
        <Row>
          <Field label="비고" wide>
            <input type="text" className="form-input" value={form.remark}
                   onChange={(e) => set('remark', e.target.value)} placeholder="특이사항 (선택)" />
          </Field>
        </Row>
      </Section>

      {/* 액션 */}
      {hasQtyInput && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className="btn-secondary btn-md" onClick={onReset} disabled={saving || actionBusy}>
            초기화
          </button>
          <button className="btn-primary btn-md" onClick={onSave} disabled={saving || actionBusy}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      )}

      {/* 결과 패널 */}
      {saved && (
        <ResultPanel
          saved={saved} ncMarked={ncMarked} savedInternal={savedInternal} actionBusy={actionBusy}
          onSendRepair={onSendRepair} onMarkNonconforming={onMarkNonconforming}
        />
      )}
    </div>
  )
}


function ResultPanel({ saved, ncMarked, savedInternal, actionBusy, onSendRepair, onMarkNonconforming }) {
  const ng = saved.judgment === QC_JUDGMENT.NG
  return (
    <div style={{
      marginTop: 20, padding: 16, borderRadius: 8,
      background: ng ? '#fff7f7' : '#f0fdf4',
      border: `1px solid ${ng ? '#fecaca' : '#bbf7d0'}`,
    }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600 }}>
        검사 #{saved.id} —{' '}
        <span style={{ color: ng ? '#991b1b' : '#166534' }}>{saved.judgment}</span>
        {saved.lot_no && <span style={{ marginLeft: 8, fontSize: 12, fontFamily: 'monospace' }}>{saved.lot_no}</span>}
      </h3>
      {ng && (
        <>
          {saved.repair_lot_no ? (
            <p style={{ margin: 0, color: '#166534', fontWeight: 500 }}>✅ 재공정 LOT: <b>{saved.repair_lot_no}</b></p>
          ) : ncMarked ? (
            <p style={{ margin: 0, color: 'var(--color-text-sub, var(--color-gray))', fontSize: 13 }}>
              ⚠ 부적합품 격리됨 — 폐기/되살리기는{' '}
              <a href="/admin/qc-nonconforming" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>부적합품 관리</a>{' '}
              에서 처리하세요.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {savedInternal?.is_internal ? (
                <button className="btn-primary btn-md" onClick={onSendRepair} disabled={actionBusy}>
                  재공정 보내기
                </button>
              ) : (
                <button className="btn-text" disabled title="외부 LOT — 재공정 불가">
                  재공정 불가 (외부 LOT)
                </button>
              )}
              <button className="btn-danger btn-md" onClick={onMarkNonconforming} disabled={actionBusy}>
                부적합품 처리
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
