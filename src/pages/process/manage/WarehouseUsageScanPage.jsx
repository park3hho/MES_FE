// pages/process/manage/WarehouseUsageScanPage.jsx
// 창고 재고 QR 스캔 → 사용/미사용 즉시 전환 (2026-07-29).
//   흐름: LOT QR 스캔 → 현재 상태 표시 → [전체 사용]/[전체 미사용] → 창고 in_use 일괄 설정 + 수불대장 자동기록.
//   BE: GET /warehouse/scan-usage/{lot}(조회), POST /warehouse/scan-usage {lot_no,in_use}(설정).
//   창고 페이지 안이 아니라 메인(관리)에서 바로 진입하는 스캔 전용 화면.
import { useState } from 'react'

import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { scanUsageLookup, scanUsageSet } from '@/api'

export default function WarehouseUsageScanPage({ onLogout, onBack }) {
  const [step, setStep] = useState('scan')   // 'scan' | 'set'
  const [info, setInfo] = useState(null)     // scanUsageLookup 결과
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)       // {type:'ok'|'err', text}

  const reset = () => { setStep('scan'); setInfo(null); setMsg(null) }

  const apply = async (inUse) => {
    setBusy(true); setMsg(null)
    try {
      const r = await scanUsageSet(info.lot_no, inUse)
      setMsg({ type: 'ok', text: `${r.name} — ${inUse ? '사용' : '미사용'}으로 전환 (${r.changed}/${r.matched}박스 변경)` })
      setTimeout(reset, 1600)
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '전환 실패' })
    } finally { setBusy(false) }
  }

  if (step === 'scan') {
    return (
      <QRScanner
        processLabel="창고 사용/미사용 · LOT 스캔"
        banner={<p style={{ color: 'var(--color-text-sub)', margin: 0 }}>창고 재고 QR(LOT)을 스캔하세요</p>}
        onScan={async (val) => {
          const lot = (val || '').trim()
          if (!lot) throw new Error('빈 값입니다.')
          const r = await scanUsageLookup(lot)   // 없으면 404 throw → QRScanner 가 재스캔 허용
          setInfo(r); setStep('set')
        }}
        onLogout={onLogout}
        onBack={onBack}
      />
    )
  }

  const stateLabel = info.all_in_use ? '전체 사용 중'
    : info.all_unused ? '전체 미사용'
      : `${info.in_use_count}/${info.count}박스 사용 중`

  return (
    <div className="page-flat">
      <PageHeader title="창고 사용/미사용" subtitle={`${info.name} · ${info.lot_no}`} onBack={reset} />
      <div className="page-content" style={{ maxWidth: 480 }}>
        <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{info.name}</p>
        <p style={{ color: 'var(--color-text-sub)', margin: '0 0 16px' }}>
          {info.count}박스 · 총 {info.total_qty} {info.unit} · 현재 <b>{stateLabel}</b>
        </p>
        {msg && (
          <p style={{ color: msg.type === 'err' ? 'var(--color-danger, #d23f3f)' : 'var(--color-primary, #2b7)', fontWeight: 600, marginBottom: 12 }}>
            {msg.text}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="btn-primary btn-lg btn-full" disabled={busy || info.all_in_use} onClick={() => apply(true)}>
            전체 사용
          </button>
          <button type="button" className="btn-secondary btn-lg btn-full" disabled={busy || info.all_unused} onClick={() => apply(false)}>
            전체 미사용
          </button>
        </div>
        <button type="button" className="btn-text" style={{ marginTop: 12 }} onClick={reset}>다시 스캔</button>
      </div>
    </div>
  )
}
