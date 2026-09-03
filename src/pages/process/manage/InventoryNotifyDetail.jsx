// pages/process/manage/InventoryNotifyDetail.jsx
// 재고별 발송 상세 (2026-08-28) — 알림 발송 설정의 '재고별 발송 알림' 종류 전용 화면.
//   품목마다 담당 수신자를 지정 → 안전재고 미달이 감지되면 그 담당자에게 발송(BE 라우팅).
//   수신자 저장은 기존 범용 테이블 재활용: notify_type="inventory:{item_id}"(품목별) / "inventory"(기본).
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import {
  getNotificationInventoryMap, addNotificationRecipient, deleteNotificationRecipient,
  bulkAssignInventoryRecipient,
} from '@/api'

// 수신자 세 갈래 — BE core/notify_config 의 예약 키와 문자열이 같아야 한다.
//   inventory      기본 수신자   담당 '미지정' 품목만 (폴백)
//   inventory:*    총 책임자     담당 지정 여부와 무관하게 전 품목
//   inventory:{id} 품목 담당자
const NT_DEFAULT = 'inventory'
const NT_CHIEF = 'inventory:*'
const UNCATEGORIZED = '미분류'

const inputStyle = {
  padding: '8px 10px', fontSize: 13,
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  background: 'var(--color-white, #fff)', color: 'var(--color-dark)', fontFamily: 'inherit',
}
const fmt = (v) => (Number.isInteger(Number(v)) ? String(Number(v)) : `${Number(v)}`)

// 수신자 추가 폼 — 기본/총괄/품목/분류일괄 공용 (계정 or 외부 메일)
//   notifyType 은 그대로 onAdd 로 넘어간다. 분류 일괄은 대상이 여러 품목이라 null 을 주고,
//   호출부가 그 값을 무시한 채 item_ids 로 일괄 API 를 부른다.
function AddRecipient({ notifyType, users, existing, busy, onAdd, submitLabel = '추가' }) {
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
      <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={submit}>{submitLabel}</button>
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
  const [q, setQ] = useState('')                   // 품목 검색 (이름·품번·분류)
  const [groupByCat, setGroupByCat] = useState(true)   // 분류별 보기 ↔ 개별 보기
  const [openCat, setOpenCat] = useState(null)     // 분류 일괄 지정 폼이 열린 분류 경로

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

  // 분류 단위 일괄 지정 — BE 가 inventory:{id} 행을 여러 개 만든다(스키마 변경 없음)
  const bulkAssign = async (itemIds, payload) => {
    if (!itemIds.length) return
    setBusy(true)
    try {
      const r = await bulkAssignInventoryRecipient({
        itemIds, machineId: payload.machine_id ?? null, email: payload.email || '',
      })
      await reload()
      setOpenCat(null)
      setMsg({
        type: 'ok',
        text: `${r.created}건 지정됨${r.skipped ? ` · ${r.skipped}건은 이미 지정돼 건너뜀` : ''}`,
      })
    } catch (e) { setMsg({ type: 'err', text: e.message || '일괄 지정 실패' }) } finally { setBusy(false) }
  }

  // ★ 훅은 조기 반환(`if (!data)`) **위**에 있어야 한다 — 아래로 내리면 로딩 중 렌더에서 훅 개수가
  //   달라져 React 가 터진다. 그래서 data 가 없을 때도 안전하게 `data?.items` 로 읽는다.
  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const list = data?.items || []
    if (!kw) return list
    return list.filter((it) => `${it.name} ${it.part_no} ${it.category_path || ''}`
      .toLowerCase().includes(kw))
  }, [q, data])

  // 분류별 묶음 — category_path 가 없으면 '미분류'로 모은다(빠뜨리면 목록에서 사라진다)
  const byCat = useMemo(() => {
    const m = new Map()
    for (const it of shown) {
      const key = it.category_path || UNCATEGORIZED
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(it)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [shown])

  if (!data) return <p style={{ color: 'var(--color-text-sub)' }}>불러오는 중…</p>
  const { items = [], default_recipients = [], chief_recipients = [] } = data

  return (
    <>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-sub)', margin: '0 0 14px' }}>
        각 품목에 담당 수신자를 지정하면, <b>안전재고 미달이 감지될 때</b> 그 담당자에게만 메일이 나갑니다.
        미지정 품목은 <b>기본 수신자</b>로, <b>총 책임자</b>는 담당 지정과 무관하게 전 품목을 한 통으로 받습니다.
      </p>

      {/* 총 책임자 — 전 품목 수신 (기본 수신자와 다르다: 기본은 '담당 미지정'만) */}
      <div style={{ background: '#eef7f0', border: '1px solid #cfe6d6', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.02em', color: '#1f6b3a' }}>재고 총 책임자</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>담당 지정과 무관하게 <b>전 품목</b> 미달 내역을 한 통으로</span>
          <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginLeft: 4 }}>
            {chief_recipients.length === 0
              ? <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>미지정 — 총괄 메일 없음</span>
              : chief_recipients.map((r) => <RcpChip key={r.id} r={r} busy={busy} onRemove={remove} />)}
          </span>
        </div>
        <AddRecipient notifyType={NT_CHIEF} users={users} existing={chief_recipients} busy={busy} onAdd={add} />
      </div>

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
        <AddRecipient notifyType={NT_DEFAULT} users={users} existing={default_recipients} busy={busy} onAdd={add} />
      </div>

      {/* 검색 + 보기 전환 — 분류별로 묶어 보면 분류 단위 일괄 지정이 열린다 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <input style={{ ...inputStyle, minWidth: 240, flex: 1 }} value={q}
          placeholder="품목 검색 — 품명 · 품번 · 분류"
          onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: 'flex', gap: 4 }}>
          {[[true, '분류별'], [false, '개별']].map(([v, lab]) => (
            <button key={lab} type="button"
              className={groupByCat === v ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => { setGroupByCat(v); setOpenCat(null) }}>{lab}</button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{shown.length}건</span>
      </div>

      {/* 품목별 매핑 */}
      {items.length === 0 ? (
        <p style={{ color: 'var(--color-text-sub)', fontSize: 13 }}>
          안전재고가 설정된 품목이 없습니다 — 안전재고 관리에서 품목별 기준을 먼저 설정하세요.
        </p>
      ) : shown.length === 0 ? (
        <p style={{ color: 'var(--color-text-sub)', fontSize: 13 }}>
          <b>{q}</b> 에 해당하는 품목이 없습니다.
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
              {(groupByCat ? byCat : [[null, shown]]).map(([cat, rows]) => (
                <Fragment key={cat || '__all__'}>
                  {/* 분류 헤더 — 그 분류 전체에 담당자를 한 번에 지정하는 자리 */}
                  {cat !== null && (
                    <tr style={{ background: '#f4f7fc', borderTop: '1px solid #e3e9f2' }}>
                      <td style={{ ...tdStyle, fontWeight: 800, fontSize: 12.5 }}>
                        {cat} <span style={{ color: 'var(--color-text-sub)', fontWeight: 600 }}>· {rows.length}건</span>
                      </td>
                      <td style={tdStyle}>
                        {openCat === cat && (
                          <AddRecipient notifyType={null} users={users} existing={[]} busy={busy}
                            submitLabel={`${rows.length}건에 지정`}
                            onAdd={(_nt, payload) => bulkAssign(rows.map((r) => r.item_id), payload)} />
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button type="button" className="btn-text"
                          onClick={() => setOpenCat(openCat === cat ? null : cat)}>
                          {openCat === cat ? '닫기' : '＋ 분류 일괄'}
                        </button>
                      </td>
                    </tr>
                  )}
                  {rows.map((it) => (
                    <tr key={it.item_id} style={{ borderTop: '1px solid #eef1f5' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700 }}>{it.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--color-text-sub)', marginTop: 2 }}>
                          현재 {fmt(it.current)} · 안전 {fmt(it.safety_stock)}{it.unit ? it.unit : ''}
                          {it.short && <span style={{ color: 'var(--color-warning, #e67e22)', fontWeight: 700 }}> · 미달 ⚠</span>}
                          {/* 개별 보기에선 어느 분류인지 행마다 보여야 한다 (그룹 헤더가 없으므로) */}
                          {!groupByCat && it.category_path && <span> · {it.category_path}</span>}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                          {it.recipients.length === 0
                            ? <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>담당 미지정 → 기본 수신자</span>
                            : it.recipients.map((r) => <RcpChip key={r.id} r={r} busy={busy} onRemove={remove} />)}
                        </div>
                        {openItem === it.item_id && (
                          <AddRecipient notifyType={`${NT_DEFAULT}:${it.item_id}`} users={users}
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
                </Fragment>
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
