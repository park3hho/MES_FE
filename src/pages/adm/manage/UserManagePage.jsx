// src/pages/adm/manage/UserManagePage.jsx
// 계정(Machine) CRUD 관리자 페이지 (Phase A+, 2026-04-23)
// team_rnd 전용 — /admin/users
//
// 기능:
//   - 계정 목록 (role/active 필터)
//   - 생성 (login_id/password/role/location)
//   - 수정 (role/password/location/active 토글)
//   - 비활성화 (soft delete — 이력 FK 보존)
//
// Toss flat 원칙 준수: .page-flat / PageHeader / .list-item / 모달

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  listUsers, createUser, updateUser, deleteUser,
  listFactoryLocations,
} from '@/api'
import { Role } from '@/constants/permissions'
import s from './UserManagePage.module.css'

const ROLE_OPTIONS = [
  { value: Role.TEAM_WIRE,     label: 'team_wire (와이어)' },
  { value: Role.TEAM_WINDING,  label: 'team_winding (권선)' },
  { value: Role.TEAM_QC,       label: 'team_qc (품질)' },
  { value: Role.TEAM_RND,      label: 'team_rnd (R&D · 전권)' },
  { value: Role.GENERAL_ADMIN, label: 'general_admin (라인 관리)' },
]

const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]))

const EMPTY_FORM = {
  login_id: '',
  password: '',
  location_id: '',
  role: Role.GENERAL_ADMIN,
}

export default function UserManagePage({ onBack }) {
  const [users, setUsers] = useState([])
  const [locations, setLocations] = useState([])
  const [roleFilter, setRoleFilter] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)

  const [show, setShow] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, locs] = await Promise.all([
        listUsers({ role: roleFilter || undefined, activeOnly }),
        listFactoryLocations(),
      ])
      setUsers(list)
      setLocations(locs)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [roleFilter, activeOnly])

  useEffect(() => { fetchAll() }, [fetchAll])

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

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, location_id: locations[0]?.id ?? '' })
    setShow(true)
  }

  const openEdit = (u) => {
    setEditingId(u.id)
    setForm({
      login_id: u.login_id,
      password: '',  // 수정 모드: 빈값 = 비밀번호 유지
      location_id: u.location_id,
      role: u.role,
    })
    setShow(true)
  }

  const closeModal = () => {
    if (saving) return
    setShow(false)
  }

  const handleSave = async () => {
    if (!editingId && !form.login_id.trim()) return setError('로그인 ID를 입력해주세요.')
    if (!editingId && form.password.length < 4) return setError('비밀번호는 4자 이상이어야 합니다.')
    if (!form.location_id) return setError('공장을 선택해주세요.')
    if (!form.role) return setError('role을 선택해주세요.')

    setSaving(true)
    try {
      if (editingId) {
        const patch = {
          location_id: Number(form.location_id),
          role: form.role,
        }
        if (form.password) patch.password = form.password  // 비우면 변경 안 함
        await updateUser(editingId, patch)
        setMsg(`수정 완료: ${form.login_id}`)
      } else {
        await createUser({
          login_id: form.login_id.trim(),
          password: form.password,
          location_id: Number(form.location_id),
          role: form.role,
        })
        setMsg(`생성 완료: ${form.login_id}`)
      }
      setShow(false)
      await fetchAll()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (u) => {
    try {
      if (u.active) {
        // 비활성화 = soft delete (DELETE 엔드포인트)
        if (!window.confirm(`${u.login_id} 을(를) 비활성화할까요?\n\n로그인만 차단되고 과거 이력은 보존됩니다.`)) return
        await deleteUser(u.id)
        setMsg(`비활성화: ${u.login_id}`)
      } else {
        // 복원 = PATCH active=true
        await updateUser(u.id, { active: true })
        setMsg(`활성화: ${u.login_id}`)
      }
      await fetchAll()
    } catch (e) {
      setError(e.message)
    }
  }

  const locLabel = (id) => {
    const l = locations.find((x) => x.id === id)
    return l ? (l.factory_specific_address || l.factory_address) : `공장 ${id}`
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="계정 관리"
        subtitle="team_rnd 전용 — 아이디 생성·role 변경·비활성화"
        onBack={onBack}
      />

      {msg && <p className={s.msgOk}>{msg}</p>}
      {error && <p className={s.msgErr}>⚠ {error}</p>}

      <div className={s.filterBar}>
        <select
          className={s.filterSelect}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">전체 role</option>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <label className={s.filterCheck}>
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          <span>활성 계정만</span>
        </label>
        <span className={s.count}>총 {users.length}명</span>
        <button type="button" className="btn-primary btn-sm" onClick={openCreate}>
          + 새 계정
        </button>
      </div>

      {loading && <p className={s.emptyTxt}>불러오는 중...</p>}
      {!loading && users.length === 0 && (
        <p className={s.emptyTxt}>조건에 맞는 계정이 없습니다.</p>
      )}

      <ul className={s.list}>
        {users.map((u) => (
          <li key={u.id} className={`list-item ${s.row} ${!u.active ? s.rowInactive : ''}`}>
            <div className={s.rowMain}>
              <div className={s.rowTop}>
                <strong className={s.loginId}>{u.login_id}</strong>
                <span className={s.roleTag}>{ROLE_LABEL[u.role] || u.role}</span>
                {!u.active && <span className={s.badgeOff}>비활성</span>}
              </div>
              <div className={s.rowSub}>
                <span>🏭 {locLabel(u.location_id)}</span>
                {u.default_printer_id && <span>🖨️ printer #{u.default_printer_id}</span>}
              </div>
            </div>
            <div className={s.rowActions}>
              <button type="button" className={s.actBtn} onClick={() => openEdit(u)}>
                편집
              </button>
              <button
                type="button"
                className={`${s.actBtn} ${!u.active ? s.actBtnRestore : s.actBtnDanger}`}
                onClick={() => handleToggleActive(u)}
              >
                {u.active ? '비활성' : '활성'}
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
              <h2>{editingId ? '계정 수정' : '새 계정 생성'}</h2>
              <button type="button" className={s.closeBtn} onClick={closeModal} disabled={saving}>✕</button>
            </div>

            <div className={s.formBody}>
              <div className={s.field}>
                <label className={s.label}>로그인 ID *</label>
                <input
                  type="text"
                  className={s.input}
                  value={form.login_id}
                  onChange={(e) => setForm({ ...form, login_id: e.target.value })}
                  placeholder="예: qc_kim"
                  disabled={saving || Boolean(editingId)}
                />
                {editingId && (
                  <small className={s.hint}>로그인 ID는 생성 후 변경할 수 없습니다.</small>
                )}
              </div>

              <div className={s.field}>
                <label className={s.label}>
                  {editingId ? '비밀번호 (변경 시에만 입력)' : '비밀번호 *'}
                </label>
                <input
                  type="password"
                  className={s.input}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editingId ? '비워두면 유지' : '최소 4자'}
                  disabled={saving}
                />
              </div>

              <div className={s.field}>
                <label className={s.label}>공장 *</label>
                <select
                  className={s.input}
                  value={form.location_id}
                  onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">공장을 선택</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.factory_specific_address || l.factory_address} (id={l.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className={s.field}>
                <label className={s.label}>Role *</label>
                <select
                  className={s.input}
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  disabled={saving}
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={s.modalFooter}>
              <button type="button" className="btn-secondary btn-md" onClick={closeModal} disabled={saving}>
                취소
              </button>
              <button type="button" className="btn-primary btn-md" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : (editingId ? '수정' : '생성')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
