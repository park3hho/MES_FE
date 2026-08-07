// pages/process/manage/WarehouseUsageScanPage.jsx
// 창고 재고 QR 스캔 — 수량 차감 + 사용/미사용 전환 (2026-07-29, 차감 추가 2026-08-07).
//   흐름: LOT/STOCK QR 스캔 → [작업자 번호] → [후보 선택] → 액션 (한 화면에서 즉시 실행)
//         · 수량 차감  : 인라인 입력 + 확인 → 소모품 '가져감' → 수불대장 manual_out
//         · 개봉 상태 변경: LOT 단위 in_use 일괄 토글(단일 버튼) → 수불대장 usage
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
//
// ★ UI (2026-08-07 재설계): 품명 → **현재 수량(최대 강조)** → Stock_No./위치(보조) → 액션 2개.
//   차감은 별도 화면 없이 [수량 입력][확인] 인라인 — 개봉 토글도 현재 상태 기준 단일 버튼 (사용자 지정).
//   안내문구는 지시만 — 이유 설명은 넣지 않는다(과잉친절 지적).
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

  const [step, setStep] = useState('scan')   // 'scan'|'worker'|'pick'|'action'
  const [cands, setCands] = useState([])     // scanResolve 후보
  const [row, setRow] = useState(null)       // 선택된 창고 행
  const [usage, setUsage] = useState(null)   // LOT 단위 사용/미사용 요약 (lot_no 있을 때만)
  const [qty, setQty] = useState('')         // 차감 수량 — 빈 값 시작 (확인 즉시 실행이라 실수 방지)
  const [worker, setWorker] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)       // {type:'ok'|'err', text}

  // 작업자는 유지 — 같은 사람이 여러 자재를 연속 스캔하는 게 보통이라 매번 다시 묻지 않는다.
  const reset = () => {
    setStep('scan'); setCands([]); setRow(null); setUsage(null)
    setQty(''); setMsg(null)
  }

  const effWorker = autoWorker || worker.trim()

  // 후보 확정 → 액션 화면. lot_no 가 있으면 LOT 단위 사용/미사용 요약도 함께 가져온다.
  const chooseRow = async (r) => {
    setRow(r); setQty(''); setMsg(null); setUsage(null)
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
      setMsg({ type: 'ok', text: `${inUse ? '사용' : '미사용'}으로 변경 완료 (${r.changed}/${r.matched}박스)` })
      setTimeout(reset, 1600)
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '변경 실패' })
    } finally { setBusy(false) }
  }

  const applyConsume = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await scanConsume(row.id, num(qty), effWorker, '')
      setMsg({ type: 'ok', text: `${fmtQty(r.consumed)} ${r.unit} 차감 완료 · 잔량 ${fmtQty(r.qty_after)} ${r.unit}` })
      setTimeout(reset, 1800)
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '차감 실패' })
    } finally { setBusy(false) }
  }

  // ── 스캔 ──
  if (step === 'scan') {
    return (
      <QRScanner
        processLabel="창고 QR 스캔"
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
  //   ⚠️ chips 를 넘기지 않는다 — WizardShell 의 chips 는 {label, value} 객체 배열이라
  //     문자열을 넣으면 label/value 가 비어 '빈 칩 버블'이 그려진다 (2026-08-07 버그).
  if (step === 'worker') {
    const ok = worker.trim().length > 0
    const next = () => afterResolve(cands)
    return (
      <WizardShell stepIndex={1} total={2} onBack={reset}>
        <Question title="작업자 번호" sub="작업자 번호표의 번호를 입력하세요">
          <BigInput
            value={worker}
            onChange={(e) => setWorker(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && ok) next() }}
            placeholder="번호 입력"
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
        <PageHeader title="재고 선택" subtitle={cands[0]?.name || ''} onBack={reset} />
        <div className={`page-content ${s.body}`}>
          <p className={s.pickHint}>같은 품명 재고가 {cands.length}건 있습니다. 수량·위치로 선택하세요.</p>
          <div className={s.pickList}>
            {cands.map((r) => (
              <button key={r.id} type="button" className={s.pickItem} onClick={() => chooseRow(r)}>
                <span className={s.pickMain}>
                  <span className={s.pickTitle}>{r.name}{r.spec ? ` · ${r.spec}` : ''}</span>
                  <span className={s.pickSub}>
                    WH-{r.id} · {r.location_full || r.location || '위치 미지정'}
                  </span>
                </span>
                <span className={s.pickQty}>{fmtQty(r.quantity)}<small>{r.unit || 'ea'}</small></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── 액션 (차감 인라인 + 개봉 토글) ──
  const unit = row.unit || 'ea'
  const stock = num(row.quantity)
  const q = num(qty)
  const okQty = q > 0 && q <= stock

  // 개봉 상태 — '전체' 수식 없이 상태만 (사용자 지정). 섞여 있으면 '일부 사용'.
  const openLabel = !usage ? null
    : usage.all_in_use ? '사용'
      : usage.all_unused ? '미사용'
        : '일부 사용'
  // 토글 방향 = 현재 상태의 반대. 일부 사용 상태는 '사용하기'(마저 개봉) 쪽으로.
  const nextInUse = usage ? !usage.all_in_use : true

  return (
    <div className="page-flat">
      <PageHeader title="창고 QR" subtitle={row.lot_no || `WH-${row.id}`} onBack={reset} />
      <div className={`page-content ${s.body}`}>
        {effWorker && (
          <div className={s.workerBar}>
            <span className={s.workerBadge}>작업자 {effWorker}</span>
            {needWorker && (
              <button type="button" className={s.workerChange} onClick={() => setStep('worker')}>변경</button>
            )}
          </div>
        )}

        <h2 className={s.prodName}>{row.name}</h2>
        {row.spec && <p className={s.prodSpec}>{row.spec}</p>}

        <div className={`${s.qtyBox} ${stock <= 0 ? s.qtyEmpty : ''}`}>
          <span className={s.qtyLabel}>현재 수량</span>
          <span className={s.qtyValue}>{fmtQty(stock)}<span className={s.qtyUnit}>{unit}</span></span>
        </div>

        <div className={s.meta}>
          <span className={s.metaLabel}>Stock_No.</span>
          <span className={s.metaValue}>WH-{row.id}</span>
          <span className={s.metaLabel}>위치</span>
          <span className={s.metaValue}>{row.location_full || row.location || '미지정'}</span>
          {openLabel && (
            <>
              <span className={s.metaLabel}>개봉 상태</span>
              <span className={s.metaValue}>{openLabel}</span>
            </>
          )}
        </div>

        {msg && <p className={`${s.msg} ${msg.type === 'err' ? s.msgErr : s.msgOk}`}>{msg.text}</p>}

        <div className={s.actions}>
          <div>
            <p className={s.actionLabel}>수량 차감</p>
            <div className={s.consumeRow}>
              <input className={s.qtyInput} value={qty} inputMode="decimal" placeholder="수량"
                onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter' && okQty && !busy) applyConsume() }} />
              <button type="button" className={`btn-primary btn-lg ${s.confirmBtn}`}
                disabled={busy || !okQty} onClick={applyConsume}>
                {busy ? '처리 중' : '확인'}
              </button>
            </div>
            {q > stock
              ? <p className={`${s.afterHint} ${s.afterOver}`}>재고({fmtQty(stock)} {unit})보다 많습니다</p>
              : okQty && <p className={s.afterHint}>차감 후 잔량 <b>{fmtQty(stock - q)} {unit}</b></p>}
          </div>

          {/* 개봉 토글 — LOT 단위 일괄이라 lot_no + 상태조회 성공 시에만. 현재 상태의 반대 방향 단일 버튼 */}
          {row.lot_no && usage && (
            <div>
              <p className={s.actionLabel}>개봉 상태 변경</p>
              <button type="button" className="btn-secondary btn-lg btn-full"
                disabled={busy} onClick={() => applyUsage(nextInUse)}>
                {nextInUse ? '사용하기' : '미사용으로 변경'}
              </button>
            </div>
          )}

          <button type="button" className={s.rescan} onClick={reset}>다시 스캔</button>
        </div>
      </div>
    </div>
  )
}
