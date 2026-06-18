// pages/process/manage/RoleManagePage.jsx
// RBAC 역할 마스터 관리 (동적 역할, 2026-06-18)
// team_rnd 전용(ADMIN_PERMISSIONS) — 역할 생성/표시명·관리자등급 수정/삭제.
//   role_key 는 생성 후 불변(machine.role 고아 방지). team_rnd 는 전권·삭제 불가.
//   삭제는 배정된 계정이 0명일 때만(BE 가드). 기능 부여는 '권한 관리'(매트릭스)에서.

import { useState, useEffect } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { getRoles, createRole, updateRole, deleteRole } from '@/api'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import s from './RoleManagePage.module.css'

const EMPTY = { role_key: '', label: '', is_admin: false }

export default function RoleManagePage({ onBack }) {
  const confirm = useConfirm()
  const [roles, setRoles] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const d = await getRoles()
      setRoles(d.roles)
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setLoading(false)
    }
  }

  const setRow = (key, patch) =>
    setRoles((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  async function addRole() {
    const role_key = form.role_key.trim().toLowerCase()
    const label = form.label.trim()
    if (!role_key) return setMsg({ type: 'err', text: '역할 키를 입력해주세요.' })
    if (!label) return setMsg({ type: 'err', text: '표시명을 입력해주세요.' })
    setBusy(true); setMsg(null)
    try {
      await createRole({ role_key, label, is_admin: form.is_admin })
      setForm(EMPTY)
      setMsg({ type: 'ok', text: `역할 추가됨: ${role_key}. '권한 관리'에서 기능을 부여하세요.` })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function saveRow(r) {
    setBusy(true); setMsg(null)
    try {
      await updateRole(r.key, { label: r.label, is_admin: r.is_admin })
      setMsg({ type: 'ok', text: `저장됨: ${r.label}` })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
      await load()   // 실패 시 서버값으로 되돌림
    } finally {
      setBusy(false)
    }
  }

  async function removeRole(r) {
    const ok = await confirm({
      title: '역할 삭제',
      message: `'${r.label}' (${r.key}) 역할을 삭제할까요?\n배정된 계정이 있으면 삭제되지 않습니다.`,
      confirmText: '삭제',
    })
    if (!ok) return
    setBusy(true); setMsg(null)
    try {
      await deleteRole(r.key)
      setMsg({ type: 'ok', text: `삭제됨: ${r.key}` })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="역할 관리"
        subtitle="역할 생성·삭제 — 기능 부여는 '권한 관리' 매트릭스에서"
        onBack={onBack}
      />
      {msg && <p className={msg.type === 'ok' ? s.ok : s.err}>{msg.text}</p>}

      {/* 새 역할 추가 */}
      <div className={s.addRow}>
        <input
          className={s.keyInput}
          placeholder="역할 키 (예: quality_lead)"
          value={form.role_key}
          onChange={(e) => setForm({ ...form, role_key: e.target.value })}
          disabled={busy}
        />
        <input
          className={s.labelInput}
          placeholder="표시명 (예: 품질팀장)"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          disabled={busy}
        />
        <label className={s.adminChk}>
          <input
            type="checkbox"
            checked={form.is_admin}
            onChange={(e) => setForm({ ...form, is_admin: e.target.checked })}
            disabled={busy}
          />
          <span>관리자 nav</span>
        </label>
        <button className="btn-primary btn-sm" onClick={addRole} disabled={busy}>
          + 추가
        </button>
      </div>
      <p className={s.hint}>역할 키는 소문자/숫자/_ 로 시작, 생성 후 변경 불가. 추가 직후엔 기능이 0개입니다.</p>

      {loading && <p className={s.note}>불러오는 중…</p>}

      {/* 역할 목록 */}
      <ul className={s.list}>
        {roles.map((r) => (
          <li key={r.key} className={s.row}>
            <div className={s.rowMain}>
              <input
                className={s.rowLabel}
                value={r.label}
                onChange={(e) => setRow(r.key, { label: e.target.value })}
                disabled={busy}
              />
              <span className={s.key}>{r.key}</span>
              {r.is_superuser && <span className={s.badge}>전권</span>}
            </div>
            <label className={s.adminChk}>
              <input
                type="checkbox"
                checked={r.is_admin}
                onChange={(e) => setRow(r.key, { is_admin: e.target.checked })}
                disabled={busy || r.is_superuser}
              />
              <span>관리자 nav</span>
            </label>
            <div className={s.rowActions}>
              <button className="btn-secondary btn-sm" onClick={() => saveRow(r)} disabled={busy}>
                저장
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={() => removeRole(r)}
                disabled={busy || r.is_superuser}
                title={r.is_superuser ? '전권 역할은 삭제할 수 없습니다' : '삭제'}
              >
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
