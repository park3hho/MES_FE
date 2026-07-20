// pages/process/manage/ProductionOrderPage.jsx
// 생산오더(PO) 관리 — 목록/상세 조회 전용 (Layer A 2026-07-17, 생성폼 제거 2026-07-18).
//   ⚠️ PO 생성은 이제 송장(송장관리)에서만 — docs/invoice-po-integration-design.md §5.
//   이 화면은 오더 목록·동결 구성품(POComponent)·카운터 조회 + 출처(송장) 표시.
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { getProductionOrders, getProductionOrder } from '@/api'

const STATUS_LABEL = { OPEN: '대기', IN_PROGRESS: '진행중', DONE: '완료', CLOSED: '종결', CANCELLED: '취소' }

export default function ProductionOrderPage() {
  const nav = useNavigate()
  const [orders, setOrders] = useState([])
  const [view, setView] = useState('list')   // 'list' | number(detail id)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    try {
      setOrders(await getProductionOrders())
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '불러오기 실패' })
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (typeof view === 'number') {
    return <OrderDetail id={view} onBack={() => setView('list')} />
  }

  return (
    <div className="page-flat">
      <PageHeader title="생산오더 (PO)" subtitle="송장관리에서 생성 · 여기선 목록·동결 구성품·진행 조회" onBack={() => nav('/admin/manage')} />
      <div className="page-content">
        <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--color-text-sub)' }}>
          ℹ 생산오더는 <b>송장관리</b>의 요구 항목에서 “생산오더 생성”으로 만듭니다 (제품 라인마다 1개, BOM 완전동결).
        </p>
        {msg && (
          <p style={{ color: msg.type === 'err' ? 'var(--color-danger, #d23f3f)' : 'var(--color-primary, #2b7)', fontWeight: 600 }}>{msg.text}</p>
        )}
        {orders.length === 0 ? (
          <p style={{ color: 'var(--color-text-sub)' }}>등록된 생산오더가 없습니다 — 송장관리에서 생성하세요.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: 8 }}>PO 번호</th><th style={{ padding: 8 }}>라인</th><th style={{ padding: 8 }}>BOM</th>
                  <th style={{ padding: 8 }}>계획/양품</th><th style={{ padding: 8 }}>상태</th><th style={{ padding: 8 }}>출처</th><th style={{ padding: 8 }} />
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
                    <td style={{ padding: 8 }}>{o.invoice_id ? `송장 #${o.invoice_id}` : '—'}</td>
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


// ── 오더 상세 (동결 구성품) ──
function OrderDetail({ id, onBack }) {
  const [po, setPo] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    getProductionOrder(id).then(setPo).catch((e) => setErr(e.message || '불러오기 실패'))
  }, [id])

  if (err) return <div className="page-flat"><PageHeader title="생산오더 상세" onBack={onBack} /><p className="page-content" style={{ color: 'var(--color-danger, #d23f3f)' }}>{err}</p></div>
  if (!po) return <div className="page-flat"><PageHeader title="생산오더 상세" onBack={onBack} /><p className="page-content">불러오는 중…</p></div>

  const bomTxt = po.bom_id ? `#${po.bom_id} v${po.bom_ver || '?'}` : '없음'
  const srcTxt = po.invoice_id ? ` · 송장 #${po.invoice_id}` : ''

  return (
    <div className="page-flat">
      <PageHeader title={`생산오더 — ${po.po_no}`} subtitle={`${po.line} · BOM ${bomTxt}${srcTxt}`} onBack={onBack} />
      <div className="page-content">
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
