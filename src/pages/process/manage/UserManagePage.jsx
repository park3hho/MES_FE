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
  listUsers, createUser, updateUser, deleteUser, getUserDetail,
  listFactoryLocations, getRoles,
} from '@/api'
import { Role } from '@/constants/permissions'
import { TOAST_MSG_MS, TOAST_ERROR_MS } from '@/constants/etcConst'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import s from './UserManagePage.module.css'

// 역할 옵션은 동적 — getRoles 로 받음 (2026-06-18). 표시: "라벨 (key)".
const roleOptText = (r) => `${r.label} (${r.key})`

// ── 아이콘 (얇은 라인) ──
const IconPencil = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)
const IconFactory = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 20h20" /><path d="M4 20V9l5 3V9l5 3V9l5 3v8" />
  </svg>
)
const IconPrinter = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" rx="1" />
  </svg>
)
const IconToggleOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="12" r="3" /><rect x="1" y="6" width="22" height="12" rx="6" />
  </svg>
)
const IconToggleOn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="16" cy="12" r="3" fill="currentColor" /><rect x="1" y="6" width="22" height="12" rx="6" />
  </svg>
)

// 아바타 이니셜 — 이름(있으면) 첫 글자, 없으면 login_id 앞 2글자
const initials = (name, loginId) => {
  const n = (name || '').trim()
  if (n) return n.slice(0, 1)
  return (loginId || '?').slice(0, 2)
}

// role 별 은은한 아바타/배지 색 (전권만 강조, 나머지 중립) — 클래스 접미사 반환
const roleTone = (role) => {
  if (role === 'team_rnd') return 'rnd'   // 전권 강조
  return 'neutral'
}

const EMPTY_FORM = {
  login_id: '',
  display_name: '',
  email: '',
  password: '',
  location_id: '',
  role: Role.GENERAL_ADMIN,   // 안전 기본값 (역할 로드 후에도 유지)
}

export default function UserManagePage({ onBack }) {
  const confirm = useConfirm()
  const [users, setUsers] = useState([])
  const [locations, setLocations] = useState([])
  const [roleOptions, setRoleOptions] = useState([])   // [{key, label, ...}] (동적 역할)
  const [roleFilter, setRoleFilter] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)

  const [show, setShow] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // 계정 클릭 시 온디맨드 상세(권한 연동값) — 목록엔 안 싣고 펼칠 때만 조회 (2026-07-16)
  const [detailId, setDetailId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, locs, rolesRes] = await Promise.all([
        listUsers({ role: roleFilter || undefined, activeOnly }),
        listFactoryLocations(),
        getRoles(),
      ])
      setUsers(list)
      setLocations(locs)
      setRoleOptions(rolesRes.roles || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [roleFilter, activeOnly])

  useEffect(() => { fetchAll() }, [fetchAll])

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

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, location_id: locations[0]?.id ?? '' })
    setShow(true)
  }

  const openEdit = (u) => {
    setEditingId(u.id)
    setForm({
      login_id: u.login_id,
      display_name: u.display_name || '',
      email: u.email || '',
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
          display_name: form.display_name.trim(),
          email: form.email.trim(),
        }
        if (form.password) patch.password = form.password  // 비우면 변경 안 함
        await updateUser(editingId, patch)
        setMsg(`수정 완료: ${form.login_id}`)
      } else {
        await createUser({
          login_id: form.login_id.trim(),
          display_name: form.display_name.trim(),
          email: form.email.trim(),
          password: form.password,
          location_id: Number(form.location_id),
          role: form.role,
        })
        setMsg(`생성 완료: ${form.login_id}`)
      }
      setShow(false)
      if (detailId === editingId) setDetailId(null)   // 수정한 계정 상세는 stale — 닫기
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
        if (!(await confirm({
          title: '계정 비활성화',
          message: `${u.login_id} 계정을 비활성화할까요?\n로그인만 차단되고 과거 이력은 보존됩니다.`,
          confirmText: '비활성화',
        }))) return
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

  // 계정 행 클릭 → 상세(권한 연동값) 온디맨드 로드 · 다시 클릭하면 접기
  const toggleDetail = async (u) => {
    if (detailId === u.id) { setDetailId(null); return }
    setDetailId(u.id)
    setDetail(null)
    setDetailLoading(true)
    try {
      setDetail(await getUserDetail(u.id))
    } catch (e) {
      setError(e.message)
      setDetailId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const locLabel = (id) => {
    const l = locations.find((x) => x.id === id)
    return l ? (l.factory_specific_address || l.factory_address) : `공장 ${id}`
  }

  const roleLabelMap = Object.fromEntries(roleOptions.map((r) => [r.key, r.label]))

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
          {roleOptions.map((r) => (
            <option key={r.key} value={r.key}>{roleOptText(r)}</option>
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
        {/* 비활성 계정은 항상 맨 아래로 (활성 우선 정렬) */}
        {[...users].sort((a, b) => Number(b.active) - Number(a.active)).map((u) => (
          <li key={u.id} className={`${s.rowWrap} ${!u.active ? s.rowInactive : ''}`}>
            <div
              className={s.row}
              role="button"
              tabIndex={0}
              onClick={() => toggleDetail(u)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDetail(u) } }}
            >
              <span className={`${s.avatar} ${s['av_' + roleTone(u.role)]}`}>
                {initials(u.display_name, u.login_id)}
              </span>

              <div className={s.rowMain}>
                <div className={s.idLine}>
                  <span className={s.loginId}>{u.display_name || u.login_id}</span>
                  {u.display_name && <span className={s.subId}>{u.login_id}</span>}
                  <span className={`${s.chevron} ${detailId === u.id ? s.chevronOpen : ''}`}>▾</span>
                </div>
                <p className={s.subLine}>
                  <span className={`${s.statusDot} ${u.active ? s.dotOn : s.dotOff}`} />
                  {u.active ? '활성' : '비활성'}
                  <span className={s.sep}>·</span>
                  <IconFactory />
                  {locLabel(u.location_id)}
                  {u.default_printer_id && (
                    <>
                      <span className={s.sep}>·</span>
                      <IconPrinter />
                      #{u.default_printer_id}
                    </>
                  )}
                </p>
              </div>

              <span className={`${s.roleBadge} ${s['rb_' + roleTone(u.role)]}`}>
                {roleLabelMap[u.role] || u.role}
              </span>

              <div className={s.rowActions}>
                <button
                  type="button"
                  className={s.iconBtn}
                  title="편집"
                  onClick={(e) => { e.stopPropagation(); openEdit(u) }}
                >
                  <IconPencil />
                </button>
                <button
                  type="button"
                  className={`${s.iconBtn} ${u.active ? s.iconBtnDanger : s.iconBtnRestore}`}
                  title={u.active ? '비활성화' : '활성화'}
                  onClick={(e) => { e.stopPropagation(); handleToggleActive(u) }}
                >
                  {u.active ? <IconToggleOn /> : <IconToggleOff />}
                </button>
              </div>
            </div>

            {/* 온디맨드 상세 — 권한 연동값 (클릭 시만 조회) */}
            {detailId === u.id && (
              <div className={s.detailPanel}>
                {detailLoading && <span className={s.detailMuted}>불러오는 중…</span>}
                {!detailLoading && detail && (
                  <div className={s.detailGrid}>
                    <div className={s.detailItem}>
                      <span className={s.detailKey}>이메일</span>
                      <span>{detail.email || '—'}</span>
                    </div>
                    <div className={s.detailItem}>
                      <span className={s.detailKey}>담당 프린터</span>
                      <span>{detail.printer_name || '미지정'}</span>
                    </div>
                    <div className={s.detailItem}>
                      <span className={s.detailKey}>권한</span>
                      {detail.role === 'team_rnd'
                        ? <span className={s.permRnd}>전권 — 모든 기능</span>
                        : <span>실효 {detail.effective_features.length}개 (role 기본 {detail.role_features.length}개)</span>}
                    </div>
                    {detail.overrides.length > 0 && (
                      <div className={s.detailItem}>
                        <span className={s.detailKey}>개인 예외</span>
                        <span className={s.ovWrap}>
                          {detail.overrides.map((o) => (
                            <span key={o.feature} className={o.effect === 'grant' ? s.ovGrant : s.ovDeny}>
                              {o.effect === 'grant' ? '＋' : '－'}{o.feature}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                    {detail.role !== 'team_rnd' && detail.effective_features.length > 0 && (
                      <div className={s.featWrap}>
                        {detail.effective_features.map((f) => (
                          <span key={f} className={s.featChip}>{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
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
                <label className={s.label}>이름</label>
                <input
                  type="text"
                  className={s.input}
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  placeholder="실명 (예: 김철수)"
                  disabled={saving}
                />
              </div>

              <div className={s.field}>
                <label className={s.label}>이메일</label>
                <input
                  type="email"
                  className={s.input}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="예: kim@company.com (선택)"
                  disabled={saving}
                />
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
                  {roleOptions.map((r) => (
                    <option key={r.key} value={r.key}>{roleOptText(r)}</option>
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
