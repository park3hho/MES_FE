// pages/process/manage/AccessControlPage.jsx
// 접근 권한 관리 — 역할 CRUD + 역할별 기능 + 개인별 override 를 한 화면에 통합 (2026-07-16).
//   구 3페이지(RolePermissionPage / RoleManagePage / MachinePermissionPage)를 대체.
//   좌측 마스터(역할 목록 or 사용자 목록) + 우측 기능 매트릭스(역할=체크박스 / 개인=3-state+최종).
//   team_rnd(전권)는 역할편집·매트릭스·개인설정에서 잠금/제외. BE 무변경(기존 엔드포인트 재사용).
//   설계: docs/rbac-management-design.md 통합안.
// 부서 역할 탭 (2026-09-22, 부서 2단계 배포 2) — 부서 → 역할 매핑. 설계 docs/department-design.md §6
//   ★ 매핑 한 줄이 그 부서 전원(팀원 포함)의 권한을 바꾼다 → 저장 전에 **영향 미리보기**(BE 계산)를 반드시 거친다.
//   ★ 개인 탭의 '기본' = 주 역할 + 부서 상속(BE 값). FE 는 상속을 계산하지 않는다.

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import {
  getRolePermissions, saveRolePermissions,
  getRoles, createRole, updateRole, deleteRole,
  listUsers, getMachinePermissions, saveMachinePermissions,
  getDepartments, getMappableRoles, getDepartmentRoles, putDepartmentRoles,
  getIamEvents,
} from '@/api'
import { fmtKstDateTime } from '@/utils/dateConvert'
import s from './AccessControlPage.module.css'

const MODE_ROLE = 'role'
const MODE_DEPT = 'dept'
const MODE_USER = 'user'
const EMPTY_ADD = { role_key: '', label: '', is_admin: false }
// 'inherit' 의 표시는 '기본' — 부서 상속과 헷갈리지 않게 (2026-09-22). 값(키)은 그대로다.
const OV_STATES = [['inherit', '기본'], ['grant', '허용'], ['deny', '차단']]

const sameSet = (a, b) => {
  const x = new Set(a || []); const y = new Set(b || [])
  return x.size === y.size && [...x].every((k) => y.has(k))
}

// ── 변경 이력 탭 (iam_event, 읽기 전용) — 종류 문자열은 BE models/auth/iam_event.py KIND_* 와 같다
const MODE_LOG = 'log'
const IAM_KINDS = [
  ['membership', '소속'], ['primary_dept', '주 소속'], ['role_review', '전보 재확인'],
  ['primary_role', '주 역할'], ['override', '개인 예외'], ['mapping', '부서 매핑'],
  ['role_perm', '역할 권한'], ['role', '역할'], ['dept_master', '부서'],
  ['assignment', '지정'], ['active', '활성·퇴사'],
]
const IAM_KIND_LABEL = Object.fromEntries(IAM_KINDS)
const TARGET_LABEL = { account: '계정', department: '부서', role: '역할' }
// 지정(assignment)의 대상 키 — 역할이 아니라 담당 종류다(BE purchase_assignee_service)
const ASSIGN_LABEL = {
  'purchase.approver': '구매 승인자', 'purchase.purchaser': '구매 담당',
  'purchase.approval_mode': '승인 체계', dept_manager: '부서장',
}
const APPROVAL_LABEL = { global: '전역 승인자만', dept_manager: '부서장 우선', both: '부서장·전역 둘 다' }
const OV_WORD = { grant: '허용', deny: '차단' }
const LOG_LIMITS = [200, 1000]

const deptNames = (xs) => (Array.isArray(xs) && xs.length ? xs.map((x) => x?.name || `#${x?.id}`).join(', ') : '없음')

// 이력 한 줄 요약 — 모양은 BE 가 종류마다 남긴 before/after 그대로다(department_service · user_service · …)
function iamSummary(ev, roleLabel, featLabel, userName) {
  const b = ev.before; const a = ev.after
  const plusMinus = (added, removed, label) =>
    [...added.map((k) => `+${label(k)}`), ...removed.map((k) => `−${label(k)}`)].join('  ') || '변경 없음'
  switch (ev.kind) {
    case 'membership':
    case 'primary_dept':
      return `${deptNames(b)} → ${deptNames(a)}`
    case 'role_review':
      return `${deptNames(a?.from)} → ${deptNames(a?.to)} · 주 역할 '${a?.role_label || roleLabel(a?.role)}' 유지 확인`
    case 'primary_role':
      return `${roleLabel(b)} → ${roleLabel(a)}`
    case 'active':
      return a ? '복귀 (활성)' : '퇴사 (비활성)'
    case 'role_perm':
      return plusMinus(a?.added || [], b?.removed || [], featLabel)
    case 'mapping': {
      const bs = new Set(b || []); const as = new Set(a || [])
      return plusMinus([...as].filter((k) => !bs.has(k)), [...bs].filter((k) => !as.has(k)), roleLabel)
    }
    case 'override': {
      const keys = [...new Set([...Object.keys(b || {}), ...Object.keys(a || {})])]
      return keys.filter((k) => (b || {})[k] !== (a || {})[k])
        .map((k) => `${featLabel(k)}: ${OV_WORD[(b || {})[k]] || '기본'}→${OV_WORD[(a || {})[k]] || '기본'}`)
        .join('  ') || '변경 없음'
    }
    case 'assignment': {
      if (ev.target_key === 'purchase.approval_mode') return `${APPROVAL_LABEL[b] || b} → ${APPROVAL_LABEL[a] || a}`
      const bs = new Set(b || []); const as = new Set(a || [])
      return plusMinus([...as].filter((k) => !bs.has(k)), [...bs].filter((k) => !as.has(k)), userName)
    }
    case 'role':
      if (b == null) return `생성 — ${a?.label || ''}${a?.is_admin ? ' (관리 등급)' : ''}`
      if (a == null) return `삭제 — 기능 ${(b.features || []).length}개였음`
      return [
        b.label !== a.label ? `이름 ${b.label}→${a.label}` : '',
        b.is_admin !== a.is_admin ? `관리 등급 ${b.is_admin ? '해제' : '지정'}` : '',
      ].filter(Boolean).join('  ') || '변경 없음'
    case 'dept_master':
      if (b == null) return `생성 — ${a?.name || ''}`
      return [
        b.name !== a?.name ? `이름 ${b.name}→${a?.name}` : '',
        b.active !== a?.active ? (a?.active ? '다시 사용' : '사용 중지') : '',
        b.parent_id !== a?.parent_id ? '상위 부서 변경' : '',
        b.sort_order !== a?.sort_order ? `정렬 ${b.sort_order}→${a?.sort_order}` : '',
      ].filter(Boolean).join('  ') || '변경 없음'
    default:
      return JSON.stringify(a)
  }
}

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
  const [detail, setDetail] = useState(null)   // {machine,is_rnd,features,role_base,base_from,inherited,overrides}
  const [overrides, setOverrides] = useState({})

  // 부서 모드 — 탭을 처음 열 때 불러온다(다른 탭이 이 조회 실패에 막히지 않게)
  const [deptLoaded, setDeptLoaded] = useState(false)
  const [depts, setDepts] = useState([])          // 부서 바로 뒤에 그 팀들이 오는 순서(BE list_departments)
  const [mappable, setMappable] = useState([])    // [{key,label,mappable,reason}]
  const [deptMaps, setDeptMaps] = useState({})    // {"<deptId>": [role_key]} — 저장된 값
  const [selDept, setSelDept] = useState('')
  const [draft, setDraft] = useState(() => new Set())   // 선택 부서의 편집본
  const [preview, setPreview] = useState(null)    // PUT apply=false 결과 — 있으면 '적용' 단계

  // 변경 이력 모드 (iam_event, 읽기 전용) — ISO 27001 A.5.18 '누가 언제 누구에게 무엇을 주고 뺐나'
  const [allUsers, setAllUsers] = useState([])    // 퇴사자 포함 — 회수 이력은 퇴사자 쪽이 중요하다
  const [events, setEvents] = useState(null)      // null = 불러오는 중
  const [logKind, setLogKind] = useState('')
  const [logUser, setLogUser] = useState('')      // 대상 계정 id ('' = 전체)
  const [logLimit, setLogLimit] = useState(LOG_LIMITS[0])

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
    setAllUsers(us || [])
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
  // 기본 = 주 역할 + 부서 상속 (BE role_base, 레거시 묶음도 펼친 값)
  const roleBaseSet = useMemo(() => new Set(detail?.role_base || []), [detail])
  const featLabel = useMemo(() => Object.fromEntries(features.map((f) => [f.key, f.label])), [features])
  const roleLabel = (k) => roleLabels[k] || mappable.find((r) => r.key === k)?.label || k

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

  // ── 부서 모드 (부서 → 역할 매핑) ──
  const loadDept = useCallback(async () => {
    const [ds, mr, maps] = await Promise.all([getDepartments(true), getMappableRoles(), getDepartmentRoles()])
    setDepts(ds || []); setMappable(mr || []); setDeptMaps(maps)
    setDeptLoaded(true)
    return maps
  }, [])
  const selDeptObj = depts.find((d) => String(d.id) === String(selDept)) || null
  const deptDirty = !!selDeptObj && !sameSet(draft, deptMaps[String(selDept)])
  // 팀이면 상위 부서 매핑도 같이 받는다(설계 D2) — 읽기 전용으로 보여 준다
  const parentMapped = selDeptObj?.parent_id ? (deptMaps[String(selDeptObj.parent_id)] || []) : []
  const deptPath = (d) => (d ? (d.is_team && d.parent_name ? `${d.parent_name} > ${d.name}` : d.name) : '')

  const pickDept = async (id) => {
    if (String(id) === String(selDept)) return
    if (deptDirty) {
      const ok = await confirm({
        title: '저장하지 않은 변경',
        message: `'${deptPath(selDeptObj)}' 의 매핑 변경을 저장하지 않았습니다.\n버리고 이동할까요?`,
        confirmText: '버리기',
      })
      if (!ok) return
    }
    setSelDept(String(id)); setDraft(new Set(deptMaps[String(id)] || [])); setPreview(null)
  }
  const toggleMap = (k) => {
    setDraft((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
    setPreview(null)
  }

  async function previewDept() {
    if (!selDeptObj) return
    setSaving(true); setMsg(null)
    try {
      setPreview(await putDepartmentRoles(selDeptObj.id, [...draft], false))
    } catch (e) { setMsg({ type: 'err', text: e.message }) } finally { setSaving(false) }
  }

  async function applyDept() {
    if (!selDeptObj) return
    setSaving(true); setMsg(null)
    try {
      await putDepartmentRoles(selDeptObj.id, [...draft], true)   // 서버가 다시 계산·검증한다
      const maps = await getDepartmentRoles()
      setDeptMaps(maps); setDraft(new Set(maps[String(selDeptObj.id)] || [])); setPreview(null)
      setMsg({ type: 'ok', text: `${deptPath(selDeptObj)} 매핑 저장됨. 서버 판정은 바로 바뀌고, 소속원 화면은 새로고침(또는 재로그인) 후 반영됩니다.` })
    } catch (e) { setMsg({ type: 'err', text: e.message }) } finally { setSaving(false) }
  }

  // ── 변경 이력 모드 ──
  const userName = (id) => {
    const u = allUsers.find((x) => String(x.id) === String(id))
    return u ? (u.display_name || u.login_id) : `#${id}`
  }
  useEffect(() => {
    if (mode !== MODE_LOG) return
    let alive = true
    setEvents(null)
    getIamEvents({
      kind: logKind,
      target_type: logUser ? 'account' : '',
      target_id: logUser || undefined,
      limit: logLimit,
    })
      .then((rows) => { if (alive) setEvents(rows) })
      .catch((e) => { if (alive) { setEvents([]); setMsg({ type: 'err', text: e.message }) } })
    return () => { alive = false }
  }, [mode, logKind, logUser, logLimit])

  const switchMode = (m) => {
    setMode(m); setQuery(''); setMsg(null)
    // 탭에 들어올 때마다 다시 읽는다 — 역할 탭에서 기능·등급을 바꾸면 '매핑 가능 여부' 가 달라진다(결정 9)
    if (m === MODE_DEPT) {
      loadDept().catch((e) => setMsg({ type: 'err', text: e.message }))
    }
  }
  const dirty = mode === MODE_ROLE ? roleDirty : mode === MODE_DEPT ? deptDirty : userDirty
  const onSave = mode === MODE_ROLE ? saveRole : mode === MODE_DEPT ? previewDept : saveUser
  const filteredUsers = users.filter((u) => {
    const q = userQuery.trim().toLowerCase()
    return !q || u.login_id.toLowerCase().includes(q) || (u.display_name || '').toLowerCase().includes(q)
  })

  return (
    <div className="page-flat">
      <PageHeader
        title="접근 권한 관리"
        subtitle="역할 권한 · 부서 역할 · 개인별 예외 · 변경 이력 — team_rnd 전용"
        onBack={onBack}
      />
      {msg && <p className={msg.type === 'ok' ? s.ok : s.err}>{msg.text}</p>}

      <div className={s.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={mode === MODE_ROLE}
          className={`${s.tab} ${mode === MODE_ROLE ? s.tabOn : ''}`} onClick={() => switchMode(MODE_ROLE)}>
          역할 권한
        </button>
        <button type="button" role="tab" aria-selected={mode === MODE_DEPT}
          className={`${s.tab} ${mode === MODE_DEPT ? s.tabOn : ''}`} onClick={() => switchMode(MODE_DEPT)}>
          부서 역할
        </button>
        <button type="button" role="tab" aria-selected={mode === MODE_USER}
          className={`${s.tab} ${mode === MODE_USER ? s.tabOn : ''}`} onClick={() => switchMode(MODE_USER)}>
          개인별 권한
        </button>
        <button type="button" role="tab" aria-selected={mode === MODE_LOG}
          className={`${s.tab} ${mode === MODE_LOG ? s.tabOn : ''}`} onClick={() => switchMode(MODE_LOG)}>
          변경 이력
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
            ) : mode === MODE_DEPT ? (
              <>
                <div className={s.masterHead}>부서</div>
                {!deptLoaded ? <p className={s.note}>불러오는 중…</p> : (
                  <ul className={s.mList}>
                    {depts.map((d) => {
                      const n = (deptMaps[String(d.id)] || []).length
                      return (
                        <li key={d.id}>
                          <button type="button"
                            className={`${s.mItem} ${String(d.id) === String(selDept) ? s.mItemOn : ''} ${d.is_team ? s.mItemTeam : ''} ${d.active ? '' : s.mItemOff}`}
                            onClick={() => pickDept(d.id)}>
                            <span className={s.mMain}>
                              <span className={s.mName}>
                                {d.name}
                                {!d.active && <span className={s.offBadge}>사용 중지</span>}
                              </span>
                              <span className={s.mKey}>{d.is_team ? `${d.parent_name} 팀` : d.code} · {d.member_count}명</span>
                            </span>
                            {n > 0 && <span className={s.navBadge} title="매핑된 역할 수">역할 {n}</span>}
                          </button>
                        </li>
                      )
                    })}
                    {depts.length === 0 && <li className={s.note}>부서가 없습니다.</li>}
                  </ul>
                )}
              </>
            ) : mode === MODE_LOG ? (
              <>
                <div className={s.masterHead}>종류</div>
                <ul className={s.mList}>
                  {[['', '전체'], ...IAM_KINDS].map(([k, label]) => (
                    <li key={k || 'all'}>
                      <button type="button" className={`${s.mItem} ${logKind === k ? s.mItemOn : ''}`}
                        onClick={() => setLogKind(k)}>
                        <span className={s.mMain}><span className={s.mName}>{label}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
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
            {mode === MODE_LOG ? (
              <>
                <div className={s.toolbar}>
                  <select className={s.search} value={logUser} onChange={(e) => setLogUser(e.target.value)}>
                    <option value="">대상: 전체 (계정·부서·역할)</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        계정: {u.display_name || u.login_id}{u.active === false ? ' (비활성)' : ''}
                      </option>
                    ))}
                  </select>
                  <select className={`${s.inp} ${s.logLimit}`} value={logLimit} onChange={(e) => setLogLimit(Number(e.target.value))}>
                    {LOG_LIMITS.map((n) => <option key={n} value={n}>최근 {n}건</option>)}
                  </select>
                </div>
                <p className={s.legend}>
                  고칠 수 없는 기록입니다(추가만). 1.5b 배포 이전의 변경은 남아 있지 않습니다. 시각은 한국 시간.
                </p>
                {events === null ? <p className={s.note}>불러오는 중…</p>
                  : events.length === 0 ? <p className={s.placeholder}>기록이 없습니다.</p> : (
                    <ul className={s.logList}>
                      {events.map((ev) => (
                        <li key={ev.id} className={s.logItem}>
                          <div className={s.logHead}>
                            <span className={s.logWhen}>{fmtKstDateTime(ev.at)}</span>
                            <span className={s.navBadge}>{IAM_KIND_LABEL[ev.kind] || ev.kind}</span>
                            <b>
                              {ev.kind === 'assignment'
                                ? `지정 ${ASSIGN_LABEL[ev.target_key] || ev.target_key}${ev.target_name ? ` · ${ev.target_name}` : ''}`
                                : `${TARGET_LABEL[ev.target_type] || ev.target_type} ${ev.target_name
                                    || (ev.target_type === 'role' ? roleLabel(ev.target_key) : ev.target_key)
                                    || `#${ev.target_id}`}`}
                            </b>
                            <span className={s.mKey}>· {ev.actor_name || '시스템'}</span>
                          </div>
                          <div className={s.logBody}>{iamSummary(ev, roleLabel, (k) => featLabel[k] || k, userName)}</div>
                          {ev.reason && <div className={s.logReason}>{ev.reason}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
              </>
            ) : mode === MODE_DEPT ? (
              !selDeptObj ? (
                <p className={s.placeholder}>왼쪽에서 부서를 고르면 그 부서 소속원이 물려받을 역할을 정할 수 있습니다.</p>
              ) : preview ? (
                /* ── 영향 미리보기 — 아직 저장 전. 아래 [적용] 을 눌러야 저장된다 ── */
                <div className={s.preview}>
                  <p className={s.legend}>
                    <b>{deptPath(selDeptObj)}</b> 매핑 변경 미리보기 — <b>아직 저장되지 않았습니다.</b>
                  </p>
                  <div className={s.pvDiff}>
                    {preview.added.length > 0 && <span className={s.pvGain}>＋ {preview.added.map(roleLabel).join(', ')}</span>}
                    {preview.removed.length > 0 && <span className={s.pvLose}>－ {preview.removed.map(roleLabel).join(', ')}</span>}
                    {preview.added.length + preview.removed.length === 0 && <span className={s.pvSame}>매핑 변경 없음</span>}
                  </div>
                  {preview.affected.length === 0 ? (
                    <p className={s.note}>권한이 바뀌는 사람이 없습니다 — 소속원이 없거나, 사용 중지된 부서이거나, 기계·공용 계정뿐입니다.</p>
                  ) : (
                    <>
                      <div className={s.masterHead}>영향받는 사람 {preview.affected.length}명</div>
                      <ul className={s.pvList}>
                        {preview.affected.map((a) => {
                          // 잠금·폐기 묶음 키는 매트릭스에 없는 이름이라 뺀다(펼친 공정 키로 이미 보인다)
                          const gained = a.gained.filter((f) => featLabel[f])
                          const lost = a.lost.filter((f) => featLabel[f])
                          return (
                            <li key={a.id} className={s.pvItem}>
                              <div className={s.pvWho}>
                                <b>{a.name}</b> <span className={s.mKey}>{a.role_label}</span>
                              </div>
                              <div className={s.pvChips}>
                                {gained.map((f) => <span key={`g${f}`} className={s.pvGain}>＋{featLabel[f]}</span>)}
                                {lost.map((f) => <span key={`l${f}`} className={s.pvLose}>－{featLabel[f]}</span>)}
                                {gained.length + lost.length === 0 && (
                                  <span className={s.pvSame}>기능 변화 없음 — 주 역할·다른 경로·개인 예외가 이미 같은 결과를 냅니다</span>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <p className={s.legend}>
                    <b>{deptPath(selDeptObj)}</b> — 체크한 역할을 이 {selDeptObj.is_team ? '팀' : '부서와 하위 팀'}의
                    소속원(주 소속·겸직 모두, 사람 계정만)이 물려받습니다. 주 역할 권한에 <b>더해질 뿐</b> 빼지는 않습니다.
                  </p>
                  {!selDeptObj.active && <p className={s.lockNote}>사용 중지된 부서라 매핑이 있어도 상속되지 않습니다.</p>}
                  {selDeptObj.is_team && !selDeptObj.parent_active && (
                    <p className={s.lockNote}>상위 부서가 사용 중지라 이 팀은 상속되지 않습니다.</p>
                  )}
                  {selDeptObj.is_team && parentMapped.length > 0 && (
                    <p className={s.legend}>
                      상위 부서 <b>{selDeptObj.parent_name}</b> 에서 함께 받는 역할: {parentMapped.map(roleLabel).join(', ')}
                    </p>
                  )}
                  <div className={s.matrix}>
                    {mappable.map((r) => {
                      const on = draft.has(r.key)
                      return (
                        <label key={r.key} className={`${s.featRow} ${r.mappable ? s.rowClick : s.rowDis}`}>
                          <div className={s.featInfo}>
                            <div className={s.featLabel}>{r.label}</div>
                            <div className={s.featMeta}>
                              <code>{r.key}</code>
                              {r.mappable ? ` · 기능 ${origGrants[r.key]?.size || 0}개` : ` · ${r.reason}`}
                            </div>
                          </div>
                          {/* 매핑 불가 역할은 끄기만 된다(예전에 들어간 값을 빼는 길은 남긴다) */}
                          <input type="checkbox" className={s.chk} checked={on}
                            disabled={!r.mappable && !on} onChange={() => toggleMap(r.key)} />
                        </label>
                      )
                    })}
                  </div>
                </>
              )
            ) : mode === MODE_USER && !detail ? (
              <p className={s.placeholder}>왼쪽에서 사용자를 선택하면 기본 권한(주 역할 + 부서 상속) 위의 예외(허용/차단)를 설정할 수 있습니다.</p>
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
                  <>
                    <p className={s.legend}>
                      <b>{detail.machine.login_id}</b> · 주 역할 <b>{roleLabels[detail.machine.role] || detail.machine.role}</b> —
                      <span className={s.lgInherit}> 기본</span>=주 역할 + 부서 상속을 따름,
                      <span className={s.lgGrant}> 허용</span>=강제 부여,
                      <span className={s.lgDeny}> 차단</span>=강제 차단(우선). <b>최종</b>=계산된 순 권한.
                    </p>
                    <p className={s.legend}>
                      부서 상속:{' '}
                      {(detail.inherited || []).length === 0 ? '없음' : detail.inherited.map((r) => (
                        <span key={r.key} className={s.inhChip} title={(r.via || []).join('\n')}>
                          {r.label} ← {(r.via || []).join(', ') || '부서'}
                        </span>
                      ))}
                    </p>
                  </>
                )}

                {sections.length === 0 ? <p className={s.note}>검색 결과가 없습니다.</p> : (
                  <div className={s.matrix}>
                    {sections.map(({ group, feats }) => (
                      <Fragment key={group}>
                        <div className={s.groupRow}>
                          <span className={s.groupName}>{group}</span>
                          <span className={s.groupCount}>{feats.length}</span>
                        </div>
                        {feats.map((f) => {
                          // 개인 모드 — 기본 허용의 출처. 부서에서 온 것만 줄로 보이고 전체는 툴팁
                          const baseFrom = mode === MODE_USER ? (detail?.base_from?.[f.key] || []) : []
                          const deptFrom = baseFrom.filter((x) => x.kind === 'dept')
                          return (
                            <div key={f.key} className={s.featRow}>
                              <div className={s.featInfo}>
                                <div className={s.featLabel}>{f.label}</div>
                                <div className={s.featMeta}>{f.desc}{f.desc ? ' · ' : ''}<code>{f.key}</code></div>
                                {deptFrom.length > 0 && (
                                  <div className={s.srcLine}>부서 상속: {deptFrom.map((x) => x.text).join(' / ')}</div>
                                )}
                              </div>
                              {mode === MODE_ROLE ? (
                                <input type="checkbox" className={s.chk}
                                  checked={grants[selRole]?.has(f.key) || false}
                                  onChange={() => toggleFeat(f.key)} disabled={selIsSuper} />
                              ) : (
                                <>
                                  <span className={s.baseBadge} title={baseFrom.map((x) => x.text).join('\n') || undefined}>
                                    기본 {roleBaseSet.has(f.key) ? '허용' : '차단'}
                                  </span>
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
                          )
                        })}
                      </Fragment>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {!loading && mode !== MODE_LOG && (
        <div className={s.saveBar}>
          {mode === MODE_DEPT && preview ? (
            /* 미리보기 단계 — 적용을 눌러야 저장된다. 서버가 그때 다시 계산·검증한다 */
            <>
              <button type="button" className="btn-secondary btn-lg" onClick={() => setPreview(null)} disabled={saving}>
                다시 편집
              </button>
              <button type="button" className="btn-primary btn-lg" onClick={applyDept} disabled={saving}>
                {saving ? '저장 중…' : `적용 (${preview.affected.length}명 영향)`}
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary btn-lg" onClick={onSave} disabled={saving || !dirty}>
              {saving ? (mode === MODE_DEPT ? '계산 중…' : '저장 중…')
                : !dirty ? '변경 없음'
                : mode === MODE_DEPT ? '영향 미리보기' : '변경사항 저장'}
            </button>
          )}
          <p className={s.note}>
            {mode === MODE_DEPT
              ? '미리보기로 누가 무엇을 얻고 잃는지 확인한 뒤 적용합니다 · 매핑은 그 부서의 팀원까지 물려받습니다.'
              : '저장 시 즉시 서버 반영 · 로그인 중인 사용자는 재로그인 시 새 권한이 적용됩니다.'}
          </p>
        </div>
      )}
    </div>
  )
}
