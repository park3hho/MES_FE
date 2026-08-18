// components/Inventory/ProductStockSection.jsx
// 제품 LOT 재고 섹션 (2026-08-14) — 제품 **한 종류**를 그린다. 종류 선택은 페이지 탭이 한다.
//   ★ RT 와 같은 순서: LOT 발급 먼저, BOM 은 나중.
//   ★ 여러 제품을 한 섹션에 묶지 않는다 — 묶으면 바깥 탭 안에 같은 목록이 또 생겨 2중 내비가 되고,
//     제품이 늘 때마다 탭 이름이 "A · B · C · D…" 로 불어난다. 제품 하나 = 탭 하나.
import { useState, useEffect, useCallback } from 'react'

import {
  getProductStocks, createProductStocksBulk, printProductLabel, deleteProductStock,
} from '@/api'
import { PHI_SPECS } from '@/constants/processConst'
import { useToast } from '@/contexts/ToastContext'
import { fmtKstDateTime } from '@/utils/dateConvert'

import s from './ProductStockSection.module.css'

// Φ 선택지는 PHI_SPECS 가 진실의 원천 (하드코딩 금지). 큰 값부터 보이게 정렬.
const PHIS = Object.keys(PHI_SPECS).sort((a, b) => Number(b) - Number(a))

export default function ProductStockSection({ kind, label, prefix }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    if (!kind) return
    setLoading(true)
    try {
      const r = await getProductStocks(kind)
      setItems(r.items || [])
    } catch (e) {
      toast(`조회 실패: ${e.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [kind, toast])
  useEffect(() => { load() }, [load])

  const onCreated = async (msg) => {
    setAdding(false)
    toast(msg)
    await load()
  }

  const reprint = async (lotNo) => {
    try {
      await printProductLabel(kind, lotNo)
      toast(`${lotNo} 라벨 재출력`)
    } catch (e) {
      toast(`재출력 실패: ${e.message}`, 'error')
    }
  }

  const remove = async (row) => {
    try {
      await deleteProductStock(kind, row.id)
      toast(`${row.lot_no} 삭제됨`)
      await load()
    } catch (e) {
      toast(`삭제 실패: ${e.message}`, 'error')
    }
  }

  return (
    <div className={s.wrap}>
      <div className={s.kindBar}>
        <span className={s.kindName}>{label} <em className={s.prefix}>{prefix}</em></span>
        <button type="button" className={s.addBtn} onClick={() => setAdding((v) => !v)}>
          {adding ? '닫기' : '＋ LOT 발급'}
        </button>
      </div>

      {adding && <AddForm kind={kind} label={label} onDone={onCreated} />}

      {loading && <p className={s.info}>불러오는 중…</p>}

      {!loading && (
        <div className={s.tscroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.thL}>LOT 번호</th><th>Φ</th><th>수량</th>
                <th className={s.thL}>메모</th><th className={s.thL}>발급일시</th><th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={6} className={s.muted}>발급된 LOT 이 없습니다.</td></tr>
              )}
              {items.map((r) => (
                <tr key={r.id}>
                  <td className={`${s.tdL} ${s.lotNo}`}>{r.lot_no}</td>
                  <td>
                    <span className={s.phiTag}
                      style={{ background: PHI_SPECS[r.phi]?.color || 'var(--color-border)' }}>
                      Φ{r.phi}
                    </span>
                  </td>
                  <td>{r.quantity}</td>
                  <td className={s.tdL}>{r.memo || '—'}</td>
                  <td className={s.tdL}>{fmtKstDateTime(r.created_at)}</td>
                  <td className={s.tdL}>
                    <button type="button" className={s.linkBtn} onClick={() => reprint(r.lot_no)}>재출력</button>
                    <button type="button" className={`${s.linkBtn} ${s.danger}`} onClick={() => remove(r)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={s.note}>
        LOT 번호는 <b>{prefix}{'{Φ}'}-YYYYMMDD-순번</b> 형식입니다 (RT 와 같은 규약).
        발급하면 라벨이 바로 인쇄되고, 실패한 건 목록에서 <b>재출력</b> 으로 다시 뽑을 수 있습니다.
        <br />BOM·자재 소비 연동은 아직입니다 — 지금은 번호 발급과 재고 조회만 합니다.
      </p>
    </div>
  )
}

// ══════════════════════════════════════════════════
// LOT 발급 — Φ + 수량. 발급과 동시에 라벨 N장 인쇄된다.
// ══════════════════════════════════════════════════
function AddForm({ kind, label, onDone }) {
  const [phi, setPhi] = useState('')
  const [count, setCount] = useState('1')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const n = parseInt(count, 10) || 0
  const ok = phi && n > 0

  const submit = async () => {
    if (!ok || saving) return
    setSaving(true); setErr(null)
    try {
      const r = await createProductStocksBulk(kind, { phi, count: n, memo })
      const failed = (r.print_errors || []).length
      onDone(failed
        ? `${label} ${r.count}건 발급 · 라벨 ${failed}건 인쇄 실패 (재출력 가능)`
        : `${label} ${r.count}건 발급 · 라벨 ${r.count}장 인쇄`)
    } catch (e) {
      setErr(e.message || '발급 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={s.form}>
      <div className={s.fRow}>
        <span className={s.fLab}>Φ</span>
        <div className={s.phiWrap}>
          {PHIS.map((p) => (
            <button key={p} type="button"
              className={`${s.phiBtn} ${phi === p ? s.phiOn : ''}`}
              aria-pressed={phi === p}
              onClick={() => setPhi(p)}>Φ{p}</button>
          ))}
        </div>
      </div>
      <div className={s.fRow}>
        <span className={s.fLab}>수량</span>
        <input type="number" inputMode="numeric" min="1" className={s.fInput}
          value={count} onChange={(e) => setCount(e.target.value)} />
      </div>
      <div className={s.fRow}>
        <span className={s.fLab}>메모</span>
        <input className={s.fInput} maxLength={200} placeholder="선택"
          value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>
      {err && <p className={s.err}>⚠ {err}</p>}
      <button type="button" className="btn-primary btn-full" disabled={!ok || saving} onClick={submit}>
        {saving ? '발급 중…' : `${label} ${n || ''}건 발급 + 라벨 인쇄`}
      </button>
    </div>
  )
}
