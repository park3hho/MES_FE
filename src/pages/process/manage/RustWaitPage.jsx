// pages/process/manage/RustWaitPage.jsx
// 녹 제거 대기 (2026-08-01) — 요크 잔량을 가용 재고에서 잠시 빼두었다가, 녹 제거가 끝나면
//   **원래 LOT 으로 되돌린다**.
//
// ⚠️ 폐기와의 차이가 이 화면의 존재 이유:
//   · 폐기  = 라인에서 나감 → 수량만 차감, 다시 안 돌아옴 (회전자 요크 폐기 화면)
//   · 녹 제거 = 다시 투입됨 → **새 LOT 을 끊지 않고** 상태만 옮겼다가 같은 LOT 으로 복귀
//   대기 중에는 status='rust_wait' 라 재고·소요 집계에서 빠진다(폐기로 잡히지도 않음).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import QRScanner from '@/components/QRScanner'
import { listRustWait, listAvailableYokes, toRustWait, restoreFromRustWait } from '@/api'
import s from './RustWaitPage.module.css'

const fmt = (v) => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)))
}

// ── 정렬 훅 ── 가용/대기 두 표가 같은 규칙으로 동작하도록 한 곳에.
//   ★ phi 는 '20'/'45' 같은 문자열이라 문자 정렬하면 '100' < '20' 이 된다 → 숫자 파생 필드로 정렬.
function useSort(rows, initialKey, initialDir = 'asc') {
  const [key, setKey] = useState(initialKey)
  const [dir, setDir] = useState(initialDir)
  const sorted = useMemo(() => {
    const arr = [...(rows || [])]
    arr.sort((a, b) => {
      const x = a[key]
      const y = b[key]
      let c
      if (typeof x === 'number' && typeof y === 'number') c = x - y
      else c = String(x ?? '').localeCompare(String(y ?? ''), 'ko')
      return dir === 'asc' ? c : -c
    })
    return arr
  }, [rows, key, dir])
  const toggle = (k) => {
    if (k === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setKey(k); setDir('asc') }
  }
  return { sorted, key, dir, toggle }
}

function SortTh({ label, sortKey: k, st, align }) {
  const on = st.key === k
  return (
    <th className={align === 'right' ? s.num : undefined}>
      <button type="button" className={s.sortBtn} onClick={() => st.toggle(k)}>
        {label}
        <span className={on ? s.sortMark : s.sortMarkIdle}>
          {on ? (st.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

export default function RustWaitPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [avail, setAvail] = useState([])    // 가용 요크 — 목록에서 골라 담기
  const [msg, setMsg] = useState(null)      // {type:'ok'|'err', text}
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [scanning, setScanning] = useState(false)

  // 빼기 폼
  const [lot, setLot] = useState('')
  const [qty, setQty] = useState('')
  const [memo, setMemo] = useState('')
  // 복귀 수량 (행별) — 비우면 대기분 전부
  const [back, setBack] = useState({})

  const load = useCallback(async () => {
    try {
      // 대기/가용 함께 갱신 — 하나를 빼면 다른 쪽이 줄어드는 관계라 따로 새로고침하면 어긋나 보임
      const [w, a] = await Promise.all([listRustWait('EA'), listAvailableYokes('EA')])
      setRows(w)
      setAvail(a)
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '불러오기 실패' })
    } finally { setLoaded(true) }
  }, [])

  useEffect(() => { load() }, [load])

  const total = rows.reduce((n, r) => n + Number(r.quantity || 0), 0)

  // phi 숫자 파생 — 정렬용 (문자 '100' < '20' 방지)
  const withNum = (list) => list.map((r) => ({ ...r, phi_num: Number(r.phi) || 0 }))
  const availRows = useMemo(() => withNum(avail), [avail])
  const waitRows = useMemo(() => withNum(rows), [rows])
  const availSt = useSort(availRows, 'lot_no', 'asc')
  const waitSt = useSort(waitRows, 'lot_no', 'asc')

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
            <input className={s.lotInput} value={lot} placeholder="요크 LOT 번호 (아래 목록 선택 또는 QR 스캔)"
              disabled={busy}
              onChange={(e) => setLot(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doTake() }} />
            <button type="button" className={`btn-secondary btn-sm ${s.smallBtn}`}
              disabled={busy} onClick={() => setScanning((v) => !v)}>
              {scanning ? '스캔 닫기' : 'QR 스캔'}
            </button>
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

          {/* QR 스캔 — 라벨을 찍으면 LOT 칸만 채운다. 수량·메모를 확인하고 누르도록
              바로 처리하지는 않음 (오스캔 즉시 반영 방지). */}
          {scanning && (
            <div className={s.scanBox}>
              <QRScanner
                compact
                processLabel="요크 라벨을 스캔하세요"
                onScan={(val) => {
                  setLot((val || '').trim())
                  setScanning(false)
                  setMsg({ type: 'ok', text: `스캔됨: ${val} — 수량 확인 후 '대기로 빼기'` })
                }}
              />
            </div>
          )}

          {/* 가용 요크 — 손으로 LOT 을 치지 않고 남아 있는 것에서 고르게 (행 클릭 = 선택) */}
          <p className={s.availTitle}>
            가용 요크 <span className={s.sub}>행을 클릭하면 위 LOT 칸에 채워집니다 · {avail.length}건</span>
          </p>
          {loaded && avail.length === 0 ? (
            <p className={s.empty}>가용 요크 재고가 없습니다.</p>
          ) : (
            <div className={s.availWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <SortTh label="요크 LOT" sortKey="lot_no" st={availSt} />
                    <SortTh label="파이" sortKey="phi_num" st={availSt} />
                    <SortTh label="모터" sortKey="motor_type" st={availSt} />
                    <SortTh label="가용 수량" sortKey="quantity" st={availSt} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {availSt.sorted.map((a) => (
                    <tr key={a.id}
                      className={`${s.pickRow} ${lot === a.lot_no ? s.pickOn : ''}`.trim()}
                      onClick={() => !busy && setLot(a.lot_no)}>
                      <td className={s.lot}>{a.lot_no}</td>
                      <td>{a.phi ? `Φ${a.phi}` : '-'}</td>
                      <td>{a.motor_type || '-'}</td>
                      <td className={s.num}>{fmt(a.quantity)}개</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                  <SortTh label="요크 LOT" sortKey="lot_no" st={waitSt} />
                  <SortTh label="파이" sortKey="phi_num" st={waitSt} />
                  <SortTh label="모터" sortKey="motor_type" st={waitSt} />
                  <SortTh label="대기 수량" sortKey="quantity" st={waitSt} align="right" />
                  <th>메모</th>
                  <th className={s.num}>복귀 수량</th>
                  <th aria-label="작업" />
                </tr>
              </thead>
              <tbody>
                {waitSt.sorted.map((r) => (
                  <tr key={r.id}>
                    <td className={s.lot}>{r.lot_no}</td>
                    <td>{r.phi ? `Φ${r.phi}` : '-'}</td>
                    <td>{r.motor_type || '-'}</td>
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
                  <tr><td colSpan={7} className={s.empty}>
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
