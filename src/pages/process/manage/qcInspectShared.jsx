// pages/process/manage/qcInspectShared.jsx
// IQ/IPQ 페이지 공통 유틸 — 진행형 섹션 래퍼, 자동 산출, 저장 로직 (2026-05-31)

import { motion, AnimatePresence } from 'framer-motion'
import { QC_JUDGMENT } from '@/constants/qcConst'

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
            <div style={{
              fontSize: 12, fontWeight: 700,
              color: 'var(--color-text-sub, var(--color-gray))',
              marginBottom: 10,
              display: 'flex', gap: 6, alignItems: 'baseline',
            }}>
              <span>{title}</span>
              {hint && <span style={{ fontWeight: 400, fontSize: 10.5, color: 'var(--color-text-muted)' }}>· {hint}</span>}
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
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      flex: wide ? '1 1 100%' : '1 1 180px',
      minWidth: 0,
    }}>
      <span style={{
        fontSize: 11.5, fontWeight: 600,
        color: 'var(--color-text-sub, var(--color-gray))',
        display: 'flex', gap: 4, alignItems: 'baseline',
      }}>
        {label}
        {required && <span style={{ color: '#c0392b' }}>*</span>}
        {hint && <span style={{ fontWeight: 400, fontSize: 10.5, color: 'var(--color-text-muted)' }}>({hint})</span>}
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
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 32, padding: '4px 14px', borderRadius: 6, fontWeight: 700,
      fontSize: 13, letterSpacing: '0.04em',
      background: ng ? '#fee2e2' : '#dcfce7',
      color: ng ? '#991b1b' : '#166534',
    }}>
      {value}
    </span>
  )
}

// ─────────────────────────────────────────
// 자동 산출 — BE/QcRecordPage 동일 로직
// ─────────────────────────────────────────
export function computeRate(insp, defect) {
  const i = parseFloat(insp), d = parseFloat(defect) || 0
  if (!i || i <= 0) return null
  return Math.round((d / i) * 10000) / 100
}
export function computeJudgment(defect) {
  return (parseFloat(defect) || 0) > 0 ? QC_JUDGMENT.NG : QC_JUDGMENT.OK
}

export const TODAY = () => new Date().toISOString().slice(0, 10)

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
  process_category:  '공정구분',
  received_date:     '입고일',
  supplier:          '입고업체',
  product_type:      '제품구분',
  inspection_target: '검사 대상',
  size:              '사이즈',
  inspection_qty:    '검사수량',
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
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
        fontSize: 12.5, fontWeight: 600,
      }}>
        {found ? (
          <span style={{ color: '#166534' }}>✓ 시스템 LOT 조회됨</span>
        ) : (
          <span style={{ color: '#991b1b' }}>⚠ 시스템에 없는 LOT</span>
        )}
        <span style={{
          fontFamily: 'monospace', fontSize: 11.5,
          color: 'var(--color-primary)', padding: '1px 6px',
          background: 'rgba(56, 104, 249, 0.08)', borderRadius: 4,
        }}>
          {meta.lot_no}
        </span>
      </div>

      {/* 데이터 grid — found 면 Inventory + 추론, !found 면 추론만 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '6px 14px',
        fontSize: 11.5,
      }}>
        <MetaRow label="공정" value={meta.process} />
        {found && <MetaRow label="파이" value={meta.phi ? `Φ${meta.phi}` : ''} />}
        {found && <MetaRow label="모터" value={meta.motor_type} />}
        {found && <MetaRow label="검사수량" value={meta.quantity != null ? meta.quantity : ''} />}
        {found && <MetaRow label="상태" value={meta.status} mono />}
        {found && meta.received_date && <MetaRow label="입고일" value={meta.received_date} />}
        {meta.repair_suffix && <MetaRow label="재공정" value={meta.repair_suffix} />}
        {meta.suggested?.process_category && <MetaRow label="공정구분" value={meta.suggested.process_category} suggested />}
        {meta.suggested?.product_type    && <MetaRow label="제품구분" value={meta.suggested.product_type} suggested />}
        {meta.suggested?.inspection_target    && <MetaRow label="검사 대상" value={meta.suggested.inspection_target} suggested />}
      </div>

      {autofilledKeys.length > 0 && (
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: '1px dashed #d1d5db',
          fontSize: 11.5, color: '#374151', lineHeight: 1.55,
          fontFamily: 'inherit',
        }}>
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
      <span style={{
        fontWeight: 600,
        fontFamily: mono ? 'monospace' : 'inherit',
        color: suggested ? '#0891b2' : 'var(--color-text)',
      }}>
        {String(value)}{suggested && <span style={{ fontSize: 9.5, marginLeft: 3, color: '#94a3b8' }}>(추론)</span>}
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
