// pages/process/manage/WarehouseUsageScanPage.jsx
// 창고 재고 QR 스캔 — 사용/미사용 전환 + 수량 차감 (2026-07-29, 차감 추가 2026-08-07).
//   흐름: LOT/STOCK QR 스캔 → [작업자 번호] → [후보 선택] → 액션
//         · 수량 차감      : 소모품 '가져감' → 수불대장 manual_out
//         · 전체 사용/미사용: LOT 단위 in_use 일괄 토글 → 수불대장 usage
//   BE: GET /warehouse/scan-resolve/{scan}, GET /warehouse/scan-usage/{lot},
//       POST /warehouse/scan-usage, POST /warehouse/scan-consume
//
// ★ 스캔 대상 식별 (2026-08-07)
//   제품 라벨 QR = lot_no 또는 STOCK 번호 `WH-{id}`. 예전엔 LOT 없는 자재에 **품명**을 찍어서
//   'Encoder Cable' 처럼 입고 차수가 다른 행이 여럿이면 어느 무더기인지 못 골랐다.
//   구 라벨도 계속 쓰도록 품명 조회를 남겨두되, 후보가 여럿이면 수량·위치를 보여주고 고르게 한다.
//
// ★ 작업자 스텝은 공용 단말 계정에서만 — 사람(PERSON) 계정은 계정 자체가 작업자라 자동.
//   수불대장의 machine FK 는 '단말'이라 MACHINE/SHARED 에선 누가 했는지가 안 남는다. BE 도 같은 검사를 한다.
import { useState } from 'react'

import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { WizardShell, Question, BigInput, PrimaryButton } from '@/components/QcWizard'
import { autoWorkerCode } from '@/constants/processConst'
import { scanResolve, scanUsageLookup, scanUsageSet, scanConsume } from '@/api'
import s from './WarehouseUsageScanPage.module.css'

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const fmtQty = (v) => String(num(v))   // 수량은 소수 허용(kg 등) — 정수면 정수로 그대로 찍힌다

export default function WarehouseUsageScanPage({ user, onLogout, onBack }) {
  const autoWorker = autoWorkerCode(user)          // 사람 계정이면 코드, 아니면 ''
  const needWorker = !autoWorker                   // '' = 공용 단말(또는 코드 미부여) → 입력 필요

  const [step, setStep] = useState('scan')   // 'scan'|'worker'|'pick'|'action'|'consume'
  const [cands, setCands] = useState([])     // scanResolve 후보
  const [row, setRow] = useState(null)       // 선택된 창고 행
  const [usage, setUsage] = useState(null)   // LOT 단위 사용/미사용 요약 (lot_no 있을 때만)
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [worker, setWorker] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)       // {type:'ok'|'err', text}

  // 작업자는 유지 — 같은 사람이 여러 자재를 연속 스캔하는 게 보통이라 매번 다시 묻지 않는다.
  const reset = () => {
    setStep('scan'); setCands([]); setRow(null); setUsage(null)
    setQty('1'); setNote(''); setMsg(null)
  }

  const effWorker = autoWorker || worker.trim()

  // 후보 확정 → 액션 화면. lot_no 가 있으면 LOT 단위 사용/미사용 요약도 함께 가져온다.
  const chooseRow = async (r) => {
    setRow(r); setQty('1'); setNote(''); setMsg(null); setUsage(null)
    if (r.lot_no) {
      try { setUsage(await scanUsageLookup(r.lot_no)) } catch { /* 요약 실패해도 차감은 가능 */ }
    }
    setStep('action')
  }

  const afterResolve = (list) => {
    setCands(list)
    if (list.length === 1) chooseRow(list[0])
    else setStep('pick')
  }

  const applyUsage = async (inUse) => {
    setBusy(true); setMsg(null)
    try {
      const r = await scanUsageSet(row.lot_no, inUse, effWorker)
      setMsg({ type: 'ok', text: `${r.name} — ${inUse ? '사용' : '미사용'}으로 전환 (${r.changed}/${r.matched}박스 변경)` })
      setTimeout(reset, 1600)
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '전환 실패' })
    } finally { setBusy(false) }
  }

  const applyConsume = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await scanConsume(row.id, num(qty), effWorker, note.trim())
      setMsg({ type: 'ok', text: `${r.name} — ${fmtQty(r.consumed)} ${r.unit} 차감 (잔량 ${fmtQty(r.qty_after)} ${r.unit})` })
      setTimeout(reset, 1800)
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '차감 실패' })
      setStep('action')
    } finally { setBusy(false) }
  }

  // ── 스캔 ──
  if (step === 'scan') {
    return (
      <QRScanner
        processLabel="창고 QR 스캔 · 사용/차감"
        banner={<p className={s.itemMeta}>창고 재고 QR(LOT 또는 STOCK 번호)을 스캔하세요</p>}
        onScan={async (val) => {
          const v = (val || '').trim()
          if (!v) throw new Error('빈 값입니다.')
          const r = await scanResolve(v)      // 없으면 404 throw → QRScanner 가 재스캔 허용
          const list = r.candidates || []
          if (!list.length) throw new Error(`창고 재고를 찾을 수 없습니다: ${v}`)
          if (needWorker && !worker.trim()) { setCands(list); setStep('worker'); return }
          afterResolve(list)
        }}
        onLogout={onLogout}
        onBack={onBack}
      />
    )
  }

  // ── 작업자 번호 (공용 단말만) ──
  if (step === 'worker') {
    const ok = worker.trim().length > 0
    const next = () => afterResolve(cands)
    return (
      <WizardShell stepIndex={1} total={2} onBack={reset} chips={[cands[0]?.name || '']}>
        <Question title="작업자 번호" sub="공용 단말이라 누가 작업했는지 기록이 필요합니다 · 작업자 번호표 참조">
          <BigInput
            value={worker}
            onChange={(e) => setWorker(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && ok) next() }}
            placeholder="예) 01"
            inputMode="numeric"
            autoFocus
          />
          <PrimaryButton disabled={!ok} onClick={next}>다음</PrimaryButton>
        </Question>
      </WizardShell>
    )
  }

  // ── 후보 선택 (같은 품명 라벨이 여러 행일 때) ──
  if (step === 'pick') {
    return (
      <div className="page-flat">
        <PageHeader title="어느 재고인가요?" subtitle={`${cands.length}건이 같은 QR 을 씁니다`} onBack={reset} />
        <div className={`page-content ${s.body}`}>
          <p className={s.pickHint}>
            품명으로 찍은 옛 라벨이라 무더기를 특정할 수 없습니다. 수량·위치를 보고 골라주세요.
            <br />앞으로 뽑는 라벨은 STOCK 번호가 찍혀 이 화면이 나오지 않습니다.
          </p>
          <div className={s.pickList}>
            {cands.map((r) => (
              <button key={r.id} type="button" className={s.pickItem} onClick={() => chooseRow(r)}>
                <span className={s.pickMain}>
                  <span className={s.pickTitle}>{r.name}{r.spec ? ` · ${r.spec}` : ''}</span>
                  <span className={s.pickSub}>
                    WH-{r.id} · {r.location_full || r.location || '위치 미지정'}
                  </span>
                </span>
                <span className={s.pickQty}>{fmtQty(r.quantity)} {r.unit || 'ea'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const unit = row.unit || 'ea'
  const stock = num(row.quantity)

  // ── 차감 수량 입력 ──
  if (step === 'consume') {
    const q = num(qty)
    const ok = q > 0 && q <= stock
    return (
      <div className="page-flat">
        <PageHeader title="수량 차감" subtitle={`${row.name} · 현재 ${fmtQty(stock)} ${unit}`}
          onBack={() => { setStep('action'); setMsg(null) }} />
        <div className={`page-content ${s.body}`}>
          <div className={s.consumeRow}>
            <button type="button" className={s.stepBtn} disabled={q <= 1}
              onClick={() => setQty(String(Math.max(1, q - 1)))}>−</button>
            <input className={s.qtyInput} value={qty} inputMode="decimal" autoFocus
              onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))} />
            <button type="button" className={s.stepBtn} disabled={q >= stock}
              onClick={() => setQty(String(Math.min(stock, q + 1)))}>+</button>
            <span className={s.unit}>{unit}</span>
          </div>
          <p className={s.afterHint}>
            차감 후 잔량 <b>{ok ? fmtQty(stock - q) : '-'} {unit}</b>
            {q > stock && ' · 재고보다 많습니다'}
          </p>
          <input className={s.noteInput} value={note} placeholder="용도 메모 (선택)"
            onChange={(e) => setNote(e.target.value)} />
          {msg && <p className={`${s.msg} ${msg.type === 'err' ? s.msgErr : s.msgOk}`}>{msg.text}</p>}
          <button type="button" className="btn-primary btn-lg btn-full"
            disabled={busy || !ok} onClick={applyConsume}>
            {busy ? '처리 중...' : `${fmtQty(q)} ${unit} 차감`}
          </button>
        </div>
      </div>
    )
  }

  // ── 액션 선택 ──
  const stateLabel = !usage ? null
    : usage.all_in_use ? '전체 사용 중'
      : usage.all_unused ? '전체 미사용'
        : `${usage.in_use_count}/${usage.count}박스 사용 중`

  return (
    <div className="page-flat">
      <PageHeader title="창고 QR" subtitle={row.lot_no || `WH-${row.id}`} onBack={reset} />
      <div className={`page-content ${s.body}`}>
        <p className={s.itemName}>{row.name}{row.spec ? ` · ${row.spec}` : ''}</p>
        <p className={s.itemMeta}>
          현재 <span className={s.qty}>{fmtQty(stock)} {unit}</span>
          {' · '}{row.location_full || row.location || '위치 미지정'}
          {stateLabel && <> · {stateLabel}</>}
          <br /><span className={s.stockNo}>STOCK WH-{row.id}</span>
        </p>

        {effWorker && (
          <p className={s.workerLine}>
            작업자 <b>{effWorker}</b>
            {needWorker && (
              <button type="button" className="btn-text" onClick={() => setStep('worker')}>변경</button>
            )}
          </p>
        )}

        {msg && <p className={`${s.msg} ${msg.type === 'err' ? s.msgErr : s.msgOk}`}>{msg.text}</p>}

        <div className={s.actionGroup}>
          <p className={s.actionLabel}>가져가기</p>
          <button type="button" className="btn-primary btn-lg btn-full"
            disabled={busy || stock <= 0} onClick={() => { setMsg(null); setStep('consume') }}>
            {stock > 0 ? '수량 차감' : '재고 없음'}
          </button>
        </div>

        {/* 사용/미사용은 LOT 단위 일괄 토글이라 lot_no 가 있는 자재(자석·원자재)에만 의미가 있다 */}
        {row.lot_no && (
          <div className={s.actionGroup}>
            <p className={s.actionLabel}>개봉 상태 (LOT 전체)</p>
            <div className={s.btnRow}>
              <button type="button" className="btn-secondary btn-lg btn-full"
                disabled={busy || usage?.all_in_use} onClick={() => applyUsage(true)}>전체 사용</button>
              <button type="button" className="btn-secondary btn-lg btn-full"
                disabled={busy || usage?.all_unused} onClick={() => applyUsage(false)}>전체 미사용</button>
            </div>
          </div>
        )}

        <button type="button" className="btn-text" onClick={reset}>다시 스캔</button>
      </div>
    </div>
  )
}
