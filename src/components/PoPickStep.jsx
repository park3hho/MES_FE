// components/PoPickStep.jsx
// 로터 생산오더(PO) 선택 스텝 — RBO(본딩)·REA(요크가공) 공용 (2026-07-28 공용화).
//   진행 가능한 로터 PO 목록에서 선택하거나 "PO 없이" 스킵. onPick(po) / onSkip().
import { useState, useEffect } from 'react'

import PageHeader from '@/components/common/PageHeader'
import { getProductionOrders } from '@/api'

export default function PoPickStep({
  onPick,
  onSkip,
  onBack,
  subtitle = 'PO 선택 시 그 오더의 동결 BOM으로 소비·집계돼요',
  skipLabel = 'PO 없이 진행 (회전자 직접 선택)',
}) {
  const [pos, setPos] = useState([])
  useEffect(() => {
    getProductionOrders('rotor')
      .then((list) => setPos((list || []).filter((p) => p.status === 'OPEN' || p.status === 'IN_PROGRESS')))
      .catch(() => setPos([]))
  }, [])

  return (
    <div className="page-flat">
      <PageHeader title="생산오더(PO)를 선택해 주세요" subtitle={subtitle} onBack={onBack} />
      <div className="process-content-inner">
        {pos.length === 0 && (
          <p style={{ color: 'var(--color-text-sub)' }}>
            진행 가능한 로터 생산오더가 없습니다 — [관리 &gt; 생산오더]에서 수주(SO)를 선택해 “생산오더 생성”으로 만들거나, 아래 “PO 없이”로 진행하세요.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, marginBottom: 16 }}>
          {pos.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn-secondary btn-md"
              style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 3, height: 'auto', padding: '10px 14px' }}
              onClick={() => onPick(p)}
            >
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{p.po_no}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: p.status === 'OPEN' ? 'var(--color-primary)' : 'var(--color-text-sub)' }}>{p.status}</span>
              </span>
              <span style={{ fontSize: 13 }}>{p.product_name || '제품 미지정'}{p.product_spec ? ` · ${p.product_spec}` : ''}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>
                계획 {p.planned_qty}개 · 양품 {p.produced_qty}/{p.planned_qty}
                {p.due_date ? ` · 납기 ${p.due_date}` : ''}
                {p.invoice_id ? ` · 송장 #${p.invoice_id}` : ''}
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="btn-ghost btn-md" onClick={onSkip}>
          {skipLabel}
        </button>
      </div>
    </div>
  )
}
