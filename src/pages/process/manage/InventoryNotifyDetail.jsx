// pages/process/manage/InventoryNotifyDetail.jsx
// 재고별 발송 상세 (2026-08-28) — 알림 발송 설정의 '재고별 발송 알림' 종류 전용 화면.
//   품목마다 담당 수신자를 지정 → 안전재고 미달이 감지되면 그 담당자에게 발송(BE 라우팅).
//   수신자 저장은 기존 범용 테이블 재활용: notify_type="inventory:{item_id}"(품목별) / "inventory"(기본).
import { useState, useEffect, useCallback } from 'react'
import {
  getNotificationInventoryMap, addNotificationRecipient, deleteNotificationRecipient,
} from '@/api'

const inputStyle = {
  padding: '8px 10px', fontSize: 13,
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  background: 'var(--color-white, #fff)', color: 'var(--color-dark)', fontFamily: 'inherit',
}
const fmt = (v) => (Number.isInteger(Number(v)) ? String(Number(v)) : `${Number(v)}`)

// 수신자 추가 폼 — 기본/품목 공용 (계정 or 외부 메일)
function AddRecipient({ notifyType, users, existing, busy, onAdd }) {
  const [mode, setMode] = useState('account')
  const [sel, setSel] = useState('')
  const [email, setEmail] = useState('')
  const avail = users.filter((u) => !existing.some((r) => r.machine_id === u.id))

  const submit = () => {
    if (mode === 'account') {
      if (!sel) return
      onAdd(notifyType, { machine_id: Number(sel) }); setSel('')
    } else {
      const v = email.trim()
      if (!v) return
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { window.alert('이메일 형식이 올바르지 않습니다.'); return }
      onAdd(notifyType, { email: v }); setEmail('')
    }
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
      <select style={{ ...inputStyle, width: 100 }} value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="account">사내 계정</option>
        <option value="email">외부 메일</option>
      </select>
      {mode === 'account' ? (
        <select style={{ ...inputStyle, minWidth: 210 }} value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">— 계정 선택 (이메일 등록 계정) —</option>
          {avail.map((u) => <option key={u.id} value={String(u.id)}>{u.display_name || u.login_id} · {u.email}</option>)}
        </select>
      ) : (
        <input style={{ ...inputStyle, minWidth: 210 }} value={email} placeholder="purchase@example.com"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
      )}
      <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={submit}>추가</button>
    </div>
  )
}

// 수신자 칩 (제거 가능)
function RcpChip({ r, busy, onRemove }) {
  const nm = r.display_name || r.email
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef2f8',
      borderRadius: 999, padding: '3px 6px 3px 10px', fontSize: 12, fontWeight: 600, color: '#3a465e',
    }}>
      {nm}{r.is_external ? ' · 외부' : ''}
      <button type="button" disabled={busy} onClick={() => onRemove(r)} aria-label="제거"
        style={{ border: 0, background: 'none', cursor: 'pointer', color: '#8a93a3', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
    </span>
  )
}

export default function InventoryNotifyDetail({ users, busy, setBusy, setMsg }) {
  const [data, setData] = useState(null)
  const [openItem, setOpenItem] = useState(null)   // 인라인 담당 추가가 열린 품목 id

  const reload = useCallback(async () => {
    try { setData(await getNotificationInventoryMap()) }
    catch (e) { setMsg({ type: 'err', text: e.message || '불러오기 실패' }) }
  }, [setMsg])
  useEffect(() => { reload() }, [reload])

  const add = async (notifyType, payload) => {
    setBusy(true)
    try {
      await addNotificationRecipient({ notify_type: notifyType, ...payload })
      await reload(); setMsg({ type: 'ok', text: '담당 수신자 추가됨' })
    } catch (e) { setMsg({ type: 'err', text: e.message || '추가 실패' }) } finally { setBusy(false) }
  }
  const remove = async (r) => {
    if (!window.confirm(`${r.display_name || r.email} 을(를) 이 품목 담당에서 제거할까요?`)) return
    setBusy(true)
    try { await deleteNotificationRecipient(r.id); await reload() }
    catch (e) { setMsg({ type: 'err', text: e.message || '제거 실패' }) } finally { setBusy(false) }
  }

  if (!data) return <p style={{ color: 'var(--color-text-sub)' }}>불러오는 중…</p>
  const { items = [], default_recipients = [] } = data

  return (
    <>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-sub)', margin: '0 0 14px' }}>
        각 품목에 담당 수신자를 지정하면, <b>안전재고 미달이 감지될 때</b> 그 담당자에게만 메일이 나갑니다.
        미지정 품목은 아래 <b>기본 수신자</b>로 발송됩니다.
      </p>

      {/* 기본 수신자 (폴백) */}
      <div style={{ background: '#f0f4fb', border: '1px solid #dbe3f2', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.02em', color: 'var(--color-primary, #1e2a52)' }}>기본 수신자</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>담당 미지정 품목은 여기로</span>
          <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginLeft: 4 }}>
            {default_recipients.length === 0
              ? <span style={{ fontSize: 12, color: 'var(--color-warning, #e67e22)', fontWeight: 600 }}>미지정 — .env 기본 주소로 발송</span>
              : default_recipients.map((r) => <RcpChip key={r.id} r={r} busy={busy} onRemove={remove} />)}
          </span>
        </div>
        <AddRecipient notifyType="inventory" users={users} existing={default_recipients} busy={busy} onAdd={add} />
      </div>

      {/* 품목별 매핑 */}
      {items.length === 0 ? (
        <p style={{ color: 'var(--color-text-sub)', fontSize: 13 }}>
          안전재고가 설정된 품목이 없습니다 — 안전재고 관리에서 품목별 기준을 먼저 설정하세요.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 11 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg, #f8fafc)' }}>
                <th style={thStyle}>재고 품목</th>
                <th style={thStyle}>담당 수신자</th>
                <th style={{ ...thStyle, width: 120, textAlign: 'right' }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.item_id} style={{ borderTop: '1px solid #eef1f5' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700 }}>{it.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-sub)', marginTop: 2 }}>
                      현재 {fmt(it.current)} · 안전 {fmt(it.safety_stock)}{it.unit ? it.unit : ''}
                      {it.short && <span style={{ color: 'var(--color-warning, #e67e22)', fontWeight: 700 }}> · 미달 ⚠</span>}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                      {it.recipients.length === 0
                        ? <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>담당 미지정 → 기본 수신자</span>
                        : it.recipients.map((r) => <RcpChip key={r.id} r={r} busy={busy} onRemove={remove} />)}
                    </div>
                    {openItem === it.item_id && (
                      <AddRecipient notifyType={`inventory:${it.item_id}`} users={users}
                        existing={it.recipients} busy={busy} onAdd={add} />
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button type="button" className="btn-text"
                      onClick={() => setOpenItem(openItem === it.item_id ? null : it.item_id)}>
                      {openItem === it.item_id ? '닫기' : '＋ 담당'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

const thStyle = {
  textAlign: 'left', fontSize: 11, fontWeight: 800, letterSpacing: '.03em',
  color: 'var(--color-text-muted, #98a2b3)', textTransform: 'uppercase', padding: '10px 12px',
}
const tdStyle = { padding: '11px 12px', verticalAlign: 'middle' }
