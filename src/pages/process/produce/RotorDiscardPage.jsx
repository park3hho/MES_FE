// pages/process/produce/RotorDiscardPage.jsx
// 회전자 요크(EA) 폐기 — 본딩 중 자석 붙인 채 폐기 시 N/S/AZ 소모분을 창고에서 함께 차감 (2026-07-22).
//   흐름: EA QR 스캔 → 폐기 사유 + 극별 소모 개수 입력 → 폐기(EA discarded + 자석 차감 + 수불대장).
//   BE: POST /inventory/rotor/discard-yoke (자석 개봉재고 부족 시 422 차단).
import { useState } from 'react'

import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { discardRotorYoke } from '@/api'

const POLES = ['N', 'S', 'AZ']
const _num = (v) => (v === '' || /^\d+$/.test(v))   // 숫자만 허용

export default function RotorDiscardPage({ onLogout, onBack }) {
  const [step, setStep] = useState('scan')   // 'scan' | 'form'
  const [eaLot, setEaLot] = useState('')
  const [reason, setReason] = useState('')
  const [category, setCategory] = useState('')
  const [mags, setMags] = useState({ N: '', S: '', AZ: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)   // {type:'ok'|'err', text}

  const reset = () => {
    setStep('scan'); setEaLot(''); setReason(''); setCategory(''); setMags({ N: '', S: '', AZ: '' }); setMsg(null)
  }

  const submit = async () => {
    if (!reason.trim()) { setMsg({ type: 'err', text: '폐기 사유를 입력하세요.' }); return }
    setBusy(true); setMsg(null)
    try {
      const magnets = {}
      for (const p of POLES) { const n = parseInt(mags[p], 10); if (n > 0) magnets[p] = n }
      const r = await discardRotorYoke({ lot_no: eaLot, reason: reason.trim(), category: category.trim(), magnets })
      setMsg({ type: 'ok', text: `폐기 완료 — ${r.lot_no} · 자석 ${POLES.map((p) => `${p} ${r.magnets?.[p] || 0}`).join(' / ')}` })
      setTimeout(reset, 1800)
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '폐기 실패' })
    } finally { setBusy(false) }
  }

  if (step === 'scan') {
    return (
      <QRScanner
        processLabel="회전자 요크 폐기 · EA 스캔"
        onScan={async (val) => { setEaLot(val); setStep('form') }}
        banner={<p style={{ color: 'var(--color-text-sub)', margin: 0 }}>폐기할 요크(EA) LOT 을 스캔하세요</p>}
        onLogout={onLogout}
        onBack={onBack}
      />
    )
  }

  const inputStyle = { width: '100%', padding: 8, borderRadius: 6, border: '1.5px solid var(--color-border)', fontSize: 14 }

  return (
    <div className="page-flat">
      <PageHeader title="회전자 요크 폐기" subtitle={`대상 요크: ${eaLot}`} onBack={() => { reset() }} />
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
