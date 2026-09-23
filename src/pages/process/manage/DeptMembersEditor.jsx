// src/pages/process/manage/DeptMembersEditor.jsx
// 부서 관리 — 행 아래에 펼치는 소속원 편집 (2026-09-23, 사용자 "부서 관리 기능에서 진행될 수 있으면").
//   ★ 소속은 계정당 **한 곳**(같은 날 결정 — 주 소속·겸직 폐기). 다른 곳에 있던 사람을 넣으면 '옮기기(전보)' 다.
//     저장 전에 "품질 → 와이어" 로 알려 확인을 받고 role_reviewed 로 보낸다(BE 가 없으면 422). 빼기 = 소속 없음.
//   ★ 저장은 부서 단위 전체 교체(BE set_members) — 한 사람이라도 막히면 이름이 붙은 오류가 오고 아무것도 저장되지 않는다.
//   ★ canEdit=false(소속 지정 권한 admin.users 없음)면 목록만 보인다 — 부서 마스터 담당도 인원은 확인해야 한다.
//   ★ 후보(활성 계정 전부)는 처음 편집할 때 한 번만 불러온다 — 부서장 지정과 같은 방식.
import { useEffect, useState } from 'react'

import { useConfirm } from '@/contexts/ConfirmDialogContext'
import { getDepartmentMembers, listMemberCandidates, setDepartmentMembers } from '@/api'
import s from './DepartmentManagePage.module.css'

// 사람이 아닌 계정은 배지로 — 관리 부서일 뿐 상속을 받지 않는다(설계 D5)
const TYPE_BADGE = { MACHINE: '기계', SHARED: '공용' }

export default function DeptMembersEditor({ dept, canEdit, onSaved, onError }) {
  const confirm = useConfirm()
  const [members, setMembers] = useState(null)     // null = 불러오는 중
  const [draft, setDraft] = useState([])           // 편집본
  const [cands, setCands] = useState(null)         // 후보 — null = 아직 안 불러옴
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    getDepartmentMembers(dept.id)
      .then((rows) => { if (alive) setMembers(rows) })
      .catch((e) => { if (alive) { setMembers([]); onError(e.message) } })
    return () => { alive = false }
  }, [dept.id])   // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = async () => {
    setDraft(members || [])
    setEditing(true)
    if (cands === null) {
      try { setCands(await listMemberCandidates()) } catch (e) { setCands([]); onError(e.message) }
    }
  }
  const add = (id) => {
    const c = (cands || []).find((x) => x.account_id === id)
    if (!c || draft.some((m) => m.account_id === id)) return
    // 다른 곳에 있던 사람 — 어디서 오는지 칩에 보여 저장 전에 눈에 띄게
    setDraft([...draft, { ...c, moving_from: c.unit && c.unit.id !== dept.id ? c.unit.name : '' }])
  }
  const remove = (id) => setDraft(draft.filter((m) => m.account_id !== id))

  const save = async () => {
    const ids = draft.map((m) => m.account_id)
    const moves = draft.filter((m) => m.moving_from)
    let roleReviewed = false
    if (moves.length > 0) {
      // 전보 — 주 역할·개인 권한은 그대로 따라간다는 걸 알리고 확인을 받는다(계정 화면의 전보 확인과 같은 뜻)
      const ok = await confirm({
        title: '다른 부서에서 옮깁니다',
        message: moves.map((m) => `· ${m.name}: ${m.moving_from} → ${dept.name}`).join('\n')
          + '\n\n이전 소속은 닫히고(이력에 남음) 주 역할·개인 권한은 그대로 따라갑니다. 부서가 물려주는 역할만 바뀝니다.',
        confirmText: '옮기고 저장',
      })
      if (!ok) return
      roleReviewed = true
    }
    setBusy(true)
    try {
      const rows = await setDepartmentMembers(dept.id, ids, roleReviewed)
      setMembers(rows)
      setEditing(false)
      onSaved(rows.length)
    } catch (e) {
      onError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const list = editing ? draft : (members || [])
  return (
    <div className={s.memBox}>
      {members === null ? <span className={s.mgrNone}>불러오는 중…</span> : (
        <>
          <div className={s.mgrChips}>
            {list.map((m) => (
              <span
                key={m.account_id}
                className={m.active === false ? `${s.mgrChip} ${s.mgrOff}` : s.mgrChip}
                title={m.active === false ? '비활성 계정' : (m.role_label || '')}
              >
                {m.name}
                {TYPE_BADGE[m.account_type] && <span className={s.memType}>{TYPE_BADGE[m.account_type]}</span>}
                {m.moving_from && <span className={s.memMove}>← {m.moving_from}</span>}
                {editing && (
                  <button
                    type="button" className={s.mgrX} aria-label="빼기" disabled={busy}
                    onClick={() => remove(m.account_id)}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {list.length === 0 && <span className={s.mgrNone}>소속원 없음</span>}
          </div>
          {editing ? (
            <div className={s.mgrEdit}>
              {dept.active ? (
                <select
                  className="form-input" value="" disabled={busy || cands === null}
                  onChange={(e) => add(Number(e.target.value))}
                >
                  <option value="">{cands === null ? '불러오는 중…' : '사람 추가…'}</option>
                  {(cands || [])
                    .filter((c) => !draft.some((m) => m.account_id === c.account_id))
                    .map((c) => (
                      <option key={c.account_id} value={c.account_id}>
                        {c.name}
                        {TYPE_BADGE[c.account_type] ? ` (${TYPE_BADGE[c.account_type]})` : ''}
                        {c.unit && c.unit.id !== dept.id ? ` — 현재 ${c.unit.name}` : ''}
                      </option>
                    ))}
                </select>
              ) : (
                <span className={s.mgrNone}>사용 중지된 부서 — 빼기만 됩니다</span>
              )}
              <div className={s.mgrBtns}>
                <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => setEditing(false)}>취소</button>
                <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={save}>저장</button>
              </div>
            </div>
          ) : canEdit ? (
            <button type="button" className={s.nameBtn} onClick={startEdit}>소속원 편집</button>
          ) : (
            <span className={s.mgrNone}>소속 지정은 계정 관리 권한이 필요합니다</span>
          )}
        </>
      )}
    </div>
  )
}
