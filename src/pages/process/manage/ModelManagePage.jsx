// src/pages/adm/manage/ModelManagePage.jsx
// 제품 모델 레지스트리 CRUD 페이지 (2026-04-24 · PR-11 확장)
// team_rnd 전용 — /admin/manage/models
//
// 등록 필드 (3섹션):
//   [기본]   phi / motor_type / rt_st_type / color_hex / color_hex_light / label / display_order
//   [박스]   max_per_box (UB 박스당 최대 투입 수량)
//   [OQ 검사] pole_pairs / r_ref / l_ref / l_unit / kt_ref
//   [엑셀]   wire_type / sheet_name
//
// Toss flat 원칙 준수: .page-flat / PageHeader / .list-item / 모달

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { createModel, updateModel, deleteModel, hardDeleteModel, getModels } from '@/api'
import { useModels } from '@/hooks/useModels'
import { MOTOR_LABEL } from '@/constants/processConst'
import { OQ_THRESHOLD_DEFAULTS, TOAST_MSG_MS, TOAST_ERROR_MS } from '@/constants/etcConst'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import s from './ModelManagePage.module.css'

// MOTOR_LABEL 은 processConst 중앙화 사용 (2026-05-02). DIRECTION_FROM_MOTOR 는 제품코드 빌드 전용.
const DIRECTION_FROM_MOTOR = { inner: 'RI', outer: 'RO', axial: 'AX' }
const MOTOR_OPTIONS = Object.keys(MOTOR_LABEL).map((value) => ({
  value,
  label: `${MOTOR_LABEL[value]} (${DIRECTION_FROM_MOTOR[value] || ''})`.replace(' ()', ''),
}))

const RT_ST_OPTIONS = [
  { value: 'none', label: '없음' },
  { value: 'rt',   label: 'RT' },
  { value: 'st',   label: 'ST' },
  { value: 'both', label: 'RT/ST' },
]

// RT_ST suffix 제거 (2026-05-01) — 라벨 뒤에 ST/RT 표시 안 함, 식별만 데이터로 유지
// MOTOR_LABEL / DIRECTION_FROM_MOTOR 는 위에서 정의됨 (중앙화)

// 제품 코드용 자리 옵션 (2026-05-01)
const WIRE_CONFIG_OPTIONS = [
  { value: '',  label: '—' },
  { value: 'A', label: 'A · 직렬' },
  { value: 'B', label: 'B · 병렬' },
]
const FRAME_TYPE_OPTIONS = [
  { value: '',   label: '—' },
  { value: 'F',  label: 'F · 프레임' },
  { value: 'FL', label: 'FL · 프레임리스' },
]

const L_UNIT_OPTIONS = ['mH', 'µH']
const WIRE_OPTIONS = ['', 'copper', 'silver']

const EMPTY_FORM = {
  // 기본
  phi: '',
  motor_type: 'inner',
  rt_st_type: 'none',
  // 제품 코드 자리 (2026-05-01)
  height_code: '',
  gear_ratio: '',
  wire_config: '',
  frame_type: '',
  // 표시
  color_hex: '#3498DB',
  color_hex_light: '',
  label: '',
  display_order: 100,
  // 박스
  max_per_box: 1,
  // OQ
  pole_pairs: 0,
  r_ref: '',
  l_ref: '',
  l_unit: 'mH',
  kt_ref: '',
  // OQ 검사 임계값 — 항목별 미달 % (warn=0 이면 경고 단계 비활성). default 는 etcConst 단일 출처
  ...OQ_THRESHOLD_DEFAULTS,
  // 엑셀
  wire_type: '',
  sheet_name: '',
}

function autoLabel({ phi, motor_type }) {
  // RT/ST suffix 제거 (2026-05-01) — 라벨엔 외경+방향만, RT/ST 는 데이터 식별로만
  if (!phi) return ''
  const dir = MOTOR_LABEL[motor_type] || motor_type
  return `Φ${phi} ${dir}`
}

// 제품 코드 빌드 — BE services/model_registry_service.py::build_product_code 와 동기화 (2026-05-01)
// 형식: FD-{RO|RI|AX}-{phi}-{height}-g{gear}-{A|B}-{F|FL}
// 빈 자리는 자동 스킵 (예: height/gear 비면 FD-RO-20 까지만)
function buildProductCode({ motor_type, phi, height_code, gear_ratio, wire_config, frame_type }) {
  const dir = DIRECTION_FROM_MOTOR[motor_type] || ''
  const phiStr = String(phi || '').trim()
  if (!dir || !phiStr) return ''
  const parts = ['FD', dir, phiStr]
  if (height_code) parts.push(height_code)
  if (gear_ratio) parts.push(`g${gear_ratio}`)
  if (wire_config) parts.push(wire_config)
  if (frame_type) parts.push(frame_type)
  return parts.join('-')
}

function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ModelRegistry 행 → 임계값 6키 (누락 키는 OQ_THRESHOLD_DEFAULTS 로 fallback)
function modelThresholds(m) {
  return Object.fromEntries(
    Object.keys(OQ_THRESHOLD_DEFAULTS).map((k) => [k, m?.[k] ?? OQ_THRESHOLD_DEFAULTS[k]]),
  )
}

export default function ModelManagePage({ onBack }) {
  const confirm = useConfirm()
  // Provider reload 만 받아옴 — 비활성 모델도 보여야 하므로 목록은 자체 fetch (active_only=false).
  // Provider 의 models 는 active_only=true 라 비활성 행이 누락됨 (2026-05-08 fix).
  // CRUD 후엔 자체 reload + Provider reload 둘 다 호출하여 캐시 일관성 유지.
  const { reload: reloadProvider } = useModels()
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await getModels(false)   // 비활성 포함
      setModels(res?.models || [])
    } catch (e) {
      setLoadError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  // CRUD 후 Provider 캐시도 갱신 — 다른 페이지 (BoxManager 등) 가 최신 활성 목록 보도록
  const reloadAll = useCallback(async () => {
    await reload()
    await reloadProvider()
  }, [reload, reloadProvider])

  const [activeOnly, setActiveOnly] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)

  const [show, setShow] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [labelEdited, setLabelEdited] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), TOAST_MSG_MS)
    return () => clearTimeout(t)
  }, [msg])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), TOAST_ERROR_MS)
    return () => clearTimeout(t)
  }, [error])

  // autoLabel 갱신 — 사용자가 label 직접 수정하지 않았고 편집 모드 아닐 때만
  useEffect(() => {
    if (labelEdited || editingId) return
    setForm((f) => ({ ...f, label: autoLabel(f) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.phi, form.motor_type, form.rt_st_type, labelEdited, editingId])

  const visibleModels = activeOnly ? models.filter((m) => m.is_active) : models

  const openCreate = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setLabelEdited(false)
    setShow(true)
  }, [])

  const openEdit = useCallback((m) => {
    setEditingId(m.id)
    setForm({
      phi: m.phi,
      motor_type: m.motor_type,
      rt_st_type: m.rt_st_type || 'none',
      // 제품 코드 자리 (2026-05-01)
      height_code: m.height_code || '',
      gear_ratio: m.gear_ratio || '',
      wire_config: m.wire_config || '',
      frame_type: m.frame_type || '',
      color_hex: m.color_hex,
      color_hex_light: m.color_hex_light || '',
      label: m.label,
      display_order: m.display_order ?? 100,
      max_per_box: m.max_per_box ?? 1,
      pole_pairs: m.pole_pairs ?? 0,
      r_ref: m.r_ref ?? '',
      l_ref: m.l_ref ?? '',
      l_unit: m.l_unit || 'mH',
      kt_ref: m.kt_ref ?? '',
      // OQ 검사 임계값 — 누락 시 DEFAULTS 로 fallback (마이그레이션 미적용 모델 호환)
      ...modelThresholds(m),
      wire_type: m.wire_type || '',
      sheet_name: m.sheet_name || '',
    })
    setLabelEdited(true)
    setShow(true)
  }, [])

  const closeModal = () => {
    if (saving) return
    setShow(false)
  }

  const handleSave = async () => {
    if (!form.phi || !/^\d+$/.test(String(form.phi))) {
      return setError('phi 는 숫자로 입력해주세요.')
    }
    if (!form.color_hex || !/^#[0-9A-Fa-f]{6}$/.test(form.color_hex)) {
      return setError('대표 컬러는 #RRGGBB 형식이어야 합니다.')
    }
    if (form.color_hex_light && !/^#[0-9A-Fa-f]{6}$/.test(form.color_hex_light)) {
      return setError('보조 컬러는 #RRGGBB 형식이어야 합니다.')
    }
    if (Number(form.max_per_box) < 1) {
      return setError('박스당 수량은 1 이상이어야 합니다.')
    }

    setSaving(true)
    try {
      const payload = {
        color_hex: form.color_hex.toUpperCase(),
        color_hex_light: (form.color_hex_light || '').toUpperCase(),
        label: form.label || autoLabel(form),
        display_order: Number(form.display_order) || 100,
        rt_st_type: form.rt_st_type,
        // 제품 코드 자리 (2026-05-01)
        height_code: form.height_code || '',
        gear_ratio: form.gear_ratio || '',
        wire_config: form.wire_config || '',
        frame_type: form.frame_type || '',
        max_per_box: Number(form.max_per_box) || 1,
        pole_pairs: Number(form.pole_pairs) || 0,
        r_ref: numOrNull(form.r_ref),
        l_ref: numOrNull(form.l_ref),
        l_unit: form.l_unit || 'mH',
        kt_ref: numOrNull(form.kt_ref),
        // OQ 검사 임계값 (2026-06-02 재구조화: 상하한 대칭 4단계).
        // Number(...) 변환 후 음수 차단 (UI 도 min=0). 0 = 해당 방향/단계 비활성.
        r_low_warn_pct:   Math.max(0, Number(form.r_low_warn_pct)   || 0),
        r_low_fail_pct:   Math.max(0, Number(form.r_low_fail_pct)   || 0),
        r_high_warn_pct:  Math.max(0, Number(form.r_high_warn_pct)  || 0),
        r_high_fail_pct:  Math.max(0, Number(form.r_high_fail_pct)  || 0),
        l_low_warn_pct:   Math.max(0, Number(form.l_low_warn_pct)   || 0),
        l_low_fail_pct:   Math.max(0, Number(form.l_low_fail_pct)   || 0),
        l_high_warn_pct:  Math.max(0, Number(form.l_high_warn_pct)  || 0),
        l_high_fail_pct:  Math.max(0, Number(form.l_high_fail_pct)  || 0),
        kt_low_warn_pct:  Math.max(0, Number(form.kt_low_warn_pct)  || 0),
        kt_low_fail_pct:  Math.max(0, Number(form.kt_low_fail_pct)  || 0),
        kt_high_warn_pct: Math.max(0, Number(form.kt_high_warn_pct) || 0),
        kt_high_fail_pct: Math.max(0, Number(form.kt_high_fail_pct) || 0),
        km_low_warn_pct:  Math.max(0, Number(form.km_low_warn_pct)  || 0),
        km_low_fail_pct:  Math.max(0, Number(form.km_low_fail_pct)  || 0),
        km_high_warn_pct: Math.max(0, Number(form.km_high_warn_pct) || 0),
        km_high_fail_pct: Math.max(0, Number(form.km_high_fail_pct) || 0),
        wire_type: form.wire_type || '',
        sheet_name: form.sheet_name || '',
      }
      if (editingId) {
        // phi/motor_type 은 unique 키라 수정 불가
        await updateModel(editingId, payload)
        setMsg(`수정 완료: ${payload.label}`)
      } else {
        await createModel({
          phi: String(form.phi).trim(),
          motor_type: form.motor_type,
          ...payload,
        })
        setMsg(`등록 완료: ${payload.label}`)
      }
      setShow(false)
      await reloadAll()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (m) => {
    try {
      if (m.is_active) {
        // 비활성화 경고 강화 (2026-04-24 추가 보완) — FE 는 active_only=true 로 조회하므로
        // 비활성 후 기존 LOT 표시에서 max_per_box/pole_pairs 등이 fallback 값으로 잘못 보일 수 있음
        const warn =
          `${m.label} 을(를) 비활성화할까요?\n\n` +
          `• 기존 LOT 이력은 DB 에 그대로 보존됩니다\n` +
          `• 이 모델에 속한 LOT 의 색상/박스 수량/검사 기준은 일반 화면에서 fallback 값으로 표시될 수 있습니다\n` +
          `• 현재 생산 중인 모델이면 비활성화 대신 데이터만 수정하는 것을 권장합니다`
        if (!(await confirm({ title: '모델 비활성화', message: warn, confirmText: '비활성화' }))) return
        await deleteModel(m.id)
        setMsg(`비활성화: ${m.label}`)
      } else {
        await updateModel(m.id, { is_active: true })
        setMsg(`활성화: ${m.label}`)
      }
      await reloadAll()
    } catch (e) {
      setError(e.message)
    }
  }

  // 완전 삭제 — 실수로 추가한 미사용 모델 제거용. 송장 참조 중이면 BE 가 409 → 에러 토스트.
  const handleHardDelete = async (m) => {
    const warn =
      `${m.label} 을(를) 완전 삭제할까요?\n\n` +
      `• DB 에서 행이 영구 제거됩니다 (복구 불가)\n` +
      `• 실수로 추가한 모델 정리용입니다\n` +
      `• 송장에서 사용 중이면 삭제되지 않습니다 (대신 '비활성')`
    if (!(await confirm({ title: '모델 완전 삭제', message: warn, confirmText: '완전 삭제', danger: true }))) return
    try {
      await hardDeleteModel(m.id)
      setMsg(`완전 삭제: ${m.label}`)
      await reloadAll()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="제품 모델 관리"
        subtitle="team_rnd 전용 — 파이·내외전·RT/ST·컬러·박스 수량·OQ 기준치"
        onBack={onBack}
      />

      {msg && <p className={s.msgOk}>{msg}</p>}
      {error && <p className={s.msgErr}>⚠ {error}</p>}
      {loadError && <p className={s.msgErr}>⚠ 목록 로드 실패: {loadError}</p>}

      <div className={s.filterBar}>
        <label className={s.filterCheck}>
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          <span>활성만</span>
        </label>
        <span className={s.count}>총 {visibleModels.length}개</span>
        <button type="button" className="btn-primary btn-sm" onClick={openCreate}>
          + 새 모델
        </button>
      </div>

      {loading && <p className={s.emptyTxt}>불러오는 중...</p>}
      {!loading && visibleModels.length === 0 && (
        <p className={s.emptyTxt}>등록된 모델이 없습니다.</p>
      )}

      {/* 테이블 형식 — 데스크탑 가정 (2026-05-01)
          모바일 대응 제거 — 모델 관리는 데스크탑 작업이라 가로 스크롤 허용 */}
      <div style={{ overflowX: 'auto', padding: '0 4px' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', minWidth: 1200,
          fontSize: 13,
        }}>
          <colgroup>
            <col style={{ width: 32 }} />     {/* 색 */}
            <col style={{ width: 150 }} />    {/* 표시 이름 */}
            <col style={{ width: 60 }} />     {/* Φ */}
            <col style={{ width: 80 }} />     {/* 방향 */}
            <col style={{ width: 70 }} />     {/* RT/ST */}
            <col style={{ width: 240 }} />    {/* 제품 코드 */}
            <col style={{ width: 60 }} />     {/* 박스 */}
            <col style={{ width: 60 }} />     {/* 극쌍 */}
            <col style={{ width: 80 }} />     {/* Kt */}
            <col style={{ width: 80 }} />     {/* 시트 */}
            <col style={{ width: 60 }} />     {/* 정렬 */}
            <col style={{ width: 70 }} />     {/* 활성 */}
            <col style={{ width: 200 }} />    {/* 액션 */}
          </colgroup>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e8ee', textAlign: 'left' }}>
              {['', '표시 이름', 'Φ', '방향', 'RT/ST', '제품 코드',
                '박스', '극쌍', 'Kt', '시트', '정렬', '활성', '액션'].map((h, i) => (
                <th key={i} style={{ padding: '10px 8px', fontWeight: 700, fontSize: 12, color: '#3b4252', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleModels.map((m) => (
              <tr key={m.id}
                style={{
                  borderBottom: '1px solid #f0f2f6',
                  opacity: m.is_active ? 1 : 0.5,
                  background: m.is_active ? '' : '#fafafa',
                }}
              >
                <td style={{ padding: '8px' }}>
                  <span style={{
                    display: 'inline-block', width: 14, height: 14,
                    borderRadius: '50%', background: m.color_hex,
                    border: '1px solid rgba(0,0,0,0.06)',
                  }} title={m.color_hex} />
                </td>
                <td style={{ padding: '8px', fontWeight: 600 }}>{m.label}</td>
                <td style={{ padding: '8px' }}>Φ{m.phi}</td>
                <td style={{ padding: '8px' }}>{MOTOR_LABEL[m.motor_type] || m.motor_type}</td>
                <td style={{ padding: '8px' }}>
                  {m.rt_st_type && m.rt_st_type !== 'none'
                    ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', background: '#eef1f8', borderRadius: 4 }}>{m.rt_st_type.toUpperCase()}</span>
                    : <span style={{ color: '#9aa3b3' }}>—</span>}
                </td>
                <td style={{ padding: '8px', fontWeight: 600, color: m.product_code ? '#1f2937' : '#9aa3b3' }}>
                  {m.product_code || '—'}
                </td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{m.max_per_box ?? '—'}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{m.pole_pairs > 0 ? m.pole_pairs : <span style={{ color: '#9aa3b3' }}>—</span>}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{m.kt_ref != null ? m.kt_ref : <span style={{ color: '#9aa3b3' }}>—</span>}</td>
                <td style={{ padding: '8px' }}>{m.sheet_name || <span style={{ color: '#9aa3b3' }}>—</span>}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#5f6b7a' }}>{m.display_order}</td>
                <td style={{ padding: '8px' }}>
                  {m.is_active
                    ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', background: '#dcfce7', color: '#166534', borderRadius: 4 }}>활성</span>
                    : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', background: '#f3f4f6', color: '#6b7280', borderRadius: 4 }}>비활성</span>}
                </td>
                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => openEdit(m)}>편집</button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => handleToggleActive(m)}
                    style={{ marginLeft: 4, color: m.is_active ? '#b91c1c' : '#16a34a' }}
                  >
                    {m.is_active ? '비활성' : '활성화'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => handleHardDelete(m)}
                    style={{ marginLeft: 4, color: '#dc2626' }}
                    title="DB 에서 완전 삭제 (송장 미사용 모델만)"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 생성/편집 모달 */}
      {show && (
        <div className={s.overlay} onClick={closeModal}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h2>{editingId ? '모델 수정' : '새 모델 등록'}</h2>
              <button type="button" className={s.closeBtn} onClick={closeModal} disabled={saving}>✕</button>
            </div>

            <div className={s.formBody}>
              {/* ═══ 섹션 1: 기본 ═══ */}
              <h3 className={s.sectionTitle}>기본</h3>

              <div className={s.field}>
                <label className={s.label}>Φ (파이) *</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className={s.input}
                  value={form.phi}
                  onChange={(e) => setForm({ ...form, phi: e.target.value.replace(/[^\d]/g, '') })}
                  placeholder="예: 70"
                  disabled={saving}
                />
                {/* 2026-05-01 — 수정 잠금 해제. unique 충돌 시 BE 가 400 으로 거부 */}
              </div>

              <div className={s.field}>
                <label className={s.label}>내전 / 외전 *</label>
                <div className={s.toggleRow}>
                  {MOTOR_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`${s.toggleBtn} ${form.motor_type === o.value ? s.toggleBtnOn : ''}`}
                      onClick={() => setForm({ ...form, motor_type: o.value })}
                      disabled={saving}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={s.field}>
                <label className={s.label}>RT/ST 구분</label>
                <div className={s.toggleRow}>
                  {RT_ST_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`${s.toggleBtn} ${form.rt_st_type === o.value ? s.toggleBtnOn : ''}`}
                      onClick={() => setForm({ ...form, rt_st_type: o.value })}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <small className={s.hint}>모델 식별 일부 — 같은 phi/motor 조합이라도 rt_st_type 다르면 별개 모델</small>
              </div>

              <div className={s.field}>
                <label className={s.label}>대표 컬러 *</label>
                <div className={s.colorRow}>
                  <input
                    type="color"
                    className={s.colorInput}
                    value={form.color_hex}
                    onChange={(e) => setForm({ ...form, color_hex: e.target.value.toUpperCase() })}
                    disabled={saving}
                  />
                  <input
                    type="text"
                    className={s.input}
                    value={form.color_hex}
                    onChange={(e) => setForm({ ...form, color_hex: e.target.value.toUpperCase() })}
                    placeholder="#RRGGBB"
                    maxLength={7}
                    disabled={saving}
                  />
                  <span className={s.colorPreview} style={{ background: form.color_hex }} />
                </div>
              </div>

              <div className={s.field}>
                <label className={s.label}>보조 컬러 (엑셀 배경용)</label>
                <div className={s.colorRow}>
                  <input
                    type="color"
                    className={s.colorInput}
                    value={form.color_hex_light || '#FFFFFF'}
                    onChange={(e) => setForm({ ...form, color_hex_light: e.target.value.toUpperCase() })}
                    disabled={saving}
                  />
                  <input
                    type="text"
                    className={s.input}
                    value={form.color_hex_light}
                    onChange={(e) => setForm({ ...form, color_hex_light: e.target.value.toUpperCase() })}
                    placeholder="#RRGGBB (선택)"
                    maxLength={7}
                    disabled={saving}
                  />
                  {form.color_hex_light && (
                    <span className={s.colorPreview} style={{ background: form.color_hex_light }} />
                  )}
                </div>
                <small className={s.hint}>엑셀 출력 시 행 배경색 — 비우면 사용 안 함</small>
              </div>

              <div className={s.field}>
                <label className={s.label}>표시 이름</label>
                <input
                  type="text"
                  className={s.input}
                  value={form.label}
                  onChange={(e) => {
                    setLabelEdited(true)
                    setForm({ ...form, label: e.target.value })
                  }}
                  placeholder={autoLabel(form) || 'Φ70 내전'}
                  disabled={saving}
                />
                <small className={s.hint}>비우면 자동 생성: {autoLabel(form) || '—'}</small>
              </div>

              <div className={s.field}>
                <label className={s.label}>정렬 순서</label>
                <input
                  type="number"
                  className={s.input}
                  value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: e.target.value })}
                  disabled={saving}
                />
                <small className={s.hint}>낮을수록 앞쪽에 표시됩니다.</small>
              </div>

              {/* ═══ 섹션 2: 제품 코드 (2026-05-01) ═══ */}
              <h3 className={s.sectionTitle}>제품 코드</h3>
              <p className={s.hint} style={{ margin: '-4px 0 8px' }}>
                형식: <code>FD-{'{RO|RI|AX}'}-{'{외경}'}-{'{높이}'}-g{'{기어비}'}-{'{A|B}'}-{'{F|FL}'}</code>
                <br/>비어있는 자리는 자동으로 제외됩니다.
              </p>

              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.label}>높이 코드</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={s.input}
                    value={form.height_code}
                    onChange={(e) =>
                      setForm({ ...form, height_code: e.target.value.replace(/[^\d]/g, '') })
                    }
                    placeholder="예: 07"
                    maxLength={3}
                    disabled={saving}
                  />
                  <small className={s.hint}>2자리 숫자 권장 (자동 zero-pad)</small>
                </div>
                <div className={s.field}>
                  <label className={s.label}>기어비 (g 제외)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={s.input}
                    value={form.gear_ratio}
                    onChange={(e) =>
                      setForm({ ...form, gear_ratio: e.target.value.replace(/[^\d]/g, '') })
                    }
                    placeholder="예: 30 (코드: g30)"
                    maxLength={4}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className={s.field}>
                <label className={s.label}>권선 (직렬 / 병렬)</label>
                <div className={s.toggleRow}>
                  {WIRE_CONFIG_OPTIONS.map((o) => (
                    <button
                      key={o.value || 'empty'}
                      type="button"
                      className={`${s.toggleBtn} ${form.wire_config === o.value ? s.toggleBtnOn : ''}`}
                      onClick={() => setForm({ ...form, wire_config: o.value })}
                      disabled={saving}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={s.field}>
                <label className={s.label}>프레임 / 프레임리스</label>
                <div className={s.toggleRow}>
                  {FRAME_TYPE_OPTIONS.map((o) => (
                    <button
                      key={o.value || 'empty'}
                      type="button"
                      className={`${s.toggleBtn} ${form.frame_type === o.value ? s.toggleBtnOn : ''}`}
                      onClick={() => setForm({ ...form, frame_type: o.value })}
                      disabled={saving}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 자동 미리보기 — 폰트는 입력 필드/라벨과 통일 (monospace 제거, 2026-05-01) */}
              <div className={s.field}>
                <label className={s.label}>미리보기</label>
                <div style={{
                  padding: '10px 12px',
                  background: 'var(--color-list-divider, #f0f2f6)',
                  borderRadius: 8,
                  fontSize: 14, fontWeight: 700,
                  color: buildProductCode(form) ? 'var(--color-primary, #3182f6)' : 'var(--color-text-sub, #9aa3b3)',
                }}>
                  {buildProductCode(form) || '— (외경/방향 입력 필요)'}
                </div>
              </div>

              {/* ═══ 섹션 3: 박스 ═══ */}
              <h3 className={s.sectionTitle}>박스</h3>

              <div className={s.field}>
                <label className={s.label}>박스당 수량 *</label>
                <input
                  type="number"
                  min="1"
                  className={s.input}
                  value={form.max_per_box}
                  onChange={(e) => setForm({ ...form, max_per_box: e.target.value })}
                  disabled={saving}
                />
                <small className={s.hint}>UB 박스 하나에 담는 제품 수 (기존 PHI_SPECS.max)</small>
              </div>

              {/* ═══ 섹션 3: OQ 검사 ═══ */}
              <h3 className={s.sectionTitle}>OQ 검사 기준치</h3>

              <div className={s.field}>
                <label className={s.label}>극쌍수 (pole_pairs)</label>
                <input
                  type="number"
                  min="0"
                  className={s.input}
                  value={form.pole_pairs}
                  onChange={(e) => setForm({ ...form, pole_pairs: e.target.value })}
                  disabled={saving}
                />
                <small className={s.hint}>0 = 기준 없음 (검사 항상 통과)</small>
              </div>

              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.label}>저항 R (Ω)</label>
                  <input
                    type="number"
                    step="any"
                    className={s.input}
                    value={form.r_ref}
                    onChange={(e) => setForm({ ...form, r_ref: e.target.value })}
                    placeholder="기준 없음"
                    disabled={saving}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>인덕턴스 L</label>
                  <input
                    type="number"
                    step="any"
                    className={s.input}
                    value={form.l_ref}
                    onChange={(e) => setForm({ ...form, l_ref: e.target.value })}
                    placeholder="기준 없음"
                    disabled={saving}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>L 단위</label>
                  <select
                    className={s.input}
                    value={form.l_unit}
                    onChange={(e) => setForm({ ...form, l_unit: e.target.value })}
                    disabled={saving}
                  >
                    {L_UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={s.field}>
                <label className={s.label}>토크상수 Kt (역기전력)</label>
                <input
                  type="number"
                  step="any"
                  className={s.input}
                  value={form.kt_ref}
                  onChange={(e) => setForm({ ...form, kt_ref: e.target.value })}
                  placeholder="기준 없음"
                  disabled={saving}
                />
                <small className={s.hint}>판정 임계값은 아래 "검사 통과 임계값" 에서 조절 (기본 5% 경고 / 10% FAIL)</small>
              </div>

              {/* ═══ 섹션 4: 검사 통과 임계값 (2026-06-02 재구조화: 상하한 대칭 4단계) ═══
                  각 항목(R/L/Kt) 마다 4 컬럼: 하한 경고 / 하한 FAIL / 상한 경고 / 상한 FAIL.
                  warn=0 이면 해당 방향 경고 비활성, fail=0 이면 해당 방향 FAIL 비활성. */}
              <h3 className={s.sectionTitle}>검사 통과 임계값 (% 이탈)</h3>
              <p className={s.hint} style={{ margin: '-4px 0 8px' }}>
                기준치 대비 <strong>−N% 미달</strong> 또는 <strong>+N% 초과</strong> 시 경고/FAIL.
                {' '}각 방향(하한/상한) 마다 <strong>경고 → FAIL</strong> 두 단계. <strong>0</strong> 이면 해당 칸 비활성.
                {' '}경고 % 는 FAIL % 보다 작아야 의미 있음.
              </p>

              {/* R 저항 — 하한 경고/FAIL + 상한 경고/FAIL */}
              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.label}>R · 하한 경고 (%)</label>
                  <input
                    type="number" min="0" step="any"
                    className={s.input}
                    value={form.r_low_warn_pct}
                    onChange={(e) => setForm({ ...form, r_low_warn_pct: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>R · 하한 FAIL (%)</label>
                  <input
                    type="number" min="0" step="any"
                    className={s.input}
                    value={form.r_low_fail_pct}
                    onChange={(e) => setForm({ ...form, r_low_fail_pct: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>R · 상한 경고 (%)</label>
                  <input
                    type="number" min="0" step="any"
                    className={s.input}
                    value={form.r_high_warn_pct}
                    onChange={(e) => setForm({ ...form, r_high_warn_pct: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>R · 상한 FAIL (%)</label>
                  <input
                    type="number" min="0" step="any"
                    className={s.input}
                    value={form.r_high_fail_pct}
                    onChange={(e) => setForm({ ...form, r_high_fail_pct: e.target.value })}
                    disabled={saving}
                  />
                </div>
              </div>

              {/* L 인덕턴스 */}
              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.label}>L · 하한 경고 (%)</label>
                  <input
                    type="number" min="0" step="any"
                    className={s.input}
                    value={form.l_low_warn_pct}
                    onChange={(e) => setForm({ ...form, l_low_warn_pct: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>L · 하한 FAIL (%)</label>
                  <input
                    type="number" min="0" step="any"
                    className={s.input}
                    value={form.l_low_fail_pct}
                    onChange={(e) => setForm({ ...form, l_low_fail_pct: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>L · 상한 경고 (%)</label>
                  <input
                    type="number" min="0" step="any"
                    className={s.input}
                    value={form.l_high_warn_pct}
                    onChange={(e) => setForm({ ...form, l_high_warn_pct: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>L · 상한 FAIL (%)</label>
                  <input
                    type="number" min="0" step="any"
                    className={s.input}
                    value={form.l_high_fail_pct}
                    onChange={(e) => setForm({ ...form, l_high_fail_pct: e.target.value })}
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Kt 토크상수 (역기전력) */}
              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.label}>Kt · 하한 경고 (%)</label>
                  <input
                    type="number" min="0" step="any"
                    className={s.input}
                    value={form.kt_low_warn_pct}
                    onChange={(e) => setForm({ ...form, kt_low_warn_pct: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Kt · 하한 FAIL (%)</label>
                  <input
                    type="number" min="0" step="any"
                    className={s.input}
                    value={form.kt_low_fail_pct}
                    onChange={(e) => setForm({ ...form, kt_low_fail_pct: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Kt · 상한 경고 (%)</label>
                  <input
                    type="number" min="0" step="any"
                    className={s.input}
                    value={form.kt_high_warn_pct}
                    onChange={(e) => setForm({ ...form, kt_high_warn_pct: e.target.value })}
                    disabled={saving}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Kt · 상한 FAIL (%)</label>
                  <input
                    type="number" min="0" step="any"
                    className={s.input}
                    value={form.kt_high_fail_pct}
                    onChange={(e) => setForm({ ...form, kt_high_fail_pct: e.target.value })}
                    disabled={saving}
                  />
                </div>
              </div>

              {/* K_M 토크상수 (= K_T/√(1.5·R/2)) — 기준은 K_T·R 로 역산, 공차만 모델별 설정 (2026-06-22) */}
              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.label}>K_M · 하한 경고 (%)</label>
                  <input type="number" min="0" step="any" className={s.input}
                    value={form.km_low_warn_pct}
                    onChange={(e) => setForm({ ...form, km_low_warn_pct: e.target.value })}
                    disabled={saving} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>K_M · 하한 FAIL (%)</label>
                  <input type="number" min="0" step="any" className={s.input}
                    value={form.km_low_fail_pct}
                    onChange={(e) => setForm({ ...form, km_low_fail_pct: e.target.value })}
                    disabled={saving} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>K_M · 상한 경고 (%)</label>
                  <input type="number" min="0" step="any" className={s.input}
                    value={form.km_high_warn_pct}
                    onChange={(e) => setForm({ ...form, km_high_warn_pct: e.target.value })}
                    disabled={saving} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>K_M · 상한 FAIL (%)</label>
                  <input type="number" min="0" step="any" className={s.input}
                    value={form.km_high_fail_pct}
                    onChange={(e) => setForm({ ...form, km_high_fail_pct: e.target.value })}
                    disabled={saving} />
                </div>
              </div>

              {/* ═══ 섹션 5: OQ 엑셀 ═══ */}
              <h3 className={s.sectionTitle}>OQ 엑셀 출력</h3>

              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.label}>Wire Type</label>
                  <select
                    className={s.input}
                    value={form.wire_type}
                    onChange={(e) => setForm({ ...form, wire_type: e.target.value })}
                    disabled={saving}
                  >
                    {WIRE_OPTIONS.map((w) => (
                      <option key={w || 'empty'} value={w}>{w || '—'}</option>
                    ))}
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>엑셀 시트명</label>
                  <input
                    type="text"
                    className={s.input}
                    value={form.sheet_name}
                    onChange={(e) => setForm({ ...form, sheet_name: e.target.value })}
                    placeholder="예: Large / Medium / Small / Mini"
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            <div className={s.modalFooter}>
              <button type="button" className="btn-secondary btn-md" onClick={closeModal} disabled={saving}>
                취소
              </button>
              <button type="button" className="btn-primary btn-md" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : editingId ? '수정' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
