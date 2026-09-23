// src/pages/process/manage/DepartmentManagePage.jsx
// 부서(조직) 관리 — 1단계 (2026-09-17). 설계: docs/department-design.md
//   ★ 삭제가 없다. 끄려면 '사용 중지'(active=false) 를 누른다 — 지우면 "작년에 이 사람이 왜
//     그 권한이었나" 에 답할 수 없다(ISO 27001 A.5.18). 그래서 화면에도 삭제 버튼을 두지 않는다.
//   ★ 부서 코드는 만든 뒤 바꾸지 않는다(시드·참조의 키). 이름만 고친다.
//   ★ 사용 중지·다시 사용은 **영향 미리보기**를 먼저 본다(부서 2단계 §2.6-3, 2026-09-22) — 부서가 역할을
//     물려주므로 끄고 켜는 일이 곧 소속원 권한 회수·부여다. 현재 소속 인원도 같이 알린다(§5.1).
import { useCallback, useEffect, useState } from 'react'

import PageHeader from '@/components/common/PageHeader'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import {
  createDepartment, getDepartments, previewDepartment, updateDepartment,
  listManagerCandidates, setDepartmentManagers,
} from '@/api'
import s from './DepartmentManagePage.module.css'

// 미리보기 확인창 본문 — 권한이 바뀌는 사람을 최대 8명까지 줄로 보인다(확인창은 줄바꿈을 그대로 보여 준다)
const MAX_LINES = 8
function impactText(pv) {
  const name = (k) => pv.labels?.[k]
  return pv.affected.slice(0, MAX_LINES).map((a) => {
    const g = a.gained.map(name).filter(Boolean)
    const l = a.lost.map(name).filter(Boolean)
    const parts = [...g.map((x) => `+${x}`), ...l.map((x) => `−${x}`)]
    return `· ${a.name} (${a.role_label}) ${parts.length ? parts.join(' ') : '— 기능 변화 없음'}`
  }).join('\n') + (pv.affected.length > MAX_LINES ? `\n… 외 ${pv.affected.length - MAX_LINES}명` : '')
}

const EMPTY = { code: '', name: '', sort_order: 100, parent_id: '' }

export default function DepartmentManagePage() {
  const confirm = useConfirm()
  const [items, setItems] = useState([])
  const [showOff, setShowOff] = useState(false)   // 사용 중지된 부서까지 보기
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)      // 이름 편집 중인 행
  const [editName, setEditName] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  // 부서장 (4단계, 2026-09-23) — 행 안에서 바로 지정한다. 후보(활성 사람 계정)는 처음 편집할 때 한 번만 불러온다.
  //   ★ 최상위 부서만(팀장은 보류 — 팀 소속원 의뢰는 상위 부서장이 본다). 복수·대리 허용.
  const [mgrEdit, setMgrEdit] = useState(null)    // 편집 중인 부서 id
  const [mgrDraft, setMgrDraft] = useState([])    // 편집본 — account_id 목록
  const [cands, setCands] = useState(null)        // null = 아직 안 불러옴

  const load = useCallback(async (inactive) => {
    try {
      setItems(await getDepartments(inactive))
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    }
  }, [])

  useEffect(() => { load(showOff) }, [load, showOff])

  const add = async () => {
    const code = form.code.trim().toUpperCase()
    const name = form.name.trim()
    if (!code) return setMsg({ type: 'err', text: '부서 코드를 입력해주세요.' })
    if (!name) return setMsg({ type: 'err', text: '부서 이름을 입력해주세요.' })
    setBusy(true); setMsg(null)
    try {
      await createDepartment({
        code, name,
        sort_order: Number(form.sort_order) || 100,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
      })
      setForm(EMPTY)
      await load(showOff)
      setMsg({ type: 'ok', text: `'${name}' 부서를 추가했습니다.` })
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const patch = async (id, body, okText) => {
    setBusy(true); setMsg(null)
    try {
      await updateDepartment(id, body)
      await load(showOff)
      if (okText) setMsg({ type: 'ok', text: okText })
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  // 사용 중지·다시 사용 — 미리보기 → (영향이 있으면) 확인 → 저장
  const toggleActive = async (d) => {
    const body = { active: !d.active }
    let pv
    setBusy(true); setMsg(null)
    try {
      pv = await previewDepartment(d.id, body)
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
      return
    } finally {
      setBusy(false)
    }
    if (pv.locked) {
      setMsg({
        type: 'err',
        text: `'${d.name}' 은(는) 역할 매핑이 걸린 부서라 사용 여부를 바꾸면 소속원 권한이 달라집니다 (${pv.affected.length}명). 권한 관리자에게 요청해주세요.`,
      })
      return
    }
    const lines = []
    if (d.active && pv.members > 0) {
      lines.push(`현재 소속 ${pv.members}명(하위 팀 포함)은 그대로 남습니다. 해제는 계정 관리에서 합니다.`)
    }
    if (pv.affected.length > 0) {
      lines.push(`권한이 바뀌는 사람 ${pv.affected.length}명 — 부서가 물려주던 역할이 ${d.active ? '빠집니다' : '다시 붙습니다'}.`)
      lines.push(impactText(pv))
    }
    if (lines.length > 0) {
      const ok = await confirm({
        title: d.active ? `'${d.name}' 사용 중지` : `'${d.name}' 다시 사용`,
        message: lines.join('\n\n'),
        confirmText: d.active ? '사용 중지' : '다시 사용',
        danger: d.active,
      })
      if (!ok) return
    }
    await patch(d.id, body, d.active ? `'${d.name}' 을(를) 사용 중지했습니다.` : null)
  }

  const openMgr = async (d) => {
    setMgrEdit(d.id); setMgrDraft((d.managers || []).map((m) => m.account_id)); setMsg(null)
    if (cands === null) {
      try { setCands(await listManagerCandidates()) } catch (e) { setCands([]); setMsg({ type: 'err', text: e.message }) }
    }
  }
  const saveMgr = async (d) => {
    setBusy(true); setMsg(null)
    try {
      await setDepartmentManagers(d.id, mgrDraft)
      setMgrEdit(null)
      await load(showOff)
      setMsg({ type: 'ok', text: `'${d.name}' 부서장을 저장했습니다.` })
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }
  const candName = (id) => cands?.find((c) => c.machine_id === id)?.name

  const saveName = async (d) => {
    const name = editName.trim()
    setEditId(null)
    if (!name || name === d.name) return
    await patch(d.id, { name }, null)
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="부서 관리"
        subtitle="조직 부서를 등록합니다. 계정의 소속은 계정 관리에서 지정해요"
      />
      <div className="page-content">
        {msg && <p className={msg.type === 'err' ? s.msgErr : s.msgOk}>{msg.text}</p>}

        {/* 추가 — 코드는 만든 뒤 못 바꾸므로 한 줄 안내를 붙인다 */}
        <div className={s.addRow}>
          <input
            className="form-input" value={form.code} maxLength={20}
            placeholder="코드 (예: QC)"
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <input
            className="form-input" value={form.name} maxLength={50}
            placeholder="이름 (예: 품질)"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          {/* 상위 부서 — 고르면 '팀' 이 된다. 팀 아래 팀은 서버가 막는다(부서 > 팀 2단계) */}
          <select
            className="form-input" value={form.parent_id}
            onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
          >
            <option value="">상위 없음 (부서)</option>
            {items.filter((d) => !d.is_team && d.active).map((d) => (
              <option key={d.id} value={d.id}>{d.name} 소속 팀</option>
            ))}
          </select>
          <input
            className="form-input" type="number" value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
          />
          <button type="button" className="btn-primary" onClick={add} disabled={busy}>
            추가
          </button>
        </div>
        <p className={s.hint}>
          코드는 만든 뒤 바꿀 수 없습니다. 이름은 언제든 고칠 수 있어요.
          상위 부서를 고르면 그 부서의 <b>팀</b>이 됩니다 (부서 &gt; 팀 2단계까지).
        </p>

        <div className={s.toolbar}>
          <button
            type="button" className={showOff ? s.chipOn : s.chip}
            onClick={() => setShowOff((v) => !v)}
          >
            사용 중지 포함
          </button>
        </div>

        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>코드</th>
                <th>이름</th>
                <th title="이 부서(와 팀들) 소속원 의뢰의 결재자 후보 — 승인 체계 설정이 부서장을 쓸 때">부서장</th>
                <th className={s.right} title="활성 계정만 셉니다">인원</th>
                <th className={s.right}>정렬</th>
                <th className={s.right}>상태</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className={d.active ? '' : s.rowOff}>
                  <td className={d.is_team ? `${s.code} ${s.teamCode}` : s.code}>
                    {d.is_team && <span className={s.branch}>└</span>}{d.code}
                    {/* 상위가 사용 중지돼 목록에서 빠진 팀 — 바로 위 부서의 팀처럼 보이지 않게 상위 이름을 붙인다 */}
                    {d.is_team && !d.parent_active && (
                      <span className={s.parentOff}>상위 '{d.parent_name}' 사용 중지</span>
                    )}
                  </td>
                  <td>
                    {editId === d.id ? (
                      <input
                        className="form-input" value={editName} maxLength={50} autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => saveName(d)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveName(d)
                          if (e.key === 'Escape') setEditId(null)
                        }}
                      />
                    ) : (
                      <button
                        type="button" className={s.nameBtn}
                        onClick={() => { setEditId(d.id); setEditName(d.name) }}
                      >
                        {d.name}
                      </button>
                    )}
                  </td>
                  <td>
                    {mgrEdit === d.id ? (
                      <div className={s.mgrEdit}>
                        <div className={s.mgrChips}>
                          {mgrDraft.map((id) => (
                            <span key={id} className={s.mgrChip}>
                              {candName(id) || (d.managers || []).find((m) => m.account_id === id)?.name || `계정#${id}`}
                              <button type="button" className={s.mgrX} aria-label="해제" disabled={busy}
                                onClick={() => setMgrDraft(mgrDraft.filter((x) => x !== id))}>×</button>
                            </span>
                          ))}
                          {mgrDraft.length === 0 && <span className={s.mgrNone}>없음</span>}
                        </div>
                        <select
                          className="form-input" value="" disabled={busy || cands === null}
                          onChange={(e) => { const id = Number(e.target.value); if (id && !mgrDraft.includes(id)) setMgrDraft([...mgrDraft, id]) }}
                        >
                          <option value="">{cands === null ? '불러오는 중…' : '사람 추가…'}</option>
                          {(cands || []).filter((c) => !mgrDraft.includes(c.machine_id)).map((c) => (
                            <option key={c.machine_id} value={c.machine_id}>{c.name}{c.has_nw ? '' : ' (알림 불가)'}</option>
                          ))}
                        </select>
                        <div className={s.mgrBtns}>
                          <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => setMgrEdit(null)}>취소</button>
                          <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => saveMgr(d)}>저장</button>
                        </div>
                      </div>
                    ) : d.is_team ? (
                      <span className={s.mgrNone} title="팀 소속원 의뢰는 상위 부서장이 봅니다">상위 부서장</span>
                    ) : (
                      <div className={s.mgrChips}>
                        {(d.managers || []).map((m) => (
                          <span key={m.account_id} className={m.active ? s.mgrChip : `${s.mgrChip} ${s.mgrOff}`}
                            title={m.active ? '' : '비활성 계정'}>{m.name}</span>
                        ))}
                        {(d.managers || []).length === 0 && <span className={s.mgrNone}>없음</span>}
                        {d.active && (
                          <button type="button" className={s.nameBtn} disabled={busy} onClick={() => openMgr(d)}>지정</button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className={s.right}>{d.member_count}</td>
                  <td className={s.right}>{d.sort_order}</td>
                  <td className={s.right}>
                    <button
                      type="button"
                      className={d.active ? 'btn-ghost btn-sm' : 'btn-secondary btn-sm'}
                      disabled={busy}
                      onClick={() => toggleActive(d)}
                    >
                      {d.active ? '사용 중지' : '다시 사용'}
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className={s.empty}>등록된 부서가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
