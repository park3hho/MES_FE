// src/pages/process/manage/DepartmentManagePage.jsx
// 부서(조직) 관리 — 1단계 (2026-09-17). 설계: docs/department-design.md
//   ★ 삭제가 없다. 끄려면 '사용 중지'(active=false) 를 누른다 — 지우면 "작년에 이 사람이 왜
//     그 권한이었나" 에 답할 수 없다(ISO 27001 A.5.18). 그래서 화면에도 삭제 버튼을 두지 않는다.
//   ★ 부서 코드는 만든 뒤 바꾸지 않는다(시드·참조의 키). 이름만 고친다.
import { useCallback, useEffect, useState } from 'react'

import PageHeader from '@/components/common/PageHeader'
import { createDepartment, getDepartments, updateDepartment } from '@/api'
import s from './DepartmentManagePage.module.css'

const EMPTY = { code: '', name: '', sort_order: 100, parent_id: '' }

export default function DepartmentManagePage() {
  const [items, setItems] = useState([])
  const [showOff, setShowOff] = useState(false)   // 사용 중지된 부서까지 보기
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)      // 이름 편집 중인 행
  const [editName, setEditName] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

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
                  <td className={s.right}>{d.member_count}</td>
                  <td className={s.right}>{d.sort_order}</td>
                  <td className={s.right}>
                    <button
                      type="button"
                      className={d.active ? 'btn-ghost btn-sm' : 'btn-secondary btn-sm'}
                      disabled={busy}
                      onClick={() => patch(d.id, { active: !d.active },
                        d.active ? `'${d.name}' 을(를) 사용 중지했습니다.` : null)}
                    >
                      {d.active ? '사용 중지' : '다시 사용'}
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className={s.empty}>등록된 부서가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
