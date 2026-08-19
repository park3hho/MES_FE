// components/Inventory/ProductStockSection.jsx
// 제품 LOT 재고 섹션 (2026-08-14) — 제품 **한 종류**를 그린다. 종류 선택은 페이지 탭이 한다.
//   ★ RT 와 같은 순서: LOT 발급 먼저, BOM 은 나중.
//   ★ 여러 제품을 한 섹션에 묶지 않는다 — 묶으면 바깥 탭 안에 같은 목록이 또 생겨 2중 내비가 되고,
//     제품이 늘 때마다 탭 이름이 "A · B · C · D…" 로 불어난다. 제품 하나 = 탭 하나.
import { useState, useEffect, useCallback } from 'react'

import {
  getProductStocks, createProductStocksBulk, printProductLabel, deleteProductStock, getItems,
} from '@/api'
import { PHI_SPECS } from '@/constants/processConst'
import { useToast } from '@/contexts/ToastContext'
import { fmtKstDateTime } from '@/utils/dateConvert'

import s from './ProductStockSection.module.css'

// Φ 선택지는 PHI_SPECS 가 진실의 원천 (하드코딩 금지). 큰 값부터 보이게 정렬.
const PHIS = Object.keys(PHI_SPECS).sort((a, b) => Number(b) - Number(a))

export default function ProductStockSection({ kind, label, prefix, categoryId, categoryName }) {
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

      {adding && <AddForm kind={kind} label={label} categoryId={categoryId} onDone={onCreated} />}

      {/* 분류 미지정 경고 (2026-08-19) — 이 상태면 아무 품목이나 발급된다.
          실제로 볼트가 PCB LOT 으로 발급된 적이 있어, 조용히 두지 않고 화면에 띄운다. */}
      {!categoryId && (
        <p className={s.err}>
          ⚠ 품목 분류가 지정되지 않아 <b>아무 품목이나 선택</b>됩니다.
          품목 관리에서 {label} 분류를 만들고 지정하세요.
        </p>
      )}

      {loading && <p className={s.info}>불러오는 중…</p>}

      {!loading && (
        <div className={s.tscroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.thL}>LOT 번호</th><th className={s.thL}>품목</th><th>Φ</th><th>수량</th>
                <th className={s.thL}>메모</th><th className={s.thL}>발급일시</th><th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={7} className={s.muted}>발급된 LOT 이 없습니다.</td></tr>
              )}
              {items.map((r) => (
                <tr key={r.id}>
                  <td className={`${s.tdL} ${s.lotNo}`}>{r.lot_no}</td>
                  {/* 품목 미연결(item_id 없음) = 연동 이전 발급분. 나중에 채우면 된다는 뜻으로 표시 */}
                  <td className={s.tdL}>
                    {r.item_part_no
                      ? <>{r.item_part_no}{r.item_name ? <span className={s.muted}> · {r.item_name}</span> : null}</>
                      : <span className={s.muted}>미연결</span>}
                  </td>
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
        <br />발급 시 <b>품목</b> 을 지정합니다 — BOM·구매·조립 검증이 이 연결 위에 붙습니다.
        연동 이전에 발급된 건은 <b>미연결</b> 로 표시되며 그대로 두어도 됩니다.
        <br />BOM·자재 소비 연동은 아직입니다 — 지금은 번호 발급과 재고 조회만 합니다.
      </p>
    </div>
  )
}

// ══════════════════════════════════════════════════
// LOT 발급 — Φ + 수량. 발급과 동시에 라벨 N장 인쇄된다.
// ══════════════════════════════════════════════════
function AddForm({ kind, label, categoryId, onDone }) {
  const [phi, setPhi] = useState('')
  const [count, setCount] = useState('1')
  const [memo, setMemo] = useState('')
  const [item, setItem] = useState(null)      // 선택된 품목 { id, part_no, name }
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const n = parseInt(count, 10) || 0
  const ok = phi && n > 0 && item?.id

  const submit = async () => {
    if (!ok || saving) return
    setSaving(true); setErr(null)
    try {
      const r = await createProductStocksBulk(kind, { phi, count: n, memo, itemId: item.id })
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
        <span className={s.fLab}>품목</span>
        <ItemPicker value={item} onPick={setItem} categoryId={categoryId} />
      </div>
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
      {!item && <p className={s.info}>품목을 먼저 선택해야 발급됩니다.</p>}
      <button type="button" className="btn-primary btn-full" disabled={!ok || saving} onClick={submit}>
        {saving ? '발급 중…' : `${label} ${n || ''}건 발급 + 라벨 인쇄`}
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 품목 선택 — 검색해서 고른다 (2026-08-19).
//   ★ 드롭다운으로 전부 나열하지 않는 이유: 품목 마스터는 수백 건이라 스크롤로는 못 찾는다.
//   ★ categoryId 는 **DB 설정값**이다 (코드에 박은 분류가 아니다). 분류 트리는 어드민이
//     자유 증설하는 값이라 코드에 박으면 분류를 바꾸는 순간 조용히 0건이 된다.
//     설정이 있으면 그 분류로 후보를 좁히고, 없으면 전체를 보여준다(서버도 검증 안 함).
// ══════════════════════════════════════════════════
function ItemPicker({ value, onPick, categoryId }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  // 입력이 멈춘 뒤에 조회 (키 입력마다 때리면 목록이 깜빡이고 서버도 시끄럽다)
  useEffect(() => {
    if (!open) return undefined
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        setList(await getItems(true, q.trim(), categoryId || ''))
      } catch {
        setList([])
      } finally {
        setBusy(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q, open, categoryId])

  if (value && !open) {
    return (
      <span className={s.pickedWrap}>
        <b>{value.part_no}</b>
        {value.name ? <span className={s.muted}> · {value.name}</span> : null}
        <button type="button" className={s.linkBtn} onClick={() => { setOpen(true); setQ('') }}>변경</button>
      </span>
    )
  }

  return (
    <div className={s.pickerWrap}>
      <input className={s.fInput} autoFocus placeholder="품번·품명 검색"
        value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} />
      {open && (
        <div className={s.pickerList}>
          {busy && <p className={s.info}>검색 중…</p>}
          {!busy && list.length === 0 && (
            <p className={s.info}>
              결과가 없습니다. 품목 관리에서 먼저 등록하세요.
            </p>
          )}
          {!busy && list.slice(0, 30).map((it) => (
            <button key={it.id} type="button" className={s.pickerItem}
              onClick={() => { onPick({ id: it.id, part_no: it.part_no, name: it.name }); setOpen(false) }}>
              <b>{it.part_no}</b>
              {it.name ? <span className={s.muted}> · {it.name}</span> : null}
            </button>
          ))}
          {!busy && list.length > 30 && (
            <p className={s.info}>… 외 {list.length - 30}건. 검색어를 좁혀주세요.</p>
          )}
        </div>
      )}
    </div>
  )
}
