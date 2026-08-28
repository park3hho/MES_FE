// pages/process/manage/NotificationSettingPage.jsx
// 알림 발송 설정 — "서버가 보내는 알림을 누구에게 보낼까" (2026-07-27).
//   ⚠️ 관점: 발신 주체는 서버, 지정 주체는 관리자 (수신자가 스스로 켜는 '구독' 아님).
//   BE 카탈로그(core/notify_config.NOTIFY_TYPES)를 그대로 그림 → 새 알림 기능이 추가되면
//   BE 상수 한 줄만 늘려도 이 화면에 행이 자동 생성됨 (FE 수정 불필요).
//   발송 대상 두 갈래: 사내 계정(이메일은 계정 것을 따라감) / 외부·그룹 메일(직접 입력).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import InventoryNotifyDetail from './InventoryNotifyDetail'
import {
  getNotificationCatalog, addNotificationRecipient,
  setNotificationRecipientActive, deleteNotificationRecipient,
  getNotificationRecipients, getNotificationCandidates, sendNotificationNow,
  addNotificationSchedule, updateNotificationSchedule, deleteNotificationSchedule,
} from '@/api'

// 요일 라벨 — index = Python weekday (0=월 … 6=일, BE NotificationSchedule.days 와 동일)
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']
const MODE_LABELS = { alert: '부족 시만', full: '전체 현황' }

const inputStyle = {
  padding: '8px 10px', fontSize: 14,
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  background: 'var(--color-white, #fff)',
}

export default function NotificationSettingPage() {
  const nav = useNavigate()
  const [types, setTypes] = useState([])
  const [recips, setRecips] = useState([])
  const [schedules, setSchedules] = useState([])   // 발송 스케줄 (2026-08-07)
  const [schedulesError, setSchedulesError] = useState(false)   // true = 조회 실패 (없음과 구분)
  const [users, setUsers] = useState([])
  const [msg, setMsg] = useState(null)      // {type:'ok'|'err', text}
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState({})   // {notify_type: {emails, source}}
  // 목록 → 상세 (2026-08-28) — 알림 종류가 늘고 각 디테일이 달라 목록에서 하나 고르면 그 종류만 설정.
  //   key 로 들고 types 에서 파생(재조회해도 최신 메타 반영, 사라진 key 면 목록으로 폴백).
  const [selectedKey, setSelectedKey] = useState(null)
  const selected = selectedKey ? types.find((t) => t.key === selectedKey) : null

  const load = useCallback(async () => {
    try {
      const r = await getNotificationCatalog()
      setTypes(r.types || [])
      setRecips(r.recipients || [])
      setSchedules(r.schedules || [])
      setSchedulesError(!!r.schedules_error)
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

  // ── 발송 스케줄 (2026-08-07) — 요일/시간을 화면에서 설정 (서버 crontab 수정 불필요) ──
  const doAddSchedule = async (notifyType, payload) => {
    setBusy(true)
    try {
      await addNotificationSchedule({ notify_type: notifyType, ...payload })
      await load()
      setMsg({ type: 'ok', text: '발송 스케줄 추가됨' })
    } catch (e) { setMsg({ type: 'err', text: e.message || '스케줄 추가 실패' }) } finally { setBusy(false) }
  }
  const doPatchSchedule = async (scheduleId, patch) => {
    setBusy(true)
    try { await updateNotificationSchedule(scheduleId, patch); await load() }
    catch (e) { setMsg({ type: 'err', text: e.message || '스케줄 변경 실패' }) } finally { setBusy(false) }
  }
  const doDeleteSchedule = async (s) => {
    if (!window.confirm(`${s.send_time} 발송 스케줄을 삭제할까요?`)) return
    setBusy(true)
    try { await deleteNotificationSchedule(s.id); await load(); setMsg({ type: 'ok', text: '스케줄 삭제됨' }) }
    catch (e) { setMsg({ type: 'err', text: e.message || '스케줄 삭제 실패' }) } finally { setBusy(false) }
  }
  // 지금 발송 — 부족이 없어도 현재 상태를 즉시 메일로.
  //   dev 는 기본 dry-run(실제 미발송)이지만, 서버 .env DEV_MAIL_ALLOWLIST 에 든 주소로는 실제 발송됨
  //   → 어느 쪽인지 문구로 명확히 구분 (보낸 줄 알았는데 안 갔다 / 안 간 줄 알았는데 갔다 방지).
  const doSendNow = async (notifyType, label) => {
    if (!window.confirm(`"${label}" 을(를) 지금 발송할까요?\n지정된 발송 대상 전원에게 현재 상태가 메일로 나갑니다.`)) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await sendNotificationNow(notifyType)
      const to = (r.would_send_to || []).join(', ')
      if (r.dry_run) {
        setMsg({ type: 'ok', text: `[개발 모드] 실제 발송 안 함 — 운영에서는 ${to} 로 발송됩니다.` })
      } else if (r.dev_allowlist) {
        const sentTo = (r.sent_to || []).join(', ')
        const skipped = (r.skipped || []).length
        setMsg({ type: 'ok', text: `[개발 모드] ${sentTo} 로 실제 발송했습니다 (제목에 [DEV] 표시)`
          + (skipped ? ` — 나머지 ${skipped}명은 개발 허용 목록에 없어 제외됨.` : '') })
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
        title={selected ? selected.label : '알림 발송 설정'}
        subtitle={selected ? selected.desc
          : '서버가 보내는 이메일 알림 — 종류를 선택해 발송 대상·스케줄을 설정하세요'}
        onBack={selected ? () => { setSelectedKey(null); setMsg(null) } : () => nav('/admin/manage')}
      />
      <div className="page-content">
        {msg && (
          <p style={{ color: msg.type === 'err' ? 'var(--color-danger, #d23f3f)' : 'var(--color-primary, #2b7)', fontWeight: 600 }}>
            {msg.text}
          </p>
        )}

        {!selected ? (
          /* ── 목록: 알림 종류 (누르면 상세 설정) ── */
          <>
            <p style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 16 }}>
              ※ 발송 대상을 한 명도 지정하지 않으면 서버 설정(.env)의 기본 주소로 발송됩니다 — 알림이 조용히 끊기지 않도록 하는 안전망입니다.
            </p>
            {types.length === 0 ? (
              <p style={{ color: 'var(--color-text-sub)' }}>등록된 알림 종류가 없습니다.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {types.map((t) => {
                  const active = recips.filter((r) => r.notify_type === t.key && r.is_active).length
                  // 재고별은 품목마다 별도 키(inventory:{id}) → 지정된 '품목 수'로 센다
                  const invItems = t.key === 'inventory'
                    ? new Set(recips.filter((r) => String(r.notify_type).startsWith('inventory:')).map((r) => r.notify_type)).size
                    : 0
                  return (
                    <li key={t.key} style={{ marginBottom: 8 }}>
                      <button type="button" onClick={() => { setSelectedKey(t.key); setMsg(null) }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                          padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit',
                          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-white, #fff)',
                        }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, marginBottom: 2 }}>{t.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 6 }}>{t.desc}</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11.5 }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 999, fontWeight: 700,
                              background: 'var(--color-bg, #f1f5f9)', color: 'var(--color-text-sub)',
                            }}>{t.scheduled ? '스케줄 발송' : '이벤트 즉시'}</span>
                            {t.key === 'inventory' ? (
                              <span style={{ color: invItems ? 'var(--color-primary, #2b7)' : 'var(--color-warning, #e67e22)', fontWeight: 600 }}>
                                {invItems ? `${invItems}개 품목 지정` : '지정된 품목 없음'}
                              </span>
                            ) : (
                              <span style={{ color: active ? 'var(--color-primary, #2b7)' : 'var(--color-warning, #e67e22)', fontWeight: 600 }}>
                                발송 대상 {active}명{active === 0 ? ' · 미지정 ⚠' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <span aria-hidden style={{ fontSize: 20, color: 'var(--color-text-muted, #98a2b3)' }}>›</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        ) : selected.key === 'inventory' ? (
          /* ── 상세: 재고별 발송 (품목별 담당 수신자) — 전용 화면 ── */
          <InventoryNotifyDetail users={users} busy={busy} setBusy={setBusy} setMsg={setMsg} />
        ) : (
          /* ── 상세: 선택한 알림의 발송 대상 + 스케줄 ── */
          <NotifyTypeCard
            key={selected.key}
            embedded
            type={selected}
            recips={recips.filter((r) => r.notify_type === selected.key)}
            schedules={schedules.filter((s) => s.notify_type === selected.key)}
            schedulesError={schedulesError}
            users={users}
            busy={busy}
            preview={preview[selected.key]}
            onAdd={(payload) => doAdd(selected.key, payload)}
            onToggle={doToggle}
            onDelete={doDelete}
            onPreview={() => doPreview(selected.key)}
            onSendNow={selected.can_send_now ? () => doSendNow(selected.key, selected.label) : null}
            onAddSchedule={(payload) => doAddSchedule(selected.key, payload)}
            onPatchSchedule={doPatchSchedule}
            onDeleteSchedule={doDeleteSchedule}
          />
        )}
      </div>
    </div>
  )
}


// ── 알림 종류 1개 = 카드 (발송 대상 목록 + 추가 폼 + 발송 스케줄) ──
function NotifyTypeCard({ type, embedded, recips, schedules, schedulesError, users, busy, preview, onAdd, onToggle,
                          onDelete, onPreview, onSendNow, onAddSchedule, onPatchSchedule, onDeleteSchedule }) {
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
    <section style={embedded
      ? { padding: 0 }
      : { border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: embedded ? 12 : 4 }}>
        {!embedded && <h3 style={{ margin: 0 }}>{type.label}</h3>}
        <button type="button" className="btn-text" onClick={onPreview}>실제 발송 대상 확인</button>
        {onSendNow && (
          <button type="button" className="btn-secondary btn-sm" style={{ marginLeft: 'auto' }}
            disabled={busy} onClick={onSendNow}>
            지금 발송
          </button>
        )}
      </div>
      {!embedded && <p style={{ fontSize: 12, color: 'var(--color-text-sub)', margin: '0 0 10px' }}>{type.desc}</p>}

      {/* ── 발송 스케줄 — 스케줄 기반 종류(안전재고)만. 이벤트 트리거(일일 마감)는 스케줄 없이 확정 즉시 발송 ── */}
      {type.scheduled ? (
        <ScheduleSection
          schedules={schedules}
          schedulesError={schedulesError}
          busy={busy}
          onAdd={onAddSchedule}
          onPatch={onPatchSchedule}
          onDelete={onDeleteSchedule}
        />
      ) : (
        <p style={{
          fontSize: 12, background: 'var(--color-bg, #f8fafc)', borderRadius: 'var(--radius-sm)',
          padding: '10px 12px', margin: '0 0 12px', color: 'var(--color-text-sub)',
        }}>
          ⏱ <b>발송 스케줄 없음</b> — 이 알림은 <b>해당 작업이 확정되는 즉시 자동 발송</b>됩니다(일일 마감 등).
          날짜/시간과 무관하며, 아래 <b>발송 대상</b>으로 나갑니다.
        </p>
      )}

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


// ── 발송 스케줄 섹션 — 요일 칩 + 시각 + 모드 (2026-08-07, EC2 crontab 대체) ──
function DayChips({ days, disabled, onChange }) {
  const toggle = (d) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()
    onChange(next)
  }
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {DAY_LABELS.map((label, d) => (
        <button key={d} type="button" disabled={disabled} onClick={() => toggle(d)}
          style={{
            width: 26, height: 26, borderRadius: 6, fontSize: 11, fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer',
            border: days.includes(d) ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
            background: days.includes(d) ? 'var(--color-primary)' : 'var(--color-white, #fff)',
            color: days.includes(d) ? '#fff' : (d === 5 || d === 6 ? '#d23f3f' : 'var(--color-text-sub)'),
          }}>
          {label}
        </button>
      ))}
    </span>
  )
}

// 기존 스케줄 1행 — 시각은 draft(입력 중 로컬)로 두고 블러/Enter 에만 저장.
//   즉시 PATCH 는 키 입력마다 중간값이 서버에 저장되고 reload 로 포커스가 끊기던 결함 (리뷰 반영 2026-08-07)
function ScheduleRow({ s, busy, onPatch, onDelete }) {
  const [timeDraft, setTimeDraft] = useState(s.send_time)
  useEffect(() => { setTimeDraft(s.send_time) }, [s.send_time])

  const commitTime = () => {
    if (!timeDraft || timeDraft === s.send_time) { setTimeDraft(s.send_time); return }
    onPatch(s.id, { send_time: timeDraft })
  }
  // 마지막 요일 해제는 무의미(BE 422) — PATCH 자체를 막고 안내 (리뷰 반영 2026-08-07)
  const changeDays = (d) => {
    if (!d.length) { window.alert('발송 요일은 1개 이상이어야 합니다 — 잠시 끄려면 "사용"을 해제하세요.'); return }
    onPatch(s.id, { days: d })
  }

  return (
    <li style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '5px 0', opacity: s.is_active ? 1 : 0.45 }}>
      <DayChips days={s.days} disabled={busy} onChange={changeDays} />
      <input type="time" style={{ ...inputStyle, padding: '4px 6px', fontSize: 12 }} value={timeDraft} disabled={busy}
        onChange={(e) => setTimeDraft(e.target.value)}
        onBlur={commitTime}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }} />
      <select style={{ ...inputStyle, padding: '4px 6px', fontSize: 12 }} value={s.mode} disabled={busy}
        onChange={(e) => onPatch(s.id, { mode: e.target.value })}>
        {Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input type="checkbox" checked={s.is_active} disabled={busy}
          onChange={() => onPatch(s.id, { is_active: !s.is_active })} />
        사용
      </label>
      <button type="button" className="btn-text" disabled={busy} onClick={() => onDelete(s)}>삭제</button>
    </li>
  )
}

function ScheduleSection({ schedules, schedulesError, busy, onAdd, onPatch, onDelete }) {
  const [days, setDays] = useState([0, 1, 2, 3, 4])   // 새 스케줄 기본 = 평일
  const [time, setTime] = useState('07:00')
  const [mode, setMode] = useState('alert')

  const submit = () => {
    if (!days.length) { window.alert('발송 요일을 1개 이상 선택해주세요.'); return }
    if (!time) { window.alert('발송 시각을 입력해주세요.'); return }
    onAdd({ days, send_time: time, mode })
  }

  return (
    <div style={{ background: 'var(--color-bg, #f8fafc)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 12 }}>
      <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-dark)' }}>
        발송 스케줄 <span style={{ fontWeight: 400, color: 'var(--color-text-sub)' }}>· 한국시간 기준, 여러 개 등록 가능</span>
      </p>

      {schedulesError ? (
        /* '조회 실패'를 '없음'으로 위장하면 재등록 유도 → 복구 후 이중 발송 씨앗 (리뷰 반영 2026-08-07) */
        <p style={{ fontSize: 12, color: 'var(--color-danger, #d23f3f)', margin: '0 0 8px' }}>
          ✕ 스케줄을 불러오지 못했습니다 — 서버 마이그레이션/DB 상태를 확인해주세요. (기존 스케줄이 지워진 것이 아닙니다 — 재등록하지 마세요)
        </p>
      ) : schedules.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--color-warning, #e67e22)', margin: '0 0 8px' }}>
          ⚠ 스케줄이 없습니다 — 아래에서 추가해야 정기 발송됩니다.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0 }}>
          {schedules.map((s) => (
            <ScheduleRow key={s.id} s={s} busy={busy} onPatch={onPatch} onDelete={onDelete} />
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px dashed var(--color-border)', paddingTop: 8 }}>
        <DayChips days={days} disabled={busy} onChange={setDays} />
        <input type="time" style={{ ...inputStyle, padding: '4px 6px', fontSize: 12 }} value={time}
          onChange={(e) => setTime(e.target.value)} />
        <select style={{ ...inputStyle, padding: '4px 6px', fontSize: 12 }} value={mode} onChange={(e) => setMode(e.target.value)}>
          {Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={submit}>+ 스케줄 추가</button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--color-text-sub)', margin: '6px 0 0' }}>
        부족 시만 = 안전재고 미달일 때만 발송 · 전체 현황 = 미달 없어도 감시 대상 전체 리포트 발송
      </p>
    </div>
  )
}
