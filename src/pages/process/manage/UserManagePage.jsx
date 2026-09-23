// src/pages/adm/manage/UserManagePage.jsx
// 계정(Account=Machine) CRUD 관리자 페이지 (Phase A+, 2026-04-23)
// team_rnd 전용 — /admin/users
//
// 기능:
//   - 계정 목록 (role/active 필터 · 계정 종류 배지)
//   - 생성 (종류별 PERSON/MACHINE/SHARED — 공통 자격 + 종류별 프로필, 2026-07-16)
//   - 수정 (공통 신원/role/password/location/active — 종류·프로필 상세는 미편집)
//   - 비활성화 (soft delete — 이력 FK 보존)
//
// Toss flat 원칙 준수: .page-flat / PageHeader / .list-item / 모달

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  listUsers, updateUser, deleteUser, getUserDetail,
  createPersonAccount, createMachineAccount, createSharedAccount,
  listFactoryLocations, getRoles,
  getDepartments, getAccountDepartments, setAccountDepartments,
} from '@/api'
import { Role } from '@/constants/permissions'
import { TOAST_MSG_MS, TOAST_ERROR_MS } from '@/constants/etcConst'
import { BP } from '@/constants/breakpoints'
import { useMobile } from '@/hooks/useMobile'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import { fmtKstDate } from '@/utils/dateConvert'
import s from './UserManagePage.module.css'

// 역할 옵션은 동적 — getRoles 로 받음 (2026-06-18). 표시: "라벨 (key)".
const roleOptText = (r) => `${r.label} (${r.key})`

// 계정 종류 (BE models/auth/machine.py ACCOUNT_TYPES 와 동기)
const ACCOUNT_TYPES = [
  { key: 'PERSON',  label: '사람', hint: '직원 개인' },
  { key: 'MACHINE', label: '기계', hint: '단말/설비' },
  { key: 'SHARED',  label: '공용', hint: '공유 계정' },
]
const ACCOUNT_TYPE_LABEL = Object.fromEntries(ACCOUNT_TYPES.map((t) => [t.key, t.label]))
const EMP_TYPES = ['E', 'F', 'C']   // 직원 구분 (BE person_profile.EMPLOYEE_TYPES)

// 종류별 프로필 입력 필드 (공통 자격/배치 필드는 별도 렌더)
const TYPE_FIELDS = {
  PERSON: [
    { key: 'display_name', label: '이름', required: true, placeholder: '실명 (예: 김철수)' },
    { key: 'employee_id',  label: '사번', placeholder: '(선택)' },
    { key: 'email',        label: '이메일', type: 'email', placeholder: '(선택)' },
    { key: 'birth',        label: '생년월일', type: 'date' },
    { key: 'phone',        label: '연락처', placeholder: '(선택)' },
    { key: 'worker_code',  label: '작업자 코드', placeholder: '영숫자 2자 (선택, 예: 16)' },
    { key: 'nw_user_id',   label: '네이버웍스 ID', placeholder: '봇 알림 대상 (선택)' },
  ],
  MACHINE: [
    { key: 'machine_name',  label: '기계명', required: true, placeholder: '예: 권선기 3호' },
    { key: 'serial_number', label: '시리얼 번호', placeholder: '(선택)' },
    { key: 'description',   label: '설명', placeholder: '(선택)', kind: 'textarea' },
  ],
  SHARED: [
    { key: 'display_name', label: '표시명', required: true, placeholder: '예: QC 공용' },
    { key: 'department',   label: '부서 메모', placeholder: '(선택 · 자유 입력 — 조직 소속은 아래 관리 부서)' },
    { key: 'description',  label: '설명', placeholder: '(선택)', kind: 'textarea' },
  ],
}

// 종류별 생성 API + payload 빌더 (선택 종류에 맞는 엔드포인트로 라우팅)
const CREATE_FN = {
  PERSON:  createPersonAccount,
  MACHINE: createMachineAccount,
  SHARED:  createSharedAccount,
}

// 권한 출처 표 — BE explain 의 kind → 칩 클래스 (주 역할 / 부서 상속 / 개인 허용)
const SRC_CLASS = { role: 'srcRole', dept: 'srcDept', grant: 'ovGrant' }

const buildCreatePayload = (form) => {
  const base = {
    login_id: form.login_id.trim(),
    password: form.password,
    location_id: Number(form.location_id),
    role: form.role,
  }
  if (form.account_type === 'PERSON') {
    return {
      ...base,
      name: form.display_name.trim(),
      employee_id: form.employee_id.trim(),
      email: form.email.trim(),
      birth: form.birth || null,
      phone: form.phone.trim(),
      employee_type: form.employee_type,
      worker_code: form.worker_code.trim(),
      nw_user_id: form.nw_user_id.trim(),
    }
  }
  if (form.account_type === 'MACHINE') {
    return {
      ...base,
      machine_name: form.machine_name.trim(),
      serial_number: form.serial_number.trim(),
      description: form.description.trim(),
    }
  }
  return {
    ...base,
    display_name: form.display_name.trim(),
    department: form.department.trim(),
    description: form.description.trim(),
  }
}

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
  account_type: 'PERSON',
  login_id: '',
  password: '',
  location_id: '',
  role: Role.GENERAL_ADMIN,   // 안전 기본값 (역할 로드 후에도 유지)
  // 공통 신원 / PERSON 이름 / SHARED 표시명
  display_name: '',
  email: '',
  // PERSON 전용
  employee_id: '',
  birth: '',
  phone: '',
  employee_type: 'E',
  worker_code: '',   // 작업자 코드 — LOT worker 자동입력 (사람 계정)
  nw_user_id: '',    // 네이버웍스 봇 DM 대상 ID (사람 계정). 빈값이면 메일로만 받는다
  // MACHINE 전용
  machine_name: '',
  serial_number: '',
  // MACHINE·SHARED 공용
  description: '',
  // SHARED 전용
  department: '',
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
  // 편집 시 작업자 코드 원본이 실제로 로드됐는지 — 실패 시 저장 patch 에서 worker_code 제외(빈값 덮어쓰기=코드 지움 방지)
  const [editWorkerLoaded, setEditWorkerLoaded] = useState(false)
  // 소속(부서·팀) — 전체 교체 방식이라 화면이 목록을 통째로 들고 있는다
  const [depts, setDepts] = useState([])            // 선택지 — 사용 중지 부서 포함(이미 속한 계정에서만 보인다)
  const [myDepts, setMyDepts] = useState([])        // 편집 중 계정의 소속 id 목록
  const [myPrimary, setMyPrimary] = useState(null)  // 그중 주 소속
  // 소속 원본 { ids, primary } — null = 불러오지 못함. 그땐 저장에서 소속을 **건드리지 않는다**
  //   (예전엔 빈 목록으로 두고 그대로 PUT 해서 조회가 한 번 실패하면 소속이 전부 지워졌다, 2026-09-21)
  const [deptOrig, setDeptOrig] = useState(null)
  // 연 시점의 주 역할 — 전보(주 소속 변경) 저장 때 '역할도 같이 바꿨나' 를 본다 (부서 2단계 §2.4)
  const [origRole, setOrigRole] = useState('')
  // 지난 소속(끝난 소속) — 누를 때만 불러온다. null = 아직 안 불러옴. ★ 편집값(myDepts)과 섞지 않는다
  const [pastDepts, setPastDepts] = useState(null)

  // 계정 클릭 시 온디맨드 상세(권한 연동값) — 목록엔 안 싣고 펼칠 때만 조회 (2026-07-16)
  // 검색 — 38명을 스크롤로 찾던 것을 이름·아이디·역할·부서로 거른다 (2026-09-23)
  const [q, setQ] = useState('')
  // 2분할은 넓은 화면에서만. 좁으면 한 칸을 번갈아 쓴다(목록 ↔ 상세)
  const narrow = useMobile(BP.laptop)
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
    setEditWorkerLoaded(false)
    setMyDepts([])
    setMyPrimary(null)
    setDeptOrig({ ids: [], primary: null })
    setOrigRole('')
    setPastDepts(null)
    setForm({ ...EMPTY_FORM, location_id: locations[0]?.id ?? '' })
    setShow(true)
  }

  // 부서 선택지는 화면 진입 시 한 번만 — 계정 수만큼 부르지 않는다.
  //   사용 중지 부서도 받는다: 이미 거기 속한 계정은 그 소속을 보고 해제할 수 있어야 한다(안 받으면 안 보이는 채 남는다).
  useEffect(() => {
    getDepartments(true).then(setDepts).catch(() => setDepts([]))
  }, [])

  const openEdit = async (u) => {
    const at = u.account_type || 'PERSON'
    // PERSON 이면 현재 작업자 코드를 상세에서 로드(목록엔 없음). 실패하면 미로드로 두어 저장 시 건드리지 않음.
    let workerCode = ''
    let nwUserId = ''
    let person = {}
    setEditWorkerLoaded(at !== 'PERSON')   // 비-PERSON 은 애초에 patch 대상 아님
    if (at === 'PERSON') {
      try {
        const d = await getUserDetail(u.id)
        workerCode = d.profile?.worker_code || ''
        nwUserId = d.profile?.nw_user_id || ''
        person = d.profile || {}
        setEditWorkerLoaded(true)
      } catch { /* 로드 실패 → editWorkerLoaded=false 유지 → 저장에서 worker_code 제외 */ }
    }
    // 소속 — 실패하면 원본을 null 로 두어 저장 시 소속을 건드리지 않는다(deptOrig 판정)
    try {
      const mine = await getAccountDepartments(u.id)
      const ids = mine.map((m) => m.department_id)
      const primary = mine.find((m) => m.is_primary)?.department_id ?? null
      setMyDepts(ids)
      setMyPrimary(primary)
      setDeptOrig({ ids, primary })
    } catch {
      setMyDepts([])
      setMyPrimary(null)
      setDeptOrig(null)
    }
    setEditingId(u.id)
    setOrigRole(u.role)
    setPastDepts(null)
    setForm({
      ...EMPTY_FORM,
      account_type: at,
      login_id: u.login_id,
      display_name: u.display_name || '',
      email: u.email || '',
      password: '',  // 수정 모드: 빈값 = 비밀번호 유지
      location_id: u.location_id,
      role: u.role,
      worker_code: workerCode,
      nw_user_id: nwUserId,
      // 인사 상세 — 생성에서만 받던 값을 수정에서도 연다 (2026-09-16)
      employee_id: person.employee_id || '',
      birth: person.birth || '',
      phone: person.phone || '',
      employee_type: person.employee_type || 'E',
    })
    setShow(true)
  }

  const closeModal = () => {
    if (saving) return
    setShow(false)
  }

  // 보낼 소속 — 사람 계정은 그대로. 기계·공용 계정은 관리 부서 하나(설계 D5).
  //   ★ 예전 규칙으로 2개 이상이 들어간 기계·공용 계정은 **조용히 줄이지 않는다** — 사람이 하나만 남길 때까지 소속은 안 보낸다
  //     (예전엔 이름만 고쳐 저장해도 주 소속 외 소속이 말없이 지워졌다). 화면에 경고를 띄운다.
  const deptPayload = () => ({ ids: myDepts, primary: myPrimary })
  const deptTooMany = form.account_type !== 'PERSON' && myDepts.length > 1
  const deptChanged = (ids, primary) => {
    if (!deptOrig || deptTooMany) return false
    const a = [...ids].sort((x, y) => x - y).join(',')
    const b = [...deptOrig.ids].sort((x, y) => x - y).join(',')
    return a !== b || (primary ?? null) !== (deptOrig.primary ?? null)
  }

  const handleSave = async () => {
    const isCreate = !editingId
    if (isCreate && !form.login_id.trim()) return setError('로그인 ID를 입력해주세요.')
    if (isCreate && form.password.length < 4) return setError('비밀번호는 4자 이상이어야 합니다.')
    if (!form.location_id) return setError('공장을 선택해주세요.')
    if (!form.role) return setError('role을 선택해주세요.')
    if (isCreate) {
      const t = form.account_type
      if (t === 'PERSON' && !form.display_name.trim()) return setError('이름을 입력해주세요.')
      if (t === 'MACHINE' && !form.machine_name.trim()) return setError('기계명을 입력해주세요.')
      if (t === 'SHARED' && !form.display_name.trim()) return setError('표시명을 입력해주세요.')
    }

    // 전보 — 사람 계정의 주 소속이 **다른 부서로** 바뀌면 주 역할 재확인을 받는다 (부서 2단계 §2.4, BE 가 강제).
    //   부서에서 물려받던 역할은 소속이 닫히며 자동으로 빠지지만, 주 역할은 그대로 따라가기 때문이다.
    //   같은 저장에서 주 역할도 바꿨으면 그게 재확인이다. ★ 저장을 시작하기 **전에** 묻는다(반쯤 저장되지 않게).
    let roleReviewed = false
    const dpNow = deptPayload()
    const isTransfer = !!editingId && form.account_type === 'PERSON'
      && deptOrig?.primary != null && dpNow.primary != null
      && dpNow.primary !== deptOrig.primary && deptChanged(dpNow.ids, dpNow.primary)
    if (isTransfer) {
      if (form.role !== origRole) {
        roleReviewed = true
      } else {
        const deptName = (id) => depts.find((d) => d.id === id)?.name || `#${id}`
        const roleName = roleOptions.find((r) => r.key === form.role)?.label || form.role
        const ok = await confirm({
          title: '전보 — 주 역할 확인',
          message: `주 소속이 '${deptName(deptOrig.primary)}' → '${deptName(dpNow.primary)}' 로 바뀝니다.\n\n`
            + `부서에서 물려받던 역할은 자동으로 바뀌지만, 주 역할 '${roleName}' 은(는) 그대로 따라갑니다.\n`
            + '새 부서에서도 이 주 역할이 맞으면 저장하세요. 아니면 취소하고 주 역할을 먼저 바꿔주세요.\n\n'
            + '(확인 기록이 권한 변경 이력에 남습니다)',
          confirmText: '이 역할 그대로 저장',
        })
        if (!ok) return
        roleReviewed = true
      }
    }

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
        // 작업자 코드 — PERSON + 원본 로드 성공 시만(로드 실패 시 제외해 기존 코드 보존)
        if (form.account_type === 'PERSON' && editWorkerLoaded) {
          patch.worker_code = form.worker_code.trim()
          patch.nw_user_id = form.nw_user_id.trim()
          patch.employee_id = form.employee_id.trim()
          patch.birth = form.birth || ''
          patch.phone = form.phone.trim()
          patch.employee_type = form.employee_type
        }
        await updateUser(editingId, patch)
        // 소속은 별도 엔드포인트다(계정 API 와 분리). 실패해도 계정 수정은 이미 끝났으므로
        //   메시지로만 알리고 흐름을 막지 않는다. ★ 바뀐 게 있을 때만 보낸다(불러오지 못했으면 안 보낸다).
        const dp = deptPayload()
        if (deptChanged(dp.ids, dp.primary)) {
          try {
            await setAccountDepartments(editingId, dp.ids, dp.primary, roleReviewed)
          } catch (de) {
            setError(`계정은 수정됐지만 소속 저장에 실패했습니다: ${de.message}`)
          }
        }
        setMsg(`수정 완료: ${form.login_id}`)
      } else {
        const created = await CREATE_FN[form.account_type](buildCreatePayload(form))
        // 소속 — 계정 id 가 생긴 뒤에야 저장할 수 있다
        const dp = deptPayload()
        if (dp.ids.length > 0 && created?.id) {
          try {
            await setAccountDepartments(created.id, dp.ids, dp.primary)
          } catch (de) {
            setError(`계정은 만들었지만 소속 저장에 실패했습니다: ${de.message}`)
          }
        }
        setMsg(`생성 완료: ${form.login_id} (${ACCOUNT_TYPE_LABEL[form.account_type]})`)
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
  // 오른쪽 칸에 띄울 계정을 고른다. 같은 계정을 다시 눌러도 닫지 않는다 —
  //   2분할에서 닫으면 오른쪽이 빈 칸이 되어 '고장난 화면'처럼 보인다.
  const selectUser = async (u) => {
    if (detailId === u.id && detail) return
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

  // 화면에 보일 목록 — 비활성은 늘 아래로, 검색어는 이름·아이디·역할·부서에 건다.
  //   ★ 서버 필터(role·활성만)는 그대로 두고 검색만 화면에서 — 38명 남짓이라 BE 를 늘릴 이유가 없다.
  const kw = q.trim().toLowerCase()
  const shown = [...users]
    .sort((a, b) => Number(b.active) - Number(a.active))
    .filter((u) => !kw || [
      u.display_name, u.login_id, roleLabelMap[u.role] || u.role, u.primary_department?.name,
    ].some((v) => (v || '').toLowerCase().includes(kw)))
  // 오른쪽 칸에 띄울 계정 — 목록 행에서 찾는다(활성 토글 직후에도 바로 반영된다)
  const sel = users.find((u) => u.id === detailId) || null

  // 모달 프로필 입력 필드 (텍스트/이메일/날짜/textarea) — 반복 축소
  const renderInput = (key, label, opts = {}) => (
    <div className={s.field} key={key}>
      <label className={s.label}>{label}{opts.required ? ' *' : ''}</label>
      {opts.kind === 'textarea' ? (
        <textarea
          className={`${s.input} ${s.taInput}`}
          rows={2}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={opts.placeholder}
          disabled={saving}
        />
      ) : (
        <input
          type={opts.type || 'text'}
          className={s.input}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={opts.placeholder}
          disabled={saving}
        />
      )}
    </div>
  )

  // ── 생성·수정 = 페이지 (2026-09-22, 사용자: "모달이 너무 작아서 정보를 못 담음") ──
  //   예전엔 480px 모달이라 필드가 한 줄로 길게 쌓였고, 소속 목록은 높이 200px 에 갇혔다.
  //   ★ 저장 실패 메시지가 **모달 뒤 목록 화면에만** 떠서 안 보이던 문제도 같이 풀린다 — 이제 이 화면 위에 뜬다.
  //   상태·핸들러는 그대로다(열기 = setShow(true), 닫기 = closeModal). 감싸는 틀만 모달 → 페이지로 바꿨다.
  if (show) {
    return (
      <div className="page-flat">
        <PageHeader
          title={editingId ? '계정 수정' : '새 계정 생성'}
          subtitle={editingId ? form.login_id : '계정 종류부터 고르세요'}
          onBack={closeModal}
        />
        {error && <p className={s.msgErr}>⚠ {error}</p>}
        <div className={s.editPage}>
          <div className={s.formBody}>
            {/* 계정 종류 — 생성 시만 (수정은 종류 고정) */}
            {!editingId && (
              <div className={`${s.field} ${s.wide}`}>
                <label className={s.label}>계정 종류 *</label>
                <div className={s.typeSeg}>
                  {ACCOUNT_TYPES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      className={`${s.typeSegBtn} ${form.account_type === t.key ? s.typeSegBtnOn : ''}`}
                      onClick={() => {
                        setForm({ ...form, account_type: t.key })
                        if (t.key !== 'PERSON' && myDepts.length > 1) {
                          const one = myPrimary != null && myDepts.includes(myPrimary) ? myPrimary : myDepts[0]
                          setMyDepts([one])
                          setMyPrimary(one)
                        }
                      }}
                      disabled={saving}
                    >
                      <span className={s.typeSegLabel}>{t.label}</span>
                      <span className={s.typeSegHint}>{t.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 로그인 ID */}
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

            {/* 비밀번호 */}
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

            {/* 공장 */}
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

            {/* Role */}
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

            {/* 소속(부서·팀) — 생성·수정 모두 (생성은 계정을 만든 뒤 이어서 저장).
                ★ 사람 계정은 겸직을 허용하므로 다중 선택이고, 그중 하나가 **주 소속**이다(표시·보고의 기준).
                  주 소속을 안 고르면 서버가 첫 번째를 주로 삼는다 — 기준 없는 소속을 만들지 않는다.
                ★ 기계·공용 계정은 **관리 부서 하나** (설계 D5 — 여럿이 쓰는 계정에 겸직·상속을 주지 않는다).
                ★ 사용 중지된 부서는 이미 속해 있던 경우에만 보이고, 해제만 할 수 있다. */}
            <div className={`${s.field} ${s.wide}`}>
              <label className={s.label}>
                {form.account_type === 'PERSON' ? '소속 (겸직 가능 · ★ = 주 소속)' : '관리 부서 (하나)'}
              </label>
              {editingId && !deptOrig ? (
                <p className={s.deptEmpty}>소속을 불러오지 못했습니다 — 이번 저장에서 소속은 바뀌지 않습니다.</p>
              ) : (
                <div className={s.deptBox}>
                  {deptTooMany && (
                    <p className={s.deptWarn}>
                      관리 부서는 하나만 둡니다 — 하나만 남기고 해제해야 소속이 저장됩니다(그 전까지는 지금 소속 그대로).
                    </p>
                  )}
                  {depts
                    .filter((d) => d.active || myDepts.includes(d.id) || deptOrig?.ids.includes(d.id))
                    .map((d) => {
                      const on = myDepts.includes(d.id)
                      const single = form.account_type !== 'PERSON'
                      // 상위가 사용 중지된 팀 — 목록에서 상위가 빠져 바로 위 부서의 팀처럼 보이지 않게 상위 이름을 붙인다
                      const parentOff = d.is_team && !d.parent_active
                      // 새로 주 소속이 될 수 있는 부서 — 사용 중지(또는 상위가 사용 중지)면 기존 주 소속일 때만 (BE 422 와 같은 규칙)
                      const usable = d.active && !parentOff
                      const canStar = usable || d.id === deptOrig?.primary
                      return (
                        <div key={d.id} className={s.deptRow}>
                          <label className={d.is_team ? s.deptTeam : s.deptName}>
                            <input
                              type="checkbox" checked={on} disabled={saving}
                              onChange={() => {
                                const next = on
                                  ? myDepts.filter((i) => i !== d.id)
                                  : single ? [d.id] : [...myDepts, d.id]   // 관리 부서는 하나 — 새로 고르면 바꾼다
                                setMyDepts(next)
                                if (single && !on) { setMyPrimary(d.id); return }
                                // 주 소속을 해제하면 기준이 사라진다 → 남은 것 중 **쓸 수 있는 부서**로 옮긴다
                                //   (사용 중지 부서로 옮기면 저장이 422 로 막힌다)
                                if (on && myPrimary === d.id) {
                                  const ok = next.find((i) => {
                                    const x = depts.find((y) => y.id === i)
                                    return x && x.active && !(x.is_team && !x.parent_active)
                                  })
                                  setMyPrimary(ok ?? next[0] ?? null)
                                }
                                if (!on && myPrimary == null) setMyPrimary(d.id)
                              }}
                            />
                            {d.is_team ? `└ ${d.name}` : d.name}
                            {parentOff && <span className={s.deptOff}>상위 '{d.parent_name}' 사용 중지</span>}
                            {!d.active && <span className={s.deptOff}>사용 중지</span>}
                          </label>
                          {on && !single && canStar && (
                            <button
                              type="button" disabled={saving}
                              className={myPrimary === d.id ? s.starOn : s.star}
                              title="주 소속으로"
                              onClick={() => setMyPrimary(d.id)}
                            >
                              ★
                            </button>
                          )}
                        </div>
                      )
                    })}
                  {depts.length === 0 && (
                    <p className={s.deptEmpty}>부서가 없습니다. 부서 관리에서 먼저 등록해주세요.</p>
                  )}
                </div>
              )}
              {/* 지난 소속 (1.5b 기간) — 끝난 소속은 지우지 않고 닫아 두므로 '언제 어디였나' 를 되짚을 수 있다.
                  ★ 읽기 전용. 편집 목록(myDepts)에 섞으면 저장 때 되살아난다. */}
              {editingId && (
                pastDepts === null ? (
                  <button
                    type="button" className={s.pastBtn} disabled={saving}
                    onClick={() => getAccountDepartments(editingId, true)
                      .then((rows) => setPastDepts(rows.filter((m) => m.ended_at)))
                      .catch((e) => setError(`지난 소속을 불러오지 못했습니다: ${e.message}`))}
                  >
                    지난 소속 보기
                  </button>
                ) : pastDepts.length === 0 ? (
                  <p className={s.deptEmpty}>지난 소속이 없습니다.</p>
                ) : (
                  <ul className={s.pastList}>
                    {pastDepts.map((m) => (
                      <li key={`${m.department_id}-${m.ended_at}`}>
                        <b>{m.name}</b>
                        <span className={s.pastWhen}>
                          {m.started_at ? fmtKstDate(m.started_at) : '시작일 미상'} ~ {fmtKstDate(m.ended_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>

            {/* 프로필 — 수정: 공통 신원(이름/이메일)만 / 생성: 종류별 필드 */}
            {editingId ? (
              <>
                {renderInput('display_name', '이름', { placeholder: '실명 (예: 김철수)' })}
                {renderInput('email', '이메일', { type: 'email', placeholder: '(선택)' })}
                {form.account_type === 'PERSON' && renderInput('employee_id', '사번', { placeholder: '(선택)' })}
                {form.account_type === 'PERSON' && renderInput('birth', '생년월일', { type: 'date' })}
                {form.account_type === 'PERSON' && renderInput('phone', '연락처', { placeholder: '(선택)' })}
                {form.account_type === 'PERSON' && renderInput('worker_code', '작업자 코드', {
                  placeholder: editWorkerLoaded ? '영숫자 2자 (비우면 해제)' : '불러오는 중…',
                })}
                {form.account_type === 'PERSON' && renderInput('nw_user_id', '네이버웍스 ID', {
                  placeholder: editWorkerLoaded ? '봇 알림 대상 (비우면 해제)' : '불러오는 중…',
                })}
                {form.account_type === 'PERSON' && (
                  <div className={s.field}>
                    <label className={s.label}>직원 구분 (E/F/C)</label>
                    <div className={s.empSeg}>
                      {EMP_TYPES.map((et) => (
                        <button
                          key={et}
                          type="button"
                          className={`${s.empSegBtn} ${form.employee_type === et ? s.empSegBtnOn : ''}`}
                          onClick={() => setForm({ ...form, employee_type: et })}
                          disabled={saving}
                        >
                          {et}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className={s.sectionLabel}>{ACCOUNT_TYPE_LABEL[form.account_type]} 프로필</div>
                {TYPE_FIELDS[form.account_type].map((f) => renderInput(f.key, f.label, f))}
                {form.account_type === 'PERSON' && (
                  <div className={s.field}>
                    <label className={s.label}>직원 구분 (E/F/C)</label>
                    <div className={s.empSeg}>
                      {EMP_TYPES.map((et) => (
                        <button
                          key={et}
                          type="button"
                          className={`${s.empSegBtn} ${form.employee_type === et ? s.empSegBtnOn : ''}`}
                          onClick={() => setForm({ ...form, employee_type: et })}
                          disabled={saving}
                        >
                          {et}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className={s.editFooter}>
          <button type="button" className="btn-secondary btn-md" onClick={closeModal} disabled={saving}>
            취소
          </button>
          <button type="button" className="btn-primary btn-md" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : (editingId ? '수정' : '생성')}
          </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="계정 관리"
        subtitle="team_rnd 전용 — 계정 생성·role 변경·비활성화"
        onBack={onBack}
      />

      {msg && <p className={s.msgOk}>{msg}</p>}
      {error && <p className={s.msgErr}>⚠ {error}</p>}

      {/* 검색 + 필터 (2026-09-23) — 이름·아이디·역할·부서로 거른다 */}
      <div className={s.filterBar}>
        <span className={s.search}>
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            className={s.searchInput}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름 · 아이디 · 부서로 찾기"
          />
          {q && (
            <button type="button" className={s.searchClear} aria-label="검색어 지우기" onClick={() => setQ('')}>
              ✕
            </button>
          )}
        </span>
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
        <span className={s.count}>
          {shown.length === users.length ? `총 ${users.length}명` : `${shown.length} / ${users.length}명`}
        </span>
        <button type="button" className="btn-primary btn-sm" onClick={openCreate}>
          + 새 계정
        </button>
      </div>

      {loading && <p className={s.emptyTxt}>불러오는 중...</p>}

      {/* 2분할 (2026-09-23, 사용자 선택 B안) — 왼쪽에서 고르고 오른쪽에서 확인·편집.
          ★ 좁은 화면(<1024px)에선 칸이 하나뿐이라 고른 계정이 있으면 목록을 감춘다.
          ★ 편집·비활성 버튼은 오른쪽에 하나씩만 둔다 — 행마다 아이콘으로 두면 스치듯 눌린다. */}
      <div className={s.split}>
        {!(narrow && sel) && (
          <div className={s.pane}>
            {!loading && shown.length === 0 && (
              <p className={s.emptyTxt}>
                {users.length ? '검색 결과가 없습니다.' : '조건에 맞는 계정이 없습니다.'}
              </p>
            )}
            <ul className={s.list}>
              {shown.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={`${s.pick} ${detailId === u.id ? s.pickOn : ''} ${!u.active ? s.pickOff : ''}`}
                    onClick={() => selectUser(u)}
                  >
                    <span className={`${s.avatar} ${s.avatarSm} ${s['av_' + roleTone(u.role)]}`}>
                      {initials(u.display_name, u.login_id)}
                    </span>
                    <span className={s.pickTxt}>
                      <span className={s.pickName}>
                        {u.display_name || u.login_id}
                        {!u.active && <span className={s.offTag}>비활성</span>}
                      </span>
                      <span className={s.pickSub}>
                        {u.display_name ? `${u.login_id} · ` : ''}
                        {roleLabelMap[u.role] || u.role}
                        {u.primary_department ? ` · ${u.primary_department.name}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={s.detailPane}>
          {!sel && !loading && (
            <p className={s.emptyTxt}>왼쪽에서 계정을 고르면 여기에 자세히 나옵니다.</p>
          )}
          {sel && (
            <>
              {narrow && (
                <button
                  type="button"
                  className={s.backBtn}
                  onClick={() => { setDetailId(null); setDetail(null) }}
                >
                  ← 목록으로
                </button>
              )}

              <div className={s.detHead}>
                <span className={`${s.avatar} ${s.avatarLg} ${s['av_' + roleTone(sel.role)]}`}>
                  {initials(sel.display_name, sel.login_id)}
                </span>
                <div className={s.detHeadTxt}>
                  <div className={s.detName}>
                    {sel.display_name || sel.login_id}
                    <span className={`${s.typeBadge} ${s['tb_' + (sel.account_type || 'PERSON').toLowerCase()]}`}>
                      {ACCOUNT_TYPE_LABEL[sel.account_type] || '사람'}
                    </span>
                    <span className={`${s.roleBadge} ${s['rb_' + roleTone(sel.role)]}`}>
                      {roleLabelMap[sel.role] || sel.role}
                    </span>
                  </div>
                  <p className={s.subLine}>
                    {sel.display_name && (
                      <>
                        <span className={s.subId}>{sel.login_id}</span>
                        <span className={s.sep}>·</span>
                      </>
                    )}
                    <span className={`${s.statusDot} ${sel.active ? s.dotOn : s.dotOff}`} />
                    {sel.active ? '활성' : '비활성'}
                    <span className={s.sep}>·</span>
                    <IconFactory />
                    {locLabel(sel.location_id)}
                    {sel.primary_department && (
                      <>
                        <span className={s.sep}>·</span>
                        {sel.primary_department.name}
                        {!sel.primary_department.active && ' (사용 중지)'}
                      </>
                    )}
                  </p>
                </div>
                <div className={s.detBtns}>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => openEdit(sel)}>
                    <IconPencil /> 편집
                  </button>
                  <button
                    type="button"
                    className={`btn-secondary btn-sm ${sel.active ? s.btnDanger : s.btnRestore}`}
                    onClick={() => handleToggleActive(sel)}
                  >
                    {sel.active ? <IconToggleOn /> : <IconToggleOff />}
                    {sel.active ? ' 비활성' : ' 되살리기'}
                  </button>
                </div>
              </div>

              {/* 권한 연동값 — 고른 계정만 온디맨드로 조회 */}
              {detailLoading && <span className={s.detailMuted}>불러오는 중…</span>}
              {!detailLoading && detail && (
                <div className={s.detailGrid}>
                    <div className={s.detailItem}>
                      <span className={s.detailKey}>이메일</span>
                      <span>{detail.email || '—'}</span>
                    </div>
                    <div className={s.detailItem}>
                      <span className={s.detailKey}>담당 프린터</span>
                      <span><IconPrinter /> {detail.printer_name || '미지정'}</span>
                    </div>
                    <div className={s.detailItem}>
                      <span className={s.detailKey}>권한</span>
                      {detail.role === 'team_rnd'
                        ? <span className={s.permRnd}>전권 — 모든 기능</span>
                        : <span>실효 {detail.effective_features.length}개 (주 역할 기본 {detail.role_features.length}개)</span>}
                    </div>
                    {/* 맡은 책임 — 부서장 (4단계, 2026-09-23). 지정은 부서 관리에서 */}
                    {(detail.managed_departments || []).length > 0 && (
                      <div className={s.detailItem}>
                        <span className={s.detailKey}>부서장</span>
                        <span>{detail.managed_departments.join(', ')}</span>
                      </div>
                    )}
                    {/* 부서에서 물려받은 역할 (2단계) — 어느 소속을 통해 왔는지 같이 */}
                    {detail.role !== 'team_rnd' && (detail.inherited_roles || []).length > 0 && (
                      <div className={s.detailItem}>
                        <span className={s.detailKey}>부서 상속</span>
                        <span className={s.ovWrap}>
                          {detail.inherited_roles.map((r) => (
                            <span key={r.key} className={s.srcDept}>{r.label} ← {(r.via || []).join(', ') || '부서'}</span>
                          ))}
                        </span>
                      </div>
                    )}
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
                    {/* 권한 출처 표 (2단계, 설계 §2.3) — 기능마다 주 역할 / 부서(경로) / 개인 허용 중 어디서 왔나.
                        BE 가 판정과 같은 캐시로 만든다(FE 는 계산하지 않는다). 옛 BE 면 필드가 없어 칩 목록으로 떨어진다. */}
                    {detail.role !== 'team_rnd' && Array.isArray(detail.permission_sources) ? (
                      detail.permission_sources.length > 0 && (
                        <table className={s.srcTable}>
                          <thead>
                            <tr><th>기능</th><th>출처</th></tr>
                          </thead>
                          <tbody>
                            {detail.permission_sources.map((f) => (
                              <tr key={f.key} className={f.on ? '' : s.srcOff}>
                                <td>
                                  <span className={s.srcLabel}>{f.label}</span>
                                  <code className={s.srcKey}>{f.key}</code>
                                </td>
                                <td>
                                  <span className={s.ovWrap}>
                                    {f.from.map((x) => (
                                      <span key={`${x.kind}:${x.text}`} className={SRC_CLASS[x.kind] ? s[SRC_CLASS[x.kind]] : s.srcRole}>
                                        {x.text}
                                      </span>
                                    ))}
                                    {f.denied && <span className={s.ovDeny}>개인 차단</span>}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    ) : detail.role !== 'team_rnd' && detail.effective_features.length > 0 && (
                      <div className={s.featWrap}>
                        {detail.effective_features.map((f) => (
                          <span key={f} className={s.featChip}>{f}</span>
                        ))}
                      </div>
                    )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
