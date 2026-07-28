// pages/process/manage/NotificationSettingPage.jsx
// 알림 발송 설정 — "서버가 보내는 알림을 누구에게 보낼까" (2026-07-27).
//   ⚠️ 관점: 발신 주체는 서버, 지정 주체는 관리자 (수신자가 스스로 켜는 '구독' 아님).
//   BE 카탈로그(core/notify_config.NOTIFY_TYPES)를 그대로 그림 → 새 알림 기능이 추가되면
//   BE 상수 한 줄만 늘려도 이 화면에 행이 자동 생성됨 (FE 수정 불필요).
//   발송 대상 두 갈래: 사내 계정(이메일은 계정 것을 따라감) / 외부·그룹 메일(직접 입력).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import {
  getNotificationCatalog, addNotificationRecipient,
  setNotificationRecipientActive, deleteNotificationRecipient,
  getNotificationRecipients, getNotificationCandidates, sendNotificationNow,
} from '@/api'

const inputStyle = {
  padding: '8px 10px', fontSize: 14,
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  background: 'var(--color-white, #fff)',
}

export default function NotificationSettingPage() {
  const nav = useNavigate()
  const [types, setTypes] = useState([])
  const [recips, setRecips] = useState([])
  const [users, setUsers] = useState([])
  const [msg, setMsg] = useState(null)      // {type:'ok'|'err', text}
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState({})   // {notify_type: {emails, source}}

  const load = useCallback(async () => {
    try {
      const r = await getNotificationCatalog()
      setTypes(r.types || [])
      setRecips(r.recipients || [])
      setMsg(null)
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '불러오기 실패' })
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    // 발송 대상 후보 = 이메일이 등록된 활성 계정 (알림 전용 API — 계정관리 권한 불필요)
    let cancelled = false
    getNotificationCandidates()
      .then((r) => { if (!cancelled) setUsers(r.candidates || []) })
      .catch((e) => { if (!cancelled) setMsg({ type: 'err', text: `발송 대상 후보 조회 실패: ${e.message || ''} (외부 메일 입력은 가능)` }) })
    return () => { cancelled = true }
  }, [])

  const doAdd = async (notifyType, payload) => {
    setBusy(true)
    try {
      await addNotificationRecipient({ notify_type: notifyType, ...payload })
      await load()
      setMsg({ type: 'ok', text: '발송 대상 추가됨' })
    } catch (e) { setMsg({ type: 'err', text: e.message || '추가 실패' }) } finally { setBusy(false) }
  }
  const doToggle = async (sub) => {
    setBusy(true)
    try { await setNotificationRecipientActive(sub.id, !sub.is_active); await load() }
    catch (e) { setMsg({ type: 'err', text: e.message || '변경 실패' }) } finally { setBusy(false) }
  }
  const doDelete = async (sub) => {
    if (!window.confirm(`${sub.email} 을(를) 이 알림 발송 대상에서 제거할까요?`)) return
    setBusy(true)
    try { await deleteNotificationRecipient(sub.id); await load() }
    catch (e) { setMsg({ type: 'err', text: e.message || '삭제 실패' }) } finally { setBusy(false) }
  }
  const doPreview = async (notifyType) => {
    try {
      const r = await getNotificationRecipients(notifyType)
      setPreview((p) => ({ ...p, [notifyType]: { emails: r.emails || [], source: r.source } }))
    } catch (e) { setMsg({ type: 'err', text: e.message || '확인 실패' }) }
  }
  // 지금 발송 — 부족이 없어도 현재 상태를 즉시 메일로. dev 는 dry-run(실제 미발송)이라 그대로 알림.
  const doSendNow = async (notifyType, label) => {
    if (!window.confirm(`"${label}" 을(를) 지금 발송할까요?\n지정된 발송 대상 전원에게 현재 상태가 메일로 나갑니다.`)) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await sendNotificationNow(notifyType)
      const to = (r.would_send_to || []).join(', ')
      if (r.dry_run) {
        setMsg({ type: 'ok', text: `[개발 모드] 실제 발송 안 함 — 운영에서는 ${to} 로 발송됩니다.` })
      } else if (r.mailed) {
        setMsg({ type: 'ok', text: `발송 완료 — 수신 ${r.recipients}명` })
      } else {
        setMsg({ type: 'err', text: r.reason === 'no_watchlist'
          ? '발송할 내용이 없습니다 — 품목 관리에서 안전재고를 먼저 설정해주세요.'
          : '발송 대상이 없어 보내지 않았습니다 — 아래에서 대상을 지정해주세요.' })
      }
    } catch (e) { setMsg({ type: 'err', text: e.message || '발송 실패' }) } finally { setBusy(false) }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="알림 발송 설정"
        subtitle="서버가 보내는 이메일 알림의 발송 대상 지정 — 사내 계정 또는 외부·그룹 메일"
        onBack={() => nav('/admin/manage')}
      />
      <div className="page-content">
        {msg && (
          <p style={{ color: msg.type === 'err' ? 'var(--color-danger, #d23f3f)' : 'var(--color-primary, #2b7)', fontWeight: 600 }}>
            {msg.text}
          </p>
        )}
        <p style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 16 }}>
          ※ 발송 대상을 한 명도 지정하지 않으면 서버 설정(.env)의 기본 주소로 발송됩니다 — 알림이 조용히 끊기지 않도록 하는 안전망입니다.
        </p>

        {types.length === 0 ? (
          <p style={{ color: 'var(--color-text-sub)' }}>등록된 알림 종류가 없습니다.</p>
        ) : types.map((t) => (
          <NotifyTypeCard
            key={t.key}
            type={t}
            recips={recips.filter((r) => r.notify_type === t.key)}
            users={users}
            busy={busy}
            preview={preview[t.key]}
            onAdd={(payload) => doAdd(t.key, payload)}
            onToggle={doToggle}
            onDelete={doDelete}
            onPreview={() => doPreview(t.key)}
            onSendNow={t.can_send_now ? () => doSendNow(t.key, t.label) : null}
          />
        ))}
      </div>
    </div>
  )
}


// ── 알림 종류 1개 = 카드 (발송 대상 목록 + 추가 폼) ──
function NotifyTypeCard({ type, recips, users, busy, preview, onAdd, onToggle, onDelete, onPreview, onSendNow }) {
  const [mode, setMode] = useState('account')   // 'account' | 'email'
  const [sel, setSel] = useState('')
  const [email, setEmail] = useState('')

  const submit = () => {
    if (mode === 'account') {
      if (!sel) return
      onAdd({ machine_id: Number(sel) })
      setSel('')
    } else {
      const v = email.trim()
      if (!v) return
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { window.alert('이메일 형식이 올바르지 않습니다.'); return }
      onAdd({ email: v })
      setEmail('')
    }
  }

  // 이미 지정된 계정은 후보에서 제외 (BE 400 을 사전에 방지)
  const availableUsers = users.filter((u) => !recips.some((r) => r.machine_id === u.id))

  return (
    <section style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>{type.label}</h3>
        <button type="button" className="btn-text" onClick={onPreview}>실제 발송 대상 확인</button>
        {onSendNow && (
          <button type="button" className="btn-secondary btn-sm" style={{ marginLeft: 'auto' }}
            disabled={busy} onClick={onSendNow}>
            지금 발송
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-sub)', margin: '0 0 10px' }}>{type.desc}</p>

      {preview && (
        <p style={{ fontSize: 12, marginBottom: 10, color: preview.source === 'env_fallback' ? 'var(--color-warning, #e67e22)' : 'var(--color-text-sub)' }}>
          {preview.emails.length === 0
            ? '⚠ 발송 대상이 없습니다 — 알림이 발송되지 않습니다.'
            : `→ ${preview.emails.join(', ')}${preview.source === 'env_fallback' ? ' (서버 기본 설정 사용 중)' : ''}`}
        </p>
      )}

      {recips.length === 0 ? (
        <p style={{ color: 'var(--color-text-sub)', fontSize: 13, marginBottom: 10 }}>지정된 발송 대상이 없습니다.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0 }}>
          {recips.map((s) => (
            <li key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontWeight: 600, opacity: s.is_active ? 1 : 0.45 }}>
                {s.display_name || s.email}
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-text-sub)', opacity: s.is_active ? 1 : 0.45 }}>
                {s.display_name ? s.email : ''}{s.is_external ? ' · 외부' : ''}
              </span>
              <label style={{ marginLeft: 'auto', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={s.is_active} disabled={busy} onChange={() => onToggle(s)} />
                발송
              </label>
              <button type="button" className="btn-text" disabled={busy} onClick={() => onDelete(s)}>제거</button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select style={{ ...inputStyle, width: 110 }} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="account">사내 계정</option>
          <option value="email">외부 메일</option>
        </select>
        {mode === 'account' ? (
          <select style={{ ...inputStyle, minWidth: 240 }} value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">— 계정 선택 (이메일 등록된 계정만) —</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.display_name || u.login_id} · {u.email}
              </option>
            ))}
          </select>
        ) : (
          <input style={{ ...inputStyle, minWidth: 240 }} value={email} placeholder="purchase@example.com"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
        )}
        <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={submit}>추가</button>
      </div>
      {mode === 'account' && availableUsers.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--color-text-sub)', marginTop: 6 }}>
          추가할 계정이 없습니다 — 계정 관리에서 이메일을 등록하면 여기에 나타납니다.
        </p>
      )}
    </section>
  )
}
