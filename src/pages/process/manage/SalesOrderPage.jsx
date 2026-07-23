// pages/process/manage/SalesOrderPage.jsx
// 수주(Sales Order) 관리 — SO → PO → 송장(납품) 흐름의 수요원 (2026-07-22).
//   목록(유형 탭) / 등록(헤더+Item 라인) / 상세(계약 진척 바 + 송장 연결).
//   설계: docs/sales-order-design.md. BE 라우터 /sales-order (ADMIN_SALES_ORDER).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import {
  listSalesOrders, createSalesOrder, getSalesOrder, setSalesOrderStatus,
  getSalesOrderAvailableInvoices, linkSalesOrderInvoice, unlinkSalesOrderInvoice,
  getItems, getCompanies,
} from '@/api'
import { SO_TYPES, SO_TYPE_LABELS, SO_STATUS_LABELS, SO_STATUS_NEXT } from '@/constants/soConst'

const inputStyle = { padding: '8px 10px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }
const pct = (cur, target) => (!target ? 0 : Math.min(100, Math.round((cur / target) * 100)))

export default function SalesOrderPage() {
  const nav = useNavigate()
  const [view, setView] = useState('list')   // 'list' | 'create' | number(detail id)
  const [typeTab, setTypeTab] = useState('')  // '' | STANDARD | BLANKET

  if (view === 'create') {
    return <SoCreate onCancel={() => setView('list')} onDone={(id) => setView(id)} />
  }
  if (typeof view === 'number') {
    return <SoDetail soId={view} onBack={() => setView('list')} />
  }

  return (
    <div className="page-flat">
      <PageHeader title="수주 관리 (SO)" subtitle="계약 → 생산오더 → 송장(납품) 흐름의 수요원" onBack={() => nav('/admin/manage')} />
      <div className="page-content">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" className="btn-primary btn-sm" onClick={() => setView('create')}>＋ 새 수주</button>
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {['', ...SO_TYPES].map((t) => (
              <button key={t || 'all'} type="button"
                className={typeTab === t ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm'}
                onClick={() => setTypeTab(t)}>
                {t ? SO_TYPE_LABELS[t] : '전체'}
              </button>
            ))}
          </div>
        </div>
        <SoList typeTab={typeTab} onOpen={(id) => setView(id)} />
      </div>
    </div>
  )
}


// ── 목록 ──
function SoList({ typeTab, onOpen }) {
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    listSalesOrders({ soType: typeTab || undefined })
      .then((r) => { setRows(r.items || []); setMsg(null) })   // 성공 시 에러 초기화 — 탭 전환으로 복구 가능
      .catch((e) => setMsg(e.message || '불러오기 실패'))
  }, [typeTab])

  if (msg) return <p style={{ color: 'var(--color-danger, #d23f3f)', fontWeight: 600 }}>{msg}</p>
  if (rows.length === 0) return <p style={{ color: 'var(--color-text-sub)' }}>등록된 수주가 없습니다 — “새 수주”로 추가하세요.</p>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>
            <th style={{ padding: 8 }}>수주번호</th><th style={{ padding: 8 }}>유형</th><th style={{ padding: 8 }}>고객사</th>
            <th style={{ padding: 8 }}>품목</th><th style={{ padding: 8 }}>진척(출하/계약)</th><th style={{ padding: 8 }}>상태</th><th style={{ padding: 8 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((so) => (
            <tr key={so.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: 8, fontWeight: 600 }}>{so.so_no}</td>
              <td style={{ padding: 8 }}>{SO_TYPE_LABELS[so.so_type] || so.so_type}</td>
              <td style={{ padding: 8 }}>{so.customer_name || '—'}</td>
              <td style={{ padding: 8 }}>{so.line_count}종</td>
              <td style={{ padding: 8 }}>{so.shipped_qty} / {so.total_qty} ({pct(so.shipped_qty, so.total_qty)}%)</td>
              <td style={{ padding: 8 }}>{SO_STATUS_LABELS[so.status] || so.status}</td>
              <td style={{ padding: 8 }}>
                <button type="button" className="btn-ghost btn-sm" onClick={() => onOpen(so.id)}>상세</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


// ── 등록 ──
function SoCreate({ onCancel, onDone }) {
  const [soType, setSoType] = useState('STANDARD')
  const [companyId, setCompanyId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPoNo, setCustomerPoNo] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([])   // {item_id, name, part_no, total_qty, unit_price}
  const [companies, setCompanies] = useState([])
  const [itemMaster, setItemMaster] = useState([])
  const [itemSearch, setItemSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    getCompanies(true).then((d) => setCompanies((d.companies || []).filter(
      (c) => Array.isArray(c.roles) && c.roles.includes('customer')))).catch(() => {})
    getItems(true).then(setItemMaster).catch(() => {})
  }, [])

  const _isq = itemSearch.trim().toLowerCase()
  const searchResults = !_isq ? [] : itemMaster.filter((it) => {
    if (lines.some((l) => l.item_id === it.id)) return false
    return (it.name || '').toLowerCase().includes(_isq) || (it.part_no || '').toLowerCase().includes(_isq)
  }).slice(0, 8)

  const addLine = (it) => {
    setLines((prev) => [...prev, { item_id: it.id, name: it.name, part_no: it.part_no, total_qty: '', unit_price: '', line: '' }])
    setItemSearch('')
  }
  const setLine = (i, patch) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i))

  const save = async () => {
    if (soType === 'BLANKET' && !(validFrom && validTo)) { setErr('연간 계약은 유효 기간(시작·종료)이 필요합니다.'); return }
    if (!companyId && !customerName.trim()) { setErr('고객사를 선택하거나 이름을 입력하세요.'); return }
    const payloadLines = lines
      .map((l) => ({
        item_id: l.item_id,
        line: l.line || '',   // '' = 서버 자동판별(단일 스펙), 'stator'/'rotor' = 명시
        total_qty: parseInt(l.total_qty, 10) || 0,
        unit_price: l.unit_price !== '' ? Number(l.unit_price) : null,
      }))
      .filter((l) => l.total_qty > 0)
    if (payloadLines.length === 0) { setErr('품목을 1개 이상, 수량과 함께 추가하세요.'); return }
    if (payloadLines.some((l) => l.unit_price !== null && Number.isNaN(l.unit_price))) { setErr('단가는 숫자만 입력하세요.'); return }
    setSaving(true); setErr('')
    try {
      const r = await createSalesOrder({
        so_type: soType,
        company_id: companyId ? Number(companyId) : null,
        customer_name: customerName,
        customer_po_no: customerPoNo,
        valid_from: validFrom || null,
        valid_to: validTo || null,
        notes,
        lines: payloadLines,
      })
      onDone(r.id)
    } catch (e) {
      setErr(e.message || '수주 생성 실패')
    } finally { setSaving(false) }
  }

  return (
    <div className="page-flat">
      <PageHeader title="새 수주" subtitle="계약 헤더 + 완제품 Item 별 계약 수량" onBack={onCancel} />
      <div className="page-content" style={{ maxWidth: 760 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 12 }}>
          <label>유형
            <select style={{ ...inputStyle, width: '100%' }} value={soType} onChange={(e) => setSoType(e.target.value)}>
              {SO_TYPES.map((t) => <option key={t} value={t}>{SO_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label>고객사
            <select style={{ ...inputStyle, width: '100%' }} value={companyId}
              onChange={(e) => { const v = e.target.value; setCompanyId(v); const c = companies.find((x) => String(x.id) === v); setCustomerName(c ? c.name : '') }}>
              <option value="">— 선택 (또는 아래 직접입력) —</option>
              {companies.map((c) => <option key={c.id} value={String(c.id)}>{c.name}{c.code ? ` · ${c.code}` : ''}</option>)}
            </select>
          </label>
          {!companyId && (
            <label>고객사명 (미등록)
              <input style={{ ...inputStyle, width: '100%' }} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="직접 입력" />
            </label>
          )}
          <label>고객 PO 번호
            <input style={{ ...inputStyle, width: '100%' }} value={customerPoNo} onChange={(e) => setCustomerPoNo(e.target.value)} placeholder="고객 발행 PO (참조)" />
          </label>
          {soType === 'BLANKET' && (
            <>
              <label>계약 시작<input type="date" style={{ ...inputStyle, width: '100%' }} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></label>
              <label>계약 종료<input type="date" style={{ ...inputStyle, width: '100%' }} value={validTo} onChange={(e) => setValidTo(e.target.value)} /></label>
            </>
          )}
        </div>

        {/* 품목 라인 */}
        <h3 style={{ margin: '12px 0 6px' }}>계약 품목</h3>
        <input style={{ ...inputStyle, width: '100%', marginBottom: 6 }} value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)} placeholder="완제품 Item 검색 (이름 / 품번)" />
        {itemSearch.trim() && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--color-border)', borderRadius: 6, marginBottom: 8 }}>
            {searchResults.length === 0 ? <li style={{ padding: 8, color: 'var(--color-text-sub)' }}>일치하는 Item 없음</li>
              : searchResults.map((it) => (
                <li key={it.id}>
                  <button type="button" style={{ width: '100%', textAlign: 'left', padding: 8, background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => addLine(it)}>
                    {it.name}{it.part_no ? ` (${it.part_no})` : ''}
                  </button>
                </li>
              ))}
          </ul>
        )}
        {lines.map((l, i) => (
          <div key={l.item_id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ flex: 1, fontWeight: 600 }}>{l.name}{l.part_no ? ` (${l.part_no})` : ''}</span>
            {/* 라인 — 자동(단일 스펙) / 명시(고정자·회전자 스펙 둘 다인 Item 은 필수) */}
            <select style={{ ...inputStyle, width: 96 }} value={l.line} onChange={(e) => setLine(i, { line: e.target.value })}>
              <option value="">라인 자동</option>
              <option value="stator">고정자</option>
              <option value="rotor">회전자</option>
            </select>
            <input style={{ ...inputStyle, width: 80 }} inputMode="numeric" placeholder="수량" value={l.total_qty}
              onChange={(e) => { const v = e.target.value; if (v !== '' && !/^\d+$/.test(v)) return; setLine(i, { total_qty: v }) }} />
            <input style={{ ...inputStyle, width: 100 }} inputMode="decimal" placeholder="단가(선택)" value={l.unit_price}
              onChange={(e) => { const v = e.target.value; if (v !== '' && !/^\d*\.?\d*$/.test(v)) return; setLine(i, { unit_price: v }) }} />
            <button type="button" className="btn-text" onClick={() => removeLine(i)}>✕</button>
          </div>
        ))}

        <textarea style={{ ...inputStyle, width: '100%', marginTop: 8, resize: 'vertical' }} rows={2} value={notes}
          onChange={(e) => setNotes(e.target.value)} placeholder="비고 (선택)" maxLength={500} />

        {err && <p style={{ color: 'var(--color-danger, #d23f3f)', fontWeight: 600 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn-primary btn-lg" disabled={saving} onClick={save}>{saving ? '저장 중…' : '수주 생성'}</button>
          <button type="button" className="btn-secondary btn-lg" onClick={onCancel}>취소</button>
        </div>
      </div>
    </div>
  )
}


// ── 상세 ──
function SoDetail({ soId, onBack }) {
  const [so, setSo] = useState(null)
  const [avail, setAvail] = useState([])
  const [linkSel, setLinkSel] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setSo((await getSalesOrder(soId)).so)
      setAvail((await getSalesOrderAvailableInvoices()).items || [])
    } catch (e) { setMsg({ type: 'err', text: e.message || '불러오기 실패' }) }
  }, [soId])
  useEffect(() => { load() }, [load])

  const doStatus = async (st) => {
    setBusy(true)
    try { await setSalesOrderStatus(soId, st); await load(); setMsg({ type: 'ok', text: '상태 변경됨' }) }
    catch (e) { setMsg({ type: 'err', text: e.message || '상태 변경 실패' }) } finally { setBusy(false) }
  }
  const doLink = async () => {
    if (!linkSel) return
    setBusy(true)
    try {
      const r = await linkSalesOrderInvoice(soId, Number(linkSel))
      setLinkSel(''); await load()
      setMsg({ type: 'ok', text: r.unknown_models?.length ? `연결됨 (계약에 없는 모델 경고: ${r.unknown_models.join(', ')})` : '송장 연결됨' })
    } catch (e) { setMsg({ type: 'err', text: e.message || '연결 실패' }) } finally { setBusy(false) }
  }
  const doUnlink = async (invId) => {
    setBusy(true)
    try { await unlinkSalesOrderInvoice(soId, invId); await load() }
    catch (e) { setMsg({ type: 'err', text: e.message || '해제 실패' }) } finally { setBusy(false) }
  }

  if (!so) return <div className="page-flat"><PageHeader title="수주 상세" onBack={onBack} /><p className="page-content">{msg?.text || '불러오는 중…'}</p></div>

  const nexts = SO_STATUS_NEXT[so.status] || []
  return (
    <div className="page-flat">
      <PageHeader title={`수주 — ${so.so_no}`} subtitle={`${SO_TYPE_LABELS[so.so_type] || so.so_type} · ${so.customer_name || '고객사 미지정'}`} onBack={onBack} />
      <div className="page-content">
        {msg && <p style={{ color: msg.type === 'err' ? 'var(--color-danger, #d23f3f)' : 'var(--color-primary, #2b7)', fontWeight: 600 }}>{msg.text}</p>}

        {/* 상태 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <span>상태: <b>{SO_STATUS_LABELS[so.status] || so.status}</b></span>
          {nexts.map((st) => (
            <button key={st} type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => doStatus(st)}>→ {SO_STATUS_LABELS[st]}</button>
          ))}
        </div>

        {/* 라인 진척 */}
        <h3 style={{ marginBottom: 8 }}>품목별 계약 진척</h3>
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>
                <th style={{ padding: 8 }}>Φ / 라인</th><th style={{ padding: 8 }}>계약</th><th style={{ padding: 8 }}>출하</th>
                <th style={{ padding: 8 }}>잔여</th><th style={{ padding: 8, minWidth: 140 }}>진척</th><th style={{ padding: 8 }}>단가</th>
              </tr>
            </thead>
            <tbody>
              {so.lines.map((ln) => (
                <tr key={ln.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 8 }}>Φ{ln.phi}{ln.motor_type ? ` ${ln.motor_type}` : ''} · {ln.line === 'rotor' ? '회전자' : '고정자'}</td>
                  <td style={{ padding: 8 }}>{ln.total_qty}</td>
                  <td style={{ padding: 8, fontWeight: 600 }}>{ln.shipped_qty}</td>
                  <td style={{ padding: 8 }}>{ln.remaining_qty}</td>
                  <td style={{ padding: 8 }}>
                    <div style={{ background: 'var(--color-border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${pct(ln.shipped_qty, ln.total_qty)}%`, height: '100%', background: 'var(--color-primary, #2b7)' }} />
                    </div>
                  </td>
                  <td style={{ padding: 8 }}>{ln.unit_price != null ? ln.unit_price.toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 연결 송장 */}
        <h3 style={{ marginBottom: 8 }}>연결 송장 (납품)</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <select style={{ ...inputStyle, minWidth: 240 }} value={linkSel} onChange={(e) => setLinkSel(e.target.value)}>
            <option value="">— 연결할 송장 선택 —</option>
            {avail.map((i) => <option key={i.id} value={String(i.id)}>{i.invoice_no}{i.title ? ` · ${i.title}` : ''}</option>)}
          </select>
          <button type="button" className="btn-primary btn-sm" disabled={!linkSel || busy} onClick={doLink}>연결</button>
        </div>
        {so.invoices.length === 0 ? <p style={{ color: 'var(--color-text-sub)' }}>연결된 송장이 없습니다.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {so.invoices.map((i) => (
              <li key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontWeight: 600 }}>{i.invoice_no}</span>
                <span style={{ color: 'var(--color-text-sub)' }}>{i.title}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12 }}>{i.status}{i.ob_lot_no ? ` · ${i.ob_lot_no}` : ''}</span>
                <button type="button" className="btn-text" disabled={busy} onClick={() => doUnlink(i.id)}>해제</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
