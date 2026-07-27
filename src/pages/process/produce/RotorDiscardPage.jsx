// pages/process/produce/RotorDiscardPage.jsx
// 회전자 요크(EA) 폐기 — 본딩 중 자석 붙인 채 폐기 시 N/S/AZ 소모분을 창고에서 함께 차감 (2026-07-22).
//   흐름: 생산오더(PO) 선택 → EA QR 스캔 → 폐기 사유 + 극별 소모 개수 입력 → 폐기.
//   ★ 자석 Item 확정 기준 = PO 동결 → 회전자 BOM → phi 휴리스틱 (RBO 소비와 동일 우선순위, 2026-07-25).
//     phi 만 보고 아무 자석이나 빼면 다른 오더 자석을 오차감하므로 PO 를 골라 정확한 자석을 지정.
//   BE: POST /inventory/rotor/discard-yoke (자석 개봉재고 부족 시 422 차단).
import { useState, useEffect } from 'react'

import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { discardRotorYoke, getProductionOrders } from '@/api'

const POLES = ['N', 'S', 'AZ']
const _num = (v) => (v === '' || /^\d+$/.test(v))   // 숫자만 허용

export default function RotorDiscardPage({ onLogout, onBack }) {
  const [step, setStep] = useState('po')   // 'po' | 'scan' | 'form'
  const [po, setPo] = useState(null)       // 선택한 PO (null = PO 없이 → BOM 자동)
  const [eaLot, setEaLot] = useState('')
  const [reason, setReason] = useState('')
  const [category, setCategory] = useState('')
  const [mags, setMags] = useState({ N: '', S: '', AZ: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)   // {type:'ok'|'err', text}

  const reset = () => {
    setStep('po'); setPo(null); setEaLot(''); setReason(''); setCategory('')
    setMags({ N: '', S: '', AZ: '' }); setMsg(null)
  }

  const submit = async () => {
    if (!reason.trim()) { setMsg({ type: 'err', text: '폐기 사유를 입력하세요.' }); return }
    setBusy(true); setMsg(null)
    try {
      const magnets = {}
      for (const p of POLES) { const n = parseInt(mags[p], 10); if (n > 0) magnets[p] = n }
      const r = await discardRotorYoke({
        lot_no: eaLot, reason: reason.trim(), category: category.trim(), magnets,
        po_id: po?.id || null,
        rotor_item_id: po?.product_item_id || null,
      })
      const viaLabel = r.via === 'po' ? 'PO 동결' : r.via === 'bom' ? '회전자 BOM' : 'phi 휴리스틱'
      setMsg({ type: 'ok', text: `폐기 완료 — ${r.lot_no} · 자석[${viaLabel}] ${POLES.map((p) => `${p} ${r.magnets?.[p] || 0}`).join(' / ')}` })
      setTimeout(reset, 2000)
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '폐기 실패' })
    } finally { setBusy(false) }
  }

  // ── PO 선택 ──
  if (step === 'po') {
    return (
      <PoPickStep
        onPick={(p) => { setPo(p); setStep('scan') }}
        onSkip={() => { setPo(null); setStep('scan') }}
        onBack={onBack}
      />
    )
  }

  // ── EA 스캔 ──
  if (step === 'scan') {
    return (
      <QRScanner
        processLabel="회전자 요크 폐기 · EA 스캔"
        onScan={async (val) => { setEaLot(val); setStep('form') }}
        banner={<p style={{ color: 'var(--color-text-sub)', margin: 0 }}>
          {po ? `PO ${po.po_no} 기준 자석 차감` : 'PO 없이 — 회전자 BOM 기준 자석 차감'}
        </p>}
        onLogout={onLogout}
        onBack={() => setStep('po')}
      />
    )
  }

  const inputStyle = { width: '100%', padding: 8, borderRadius: 6, border: '1.5px solid var(--color-border)', fontSize: 14 }

  return (
    <div className="page-flat">
      <PageHeader title="회전자 요크 폐기" subtitle={`대상 요크: ${eaLot} · ${po ? `PO ${po.po_no}` : 'PO 없이(BOM)'}`} onBack={() => setStep('scan')} />
      <div className="page-content" style={{ maxWidth: 520 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>폐기 사유 *</label>
        <input style={{ ...inputStyle, marginBottom: 12 }} value={reason}
          onChange={(e) => setReason(e.target.value)} placeholder="예: 본딩 불량 / 자석 오부착" />

        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>분류 (선택)</label>
        <input style={{ ...inputStyle, marginBottom: 16 }} value={category}
          onChange={(e) => setCategory(e.target.value)} placeholder="예: 공정불량 / 자재불량" />

        <p style={{ fontWeight: 600, marginBottom: 6 }}>자석 소모 개수 (붙인 채 폐기 시 — 창고에서 차감)</p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {POLES.map((p) => (
            <label key={p} style={{ flex: 1, fontSize: 13, color: 'var(--color-text-sub)' }}>{p}극
              <input type="text" inputMode="numeric" value={mags[p]}
                onChange={(e) => { const v = e.target.value; if (_num(v)) setMags((m) => ({ ...m, [p]: v })) }}
                placeholder="0" style={{ ...inputStyle, textAlign: 'right', marginTop: 4 }} />
            </label>
          ))}
        </div>

        {msg && (
          <p style={{ color: msg.type === 'err' ? 'var(--color-danger, #d23f3f)' : 'var(--color-primary, #2b7)', fontWeight: 600, marginBottom: 12 }}>
            {msg.text}
          </p>
        )}
        <button type="button" className="btn-danger btn-lg btn-full" disabled={busy} onClick={submit}>
          {busy ? '폐기 중…' : '폐기 확인 (자석 차감)'}
        </button>
      </div>
    </div>
  )
}

// 생산오더(PO) 선택 — RBO 와 동일 소스. 선택 시 그 PO 동결 BOM 자석을 차감 기준으로 사용 (2026-07-25).
function PoPickStep({ onPick, onSkip, onBack }) {
  const [pos, setPos] = useState([])
  useEffect(() => {
    getProductionOrders('rotor')
      .then((list) => setPos((list || []).filter((p) => p.status === 'OPEN' || p.status === 'IN_PROGRESS')))
      .catch(() => setPos([]))
  }, [])

  return (
    <div className="page-flat">
      <PageHeader title="생산오더(PO)를 선택해 주세요" subtitle="폐기 시 뺄 자석을 그 오더의 동결 BOM 기준으로 차감해요" onBack={onBack} />
      <div className="page-content">
        {pos.length === 0 && (
          <p style={{ color: 'var(--color-text-sub)' }}>
            진행 가능한 로터 생산오더가 없습니다 — 아래 “PO 없이”로 진행하면 회전자 BOM 기준으로 차감합니다.
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
            </button>
          ))}
        </div>
        <button type="button" className="btn-ghost btn-md" onClick={onSkip}>
          PO 없이 진행 (회전자 BOM 기준 차감)
        </button>
      </div>
    </div>
  )
}
