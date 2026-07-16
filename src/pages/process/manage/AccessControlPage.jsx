// pages/process/manage/AccessControlPage.jsx
// 접근 권한 관리 — 역할 CRUD + 역할별 기능 + 개인별 override 를 한 화면에 통합 (2026-07-16).
//   구 3페이지(RolePermissionPage / RoleManagePage / MachinePermissionPage)를 대체.
//   좌측 마스터(역할 목록 or 사용자 목록) + 우측 기능 매트릭스(역할=체크박스 / 개인=3-state+최종).
//   team_rnd(전권)는 역할편집·매트릭스·개인설정에서 잠금/제외. BE 무변경(기존 엔드포인트 재사용).
//   설계: docs/rbac-management-design.md 통합안.

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import {
  getRolePermissions, saveRolePermissions,
  getRoles, createRole, updateRole, deleteRole,
  listUsers, getMachinePermissions, saveMachinePermissions,
} from '@/api'
import s from './AccessControlPage.module.css'

const MODE_ROLE = 'role'
const MODE_USER = 'user'
const EMPTY_ADD = { role_key: '', label: '', is_admin: false }
const OV_STATES = [['inherit', '상속'], ['grant', '허용'], ['deny', '차단']]

export default function AccessControlPage({ onBack }) {
  const confirm = useConfirm()
  const [mode, setMode] = useState(MODE_ROLE)
  const [msg, setMsg] = useState(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 공용 기능 카탈로그 (grantable 만 — BE 가 admin.permissions 등 LOCKED 제외)
  const [features, setFeatures] = useState([])
  const [groupOrder, setGroupOrder] = useState([])

  // 역할 모드
  const [roles, setRoles] = useState([])       // [{key,label,is_admin,is_superuser}]
  const [origRoles, setOrigRoles] = useState([])
  const [grants, setGrants] = useState({})     // {role_key: Set(feature)}
  const [origGrants, setOrigGrants] = useState({})
  const [selRole, setSelRole] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY_ADD)

  // 개인 모드
  const [users, setUsers] = useState([])
  const [roleLabels, setRoleLabels] = useState({})
  const [userQuery, setUserQuery] = useState('')
  const [selUser, setSelUser] = useState('')
  const [detail, setDetail] = useState(null)   // {machine,is_rnd,features,role_base,overrides}
  const [overrides, setOverrides] = useState({})

  const loadAll = useCallback(async () => {
    const [rp, rr, us] = await Promise.all([getRolePermissions(), getRoles(), listUsers()])
    setFeatures(rp.features || [])
    setGroupOrder(rp.group_order || [])
    const rl = rr.roles || []
    setRoles(rl.map((r) => ({ ...r })))
    setOrigRoles(rl.map((r) => ({ ...r })))
    const g = {}
    for (const r of rl) g[r.key] = new Set((rp.grants && rp.grants[r.key]) || [])
    setGrants(g)
    setOrigGrants(Object.fromEntries(rl.map((r) => [r.key, new Set(g[r.key])])))
    setRoleLabels(Object.fromEntries(rl.map((r) => [r.key, r.label])))
    setUsers((us || []).filter((u) => u.active !== false))
    setSelRole((prev) => prev || rl.find((r) => !r.is_superuser)?.key || rl[0]?.key || '')
  }, [])

  useEffect(() => {
    (async () => {
      setLoading(true)
      try { await loadAll() } catch (e) { setMsg({ type: 'err', text: e.message }) } finally { setLoading(false) }
    })()
  }, [loadAll])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const selRoleObj = roles.find((r) => r.key === selRole) || null
  const selIsSuper = !!selRoleObj?.is_superuser
  const roleBaseSet = useMemo(() => new Set(detail?.role_base || []), [detail])

  // 검색 → 그룹 섹션 (역할=features, 개인=detail.features)
  const { sections, visKeys } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const src = mode === MODE_USER ? (detail?.features || []) : features
    const matched = q
      ? src.filter((f) => (`${f.label} ${f.desc || ''} ${f.key}`).toLowerCase().includes(q))
      : src
    const byG = {}
    for (const f of matched) (byG[f.group] ||= []).push(f)
    const ordered = [
      ...groupOrder.filter((g) => byG[g]),
      ...Object.keys(byG).filter((g) => !groupOrder.includes(g)).sort(),
    ]
    return { sections: ordered.map((g) => ({ group: g, feats: byG[g] })), visKeys: matched.map((f) => f.key) }
  }, [mode, detail, features, groupOrder, query])

  // ── 역할 모드 ──
  const toggleFeat = (fk) => setGrants((prev) => {
    const next = { ...prev, [selRole]: new Set(prev[selRole]) }
    if (next[selRole].has(fk)) next[selRole].delete(fk); else next[selRole].add(fk)
    return next
  })
  const bulkToggle = () => {
    const set = grants[selRole] || new Set()
    const all = visKeys.length > 0 && visKeys.every((k) => set.has(k))
    setGrants((prev) => {
      const next = { ...prev, [selRole]: new Set(prev[selRole]) }
      for (const k of visKeys) { if (all) next[selRole].delete(k); else next[selRole].add(k) }
      return next
    })
  }
  const setRoleMeta = (patch) =>
    setRoles((rs) => rs.map((r) => (r.key === selRole ? { ...r, ...patch } : r)))

  async function addRole() {
    const role_key = addForm.role_key.trim().toLowerCase()
    const label = addForm.label.trim()
    if (!role_key) return setMsg({ type: 'err', text: '역할 키를 입력해주세요.' })
    if (!label) return setMsg({ type: 'err', text: '표시명을 입력해주세요.' })
    setSaving(true); setMsg(null)
    try {
      await createRole({ role_key, label, is_admin: addForm.is_admin })
      setAddForm(EMPTY_ADD); setAddOpen(false)
      await loadAll(); setSelRole(role_key)
      setMsg({ type: 'ok', text: `역할 추가됨: ${role_key}. 오른쪽에서 기능을 부여하세요.` })
    } catch (e) { setMsg({ type: 'err', text: e.message }) } finally { setSaving(false) }
  }

  async function removeRole() {
    if (!selRoleObj || selIsSuper) return
    const ok = await confirm({
      title: '역할 삭제',
      message: `'${selRoleObj.label}' (${selRoleObj.key}) 역할을 삭제할까요?\n배정된 계정이 있으면 삭제되지 않습니다.`,
      confirmText: '삭제',
    })
    if (!ok) return
    setSaving(true); setMsg(null)
    try {
      await deleteRole(selRoleObj.key)
      setSelRole('')
      await loadAll()
      setMsg({ type: 'ok', text: `삭제됨: ${selRoleObj.key}` })
    } catch (e) { setMsg({ type: 'err', text: e.message }) } finally { setSaving(false) }
  }

  const roleDirty = useMemo(() => {
    for (const r of roles) {
      const a = grants[r.key] || new Set(); const b = origGrants[r.key] || new Set()
      if (a.size !== b.size) return true
      for (const x of a) if (!b.has(x)) return true
      const o = origRoles.find((x) => x.key === r.key)
      if (o && (o.label !== r.label || o.is_admin !== r.is_admin)) return true
    }
    return false
  }, [roles, grants, origGrants, origRoles])

  async function saveRole() {
    setSaving(true); setMsg(null)
    try {
      const payload = {}
      for (const r of roles) if (!r.is_superuser) payload[r.key] = [...(grants[r.key] || [])]
      await saveRolePermissions(payload)
      for (const r of roles) {
        if (r.is_superuser) continue
        const o = origRoles.find((x) => x.key === r.key)
        if (o && (o.label !== r.label || o.is_admin !== r.is_admin)) {
          await updateRole(r.key, { label: r.label, is_admin: r.is_admin })
        }
      }
      await loadAll()
      setMsg({ type: 'ok', text: '저장됨. 변경된 권한은 대상 사용자 재로그인 후 적용됩니다.' })
    } catch (e) { setMsg({ type: 'err', text: e.message }); await loadAll() } finally { setSaving(false) }
  }

  // ── 개인 모드 ──
  const pickUser = async (id) => {
    setSelUser(id); setDetail(null); setOverrides({}); setMsg(null)
    if (!id) return
    try {
      const d = await getMachinePermissions(id)
      setDetail(d); setOverrides({ ...d.overrides })
    } catch (e) { setMsg({ type: 'err', text: e.message }) }
  }
  const setOv = (fk, st) => setOverrides((prev) => {
    const next = { ...prev }
    if (st === 'inherit') delete next[fk]; else next[fk] = st
    return next
  })
  const effOf = (fk) => {
    const ov = overrides[fk]
    if (ov === 'deny') return false
    if (ov === 'grant') return true
    return roleBaseSet.has(fk)
  }
  const userDirty = detail && JSON.stringify(overrides) !== JSON.stringify(detail.overrides)

  async function saveUser() {
    if (!detail) return
    setSaving(true); setMsg(null)
    try {
      await saveMachinePermissions(detail.machine.id, overrides)
      const d = await getMachinePermissions(detail.machine.id)
      setDetail(d); setOverrides({ ...d.overrides })
      setMsg({ type: 'ok', text: '저장됨. 대상 사용자는 재로그인(또는 새로고침) 후 적용됩니다.' })
    } catch (e) { setMsg({ type: 'err', text: e.message }) } finally { setSaving(false) }
  }

  const switchMode = (m) => { setMode(m); setQuery(''); setMsg(null) }
  const dirty = mode === MODE_ROLE ? roleDirty : userDirty
  const onSave = mode === MODE_ROLE ? saveRole : saveUser
  const filteredUsers = users.filter((u) => {
    const q = userQuery.trim().toLowerCase()
    return !q || u.login_id.toLowerCase().includes(q) || (u.display_name || '').toLowerCase().includes(q)
  })

  return (
    <div className="page-flat">
      <PageHeader
        title="접근 권한 관리"
        subtitle="역할 권한 · 개인별 예외 — team_rnd 전용"
        onBack={onBack}
      />
      {msg && <p className={msg.type === 'ok' ? s.ok : s.err}>{msg.text}</p>}

      <div className={s.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={mode === MODE_ROLE}
          className={`${s.tab} ${mode === MODE_ROLE ? s.tabOn : ''}`} onClick={() => switchMode(MODE_ROLE)}>
          역할 권한
        </button>
        <button type="button" role="tab" aria-selected={mode === MODE_USER}
          className={`${s.tab} ${mode === MODE_USER ? s.tabOn : ''}`} onClick={() => switchMode(MODE_USER)}>
          개인별 권한
        </button>
      </div>

      {loading ? <p className={s.note}>불러오는 중…</p> : (
        <div className={s.layout}>
          {/* ── 좌측 마스터 ── */}
          <aside className={s.master}>
            {mode === MODE_ROLE ? (
              <>
                <div className={s.masterHead}>역할</div>
                <ul className={s.mList}>
                  {roles.map((r) => (
                    <li key={r.key}>
                      <button type="button"
                        className={`${s.mItem} ${r.key === selRole ? s.mItemOn : ''}`}
                        onClick={() => setSelRole(r.key)}>
                        <span className={s.mMain}>
                          <span className={s.mName}>{r.label}{r.is_superuser && <span className={s.superBadge}>전권</span>}</span>
                          <span className={s.mKey}>{r.key}</span>
                        </span>
                        {r.is_admin && <span className={s.navBadge} title="관리자 Nav 표시">Nav</span>}
                      </button>
                    </li>
                  ))}
                </ul>

                {addOpen ? (
                  <div className={s.addForm}>
                    <input className={s.inp} placeholder="역할 키 (예: quality_lead)"
                      value={addForm.role_key} onChange={(e) => setAddForm({ ...addForm, role_key: e.target.value })} />
                    <input className={s.inp} placeholder="표시명 (예: 품질팀장)"
                      value={addForm.label} onChange={(e) => setAddForm({ ...addForm, label: e.target.value })} />
                    <label className={s.chkRow}>
                      <input type="checkbox" checked={addForm.is_admin}
                        onChange={(e) => setAddForm({ ...addForm, is_admin: e.target.checked })} />
                      <span>관리자 Nav</span>
                    </label>
                    <div className={s.addBtns}>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => { setAddOpen(false); setAddForm(EMPTY_ADD) }} disabled={saving}>취소</button>
                      <button type="button" className="btn-primary btn-sm" onClick={addRole} disabled={saving}>추가</button>
                    </div>
                    <p className={s.hint}>키는 소문자/숫자/_ · 생성 후 변경 불가</p>
                  </div>
                ) : (
                  <button type="button" className={s.addBtn} onClick={() => setAddOpen(true)}>
                    + 역할 추가
                  </button>
                )}

                {selRoleObj && (
                  <div className={s.roleEdit}>
                    <div className={s.editHead}>선택 역할</div>
                    {selIsSuper ? (
                      <p className={s.lockNote}>team_rnd 는 전권 역할이라 편집·삭제할 수 없습니다.</p>
                    ) : (
                      <>
                        <input className={s.inp} value={selRoleObj.label}
                          onChange={(e) => setRoleMeta({ label: e.target.value })} placeholder="표시명" />
                        <label className={s.chkRow}>
                          <input type="checkbox" checked={selRoleObj.is_admin}
                            onChange={(e) => setRoleMeta({ is_admin: e.target.checked })} />
                          <span>관리자 Nav 표시</span>
                        </label>
                        <button type="button" className={s.delBtn} onClick={removeRole} disabled={saving}>
                          역할 삭제
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className={s.masterHead}>사용자</div>
                <input className={s.inp} placeholder="사용자 검색" value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)} style={{ marginBottom: 8 }} />
                <ul className={s.mList}>
                  {filteredUsers.map((u) => {
                    const rnd = u.role === 'team_rnd'
                    return (
                      <li key={u.id}>
                        <button type="button" disabled={rnd}
                          className={`${s.mItem} ${String(u.id) === String(selUser) ? s.mItemOn : ''} ${rnd ? s.mItemDis : ''}`}
                          onClick={() => !rnd && pickUser(u.id)}>
                          <span className={s.mMain}>
                            <span className={s.mName}>{u.display_name || u.login_id}</span>
                            <span className={s.mKey}>{roleLabels[u.role] || u.role}</span>
                          </span>
                          {rnd && <span className={s.superBadge}>전권</span>}
                        </button>
                      </li>
                    )
                  })}
                  {filteredUsers.length === 0 && <li className={s.note}>사용자가 없습니다.</li>}
                </ul>
              </>
            )}
          </aside>

          {/* ── 우측 기능 매트릭스 ── */}
          <section className={s.detail}>
            {mode === MODE_USER && !detail ? (
              <p className={s.placeholder}>왼쪽에서 사용자를 선택하면 role 기본 권한 위의 예외(허용/차단)를 설정할 수 있습니다.</p>
            ) : mode === MODE_USER && detail?.is_rnd ? (
              <p className={s.placeholder}><b>{detail.machine.login_id}</b> 은(는) team_rnd(전권)이라 항상 모든 기능을 사용합니다. 개인 권한을 설정할 수 없습니다.</p>
            ) : (
              <>
                <div className={s.toolbar}>
                  <input className={s.search} placeholder="기능 검색 (이름·설명·키)"
                    value={query} onChange={(e) => setQuery(e.target.value)} />
                  {mode === MODE_ROLE && !selIsSuper && (
                    <button type="button" className="btn-secondary btn-sm" onClick={bulkToggle}>표시 전체 부여/해제</button>
                  )}
                </div>

                {mode === MODE_ROLE && selIsSuper && (
                  <p className={s.lockNote}>team_rnd 는 전권이라 기능을 개별 설정하지 않습니다 (항상 전체 허용).</p>
                )}
                {mode === MODE_USER && detail && (
                  <p className={s.legend}>
                    <b>{detail.machine.login_id}</b> · role <b>{roleLabels[detail.machine.role] || detail.machine.role}</b> —
                    <span className={s.lgInherit}> 상속</span>=role 따름,
                    <span className={s.lgGrant}> 허용</span>=강제 부여,
                    <span className={s.lgDeny}> 차단</span>=강제 차단(우선). <b>최종</b>=계산된 순 권한.
                  </p>
                )}

                {sections.length === 0 ? <p className={s.note}>검색 결과가 없습니다.</p> : (
                  <div className={s.matrix}>
                    {sections.map(({ group, feats }) => (
                      <Fragment key={group}>
                        <div className={s.groupRow}>
                          <span className={s.groupName}>{group}</span>
                          <span className={s.groupCount}>{feats.length}</span>
                        </div>
                        {feats.map((f) => (
                          <div key={f.key} className={s.featRow}>
                            <div className={s.featInfo}>
                              <div className={s.featLabel}>{f.label}</div>
                              <div className={s.featMeta}>{f.desc}{f.desc ? ' · ' : ''}<code>{f.key}</code></div>
                            </div>
                            {mode === MODE_ROLE ? (
                              <input type="checkbox" className={s.chk}
                                checked={grants[selRole]?.has(f.key) || false}
                                onChange={() => toggleFeat(f.key)} disabled={selIsSuper} />
                            ) : (
                              <>
                                <span className={s.baseBadge}>기본 {roleBaseSet.has(f.key) ? '허용' : '차단'}</span>
                                <div className={s.seg}>
                                  {OV_STATES.map(([v, l]) => (
                                    <button key={v} type="button"
                                      className={`${s.segBtn} ${(overrides[f.key] || 'inherit') === v ? s[`seg_${v}`] : ''}`}
                                      onClick={() => setOv(f.key, v)}>{l}</button>
                                  ))}
                                </div>
                                <span className={`${s.effBadge} ${effOf(f.key) ? s.effOn : s.effOff}`}>
                                  최종 {effOf(f.key) ? '허용' : '차단'}
                                </span>
                              </>
                            )}
                          </div>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {!loading && (
        <div className={s.saveBar}>
          <button type="button" className="btn-primary btn-lg" onClick={onSave} disabled={saving || !dirty}>
            {saving ? '저장 중…' : dirty ? '변경사항 저장' : '변경 없음'}
          </button>
          <p className={s.note}>저장 시 즉시 서버 반영 · 로그인 중인 사용자는 재로그인 시 새 권한이 적용됩니다.</p>
        </div>
      )}
    </div>
  )
}
