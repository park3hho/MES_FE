// pages/process/manage/MachinePermissionPage.jsx
// RBAC 개인별 권한 override 편집 (Phase 3, 2026-06-17)
// team_rnd 전용(ADMIN_PERMISSIONS) — 사용자 1명 선택 → feature 별 3-state(상속/허용/차단).
//   상속 = role 기본정책 따름(override 없음) / 허용 = effect 'grant' / 차단 = effect 'deny'(deny wins)
// team_rnd 대상은 전권이라 편집 불가. 설계: docs/rbac-management-design.md §5-1b

import { useState, useEffect, Fragment, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { listUsers, getRoles, getMachinePermissions, saveMachinePermissions } from '@/api'
import s from './MachinePermissionPage.module.css'

export default function MachinePermissionPage({ onBack }) {
  const [users, setUsers] = useState([])
  const [roleLabels, setRoleLabels] = useState({})   // {role_key: label} (동적 역할)
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState(null)   // {machine, is_rnd, features, role_base, overrides}
  const [overrides, setOverrides] = useState({}) // {feature: 'grant'|'deny'}
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    (async () => {
      setLoadingUsers(true)
      try {
        const [list, rolesRes] = await Promise.all([listUsers(), getRoles()])
        setUsers(list.filter((u) => u.active !== false))
        setRoleLabels(Object.fromEntries((rolesRes.roles || []).map((r) => [r.key, r.label])))
      } catch (e) {
        setMsg({ type: 'err', text: e.message })
      } finally {
        setLoadingUsers(false)
      }
    })()
  }, [])

  const loadDetail = useCallback(async (mid) => {
    setLoadingDetail(true)
    setMsg(null)
    setDetail(null)
    try {
      const d = await getMachinePermissions(mid)
      setDetail(d)
      setOverrides({ ...d.overrides })
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  const onPick = (e) => {
    const v = e.target.value
    setSelectedId(v)
    if (v) loadDetail(v)
    else { setDetail(null); setOverrides({}) }
  }

  // 3-state 설정: 'inherit' | 'grant' | 'deny'
  const setState = (feat, state) => {
    setOverrides((prev) => {
      const next = { ...prev }
      if (state === 'inherit') delete next[feat]
      else next[feat] = state
      return next
    })
  }
  const stateOf = (feat) => overrides[feat] || 'inherit'

  async function save() {
    if (!detail) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await saveMachinePermissions(detail.machine.id, overrides)
      // BE 가 실제 저장한 결과로 baseline 재동기화 — dirty 해제 + 잠금/미지 feature drop 반영
      const d = await getMachinePermissions(detail.machine.id)
      setDetail(d)
      setOverrides({ ...d.overrides })
      setMsg({
        type: 'ok',
        text: `저장됨 (override ${res.rows}개). 대상 사용자는 재로그인(또는 앱 새로고침) 후 적용됩니다.`,
      })
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  // group(공정/관리/QC) 별 묶기
  const groups = {}
  if (detail) for (const f of detail.features) (groups[f.group] ||= []).push(f)
  const roleBase = new Set(detail?.role_base || [])
  const dirty = detail && JSON.stringify(overrides) !== JSON.stringify(detail.overrides)

  return (
    <div className="page-flat">
      <PageHeader
        title="개인별 권한 설정"
        subtitle="사용자 1명에게 기능을 강제 허용/차단 — role 기본정책 위의 예외"
        onBack={onBack}
      />
      {msg && <p className={msg.type === 'ok' ? s.ok : s.err}>{msg.text}</p>}

      <div className={s.pickRow}>
        <label className={s.pickLabel}>사용자</label>
        <select className={s.picker} value={selectedId} onChange={onPick} disabled={loadingUsers}>
          <option value="">{loadingUsers ? '불러오는 중…' : '— 선택 —'}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.login_id} ({roleLabels[u.role] || u.role})
            </option>
          ))}
        </select>
      </div>

      {loadingDetail && <p className={s.note}>불러오는 중…</p>}

      {detail && detail.is_rnd && (
        <p className={s.rndNote}>
          <b>{detail.machine.login_id}</b> 은(는) team_rnd(전권) 계정입니다. 전권 단락으로 항상 모든
          기능을 사용하므로 개인 권한을 설정할 수 없습니다.
        </p>
      )}

      {detail && !detail.is_rnd && (
        <>
          <p className={s.note}>
            <b>{detail.machine.login_id}</b> · role <b>{roleLabels[detail.machine.role] || detail.machine.role}</b>
            {' '}— <span className={s.legendInherit}>상속</span>=role 기본 따름,{' '}
            <span className={s.legendGrant}>허용</span>=강제 부여,{' '}
            <span className={s.legendDeny}>차단</span>=강제 차단(우선)
          </p>

          <div className={s.tableWrap}>
            <table className={s.matrix}>
              <thead>
                <tr>
                  <th className={s.featCol}>기능</th>
                  <th className={s.baseCol}>role 기본</th>
                  <th className={s.ctrlCol}>설정</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groups).map(([group, feats]) => (
                  <Fragment key={group}>
                    <tr className={s.groupRow}>
                      <td colSpan={3}>{group}</td>
                    </tr>
                    {feats.map((f) => {
                      const base = roleBase.has(f.key)
                      const st = stateOf(f.key)
                      return (
                        <tr key={f.key}>
                          <td className={s.featCol}>{f.label}</td>
                          <td className={s.baseCol}>
                            <span className={base ? s.baseOn : s.baseOff}>
                              {base ? '허용' : '차단'}
                            </span>
                          </td>
                          <td className={s.ctrlCol}>
                            <div className={s.seg}>
                              {[
                                ['inherit', '상속'],
                                ['grant', '허용'],
                                ['deny', '차단'],
                              ].map(([val, lbl]) => (
                                <button
                                  key={val}
                                  type="button"
                                  className={`${s.segBtn} ${st === val ? s[`seg_${val}`] : ''}`}
                                  onClick={() => setState(f.key, val)}
                                >
                                  {lbl}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className={s.actions}>
            <button className="btn-primary btn-lg" onClick={save} disabled={saving || !dirty}>
              {saving ? '저장 중…' : dirty ? '저장' : '변경 없음'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
