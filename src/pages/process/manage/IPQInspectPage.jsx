// pages/process/manage/IPQInspectPage.jsx
// IPQ (공정검사) 입력 — 자체 공정 LOT 검사 (2026-05-31)
//
// 흐름 (OQ 패턴):
//   1) 진입 시 풀스크린 QRScanner — 카메라 스캔 or 수기 입력
//   2) 스캔/입력 후 form 으로 전환 — Progressive disclosure
//        제품정보 → 검사 수량/합부 → (NG 시) 불량 후속 → 비고
//   3) 저장 → NG → "재공정 보내기" / "부적합품 처리"
//
// IPQ 는 우리 LOT 만 다룸 → process_category="공정" 자동, 입고일/입고업체 불필요.
import { useState, useMemo } from 'react'
import PageHeader from '@/components/common/PageHeader'
import QRScanner from '@/components/QRScanner'
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


// LOT prefix → 공정 코드 추론
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


export default function IPQInspectPage({ user, onBack }) {
  const [form, setForm] = useState({
    lot_no: '',
    detected_process: '',
    product_type: '',
    inspection_target: '',
    size: '',
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
  // 진입 시 풀스크린 QR 스캐너 (OQ 패턴). 스캔/수기 후 'form' 으로 전환.
  const [step, setStep] = useState('scan')

  // LOT 값 세팅 + 공정 자동 감지
  const onLotChange = (v) => {
    setForm((prev) => ({
      ...prev,
      lot_no: v,
      detected_process: inferProcessFromLot(v),
    }))
  }

  // ── 진행 조건 ──
  const showProductInfo  = !!form.lot_no.trim() && !!form.detected_process
  const showQtySection   = !!form.product_type && !!form.inspection_target.trim()
  const hasQtyInput      = form.good_qty !== '' || form.defect_qty !== ''
  const judgment         = useMemo(() => computeJudgment(form.defect_qty), [form.defect_qty])
  const rate             = useMemo(() => computeRate(form.inspection_qty, form.defect_qty), [form.inspection_qty, form.defect_qty])
  // 즉시 가드 — 양품+불량 > 검사수량 (검사수량 명시일 때만, 2026-06-01)
  const overflow = useMemo(() => {
    const insp = parseFloat(form.inspection_qty)
    const good = parseFloat(form.good_qty || 0)
    const defect = parseFloat(form.defect_qty || 0)
    return { over: !isNaN(insp) && (good + defect) > insp, insp, good, defect, sum: good + defect }
  }, [form.inspection_qty, form.good_qty, form.defect_qty])
  const showNgSection    = hasQtyInput && judgment === QC_JUDGMENT.NG
  const showRemarkSection= hasQtyInput && (judgment === QC_JUDGMENT.OK || !!form.handle_method)

  // ── 검증 ──
  const validate = () => {
    if (!form.lot_no.trim()) return 'LOT 번호를 입력해주세요.'
    if (!form.detected_process) return 'LOT 형식에서 공정 코드를 감지할 수 없습니다.'
    if (!form.product_type) return '제품구분을 선택해주세요.'
    if (!form.inspection_target.trim()) return '검사 대상을 입력해주세요.'
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
        inspection_type: QC_TYPE.IPQ,
        process_category: PROCESS_CATEGORY.PROCESS,
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
      lot_no: '', detected_process: '',
      product_type: '', inspection_target: '', size: '',
      unit: 'ea',
      inspection_qty: '', good_qty: '', defect_qty: '',
      defect_detail: '', responsible: '', responsible_qty: '', handle_method: '',
      remark: '',
      inspector: user?.id || '',
    })
    setSaved(null); setSavedInternal(null); setNcMarked(false)
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
          : '부적합품 기록 저장 (재고 외부)',
        'warning',
      )
      setNcMarked(true)
    } catch (e) {
      emitToast(e.message || '부적합품 처리 실패', 'error')
    } finally { setActionBusy(false) }
  }

  // ── 스캔 화면 (진입 시) — QRScanner 풀스크린. 카메라 + 수기 입력 둘 다 지원. ──
  if (step === 'scan') {
    return (
      <QRScanner
        processLabel="IPQ — 공정검사"
        onScan={async (val) => {
          const v = (val || '').trim()
          if (!v) throw new Error('빈 값입니다.')
          onLotChange(v)
          setStep('form')
        }}
        onBack={onBack}
      />
    )
  }

  return (
    <div className="page-flat">
      {/* PageHeader.onBack = 스캐너로 복귀 (페이지 종료는 QR 화면의 onBack 에서) */}
      <PageHeader
        title="IPQ — 공정검사"
        subtitle={`LOT: ${form.lot_no}`}
        onBack={() => setStep('scan')}
      />

      {/* Step 1: 검사대상 LOT (읽기 전용 — 변경하려면 ‘← 스캐너로 복귀’) */}
      <Section show={true} title="① 검사대상 LOT" hint="변경하려면 ‘← 스캐너로 복귀’">
        <Row>
          <Field label="LOT No" required wide>
            <input type="text" className="form-input" value={form.lot_no} readOnly />
          </Field>
        </Row>
        {form.lot_no && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--color-text-sub, var(--color-gray))' }}>
            감지된 공정: <b style={{ color: form.detected_process ? 'var(--color-primary)' : '#c0392b' }}>
              {form.detected_process || '알 수 없음 (LOT 형식 확인 필요)'}
            </b>
          </div>
        )}
      </Section>

      {/* Step 2: 제품 정보 */}
      <Section show={showProductInfo} title="② 제품 정보">
        <Row>
          <Field label="제품구분" required>
            <select className="form-input" value={form.product_type}
                    onChange={(e) => set('product_type', e.target.value)}>
              <option value="">선택</option>
              {Object.values(PRODUCT_TYPE).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="검사 대상" required>
            <input type="text" className="form-input" value={form.inspection_target}
                   onChange={(e) => set('inspection_target', e.target.value)} placeholder="예: 고정자, 낱장" />
          </Field>
          <Field label="사이즈/규격">
            <input type="text" className="form-input" value={form.size}
                   onChange={(e) => set('size', e.target.value)} placeholder="예: 87, 95" />
          </Field>
        </Row>
      </Section>

      {/* Step 3: 수량 + 자동 판정 */}
      <Section show={showQtySection} title="③ 검사 수량 / 합부">
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
                   onChange={(e) => set('good_qty', e.target.value)}
                   style={overflow.over ? { borderColor: '#fca5a5', background: '#fff5f5' } : undefined} />
          </Field>
          <Field label="불량수량">
            <input type="number" min="0" step="any" className="form-input" value={form.defect_qty}
                   onChange={(e) => set('defect_qty', e.target.value)}
                   style={overflow.over ? { borderColor: '#fca5a5', background: '#fff5f5' } : undefined} />
          </Field>
        </Row>
        {overflow.over && (
          <div style={{
            marginTop: 10, padding: '10px 14px', borderRadius: 8,
            background: '#fff5f5', border: '1px solid #fca5a5',
            fontSize: 12.5, color: '#991b1b', fontWeight: 600,
          }}>
            ⚠ 양품 {overflow.good} + 불량 {overflow.defect} = {overflow.sum} 이 검사수량 {overflow.insp} 을 초과합니다.
          </div>
        )}
        {!overflow.over && hasQtyInput && (
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

      {/* Step 4: NG 후속 */}
      <Section show={showNgSection} title="④ 불량 후속" hint="NG 일 때만">
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

      {/* Step 5: 비고 */}
      <Section show={showRemarkSection} title="⑤ 비고">
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

      {/* 결과 */}
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
                <button className="btn-text" disabled>재공정 불가 (외부 LOT)</button>
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
