// pages/process/manage/RustScanPage.jsx
// 요크 녹 QR 스캔 — 라벨을 찍어 그 LOT 을 녹 제거 대기로 보낸다 (2026-08-13).
//   흐름: 요크 라벨 QR 스캔 → 가용 수량 확인 → [수량 입력 · 메모] → 대기로 빼기
//   BE: GET /inventory/rotor/rust-wait/available (가용 목록에서 스캔 LOT 대조)
//       POST /inventory/rotor/rust-wait        (대기로 이동)
//
// ★ 왜 별도 화면인가 (사용자 결정 2026-08-13)
//   녹 제거 대기 화면(RustWaitPage)은 목록 확인·수량 조정·복귀가 주 용도라 표가 길다.
//   현장에서 요크를 들고 "이거 녹슬었다" 처리하는 동선은 스캔 한 번이 전부여야 해서 분리.
//   → RustWaitPage 의 QR 버튼은 제거하고, 이 화면이 유일한 스캔 진입점.
//
// ★ 스캔 즉시 처리하지 않는다 — 수량(전량/일부)을 확인하고 눌러야 오스캔이 재고를 건드리지 않는다.
//   창고 QR 스캔(WarehouseUsageScanPage) 과 동일한 '스캔 → 확인 → 실행' 3단 규약.
import { useState } from 'react'

import QRScanner from '@/components/QRScanner'
import { listAvailableYokes, toRustWait } from '@/api'
import s from './RustScanPage.module.css'

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export default function RustScanPage({ onLogout, onBack }) {
  const [step, setStep] = useState('scan')   // 'scan' | 'action'
  const [row, setRow] = useState(null)       // 스캔으로 찾은 가용 요크 행
  const [qty, setQty] = useState('')         // 빈 값 = 잔량 전부
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)       // {type:'ok'|'err', text}

  const reset = () => {
    setStep('scan'); setRow(null); setQty(''); setMemo(''); setMsg(null)
  }

  const avail = num(row?.quantity)   // 스캔한 LOT 의 가용 수량 (action 단계에서만 유효)

  const apply = async () => {
    const n = qty.trim() === '' ? null : num(qty)
    if (n !== null && (n <= 0 || n > avail)) {
      setMsg({ type: 'err', text: `수량은 1 ~ ${avail} 사이로 입력하세요 (비우면 전량).` })
      return
    }
    setBusy(true); setMsg(null)
    try {
      // 응답 = 그 LOT 의 처리 후 잔량 (in_stock/rust_wait) — '얼마 뺐나'가 아니라 '지금 상태'를 보여준다
      const r = await toRustWait(row.lot_no, n, memo.trim(), 'EA')
      setMsg({
        type: 'ok',
        text: `${n ?? avail}개 대기로 이동 — 대기 ${num(r.rust_wait)}개 · 가용 ${num(r.in_stock)}개`,
      })
      setTimeout(reset, 1600)
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '처리 실패' })
    } finally { setBusy(false) }
  }

  // ── 스캔 ──
  //   throw 하면 QRScanner 가 에러를 띄우고 재스캔을 허용한다 (연속 처리 동선).
  if (step === 'scan') {
    return (
      <QRScanner
        processLabel="요크 녹 QR 스캔"
        banner={<p style={{ margin: 0 }}>녹 제거가 필요한 <strong>요크 라벨</strong>을 스캔하세요</p>}
        onScan={async (val) => {
          const v = (val || '').trim()
          if (!v) throw new Error('빈 값입니다.')
          const rows = await listAvailableYokes('EA')
          const hit = (rows || []).find((x) => x.lot_no === v)
          if (!hit) throw new Error(`가용 요크에 없는 LOT 입니다: ${v} (이미 대기 중이거나 소진)`)
          setRow(hit); setQty(''); setMemo(''); setMsg(null)
          setStep('action')
        }}
        onLogout={onLogout}
        onBack={onBack}
      />
    )
  }

  // ── 확인 · 실행 ──
  //   위저드(진행바·단계) 대신 '스캔 결과 카드 + 실행' 단일 화면 — 묻는 게 아니라 확인하고 누르는 동선.
  const takeQty = qty.trim() === '' ? avail : num(qty)
  const isAll = qty.trim() === ''
  return (
    <div className={s.page}>
      <div className={s.sheet}>
        <button type="button" className={s.backBtn} onClick={reset} disabled={busy}>
          ← 다시 스캔
        </button>

        {/* 스캔 결과 — 무엇을 잡았는지가 가장 먼저 */}
        <div className={s.lotCard}>
          <span className={s.scanTag}>스캔됨</span>
          <div className={s.lotNo}>{row.lot_no}</div>
          <div className={s.meta}>Φ{row.phi} · {row.motor_type}</div>
          <div className={s.availRow}>
            <span className={s.availNum}>{avail}</span>
            <span className={s.availUnit}>개 가용</span>
          </div>
        </div>

        {/* 수량 — 전량이 기본. 일부만 뺄 때만 숫자를 친다 */}
        <p className={s.label}>대기로 뺄 수량</p>
        <div className={s.qtyRow}>
          <button
            type="button"
            className={`${s.qtyChip} ${isAll ? s.qtyChipOn : ''}`}
            disabled={busy}
            onClick={() => setQty('')}
          >
            전량 {avail}개
          </button>
          <input
            className={s.qtyInput}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) apply() }}
            placeholder="일부"
            inputMode="numeric"
            disabled={busy}
          />
        </div>

        <input
          className={s.memoInput}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) apply() }}
          placeholder="메모 (선택 — 녹 상태 등)"
          disabled={busy}
        />

        {msg && <p className={msg.type === 'err' ? s.err : s.ok}>{msg.text}</p>}

        <button type="button" className={s.submitBtn} disabled={busy} onClick={apply}>
          {busy ? '처리 중…' : `${takeQty}개 대기로 빼기`}
        </button>
      </div>
    </div>
  )
}
