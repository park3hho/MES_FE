// pages/process/manage/SalesOrderPage.jsx
// 수주(Sales Order) 관리 — SO → PO → 송장(납품) 흐름의 수요원 (2026-07-22).
//   목록(유형 탭) / 등록(헤더+Item 라인) / 상세(계약 진척 바 + 송장 연결).
//   설계: docs/sales-order-design.md. BE 라우터 /sales-order (ADMIN_SALES_ORDER).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import {
  listSalesOrders, createSalesOrder, getSalesOrder, setSalesOrderStatus,
  unlinkSalesOrderInvoice, createSalesOrderRelease,
  addSalesOrderLines, updateSalesOrderLine, deleteSalesOrderLine,
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
    // key={view} — 부모→자식 상세 이동 시 SoDetail 리마운트(상태 초기화, 잔여 msg/relQty 방지)
    return <SoDetail key={view} soId={view} onBack={() => setView('list')} onOpen={(id) => setView(id)} />
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
    let cancelled = false   // 탭 빠른 전환 시 늦은 응답이 현재 탭 목록을 덮는 경합 방지 (리뷰 반영)
    listSalesOrders({ soType: typeTab || undefined })
      .then((r) => { if (!cancelled) { setRows(r.items || []); setMsg(null) } })   // 성공 시 에러 초기화
      .catch((e) => { if (!cancelled) setMsg(e.message || '불러오기 실패') })
    return () => { cancelled = true }
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
    getItems(true, '', '', true).then(setItemMaster).catch(() => {})   // finished_only — 완제품(스펙 연결)만 + line
  }, [])

  const _isq = itemSearch.trim().toLowerCase()
  const searchResults = !_isq ? [] : itemMaster.filter((it) => {
    if (lines.some((l) => l.item_id === it.id)) return false
    return (it.name || '').toLowerCase().includes(_isq) || (it.part_no || '').toLowerCase().includes(_isq)
  }).slice(0, 8)

  const addLine = (it) => {
    // specLine = 이 Item 이 가진 스펙 라인('stator'|'rotor'|'both'). 단일이면 그 값으로 자동확정, both 면 선택 필요.
    const specLine = it.line || ''
    setLines((prev) => [...prev, {
      item_id: it.id, name: it.name, part_no: it.part_no, total_qty: '', unit_price: '',
      specLine, line: specLine === 'both' ? '' : specLine,
    }])
    setItemSearch('')
  }
  const setLine = (i, patch) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i))

  const save = async () => {
    if (soType === 'BLANKET' && !(validFrom && validTo)) { setErr('Blanket SO는 유효 기간(시작·종료)이 필요합니다.'); return }
    if (!companyId && !customerName.trim()) { setErr('고객사를 선택하거나 이름을 입력하세요.'); return }
    if (lines.some((l) => l.specLine === 'both' && !l.line)) { setErr('고정자·회전자 스펙이 모두 있는 품목은 라인을 선택하세요.'); return }
    const payloadLines = lines
      .map((l) => ({
        item_id: l.item_id,
        line: l.line || '',   // '' = 서버 자동판별(단일 스펙), 'stator'/'rotor' = 명시
        total_qty: parseInt(l.total_qty, 10) || 0,
        unit_price: l.unit_price !== '' ? Number(l.unit_price) : null,
      }))
      .filter((l) => l.total_qty > 0)
    if (payloadLines.length === 0) { setErr('품목을 1개 이상, 수량과 함께 추가하세요.'); return }
    // 수량 공란 라인 무음 누락 방지 — 추가한 품목이 조용히 빠진 채 저장되지 않게 명시 차단 (리뷰 반영)
    if (lines.length > payloadLines.length) { setErr('수량이 비어 있는 품목이 있습니다 — 수량을 입력하거나 행을 제거하세요.'); return }
    if (payloadLines.some((l) => l.unit_price !== null && Number.isNaN(l.unit_price))) { setErr('단가는 숫자만 입력하세요.'); return }
    setSaving(true); setErr('')
    try {
      const r = await createSalesOrder({
        so_type: soType,
        // ★ BE 스키마 키 = customer_id (company_id 로 보내면 Pydantic whitelist 가 무음 drop → FK 항상 null, 리뷰 blocker)
        customer_id: companyId ? Number(companyId) : null,
        customer_name: customerName,
        customer_po_no: customerPoNo,
        // BLANKET 전용 — STANDARD 로 유형 변경 시 잔존 날짜가 따라가지 않게 조건부 (리뷰 반영)
        valid_from: soType === 'BLANKET' ? (validFrom || null) : null,
        valid_to: soType === 'BLANKET' ? (validTo || null) : null,
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
            {/* 라인 — 단일 스펙 Item 은 해석 결과를 그대로 표시(자동확정), 고정자·회전자 둘 다인 Item 만 선택 */}
            {l.specLine === 'both' ? (
              <select style={{ ...inputStyle, width: 96 }} value={l.line} onChange={(e) => setLine(i, { line: e.target.value })}>
                <option value="">라인 선택</option>
                <option value="stator">고정자</option>
                <option value="rotor">회전자</option>
              </select>
            ) : (
              <span style={{ width: 96, textAlign: 'center', fontSize: 13, color: 'var(--color-text-sub)' }}>
                {l.line === 'rotor' ? '회전자' : '고정자'}
              </span>
            )}
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
function SoDetail({ soId, onBack, onOpen }) {
  const [so, setSo] = useState(null)
  const [relQty, setRelQty] = useState({})   // 분할 발행 폼: {부모라인 id → 수량 문자열}
  const [editLine, setEditLine] = useState(null)   // 라인 편집: {id, total_qty, unit_price} | null (2026-07-27)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setSo((await getSalesOrder(soId)).so)
    } catch (e) { setMsg({ type: 'err', text: e.message || '불러오기 실패' }) }
  }, [soId])
  useEffect(() => { load() }, [load])

  const doStatus = async (st) => {
    setBusy(true)
    try { await setSalesOrderStatus(soId, st); await load(); setMsg({ type: 'ok', text: '상태 변경됨' }) }
    catch (e) { setMsg({ type: 'err', text: e.message || '상태 변경 실패' }) } finally { setBusy(false) }
  }
  // 라인 편집(수량/단가) — BE update_line. 부모 라인 수량은 이미 발행(released)량 밑으로 못 내리게 FE 가드.
  const saveLine = async () => {
    if (!editLine) return
    const qty = parseInt(editLine.total_qty, 10) || 0
    if (qty <= 0) { setMsg({ type: 'err', text: '계약 수량은 1 이상이어야 합니다.' }); return }
    const src = so.lines.find((l) => l.id === editLine.id)
    if (src && src.released_qty != null && qty < src.released_qty) {
      setMsg({ type: 'err', text: `이미 분할 발행된 수량(${src.released_qty}) 미만으로 줄일 수 없습니다.` }); return
    }
    setBusy(true)
    try {
      await updateSalesOrderLine(editLine.id, {
        total_qty: qty,
        unit_price: editLine.unit_price !== '' && editLine.unit_price != null ? Number(editLine.unit_price) : null,
      })
      setEditLine(null); await load(); setMsg({ type: 'ok', text: '라인 수정됨' })
    } catch (e) { setMsg({ type: 'err', text: e.message || '라인 수정 실패' }) } finally { setBusy(false) }
  }
  const removeLineRow = async (ln) => {
    if (ln.released_qty > 0) { setMsg({ type: 'err', text: '분할 발행된 라인은 삭제할 수 없습니다 — 분할 수주를 먼저 정리하세요.' }); return }
    if (!window.confirm(`Φ${ln.phi} ${ln.motor_type} 라인을 삭제할까요?`)) return
    setBusy(true)
    try { await deleteSalesOrderLine(ln.id); await load(); setMsg({ type: 'ok', text: '라인 삭제됨' }) }
    catch (e) { setMsg({ type: 'err', text: e.message || '라인 삭제 실패' }) } finally { setBusy(false) }
  }
  const doUnlink = async (invId) => {
    setBusy(true)
    try { await unlinkSalesOrderInvoice(soId, invId); await load() }
    catch (e) { setMsg({ type: 'err', text: e.message || '해제 실패' }) } finally { setBusy(false) }
  }
  // 분할 수주(Release) 발행 — 수량 입력한 부모 라인만 {line_id, total_qty} 로 (BLANKET+ACTIVE 부모).
  const doCreateRelease = async () => {
    const lines = Object.entries(relQty)
      .map(([lineId, v]) => ({ line_id: Number(lineId), total_qty: parseInt(v, 10) || 0 }))
      .filter((l) => l.total_qty > 0)
    if (lines.length === 0) { setMsg({ type: 'err', text: '분할할 라인의 수량을 입력하세요.' }); return }
    setBusy(true)
    try {
      const r = await createSalesOrderRelease(soId, lines)
      setRelQty({}); await load()
      setMsg({ type: 'ok', text: `분할 수주 발행됨: ${r.so_no}` })
    } catch (e) { setMsg({ type: 'err', text: e.message || '분할 수주 발행 실패' }) } finally { setBusy(false) }
  }

  if (!so) return <div className="page-flat"><PageHeader title="수주 상세" onBack={onBack} /><p className="page-content">{msg?.text || '불러오는 중…'}</p></div>

  const nexts = SO_STATUS_NEXT[so.status] || []
  // 연간계약(부모) 여부 — 부모에서만 분할수주(release) 발행/목록 노출. 자식(parent_id 있음)/단발 STANDARD 는 제외.
  const isBlanketParent = so.so_type === 'BLANKET' && !so.parent_id
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
                <th style={{ padding: 8 }} />
              </tr>
            </thead>
            <tbody>
              {so.lines.map((ln) => {
                const isEditing = editLine?.id === ln.id
                return (
                <tr key={ln.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 8 }}>Φ{ln.phi}{ln.motor_type ? ` ${ln.motor_type}` : ''} · {ln.line === 'rotor' ? '회전자' : '고정자'}</td>
                  <td style={{ padding: 8 }}>
                    {isEditing ? (
                      <input style={{ ...inputStyle, width: 80 }} inputMode="numeric" value={editLine.total_qty}
                        onChange={(e) => { const v = e.target.value; if (v !== '' && !/^\d+$/.test(v)) return; setEditLine((p) => ({ ...p, total_qty: v })) }} />
                    ) : ln.total_qty}
                  </td>
                  <td style={{ padding: 8, fontWeight: 600 }}>{ln.shipped_qty}</td>
                  <td style={{ padding: 8 }}>{ln.remaining_qty}</td>
                  <td style={{ padding: 8 }}>
                    <div style={{ background: 'var(--color-border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${pct(ln.shipped_qty, ln.total_qty)}%`, height: '100%', background: 'var(--color-primary, #2b7)' }} />
                    </div>
                  </td>
                  <td style={{ padding: 8 }}>
                    {isEditing ? (
                      <input style={{ ...inputStyle, width: 100 }} inputMode="decimal" placeholder="단가" value={editLine.unit_price}
                        onChange={(e) => { const v = e.target.value; if (v !== '' && !/^\d*\.?\d*$/.test(v)) return; setEditLine((p) => ({ ...p, unit_price: v })) }} />
                    ) : (ln.unit_price != null ? ln.unit_price.toLocaleString() : '—')}
                  </td>
                  <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                    {isEditing ? (<>
                      <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={saveLine}>저장</button>
                      {' '}
                      <button type="button" className="btn-text" onClick={() => setEditLine(null)}>취소</button>
                    </>) : (<>
                      <button type="button" className="btn-ghost btn-sm" disabled={busy}
                        onClick={() => setEditLine({ id: ln.id, total_qty: String(ln.total_qty ?? ''), unit_price: ln.unit_price != null ? String(ln.unit_price) : '' })}>
                        편집
                      </button>
                      {' '}
                      <button type="button" className="btn-text" disabled={busy} onClick={() => removeLineRow(ln)}>삭제</button>
                    </>)}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 제품 추가 — 계약에 완제품 라인 추가 (addSalesOrderLines). 'line'=생산라인(고정자/회전자)이라 액션명은 '제품' (2026-07-27) */}
        {/* 분할 수주(자식)에는 직접 추가 금지 — 계약 범위는 상위 Blanket 에서만 정의(부모 라인 파생). BE 도 422 가드. (2026-07-27) */}
        {so.parent_id ? (
          <p style={{ color: 'var(--color-text-sub)', fontSize: 13, margin: '4px 0 20px' }}>
            이 수주는 Blanket 계약의 분할 수주입니다 — 품목 추가는 상위 Blanket 계약에서 하세요. (여기선 수량 조정만)
          </p>
        ) : (
          <AddProductPanel
            soId={soId}
            existingItemIds={new Set(so.lines.map((l) => l.item_id).filter(Boolean))}
            onAdded={() => { setMsg({ type: 'ok', text: '제품이 추가되었습니다' }); load() }}
          />
        )}

        {/* 분할 수주 (Release) — 연간계약(부모)에서만. 여기서 PO·송장이 붙는 실무 단위 발행 */}
        {isBlanketParent && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ marginBottom: 8 }}>분할 수주 (Release)</h3>
            {so.releases.length === 0 ? (
              <p style={{ color: 'var(--color-text-sub)' }}>아직 분할 수주가 없습니다 — 아래에서 계약을 분할해 발행하세요.</p>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>
                      <th style={{ padding: 8 }}>수주번호</th><th style={{ padding: 8 }}>상태</th>
                      <th style={{ padding: 8 }}>출하/발행</th><th style={{ padding: 8, minWidth: 140 }}>진척</th><th style={{ padding: 8 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {so.releases.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: 8, fontWeight: 600 }}>{r.so_no}</td>
                        <td style={{ padding: 8 }}>{SO_STATUS_LABELS[r.status] || r.status}</td>
                        <td style={{ padding: 8 }}>{r.shipped_qty} / {r.total_qty}</td>
                        <td style={{ padding: 8 }}>
                          <div style={{ background: 'var(--color-border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                            <div style={{ width: `${pct(r.shipped_qty, r.total_qty)}%`, height: '100%', background: 'var(--color-primary, #2b7)' }} />
                          </div>
                        </td>
                        <td style={{ padding: 8 }}>
                          <button type="button" className="btn-ghost btn-sm" onClick={() => onOpen && onOpen(r.id)}>상세</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 분할 발행 폼 — 발효(ACTIVE) 부모에서만 (BE 도 ACTIVE 만 허용) */}
            {so.status === 'ACTIVE' ? (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                <p style={{ fontWeight: 600, margin: '0 0 8px' }}>새 분할 수주 발행 — 수량 입력한 라인만</p>
                {so.lines.map((ln) => {
                  const rem = ln.release_remaining != null ? ln.release_remaining : ln.total_qty
                  return (
                    <div key={ln.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ flex: 1 }}>Φ{ln.phi}{ln.motor_type ? ` ${ln.motor_type}` : ''} · {ln.line === 'rotor' ? '회전자' : '고정자'}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>발행 {ln.released_qty ?? 0} / 계약 {ln.total_qty} · 잔여 {rem}</span>
                      <input style={{ ...inputStyle, width: 90 }} inputMode="numeric" placeholder="분할 수량" value={relQty[ln.id] || ''}
                        disabled={rem <= 0}
                        onChange={(e) => { const v = e.target.value; if (v !== '' && !/^\d+$/.test(v)) return; setRelQty((m) => ({ ...m, [ln.id]: v })) }} />
                    </div>
                  )
                })}
                <button type="button" className="btn-primary btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={doCreateRelease}>분할 수주 발행</button>
              </div>
            ) : (
              <p style={{ color: 'var(--color-text-sub)' }}>발효(ACTIVE) 상태에서만 분할 수주를 발행할 수 있습니다.</p>
            )}
          </div>
        )}

        {/* 연결 송장 — 읽기전용 목록. 귀속 지정은 송장 관리(모달)의 '소속 수주'에서 (수동 셀렉터 제거, 2026-07-27) */}
        <h3 style={{ marginBottom: 8 }}>연결 송장 (납품)</h3>
        <p style={{ color: 'var(--color-text-sub)', margin: '0 0 8px', fontSize: 13 }}>
          {isBlanketParent
            ? 'Blanket SO(부모)는 송장을 각 분할 수주에 귀속합니다 — 지정은 송장 관리에서.'
            : '송장 귀속은 송장 관리 화면의 "소속 수주"에서 지정합니다.'}
        </p>
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


// ── 제품(완제품 라인) 추가 — 기존 SO 에 계약 품목 추가 (addSalesOrderLines). SoCreate 검색 패턴 재사용 (2026-07-27).
//   BE add_lines 가 중복 Item·중복 (phi,motor,line) 사양을 400 거부(진척 이중집계 방지) → FE 는 호출·에러표면화만.
function AddProductPanel({ soId, existingItemIds, onAdded }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])   // {item_id, name, part_no, total_qty, unit_price, line}
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { getItems(true).then(setItems).catch(() => {}) }, [])

  const q = search.trim().toLowerCase()
  const results = !q ? [] : items.filter((it) => {
    if (existingItemIds.has(it.id) || rows.some((r) => r.item_id === it.id)) return false
    return (it.name || '').toLowerCase().includes(q) || (it.part_no || '').toLowerCase().includes(q)
  }).slice(0, 8)

  const add = (it) => { setRows((p) => [...p, { item_id: it.id, name: it.name, part_no: it.part_no, total_qty: '', unit_price: '', line: '' }]); setSearch('') }
  const setRow = (i, patch) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const removeRow = (i) => setRows((p) => p.filter((_, idx) => idx !== i))

  const submit = async () => {
    const payload = rows
      .map((r) => ({ item_id: r.item_id, line: r.line || '', total_qty: parseInt(r.total_qty, 10) || 0, unit_price: r.unit_price !== '' ? Number(r.unit_price) : null }))
      .filter((r) => r.total_qty > 0)
    if (payload.length === 0) { setErr('추가할 제품의 수량을 입력하세요.'); return }
    if (rows.length > payload.length) { setErr('수량이 비어 있는 제품이 있습니다 — 수량을 입력하거나 행을 제거하세요.'); return }
    setBusy(true); setErr('')
    try {
      await addSalesOrderLines(soId, payload)
      setRows([]); setSearch('')
      onAdded()
    } catch (e) { setErr(e.message || '제품 추가 실패') } finally { setBusy(false) }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ marginBottom: 8 }}>제품 추가</h3>
      <input style={{ ...inputStyle, width: '100%', marginBottom: 6 }} value={search}
        onChange={(e) => setSearch(e.target.value)} placeholder="완제품 Item 검색 (이름 / 품번)" />
      {search.trim() && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--color-border)', borderRadius: 6, marginBottom: 8 }}>
          {results.length === 0 ? <li style={{ padding: 8, color: 'var(--color-text-sub)' }}>일치하는 Item 없음</li>
            : results.map((it) => (
              <li key={it.id}>
                <button type="button" style={{ width: '100%', textAlign: 'left', padding: 8, background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => add(it)}>
                  {it.name}{it.part_no ? ` (${it.part_no})` : ''}
                </button>
              </li>
            ))}
        </ul>
      )}
      {rows.map((r, i) => (
        <div key={r.item_id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ flex: 1, fontWeight: 600 }}>{r.name}{r.part_no ? ` (${r.part_no})` : ''}</span>
          {/* line = 생산 라인(고정자/회전자). 자동 = 단일 스펙 Item 은 서버가 판별 */}
          <select style={{ ...inputStyle, width: 96 }} value={r.line} onChange={(e) => setRow(i, { line: e.target.value })}>
            <option value="">라인 자동</option>
            <option value="stator">고정자</option>
            <option value="rotor">회전자</option>
          </select>
          <input style={{ ...inputStyle, width: 80 }} inputMode="numeric" placeholder="수량" value={r.total_qty}
            onChange={(e) => { const v = e.target.value; if (v !== '' && !/^\d+$/.test(v)) return; setRow(i, { total_qty: v }) }} />
          <input style={{ ...inputStyle, width: 100 }} inputMode="decimal" placeholder="단가(선택)" value={r.unit_price}
            onChange={(e) => { const v = e.target.value; if (v !== '' && !/^\d*\.?\d*$/.test(v)) return; setRow(i, { unit_price: v }) }} />
          <button type="button" className="btn-text" onClick={() => removeRow(i)}>✕</button>
        </div>
      ))}
      {err && <p style={{ color: 'var(--color-danger, #d23f3f)', fontWeight: 600, margin: '6px 0' }}>{err}</p>}
      {rows.length > 0 && (
        <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={submit}>{busy ? '추가 중…' : '제품 추가'}</button>
      )}
    </div>
  )
}
