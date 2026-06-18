// pages/process/manage/RolePermissionPage.jsx
// RBAC 권한 매트릭스 편집 (Phase 2, 2026-06-17)
// team_rnd 전용 — role × feature 체크박스 그리드. team_rnd 는 전권이라 표에서 제외.
// 설계: docs/rbac-management-design.md

import { useState, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/common/PageHeader'
import { getRolePermissions, saveRolePermissions } from '@/api'
import s from './RolePermissionPage.module.css'

const ROLE_LABEL = {
  team_wire: '와이어',
  team_winding: '권선',
  team_qc: '품질',
  general_admin: '라인관리',
}

export default function RolePermissionPage() {
  const navigate = useNavigate()
  const [roles, setRoles] = useState([])
  const [features, setFeatures] = useState([])
  const [grants, setGrants] = useState({}) // role -> Set(feature)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setMsg(null)
    try {
      const d = await getRolePermissions()
      setRoles(d.roles)
      setFeatures(d.features)
      const g = {}
      for (const r of d.roles) g[r] = new Set(d.grants[r] || [])
      setGrants(g)
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setLoading(false)
    }
  }

  const has = (role, feat) => grants[role]?.has(feat)

  const toggle = (role, feat) => {
    setGrants((prev) => {
      const next = { ...prev, [role]: new Set(prev[role]) }
      if (next[role].has(feat)) next[role].delete(feat)
      else next[role].add(feat)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const payload = {}
      for (const r of roles) payload[r] = [...(grants[r] || [])]
      const res = await saveRolePermissions(payload)
      setMsg({
        type: 'ok',
        text: `저장됨 (${res.rows}행). 변경된 권한은 해당 사용자 재로그인 후 적용됩니다.`,
      })
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  // group(공정/관리/QC) 별 묶기
  const groups = {}
  for (const f of features) (groups[f.group] ||= []).push(f)

  if (loading) {
    return (
      <div className="page-flat">
        <PageHeader title="권한 관리" />
        <p className={s.note}>불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="권한 관리"
        subtitle="역할별 기능 사용 권한 — team_rnd 는 전권(편집 불가)"
      />
      {msg && <p className={msg.type === 'ok' ? s.ok : s.err}>{msg.text}</p>}

      <div className={s.actions}>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => navigate('/admin/permissions/user')}
        >
          개인별 권한 설정 →
        </button>
      </div>

      <div className={s.tableWrap}>
        <table className={s.matrix}>
          <thead>
            <tr>
              <th className={s.featCol}>기능</th>
              {roles.map((r) => (
                <th key={r} className={s.roleCol}>
                  {ROLE_LABEL[r] || r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([group, feats]) => (
              <Fragment key={group}>
                <tr className={s.groupRow}>
                  <td colSpan={roles.length + 1}>{group}</td>
                </tr>
                {feats.map((f) => (
                  <tr key={f.key}>
                    <td className={s.featCol}>{f.label}</td>
                    {roles.map((r) => (
                      <td key={r} className={s.cell}>
                        <input
                          type="checkbox"
                          checked={has(r, f.key) || false}
                          onChange={() => toggle(r, f.key)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.actions}>
        <button className="btn-primary btn-lg" onClick={save} disabled={saving}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
      <p className={s.note}>
        team_rnd 는 항상 전권이라 표에 없습니다. 저장하면 즉시 서버에 반영되며,
        로그인 중인 사용자는 재로그인 시 새 권한이 적용됩니다.
      </p>
    </div>
  )
}
