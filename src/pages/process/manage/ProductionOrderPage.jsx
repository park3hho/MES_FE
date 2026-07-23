// pages/process/manage/ProductionOrderPage.jsx
// 생산오더(PO) 관리 — 목록·동결 구성품·진행 조회 + '수주(SO)에서 생성' (정석 SO→PO, 2026-07-22).
//   송장→PO 임시 경로(같은 날 오전) 은퇴 — 수요원은 수주(SalesOrder). 송장 의존 제거.
//   BE = create_pos_from_so (SO 라인 Item 당 1개, planned=계약 총량, BOM 완전동결, 재실행 시 증분).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import {
  getProductionOrders,
  getProductionOrder,
  listSalesOrders,
  createSalesOrderProductionOrders,
} from '@/api'
import { SO_TYPE_LABELS, SO_STATUS_LABELS } from '@/constants/soConst'

const STATUS_LABEL = {
  OPEN: '대기',
  IN_PROGRESS: '진행중',
  DONE: '완료',
  CLOSED: '종결',
  CANCELLED: '취소',
}

export default function ProductionOrderPage() {
  const nav = useNavigate()
  const [orders, setOrders] = useState([])
  const [view, setView] = useState('list') // 'list' | number(detail id)
  const [msg, setMsg] = useState(null)
  // 수주(SO)에서 생성 (정석 SO→PO, 2026-07-22 — 송장 의존 제거)
  const [sos, setSos] = useState([])
  const [soSel, setSoSel] = useState('')
  const [soListErr, setSoListErr] = useState(null) // 권한(ADMIN_SALES_ORDER) 없으면 표면화 — 무음 403 방지
  const [poBusy, setPoBusy] = useState(false)
  const [poResult, setPoResult] = useState(null)

  const load = useCallback(async () => {
    try {
      setOrders(await getProductionOrders())
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '불러오기 실패' })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 수주 목록 (발효 ACTIVE 우선 노출, 작성중 DRAFT 포함) — 생성 대상 선택용
  useEffect(() => {
    let cancelled = false
    listSalesOrders({})
      .then((r) => {
        if (cancelled) return
        setSos((r.items || []).filter((s) => !['CANCELLED', 'CLOSED'].includes(s.status)))
        setSoListErr(null)
      })
      .catch((e) => {
        if (!cancelled) setSoListErr(e.message || '수주 목록 조회 실패 (수주 관리 권한 필요)')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 수주 라인 → 생산오더 파생 (완제품 Item 당 1개, planned=계약 총량, 증분 — BE create_pos_from_so)
  const generateFromSo = async () => {
    if (!soSel) return
    setPoBusy(true)
    setPoResult(null)
    try {
      const r = await createSalesOrderProductionOrders(Number(soSel))
      setPoResult(r)
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '생산오더 생성 실패' })
    } finally {
      setPoBusy(false)
    }
  }

  if (typeof view === 'number') {
    return <OrderDetail id={view} onBack={() => setView('list')} />
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="생산오더 (PO)"
        subtitle="수주(SO) 선택 → 생성 · 목록·동결 구성품·진행 조회"
        onBack={() => nav('/admin/manage')}
      />
      <div className="page-content">
        {/* ── 수주(SO)에서 생성 (정석 SO→PO, 2026-07-22 — 송장 의존 제거) ── */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 8,
          }}
        >
          <select
            value={soSel}
            onChange={(e) => {
              setSoSel(e.target.value)
              setPoResult(null)
            }}
            style={{
              padding: '8px 10px',
              fontSize: 14,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-white, #fff)',
              minWidth: 240,
            }}
          >
            <option value="">— 수주 선택 (계약 라인 기준 생성) —</option>
            {sos.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.so_no} · {SO_TYPE_LABELS[s.so_type] || s.so_type}
                {s.customer_name ? ` · ${s.customer_name}` : ''} (
                {SO_STATUS_LABELS[s.status] || s.status})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={generateFromSo}
            disabled={!soSel || poBusy}
          >
            {poBusy ? '생성 중…' : '생산오더 생성'}
          </button>
        </div>
        {soListErr && (
          <p
            style={{
              marginBottom: 8,
              fontSize: 13,
              color: 'var(--color-warning, #e67e22)',
              fontWeight: 600,
            }}
          >
            ⚠ {soListErr}
          </p>
        )}
        <p style={{ marginBottom: 16, fontSize: 13, color: 'var(--color-text-sub)' }}>
          ℹ 수주의 계약 라인(완제품 Item·계약 수량)을 기준으로 <b>제품 Item 당 1개</b>씩 파생합니다
          (BOM 완전동결 · 재실행 시 증분).
        </p>
        {poResult && (
          <div style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.7 }}>
            {poResult.created?.length > 0 && (
              <p>
                ✅ 생성 {poResult.created.length}건 — {poResult.created.join(', ')}
              </p>
            )}
            {poResult.updated?.length > 0 && (
              <p>
                🔁 갱신 {poResult.updated.length}건 — {poResult.updated.join(', ')}
              </p>
            )}
            {poResult.skipped?.length > 0 && (
              <p>⏸ 유지 {poResult.skipped.length}건 (진행/완료/충분)</p>
            )}
            {poResult.unresolved?.length > 0 && (
              <p style={{ color: 'var(--color-warning, #e67e22)', fontWeight: 600 }}>
                ⚠ 미해석 {poResult.unresolved.length}건 — 수주 관리에서 해당 라인을 완제품 Item 으로
                등록 후 다시 생성
                {' ('}
                {poResult.unresolved
                  .map(
                    (u) => `Φ${u.phi}·${u.motor_type}${u.reason === 'line' ? '(라인)' : '(Item)'}`,
                  )
                  .join(', ')}
                {')'}
              </p>
            )}
            {!poResult.created?.length &&
              !poResult.updated?.length &&
              !poResult.skipped?.length &&
              !poResult.unresolved?.length && (
                <p>변경 없음 — 이 송장에 완제품 Item 이 지정된 요구 항목이 없습니다.</p>
              )}
          </div>
        )}
        {msg && (
          <p
            style={{
              color:
                msg.type === 'err' ? 'var(--color-danger, #d23f3f)' : 'var(--color-primary, #2b7)',
              fontWeight: 600,
            }}
          >
            {msg.text}
          </p>
        )}
        {orders.length === 0 ? (
          <p style={{ color: 'var(--color-text-sub)' }}>
            등록된 생산오더가 없습니다 — 위에서 수주를 선택해 생성하세요.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: 8 }}>PO 번호</th>
                  <th style={{ padding: 8 }}>라인</th>
                  <th style={{ padding: 8 }}>BOM</th>
                  <th style={{ padding: 8 }}>계획/양품</th>
                  <th style={{ padding: 8 }}>상태</th>
                  <th style={{ padding: 8 }}>출처</th>
                  <th style={{ padding: 8 }} />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>{o.po_no}</td>
                    <td style={{ padding: 8 }}>{o.line}</td>
                    <td style={{ padding: 8 }}>
                      {o.bom_id ? `#${o.bom_id} v${o.bom_ver || '?'}` : '—'}
                    </td>
                    <td style={{ padding: 8 }}>
                      {o.produced_qty}/{o.planned_qty}
                    </td>
                    <td style={{ padding: 8 }}>{STATUS_LABEL[o.status] || o.status}</td>
                    <td style={{ padding: 8 }}>{o.invoice_id ? `송장 #${o.invoice_id}` : '—'}</td>
                    <td style={{ padding: 8 }}>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => setView(o.id)}
                      >
                        상세
                      </button>
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
    getProductionOrder(id)
      .then(setPo)
      .catch((e) => setErr(e.message || '불러오기 실패'))
  }, [id])

  if (err)
    return (
      <div className="page-flat">
        <PageHeader title="생산오더 상세" onBack={onBack} />
        <p className="page-content" style={{ color: 'var(--color-danger, #d23f3f)' }}>
          {err}
        </p>
      </div>
    )
  if (!po)
    return (
      <div className="page-flat">
        <PageHeader title="생산오더 상세" onBack={onBack} />
        <p className="page-content">불러오는 중…</p>
      </div>
    )

  const bomTxt = po.bom_id ? `#${po.bom_id} v${po.bom_ver || '?'}` : '없음'
  const srcTxt = po.invoice_id ? ` · 송장 #${po.invoice_id}` : ''

  return (
    <div className="page-flat">
      <PageHeader
        title={`생산오더 — ${po.po_no}`}
        subtitle={`${po.line} · BOM ${bomTxt}${srcTxt}`}
        onBack={onBack}
      />
      <div className="page-content">
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
          <Stat label="계획(양품)" v={po.planned_qty} />
          <Stat label="양품" v={po.produced_qty} />
          <Stat label="잉여" v={po.surplus_qty} />
          <Stat label="불량" v={po.scrap_qty} />
          <Stat label="상태" v={STATUS_LABEL[po.status] || po.status} />
        </div>

        <h3 style={{ marginBottom: 8 }}>동결 구성품 (POComponent)</h3>
        {!po.components || po.components.length === 0 ? (
          <p style={{ color: 'var(--color-text-sub)' }}>
            동결된 구성품이 없습니다 — 이 제품에 활성 BOM 이 없을 수 있습니다(소비 시 폴백).
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: 8 }}>#</th>
                  <th style={{ padding: 8 }}>구성품</th>
                  <th style={{ padding: 8 }}>규격</th>
                  <th style={{ padding: 8 }}>수량</th>
                  <th style={{ padding: 8 }}>역할</th>
                </tr>
              </thead>
              <tbody>
                {po.components.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 8 }}>{c.seq}</td>
                    <td style={{ padding: 8, fontWeight: 600 }}>{c.name || `#${c.part_id}`}</td>
                    <td style={{ padding: 8 }}>{c.spec || '—'}</td>
                    <td style={{ padding: 8 }}>
                      {c.quantity} {c.unit}
                    </td>
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
