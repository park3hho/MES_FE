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
import { createModel, updateModel, deleteModel } from '@/api'
import { useModels } from '@/hooks/useModels'
import s from './ModelManagePage.module.css'

const MOTOR_OPTIONS = [
  { value: 'inner', label: '내전' },
  { value: 'outer', label: '외전' },
]

const RT_ST_OPTIONS = [
  { value: 'none', label: '없음' },
  { value: 'rt',   label: 'RT' },
  { value: 'st',   label: 'ST' },
  { value: 'both', label: 'RT/ST' },
]

const RT_ST_SUFFIX = { none: '', rt: ' RT', st: ' ST', both: ' RT/ST' }

const L_UNIT_OPTIONS = ['mH', 'µH']
const WIRE_OPTIONS = ['', 'copper', 'silver']

const EMPTY_FORM = {
  // 기본
  phi: '',
  motor_type: 'inner',
  rt_st_type: 'none',
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
  // 엑셀
  wire_type: '',
  sheet_name: '',
}

function autoLabel({ phi, motor_type, rt_st_type }) {
  if (!phi) return ''
  const dir = motor_type === 'inner' ? '내전' : '외전'
  const suffix = RT_ST_SUFFIX[rt_st_type || 'none'] || ''
  return `Φ${phi} ${dir}${suffix}`
}

function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export default function ModelManagePage({ onBack }) {
  const { models, loading, error: loadError, reload } = useModels()

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
    const t = setTimeout(() => setMsg(null), 2500)
    return () => clearTimeout(t)
  }, [msg])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 3500)
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
        max_per_box: Number(form.max_per_box) || 1,
        pole_pairs: Number(form.pole_pairs) || 0,
        r_ref: numOrNull(form.r_ref),
        l_ref: numOrNull(form.l_ref),
        l_unit: form.l_unit || 'mH',
        kt_ref: numOrNull(form.kt_ref),
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
      await reload()
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
        if (!window.confirm(warn)) return
        await deleteModel(m.id)
        setMsg(`비활성화: ${m.label}`)
      } else {
        await updateModel(m.id, { is_active: true })
        setMsg(`활성화: ${m.label}`)
      }
      await reload()
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

      <ul className={s.list}>
        {visibleModels.map((m) => (
          <li key={m.id} className={`list-item ${s.row} ${!m.is_active ? s.rowInactive : ''}`}>
            <span
              className={s.colorChip}
              style={{ background: m.color_hex }}
              title={m.color_hex}
            />
            <div className={s.rowMain}>
              <div className={s.rowTop}>
                <strong className={s.modelLabel}>{m.label}</strong>
                <span className={s.tag}>Φ{m.phi}</span>
                <span className={s.tag}>{m.motor_type === 'inner' ? '내전' : '외전'}</span>
                {m.rt_st_type && m.rt_st_type !== 'none' && (
                  <span className={s.tagRt}>{m.rt_st_type.toUpperCase()}</span>
                )}
                {!m.is_active && <span className={s.badgeOff}>비활성</span>}
              </div>
              <div className={s.rowSub}>
                <span>박스: {m.max_per_box ?? '-'}개</span>
                {m.pole_pairs > 0 && <span>극쌍: {m.pole_pairs}</span>}
                {m.kt_ref != null && <span>Kt: {m.kt_ref}</span>}
                {m.sheet_name && <span>시트: {m.sheet_name}</span>}
                <span>정렬: {m.display_order}</span>
              </div>
            </div>
            <div className={s.rowActions}>
              <button type="button" className={s.actBtn} onClick={() => openEdit(m)}>
                편집
              </button>
              <button
                type="button"
                className={`${s.actBtn} ${!m.is_active ? s.actBtnRestore : s.actBtnDanger}`}
                onClick={() => handleToggleActive(m)}
              >
                {m.is_active ? '비활성' : '활성'}
              </button>
            </div>
          </li>
        ))}
      </ul>

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
                  disabled={saving || Boolean(editingId)}
                />
                {editingId && (
                  <small className={s.hint}>phi / motor_type 은 등록 후 변경 불가 — 신규 모델로 등록하세요.</small>
                )}
              </div>

              <div className={s.field}>
                <label className={s.label}>내전 / 외전 *</label>
                <div className={s.toggleRow}>
                  {MOTOR_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`${s.toggleBtn} ${form.motor_type === o.value ? s.toggleBtnOn : ''}`}
                      onClick={() => !editingId && setForm({ ...form, motor_type: o.value })}
                      disabled={Boolean(editingId)}
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

              {/* ═══ 섹션 2: 박스 ═══ */}
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
                <label className={s.label}>토크상수 Kt</label>
                <input
                  type="number"
                  step="any"
                  className={s.input}
                  value={form.kt_ref}
                  onChange={(e) => setForm({ ...form, kt_ref: e.target.value })}
                  placeholder="기준 없음"
                  disabled={saving}
                />
                <small className={s.hint}>기준 대비 -5% 미달 시 FAIL 판정</small>
              </div>

              {/* ═══ 섹션 4: OQ 엑셀 ═══ */}
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
