// src/pages/process/manage/NaverworksBotPage.jsx
// 네이버웍스 봇 관리 (2026-09-16) — 용도별 botId 등록.
//   ★ botId 를 코드에 박지 않는다. 봇은 용도마다 늘어나고 번호는 콘솔에서 발급되므로,
//     코드는 용도 키(purchase_request 등)로만 찾고 번호는 이 화면에서 관리한다.
//   ★ 용도 키는 자유 입력(사용자 결정 2026-09-16) — 오타는 '조용한 미발송'이 되므로
//     코드가 실제로 쓰는 키 목록을 힌트로 같이 보여준다.
//   권한: '알림 발송 경로 설정' 과 같은 개념이라 ADMIN_NOTIFY 재사용.
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import { listNwBots, createNwBot, updateNwBot, deleteNwBot, testNwBot } from '@/api'
import s from './NaverworksBotPage.module.css'

const EMPTY = { key: '', bot_id: '', name: '', description: '', active: true }
const KEY_RE = /^[a-z0-9_]{2,30}$/

export default function NaverworksBotPage() {
  const nav = useNavigate()
  const confirm = useConfirm()
  const [rows, setRows] = useState([])
  const [knownKeys, setKnownKeys] = useState([])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY)

  const load = useCallback(async () => {
    try {
      const d = await listNwBots()
      setRows(d.items || [])
      setKnownKeys(d.known_keys || [])
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    }
  }, [])
  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditingId(null); setForm(EMPTY); setMsg(null); setShow(true) }

  const openEdit = (row) => {
    setEditingId(row.id)
    setForm({
      key: row.key,
      bot_id: row.bot_id,
      name: row.name || '',
      description: row.description || '',
      active: row.active,
    })
    setMsg(null)
    setShow(true)
  }

  const save = async () => {
    // 키 검사는 등록에서만 — 수정은 키를 바꾸지 않는다(코드가 참조하는 값)
    if (!editingId && !KEY_RE.test(form.key.trim())) {
      return setMsg({ type: 'err', text: '용도 키는 영소문자·숫자·밑줄 2~30자여야 합니다. (예: purchase_request)' })
    }
    if (!/^\d+$/.test(form.bot_id.trim())) {
      return setMsg({ type: 'err', text: 'Bot No.는 숫자여야 합니다.' })
    }
    setBusy(true); setMsg(null)
    try {
      const body = {
        bot_id: form.bot_id.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
        active: form.active,
      }
      if (editingId) await updateNwBot(editingId, body)
      else await createNwBot({ ...body, key: form.key.trim() })
      setShow(false)
      setMsg({ type: 'ok', text: editingId ? '수정했습니다.' : '등록했습니다.' })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row) => {
    const ok = await confirm({
      title: '봇 삭제',
      message: `'${row.name || row.key}' 등록을 삭제할까요?\n전송만 멈추려면 '사용'을 끄는 것으로 충분합니다.`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    setBusy(true); setMsg(null)
    try {
      await deleteNwBot(row.id)
      setMsg({ type: 'ok', text: '삭제했습니다.' })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const runTest = async (row) => {
    setBusy(true); setMsg(null)
    try {
      const d = await testNwBot(row.id)
      setMsg({ type: 'ok', text: d.message || '테스트 메시지를 보냈습니다.' })
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="네이버웍스 봇"
        subtitle="용도별로 봇을 등록합니다 — 코드는 용도 키로 봇을 찾고, 번호는 여기서 관리합니다"
        onBack={() => nav('/admin/manage')}
      />
      <div className="page-content">
        {msg && <p className={msg.type === 'err' ? s.msgErr : s.msgOk}>{msg.text}</p>}

        <div className={s.guide}>
          <b>등록 순서</b> — ① Developer Console 에서 봇 생성 → ② Admin › 서비스 › Bot 에서 추가(서비스 중)
          → ③ 그 목록의 <b>Bot No.</b> 를 여기에 등록<br />
          받는 사람은 <b>계정 관리</b>의 &lsquo;네이버웍스 ID&rsquo; 가 등록된 사람입니다. 비어 있으면 메일로만 받습니다.
          {knownKeys.length > 0 && (
            <>
              <br />
              <b>코드가 쓰는 용도 키</b> — {knownKeys.map((k) => `${k.label}(${k.key})`).join(' · ')}
            </>
          )}
        </div>

        <div className={s.headRow}>
          <span className={s.count}>전체 {rows.length}</span>
          <button type="button" className="btn-primary btn-md" onClick={openCreate}>+ 봇 추가</button>
        </div>

        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>용도</th>
                <th>Bot No.</th>
                <th>이름</th>
                <th>상태</th>
                <th aria-label="작업" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className={s.empty}>등록된 봇이 없습니다.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {knownKeys.find((k) => k.key === r.key)?.label || '—'}
                    <div className={s.key}>{r.key}</div>
                  </td>
                  <td>{r.bot_id}</td>
                  <td>
                    {r.name || '—'}
                    {r.description && <div className={s.muted}>{r.description}</div>}
                  </td>
                  <td>
                    <span className={r.active ? s.badgeOn : s.badgeOff}>
                      {r.active ? '사용중' : '중지'}
                    </span>
                  </td>
                  <td>
                    <div className={s.actions}>
                      <button type="button" className="btn-ghost btn-sm" disabled={busy}
                              onClick={() => runTest(r)}>테스트 전송</button>
                      <button type="button" className="btn-ghost btn-sm" disabled={busy}
                              onClick={() => openEdit(r)}>수정</button>
                      <button type="button" className="btn-ghost btn-sm" disabled={busy}
                              onClick={() => remove(r)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={s.footNote}>
          <b>테스트 전송</b> — 로그인한 본인에게 시험 메시지를 보냅니다. 내 계정에 네이버웍스 ID가 등록돼 있어야 하며,
          꺼둔 봇도 전송해 등록값을 점검합니다.
        </p>
      </div>

      {show && (
        <div className={s.overlay} onClick={() => !busy && setShow(false)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h2>{editingId ? '봇 수정' : '봇 추가'}</h2>
              <p className={s.hint}>Admin 에서 &lsquo;서비스 중&rsquo; 인 봇만 실제로 전송됩니다.</p>
            </div>

            <div className={s.field}>
              <label className={s.label} htmlFor="nwbot-key">용도 키</label>
              <input id="nwbot-key" className="form-input" value={form.key} disabled={!!editingId}
                     placeholder="purchase_request"
                     onChange={(e) => setForm({ ...form, key: e.target.value })} />
              <p className={s.hint}>
                코드가 이 값으로 봇을 찾습니다. 오타가 나면 알림이 조용히 안 나가니 위의 &lsquo;코드가 쓰는 용도 키&rsquo; 와 맞추세요.
                {editingId && ' 등록 후에는 바꿀 수 없습니다.'}
              </p>
            </div>

            <div className={s.field}>
              <label className={s.label} htmlFor="nwbot-id">Bot No.</label>
              <input id="nwbot-id" className="form-input" value={form.bot_id} inputMode="numeric"
                     placeholder="13167137"
                     onChange={(e) => setForm({ ...form, bot_id: e.target.value })} />
              <p className={s.hint}>Admin › 서비스 › Bot 목록의 &lsquo;Bot No.&rsquo; 숫자입니다.</p>
            </div>

            <div className={s.field}>
              <label className={s.label} htmlFor="nwbot-name">이름</label>
              <input id="nwbot-name" className="form-input" value={form.name} placeholder="구매요청 봇"
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className={s.field}>
              <label className={s.label} htmlFor="nwbot-desc">설명 (선택)</label>
              <input id="nwbot-desc" className="form-input" value={form.description}
                     placeholder="구매요청 접수·승인 알림"
                     onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <label className={s.toggleRow}>
              <input type="checkbox" checked={form.active}
                     onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span>사용</span>
            </label>
            <p className={s.hint}>끄면 전송만 건너뜁니다. 등록한 번호는 남습니다.</p>

            <div className={s.modalFooter}>
              <button type="button" className="btn-secondary btn-md" disabled={busy}
                      onClick={() => setShow(false)}>취소</button>
              <button type="button" className="btn-primary btn-md" disabled={busy}
                      onClick={save}>{busy ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
