// pages/process/manage/RustWaitPage.jsx
// 녹 제거 대기 (2026-08-01) — 요크 잔량을 가용 재고에서 잠시 빼두었다가, 녹 제거가 끝나면
//   **원래 LOT 으로 되돌린다**.
//
// ⚠️ 폐기와의 차이가 이 화면의 존재 이유:
//   · 폐기  = 라인에서 나감 → 수량만 차감, 다시 안 돌아옴 (회전자 요크 폐기 화면)
//   · 녹 제거 = 다시 투입됨 → **새 LOT 을 끊지 않고** 상태만 옮겼다가 같은 LOT 으로 복귀
//   대기 중에는 status='rust_wait' 라 재고·소요 집계에서 빠진다(폐기로 잡히지도 않음).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { listRustWait, toRustWait, restoreFromRustWait } from '@/api'
import s from './RustWaitPage.module.css'

const fmt = (v) => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)))
}

export default function RustWaitPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState(null)      // {type:'ok'|'err', text}
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // 빼기 폼
  const [lot, setLot] = useState('')
  const [qty, setQty] = useState('')
  const [memo, setMemo] = useState('')
  // 복귀 수량 (행별) — 비우면 대기분 전부
  const [back, setBack] = useState({})

  const load = useCallback(async () => {
    try {
      setRows(await listRustWait('EA'))
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '불러오기 실패' })
    } finally { setLoaded(true) }
  }, [])

  useEffect(() => { load() }, [load])

  const total = rows.reduce((n, r) => n + Number(r.quantity || 0), 0)

  const doTake = async () => {
    const lotNo = lot.trim()
    if (!lotNo) { setMsg({ type: 'err', text: '요크 LOT 번호를 입력하세요.' }); return }
    // 빈칸 = 잔량 전부 (BE 가 null 을 그렇게 해석)
    const q = qty.trim() === '' ? null : Number(qty)
    if (q !== null && (Number.isNaN(q) || q <= 0)) {
      setMsg({ type: 'err', text: '수량은 1 이상으로 입력하거나 비워두세요(잔량 전부).' }); return
    }
    setBusy(true)
    try {
      const r = await toRustWait(lotNo, q, memo.trim(), 'EA')
      await load()
      setLot(''); setQty(''); setMemo('')
      setMsg({ type: 'ok', text: `${r.lot_no} → 녹 제거 대기 ${fmt(r.rust_wait)}개 (가용 ${fmt(r.in_stock)}개)` })
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '이동 실패' })
    } finally { setBusy(false) }
  }

  const doRestore = async (row) => {
    const raw = back[row.lot_no]
    const q = (raw ?? '').toString().trim() === '' ? null : Number(raw)
    if (q !== null && (Number.isNaN(q) || q <= 0)) {
      setMsg({ type: 'err', text: '복귀 수량은 1 이상으로 입력하거나 비워두세요(전부).' }); return
    }
    if (!window.confirm(
      `${row.lot_no} 의 녹 제거가 끝났나요?\n${q === null ? '대기분 전부' : `${q}개`}가 원래 LOT 의 가용 재고로 돌아갑니다.`
    )) return
    setBusy(true)
    try {
      const r = await restoreFromRustWait(row.lot_no, q, 'EA')
      await load()
      setBack((b) => { const n = { ...b }; delete n[row.lot_no]; return n })
      setMsg({ type: 'ok', text: `${r.lot_no} 복귀 완료 — 가용 ${fmt(r.in_stock)}개 / 대기 ${fmt(r.rust_wait)}개` })
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '복귀 실패' })
    } finally { setBusy(false) }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="녹 제거 대기"
        subtitle="요크 잔량을 가용 재고에서 잠시 빼두고, 녹 제거가 끝나면 원래 LOT 으로 되돌립니다"
        onBack={() => nav('/admin/manage')}
      />
      <div className="page-content">
        {msg && (
          <p className={`${s.msg} ${msg.type === 'err' ? s.msgErr : s.msgOk}`}>{msg.text}</p>
        )}

        <p className={s.hint}>
          ※ 대기 중인 수량은 <b>재고·소요 집계에서 빠집니다</b> (폐기로 잡히지도 않습니다).
          새 LOT 을 발급하지 않으므로, 복귀하면 원래 LOT 번호 그대로 수량이 더해집니다.
          다시 쓸 수 없는 물건이면 이 화면이 아니라 <b>회전자 요크 폐기</b> 로 처리하세요.
        </p>

        {/* ── 대기로 빼기 ── */}
        <section className={s.block}>
          <h3 className={s.blockTitle}>
            대기로 빼기 <span className={s.sub}>수량을 비우면 그 LOT 잔량 전부</span>
          </h3>
          <div className={s.form}>
            <input className={s.lotInput} value={lot} placeholder="요크 LOT 번호 (예: ED01260728-001)"
              disabled={busy}
              onChange={(e) => setLot(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doTake() }} />
            <input className={s.qtyInput} type="number" min="1" step="1" placeholder="수량"
              value={qty} disabled={busy}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doTake() }} />
            <input className={s.memoInput} value={memo} placeholder="메모 (선택 — 녹 상태 등)"
              disabled={busy}
              onChange={(e) => setMemo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doTake() }} />
            <button type="button" className={`btn-primary btn-sm ${s.smallBtn}`}
              disabled={busy} onClick={doTake}>대기로 빼기</button>
          </div>
        </section>

        {/* ── 대기 목록 ── */}
        <section className={s.block}>
          <h3 className={s.blockTitle}>
            대기 목록 <span className={s.sub}>녹 제거가 끝난 것부터 복귀시키세요</span>
          </h3>
          <p className={s.total}>
            총 <b className={s.totalNum}>{fmt(total)}</b>개 대기 중 · {rows.length}개 LOT
          </p>

          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>요크 LOT</th>
                  <th>규격</th>
                  <th className={s.num}>대기 수량</th>
                  <th>메모</th>
                  <th className={s.num}>복귀 수량</th>
                  <th aria-label="작업" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={s.lot}>{r.lot_no}</td>
                    <td className={s.spec}>
                      {r.phi ? `Φ${r.phi}` : '-'}{r.motor_type ? ` ${r.motor_type}` : ''}
                    </td>
                    <td className={s.num}>{fmt(r.quantity)}개</td>
                    <td className={s.memo}>{r.memo || '-'}</td>
                    <td className={s.num}>
                      <input className={s.qtyInput} type="number" min="1" step="1" placeholder="전부"
                        value={back[r.lot_no] ?? ''} disabled={busy}
                        onChange={(e) => setBack((b) => ({ ...b, [r.lot_no]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') doRestore(r) }} />
                    </td>
                    <td className={s.actions}>
                      <button type="button" className={`btn-primary btn-sm ${s.smallBtn}`}
                        disabled={busy} onClick={() => doRestore(r)}>복귀</button>
                    </td>
                  </tr>
                ))}
                {loaded && rows.length === 0 && (
                  <tr><td colSpan={6} className={s.empty}>
                    녹 제거 대기 중인 요크가 없습니다.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
