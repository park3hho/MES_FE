// pages/process/manage/RolePermissionPage.jsx
// RBAC 권한 매트릭스 편집 — AWS IAM 스타일 (검색 + 그룹 섹션 + 기능 설명 + 역할별 일괄토글).
// team_rnd 전용. team_rnd 는 전권이라 표에서 제외. 역할은 BE 동적(roles).
// 명명/그룹/설명은 BE FEATURE_META(group_order) 가 진실의 원천. 설계: docs/rbac-management-design.md

import { useState, useEffect, useMemo, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/common/PageHeader'
import { getRolePermissions, saveRolePermissions } from '@/api'
import s from './RolePermissionPage.module.css'

export default function RolePermissionPage() {
  const navigate = useNavigate()
  const [roles, setRoles] = useState([])        // [{key, label, is_admin, ...}]
  const [features, setFeatures] = useState([])  // [{key, label, group, desc}]
  const [groupOrder, setGroupOrder] = useState([])
  const [grants, setGrants] = useState({})      // role_key -> Set(feature)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setMsg(null)
    try {
      const d = await getRolePermissions()
      setRoles(d.roles)
      setFeatures(d.features)
      setGroupOrder(d.group_order || [])
      const g = {}
      for (const r of d.roles) g[r.key] = new Set(d.grants[r.key] || [])
      setGrants(g)
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setLoading(false)
    }
  }

  const has = (roleKey, feat) => grants[roleKey]?.has(feat) || false

  const toggle = (roleKey, feat) => {
    setGrants((prev) => {
      const next = { ...prev, [roleKey]: new Set(prev[roleKey]) }
      if (next[roleKey].has(feat)) next[roleKey].delete(feat)
      else next[roleKey].add(feat)
      return next
    })
  }

  // 역할 열 일괄: 현재 보이는(검색 필터된) 기능 전체 grant/clear 토글
  const toggleRoleAll = (roleKey, featKeys, grantAll) => {
    setGrants((prev) => {
      const next = { ...prev, [roleKey]: new Set(prev[roleKey]) }
      for (const fk of featKeys) {
        if (grantAll) next[roleKey].add(fk)
        else next[roleKey].delete(fk)
      }
      return next
    })
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const payload = {}
      for (const r of roles) payload[r.key] = [...(grants[r.key] || [])]
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

  // 검색 필터 (라벨/설명/키 부분일치) → 그룹별 묶기 → group_order 순 정렬
  const { sections, visibleKeys } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = q
      ? features.filter((f) =>
          (f.label || '').toLowerCase().includes(q) ||
          (f.desc || '').toLowerCase().includes(q) ||
          (f.key || '').toLowerCase().includes(q),
        )
      : features
    const byGroup = {}
    for (const f of matched) (byGroup[f.group] ||= []).push(f)
    // group_order 우선, 목록에 없는 그룹은 뒤에 알파벳순
    const ordered = [
      ...groupOrder.filter((g) => byGroup[g]),
      ...Object.keys(byGroup).filter((g) => !groupOrder.includes(g)).sort(),
    ]
    return {
      sections: ordered.map((g) => ({ group: g, feats: byGroup[g] })),
      visibleKeys: matched.map((f) => f.key),
    }
  }, [features, groupOrder, query])

  // 역할별: 보이는 기능을 모두 가졌는지 (헤더 일괄 체크박스 상태)
  const roleAllState = (roleKey) => {
    if (visibleKeys.length === 0) return 'none'
    const set = grants[roleKey]
    const cnt = visibleKeys.filter((k) => set?.has(k)).length
    if (cnt === 0) return 'none'
    if (cnt === visibleKeys.length) return 'all'
    return 'some'
  }

  if (loading) {
    return (
      <div className="page-flat">
        <PageHeader title="권한 관리" subtitle="역할별 기능 사용 권한" />
        <p className={s.note}>불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="권한 관리"
        subtitle="역할별 기능 사용 권한 — 행=기능, 열=역할. team_rnd 는 전권(편집 불가)"
      />
      {msg && <p className={msg.type === 'ok' ? s.ok : s.err}>{msg.text}</p>}

      <div className={s.toolbar}>
        <input
          className={s.search}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="기능 검색 (이름·설명·키)"
        />
        <div className={s.toolbarBtns}>
          <button type="button" className="btn-secondary btn-sm" onClick={() => navigate('/admin/roles')}>
            역할 추가·삭제
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => navigate('/admin/permissions/user')}>
            개인별 권한
          </button>
        </div>
      </div>

      {sections.length === 0 ? (
        <p className={s.note}>검색 결과가 없습니다.</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.matrix}>
            <thead>
              <tr>
                <th className={s.featCol}>기능</th>
                {roles.map((r) => {
                  const st = roleAllState(r.key)
                  return (
                    <th key={r.key} className={s.roleCol}>
                      <span className={s.roleName}>{r.label}</span>
                      <span className={s.roleKey}>{r.key}</span>
                      {/* 보이는 기능 전체 토글 — 일부 선택 시 전체 부여, 전체면 해제 */}
                      <button
                        type="button"
                        className={s.roleAllBtn}
                        title="현재 표시된 기능 전체 부여/해제"
                        onClick={() => toggleRoleAll(r.key, visibleKeys, st !== 'all')}
                      >
                        {st === 'all' ? '전체 해제' : '전체 부여'}
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sections.map(({ group, feats }) => (
                <Fragment key={group}>
                  <tr className={s.groupRow}>
                    <td colSpan={roles.length + 1}>
                      <span className={s.groupName}>{group}</span>
                      <span className={s.groupCount}>{feats.length}</span>
                    </td>
                  </tr>
                  {feats.map((f) => (
                    <tr key={f.key} className={s.featRow}>
                      <td className={s.featCol}>
                        <div className={s.featLabel}>{f.label}</div>
                        {f.desc && <div className={s.featDesc}>{f.desc}</div>}
                        <code className={s.featKey}>{f.key}</code>
                      </td>
                      {roles.map((r) => (
                        <td key={r.key} className={s.cell}>
                          <label className={s.checkWrap}>
                            <input
                              type="checkbox"
                              checked={has(r.key, f.key)}
                              onChange={() => toggle(r.key, f.key)}
                            />
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={s.saveBar}>
        <button className="btn-primary btn-lg" onClick={save} disabled={saving}>
          {saving ? '저장 중…' : '변경사항 저장'}
        </button>
        <p className={s.note}>
          team_rnd 는 항상 전권이라 표에 없습니다. 저장하면 즉시 서버에 반영되며,
          로그인 중인 사용자는 재로그인 시 새 권한이 적용됩니다.
        </p>
      </div>
    </div>
  )
}
