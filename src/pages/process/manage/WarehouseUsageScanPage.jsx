// pages/process/manage/WarehouseUsageScanPage.jsx
// 창고 재고 QR 스캔 → 사용/미사용 즉시 전환 (2026-07-29).
//   흐름: LOT QR 스캔 → [작업자 번호] → 현재 상태 표시 → [전체 사용]/[전체 미사용]
//         → 창고 in_use 일괄 설정 + 수불대장 자동기록.
//   BE: GET /warehouse/scan-usage/{lot}(조회), POST /warehouse/scan-usage {lot_no,in_use,worker}(설정).
//   창고 페이지 안이 아니라 메인(관리)에서 바로 진입하는 스캔 전용 화면.
//
// ★ 작업자 스텝은 **공용 단말 계정에서만** 뜬다 (2026-08-07).
//   사람(PERSON) 계정은 계정 자체가 작업자라 autoWorkerCode 가 코드를 주고 스텝을 건너뛴다.
//   MACHINE/SHARED 는 수불대장에 단말만 남고 '누가' 가 안 남아서 반드시 입력받는다.
//   (BE 도 계정 종류로 같은 검사를 한다 — 화면만 고치면 우회 가능해서.)
import { useState } from 'react'

import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { WizardShell, Question, BigInput, PrimaryButton } from '@/components/QcWizard'
import { autoWorkerCode } from '@/constants/processConst'
import { scanUsageLookup, scanUsageSet } from '@/api'

export default function WarehouseUsageScanPage({ user, onLogout, onBack }) {
  const autoWorker = autoWorkerCode(user)          // 사람 계정이면 코드, 아니면 ''
  const needWorker = !autoWorker                   // '' = 공용 단말(또는 코드 미부여) → 입력 필요

  const [step, setStep] = useState('scan')   // 'scan' | 'worker' | 'set'
  const [info, setInfo] = useState(null)     // scanUsageLookup 결과
  const [worker, setWorker] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)       // {type:'ok'|'err', text}

  // 작업자는 유지 — 같은 사람이 여러 LOT 을 연속 스캔하는 게 보통이라 매번 다시 묻지 않는다.
  const reset = () => { setStep('scan'); setInfo(null); setMsg(null) }

  const apply = async (inUse) => {
    setBusy(true); setMsg(null)
    try {
      const r = await scanUsageSet(info.lot_no, inUse, autoWorker || worker)
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
          setInfo(r)
          // 이미 입력해 둔 작업자가 있으면 다시 묻지 않고 바로 전환 화면으로
          setStep(needWorker && !worker.trim() ? 'worker' : 'set')
        }}
        onLogout={onLogout}
        onBack={onBack}
      />
    )
  }

  if (step === 'worker') {
    const ok = worker.trim().length > 0
    return (
      <WizardShell stepIndex={1} total={2} onBack={reset} chips={[info.lot_no]}>
        <Question title="작업자 번호" sub="공용 단말이라 누가 작업했는지 기록이 필요합니다 · 작업자 번호표 참조">
          <BigInput
            value={worker}
            onChange={(e) => setWorker(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && ok) setStep('set') }}
            placeholder="예) 01"
            inputMode="numeric"
            autoFocus
          />
          <PrimaryButton disabled={!ok} onClick={() => setStep('set')}>다음</PrimaryButton>
        </Question>
      </WizardShell>
    )
  }

  const stateLabel = info.all_in_use ? '전체 사용 중'
    : info.all_unused ? '전체 미사용'
      : `${info.in_use_count}/${info.count}박스 사용 중`
  const shownWorker = autoWorker || worker.trim()

  return (
    <div className="page-flat">
      <PageHeader title="창고 사용/미사용" subtitle={`${info.name} · ${info.lot_no}`} onBack={reset} />
      <div className="page-content" style={{ maxWidth: 480 }}>
        <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{info.name}</p>
        <p style={{ color: 'var(--color-text-sub)', margin: '0 0 16px' }}>
          {info.count}박스 · 총 {info.total_qty} {info.unit} · 현재 <b>{stateLabel}</b>
        </p>
        {shownWorker && (
          <p style={{ color: 'var(--color-text-sub)', margin: '0 0 12px' }}>
            작업자 <b>{shownWorker}</b>
            {needWorker && (
              <button type="button" className="btn-text" style={{ marginLeft: 8 }}
                onClick={() => setStep('worker')}>변경</button>
            )}
          </p>
        )}
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
