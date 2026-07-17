// pages/process/manage/ProductionOrderPage.jsx
// 생산오더(PO) 관리 — 제품 Item 선택 → BOM 완전동결(POComponent 스냅샷) (Layer A, 2026-07-17).
//   docs/production-order-bom-design.md §3. ⚠️ 오더가 소비를 '구동'하는 바인딩 스위치는 아직 미연결.
//   이 화면은 오더 생성/목록/동결 구성품 확인까지 (순수 추가, 기존 소비 흐름 무영향).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { getProductionOrders, getProductionOrder, createProductionOrder, getItems } from '@/api'

const LINE_OPTS = [
  { v: 'stator', label: '고정자(stator)' },
  { v: 'rotor', label: '회전자(rotor)' },
]
const STATUS_LABEL = { OPEN: '대기', IN_PROGRESS: '진행중', DONE: '완료', CLOSED: '종결', CANCELLED: '취소' }

export default function ProductionOrderPage() {
  const nav = useNavigate()
  const [orders, setOrders] = useState([])
  const [view, setView] = useState('list')   // 'list' | 'create' | number(detail id)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    try {
      setOrders(await getProductionOrders())
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '불러오기 실패' })
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (view === 'create') {
    return (
      <CreateOrder
        onCancel={() => setView('list')}
        onCreated={async (po) => { setView('list'); setMsg({ type: 'ok', text: `생성됨 — ${po.po_no} (동결 ${po.components?.length || 0}줄)` }); await load() }}
      />
    )
  }
  if (typeof view === 'number') {
    return <OrderDetail id={view} onBack={() => setView('list')} />
  }

  return (
    <div className="page-flat">
      <PageHeader title="생산오더 (PO)" subtitle="제품 선택 → BOM 완전동결. 소비 구동 연결 전(동결·조회 전용)" onBack={() => nav('/admin/manage')} />
      <div className="process-content-inner">
        <div style={{ marginBottom: 16 }}>
          <button type="button" className="btn-primary btn-md" onClick={() => setView('create')}>＋ 새 오더</button>
        </div>
        {msg && (
          <p style={{ color: msg.type === 'err' ? 'var(--color-danger, #d23f3f)' : 'var(--color-primary, #2b7)', fontWeight: 600 }}>{msg.text}</p>
        )}
        {orders.length === 0 ? (
          <p style={{ color: 'var(--color-text-sub)' }}>등록된 생산오더가 없습니다 — “새 오더”로 만드세요.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: 8 }}>PO 번호</th><th style={{ padding: 8 }}>라인</th><th style={{ padding: 8 }}>BOM</th>
                  <th style={{ padding: 8 }}>계획/양품</th><th style={{ padding: 8 }}>상태</th><th style={{ padding: 8 }} />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>{o.po_no}</td>
                    <td style={{ padding: 8 }}>{o.line}</td>
                    <td style={{ padding: 8 }}>{o.bom_id ? `#${o.bom_id} v${o.bom_ver || '?'}` : '—'}</td>
                    <td style={{ padding: 8 }}>{o.produced_qty}/{o.planned_qty}</td>
                    <td style={{ padding: 8 }}>{STATUS_LABEL[o.status] || o.status}</td>
                    <td style={{ padding: 8 }}>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setView(o.id)}>상세</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}


// ── 오더 생성 ──
function CreateOrder({ onCancel, onCreated }) {
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(null)   // {id, part_no, name}
  const [f, setF] = useState({ planned_qty: '', line: 'stator', due_date: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    getItems(true).then(setItems).catch(() => setItems([]))
  }, [])

  const filtered = q.trim()
    ? items.filter((it) => `${it.part_no} ${it.name}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30)
    : []

  const save = async () => {
    if (!picked) { setErr('제품 품목을 선택하세요.'); return }
    const qty = parseInt(f.planned_qty, 10)
    if (!qty || qty <= 0) { setErr('계획 수량(양품 목표)을 1 이상으로 입력하세요.'); return }
    setSaving(true); setErr('')
    try {
      const po = await createProductionOrder({
        product_item_id: picked.id,
        planned_qty: qty,
        line: f.line,
        due_date: f.due_date || null,
        note: f.note || '',
      })
      onCreated(po)
    } catch (e) {
      setErr(e.message || '생성 실패')
    } finally { setSaving(false) }
  }

  const inputStyle = { width: '100%', padding: 8, borderRadius: 6, border: '1.5px solid var(--color-border)' }

  return (
    <div className="page-flat">
      <PageHeader title="새 생산오더" subtitle="제품 Item 선택 시 그 제품의 기본 BOM 이 동결됩니다" onBack={onCancel} />
      <div className="process-content-inner" style={{ maxWidth: 640 }}>
        {/* 제품 선택 */}
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>제품 품목</label>
        {picked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontWeight: 600 }}>{picked.name} <span style={{ color: 'var(--color-text-sub)' }}>({picked.part_no})</span></span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPicked(null)}>변경</button>
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <input style={inputStyle} placeholder="품목명/번호 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            {filtered.length > 0 && (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
                {filtered.map((it) => (
                  <button key={it.id} type="button" className="btn-text"
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px' }}
                    onClick={() => { setPicked(it); setQ('') }}>
                    {it.name} <span style={{ color: 'var(--color-text-sub)' }}>({it.part_no})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          <label>계획 수량(양품 목표)
            <input style={inputStyle} type="number" step="1" min="1" value={f.planned_qty}
              onChange={(e) => setF((p) => ({ ...p, planned_qty: e.target.value }))} />
          </label>
          <label>라인
            <select style={inputStyle} value={f.line} onChange={(e) => setF((p) => ({ ...p, line: e.target.value }))}>
              {LINE_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </label>
          <label>납기일(선택)
            <input style={inputStyle} type="date" value={f.due_date} onChange={(e) => setF((p) => ({ ...p, due_date: e.target.value }))} />
          </label>
        </div>
        <label style={{ display: 'block', marginBottom: 16 }}>비고
          <input style={inputStyle} value={f.note} onChange={(e) => setF((p) => ({ ...p, note: e.target.value }))} />
        </label>

        {err && <p style={{ color: 'var(--color-danger, #d23f3f)', fontWeight: 600 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-primary btn-lg" disabled={saving} onClick={save}>
            {saving ? '생성 중…' : '오더 생성 (BOM 동결)'}
          </button>
          <button type="button" className="btn-secondary btn-lg" onClick={onCancel}>취소</button>
        </div>
      </div>
    </div>
  )
}


// ── 오더 상세 (동결 구성품) ──
function OrderDetail({ id, onBack }) {
  const [po, setPo] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    getProductionOrder(id).then(setPo).catch((e) => setErr(e.message || '불러오기 실패'))
  }, [id])

  if (err) return <div className="page-flat"><PageHeader title="생산오더 상세" onBack={onBack} /><p className="process-content-inner" style={{ color: 'var(--color-danger, #d23f3f)' }}>{err}</p></div>
  if (!po) return <div className="page-flat"><PageHeader title="생산오더 상세" onBack={onBack} /><p className="process-content-inner">불러오는 중…</p></div>

  return (
    <div className="page-flat">
      <PageHeader title={`생산오더 — ${po.po_no}`} subtitle={`${po.line} · BOM ${po.bom_id ? `#${po.bom_id} v${po.bom_ver || '?'}` : '없음'}`} onBack={onBack} />
      <div className="process-content-inner">
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
          <Stat label="계획(양품)" v={po.planned_qty} />
          <Stat label="양품" v={po.produced_qty} />
          <Stat label="잉여" v={po.surplus_qty} />
          <Stat label="불량" v={po.scrap_qty} />
          <Stat label="상태" v={STATUS_LABEL[po.status] || po.status} />
        </div>

        <h3 style={{ marginBottom: 8 }}>동결 구성품 (POComponent)</h3>
        {(!po.components || po.components.length === 0) ? (
          <p style={{ color: 'var(--color-text-sub)' }}>동결된 구성품이 없습니다 — 이 제품에 활성 BOM 이 없을 수 있습니다(소비 시 폴백).</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: 8 }}>#</th><th style={{ padding: 8 }}>구성품</th><th style={{ padding: 8 }}>규격</th>
                  <th style={{ padding: 8 }}>수량</th><th style={{ padding: 8 }}>역할</th>
                </tr>
              </thead>
              <tbody>
                {po.components.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 8 }}>{c.seq}</td>
                    <td style={{ padding: 8, fontWeight: 600 }}>{c.name || `#${c.part_id}`}</td>
                    <td style={{ padding: 8 }}>{c.spec || '—'}</td>
                    <td style={{ padding: 8 }}>{c.quantity} {c.unit}</td>
                    <td style={{ padding: 8 }}>{c.role || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, v }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div>
    </div>
  )
}
