// components/Inventory/ProductStockSection.jsx
// 제품 LOT 재고 섹션 (2026-08-14) — 제품 **한 종류**를 그린다. 종류 선택은 페이지 탭이 한다.
//   ★ RT 와 같은 순서: LOT 발급 먼저, BOM 은 나중.
//   ★ 여러 제품을 한 섹션에 묶지 않는다 — 묶으면 바깥 탭 안에 같은 목록이 또 생겨 2중 내비가 되고,
//     제품이 늘 때마다 탭 이름이 "A · B · C · D…" 로 불어난다. 제품 하나 = 탭 하나.
import { useState, useEffect, useCallback } from 'react'

import {
  getProductStocks, createProductStocksBulk, printProductLabel, deleteProductStock, getItems,
  getItemCategoryTree, setProductStockKindCategory,
} from '@/api'
import { PHI_SPECS } from '@/constants/processConst'
import { flatOptions } from '@/utils/categoryTree'
import { useToast } from '@/contexts/ToastContext'
import { fmtKstDateTime } from '@/utils/dateConvert'

import s from './ProductStockSection.module.css'

// Φ 선택지는 PHI_SPECS 가 진실의 원천 (하드코딩 금지). 큰 값부터 보이게 정렬.
const PHIS = Object.keys(PHI_SPECS).sort((a, b) => Number(b) - Number(a))

export default function ProductStockSection({ kind, label, prefix, categoryId, categoryName }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  // 분류 매핑은 로컬 상태로 — 배너에서 저장하면 부모 재조회 없이 즉시 반영
  const [cat, setCat] = useState({ id: categoryId || null, name: categoryName || '' })
  const toast = useToast()
  useEffect(() => { setCat({ id: categoryId || null, name: categoryName || '' }) }, [kind, categoryId, categoryName])

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

      {adding && <AddForm kind={kind} label={label} categoryId={cat.id} onDone={onCreated} />}

      {/* 분류 매핑 (2026-08-26) — 경고만 띄우던 것을 **여기서 바로 지정**하게. 지정 UI 가 없어서
          "품목 관리에서 지정하세요" 라는 안내가 갈 곳 없는 문장이 되어 있었다. */}
      <KindCategoryBar kind={kind} label={label} cat={cat}
        onSaved={(next) => { setCat(next); toast(next.id ? `${label} 품목 분류 지정됨: ${next.name}` : '분류 매핑 해제됨') }} />

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
// 분류 매핑 바 — 미지정이면 경고 + 그 자리에서 지정, 지정돼 있으면 한 줄 표기 + 변경.
//   저장은 BE PUT /inventory/product-stock/{kind}/category (지정하면 하위 분류 포함 검증 켜짐).
// ══════════════════════════════════════════════════
function KindCategoryBar({ kind, label, cat, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [opts, setOpts] = useState(null)      // [{id, label}] — 트리 평탄화 (들여쓰기 라벨)
  const [sel, setSel] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const openEdit = async () => {
    setEditing(true)
    setSel(cat.id ? String(cat.id) : '')
    if (opts) return
    try {
      setOpts(flatOptions(await getItemCategoryTree(true)))
    } catch (e) {
      toast(`분류 조회 실패: ${e.message}`, 'error')
      setOpts([])
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const id = sel ? Number(sel) : null
      await setProductStockKindCategory(kind, id)
      const name = (opts || []).find((o) => o.id === id)?.label.trim() || ''
      onSaved({ id, name })
      setEditing(false)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return cat.id ? (
      <p className={s.catNote}>
        품목 후보: <b>{cat.name || '지정된 분류'}</b> 분류 (하위 포함)
        <button type="button" className={s.linkBtn} onClick={openEdit}>변경</button>
      </p>
    ) : (
      <p className={s.err}>
        ⚠ 품목 분류가 지정되지 않아 <b>아무 품목이나 선택</b>됩니다.
        <button type="button" className={s.linkBtn} onClick={openEdit}>지금 지정</button>
      </p>
    )
  }

  // 분류가 한 건도 없으면 고를 게 없다 — 이때 저장하면 '미지정'이 그대로 저장돼
  //   화면은 경고 배너 그대로라 "저장이 안 된다" 로 보인다. 원인을 문장으로 말해준다 (2026-08-26).
  const empty = opts !== null && opts.length === 0
  // 미지정 → 미지정 저장은 아무것도 바꾸지 않는다. (지정돼 있을 때의 '' 는 해제라 허용)
  const noop = !sel && !cat.id

  return (
    <div className={s.catEdit}>
      <span className={s.fLab}>{label} 분류</span>
      {opts === null ? (
        <span className={s.muted}>분류 불러오는 중…</span>
      ) : empty ? (
        <span className={s.err}>
          등록된 품목 분류가 없습니다 — <b>품목 관리 → 분류</b> 에서 먼저 만들어주세요.
        </span>
      ) : (
        <select className={s.catSelect} value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">(미지정 — 검증 안 함)</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      )}
      <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(false)}>
        {empty ? '닫기' : '취소'}
      </button>
      {!empty && (
        <button type="button" className="btn-primary btn-sm"
          disabled={saving || opts === null || noop}
          title={noop ? '지정할 분류를 선택해주세요.' : ''}
          onClick={save}>
          {saving ? '저장 중…' : '저장'}
        </button>
      )}
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
        {value.spec ? <span className={s.muted}> · {value.spec}</span> : null}
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
          {!busy && list.slice(0, 30).map((it) => {
            // 이름만으론 못 고른다 — 같은 이름의 변형(규격 차이)이 흔해 규격·분류·제조사를 같이 보여준다
            const sub = [it.category_path, it.spec, it.material, it.manufacturer_name]
              .filter(Boolean).join(' · ')
            return (
              <button key={it.id} type="button" className={s.pickerItem}
                onClick={() => { onPick({ id: it.id, part_no: it.part_no, name: it.name, spec: it.spec }); setOpen(false) }}>
                <span className={s.pickerMain}>
                  <b>{it.part_no}</b>
                  {it.name ? <span className={s.muted}> · {it.name}</span> : null}
                </span>
                {sub && <span className={s.pickerSub}>{sub}</span>}
              </button>
            )
          })}
          {!busy && list.length > 30 && (
            <p className={s.info}>… 외 {list.length - 30}건. 검색어를 좁혀주세요.</p>
          )}
        </div>
      )}
    </div>
  )
}
