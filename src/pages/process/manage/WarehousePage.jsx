// pages/process/manage/WarehousePage.jsx
// 창고 — 플랫 dense 테이블 (2026-06-08 v5)
//
// 구조 (v5 — 사용자 확정):
//   - 아코디언/아이콘 제거. 제품 1행 = 평범한 테이블 행.
//   - 박스는 별도 행이 아니라 "박스" 컬럼(평문 텍스트)으로 표시.
//   - 박스 그룹끼리 모이도록 박스명 → 제품명 순 정렬.
//   - 박스 생성/수정/삭제는 "박스 관리" 모달에서.
//   - 행 얇게, 수정/삭제는 평범한 텍스트 버튼.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import QRScanner from '@/components/QRScanner'
import {
  listWarehouse, createWarehouse, updateWarehouse, deleteWarehouse, printWarehouseItem,
  listWarehouseBox, createWarehouseBox, updateWarehouseBox, deleteWarehouseBox,
  printWarehouseBox, getBoxContents, removeFromBox,
  listWarehouseRack, createWarehouseRack, updateWarehouseRack, deleteWarehouseRack,
  printWarehouseRack,
  getStockLocation,
  scanMove,
  getItems,
} from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import s from './WarehousePage.module.css'


// attributes(dict) ↔ "key=value\nkey2=value2" 텍스트 변환
const attrsToText = (obj) => {
  if (!obj || typeof obj !== 'object') return ''
  return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('\n')
}
const textToAttrs = (text) => {
  if (!text || !text.trim()) return null
  const obj = {}
  text.split('\n').forEach((line) => {
    const eq = line.indexOf('=')
    if (eq <= 0) return
    const k = line.slice(0, eq).trim()
    const v = line.slice(eq + 1).trim()
    if (k) obj[k] = v
  })
  return Object.keys(obj).length ? obj : null
}


const EMPTY_PRODUCT_FORM = {
  item_id: '', itemQuery: '', box_id: '', name: '', spec: '', attributesText: '',
  quantity: '', unit: 'ea',
  usage: 'PROD', usage_note: '',
  rack_id: null, shelf: null, bin: null,
  location: '', memo: '',
}

// 용도 (BE core/lot_config.WH_USAGES 와 동기) — PROD 외에는 안전재고 집계 제외
const USAGE_LABELS = { PROD: '생산', SPARE: '예비', ETC: '기타' }
const USAGE_OPTIONS = [
  { value: 'PROD', label: '생산' },
  { value: 'SPARE', label: '예비' },
  { value: 'ETC', label: '기타' },
]
const EMPTY_BOX_FORM = {
  name: '', rack_id: null, shelf: null, bin: null, location: '', memo: '',
}
const EMPTY_RACK_FORM = {
  zone: '', aisle: '', rack: '', name: '', shelf_count: '1', bin_count: '1', memo: '',
}

const seq = (n) => Array.from({ length: Math.max(0, n) }, (_, i) => i + 1)

// BoxContent 도메인 라벨 (BE core/box_config.BOX_ITEM_TYPES 와 동기)
const CONTENT_LABELS = { warehouse: '자재', inventory: '공정', nc: '부적합' }

// 위치 지정 — 등록된 랙(rack_id) 선택 + 단(Shelf)/칸(Bin) 정수 선택 (2026-06-09 A2).
// form 은 rack_id/shelf/bin(정수) 보관. 좌표는 랙 마스터가 소유 (drift 없음).
function LocationFields({ form, racks, onPickRack, onCellChange }) {
  const selected = racks.find((r) => r.id === form.rack_id)
  return (
    <div className={s.locPicker}>
      <select className={s.locSelect}
        value={selected ? String(selected.id) : ''}
        onChange={(e) => onPickRack(racks.find((x) => String(x.id) === e.target.value) || null)}>
        <option value="">랙 선택…</option>
        {racks.map((r) => (
          <option key={r.id} value={r.id}>{r.name} ({r.shelf_count}단×{r.bin_count}칸)</option>
        ))}
      </select>
      <div className={s.locCellRow}>
        <select className={s.locSelect} value={form.shelf ?? ''} disabled={!selected}
          onChange={(e) => onCellChange('shelf', e.target.value ? Number(e.target.value) : null)}>
          <option value="">단</option>
          {seq(selected?.shelf_count || 0).map((n) => <option key={n} value={n}>{n}단</option>)}
        </select>
        <select className={s.locSelect} value={form.bin ?? ''} disabled={!selected}
          onChange={(e) => onCellChange('bin', e.target.value ? Number(e.target.value) : null)}>
          <option value="">칸</option>
          {seq(selected?.bin_count || 0).map((n) => <option key={n} value={n}>{n}칸</option>)}
        </select>
      </div>
      {!racks.length && (
        <div className={s.locHint}>등록된 랙이 없습니다 — "랙 관리"에서 먼저 등록하세요.</div>
      )}
      {!!racks.length && form.rack_id && !selected && (
        <div className={s.locHint}>지정됐던 랙이 삭제되었습니다 — 다시 선택하세요.</div>
      )}
    </div>
  )
}


/** 검색 가능한 Item 콤보박스 */
function ItemCombobox({ query, selectedId, onSelect, onQueryChange }) {
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (!query || query.length < 1) { setOptions([]); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await getItems(true, query)
        setOptions(res.slice(0, 20))
      } catch { setOptions([]) }
      finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(timerRef.current)
  }, [query])

  return (
    <div className={s.comboWrap} ref={wrapRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => { onQueryChange(e.target.value); onSelect(null); setOpen(true) }}
        onFocus={() => query && setOpen(true)}
        placeholder="품번 또는 품목명 검색"
        autoComplete="off"
      />
      {selectedId && <span className={s.comboLinked}>연동됨</span>}
      {open && query.length >= 1 && (
        <div className={s.comboDropdown}>
          {loading && <div className={s.comboMsg}>검색 중…</div>}
          {!loading && options.length === 0 && (
            <div className={s.comboMsg}>일치하는 Item 없음 — 그대로 저장 가능</div>
          )}
          {options.map((it) => (
            <button key={it.id} type="button" className={s.comboOption}
              onClick={() => { onSelect(it); setOpen(false) }}>
              <span className={s.comboPartNo}>{it.part_no}</span>
              <span className={s.comboName}>{it.name}</span>
              {it.spec && <span className={s.comboSpec}>{it.spec}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


export default function WarehousePage({ onBack }) {
  const [items, setItems] = useState([])
  const [boxes, setBoxes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  const [racks, setRacks] = useState([])
  const [ncLocated, setNcLocated] = useState([])   // 위치 지정된 NC (직접 랙, 박스 안 아님)

  // 드릴다운 네비게이션 (2026-06-10) — 랙 → 단(shelf) → 칸(bin) → 항목 4단계.
  //   각 키: undefined = 미선택(상위 목록 표시), null = '미지정' 선택, 값 = 해당 위치 선택.
  //   검색(keyword) 중에는 무시하고 평면 결과 표시.
  const [nav, setNav] = useState({ rackId: undefined, shelf: undefined, bin: undefined })
  const [scanOpen, setScanOpen] = useState(false)   // QR 스캔 모달 (위치 보기 / 옮기기 진입, 2026-06-10)
  const [scanLoc, setScanLoc] = useState(null)      // 스캔한 위치 — 보기/옮기기 선택 대기 {kind,id,label}
  const [moveDest, setMoveDest] = useState(null)    // 옮기기 목적지 확정 {kind,id,label}
  const [moveLog, setMoveLog] = useState([])        // 이동 내역 [{scan,ok,err}]

  // 제품 입력 모달 — { mode, editId, form } | null
  const [modal, setModal] = useState(null)
  // 박스 관리 모달 — { form, editBoxId } | null
  const [boxModal, setBoxModal] = useState(null)
  // 랙 관리 모달 — { form, editRackId } | null
  const [rackModal, setRackModal] = useState(null)
  // 펼친 박스 id 집합 + 내용물 lazy 캐시 (본문 인라인 — 별도 모달 X)
  // 내용물 = BoxContent junction (warehouse/inventory/nc 다형성) + box_id 로만 담긴 warehouse
  const [openBoxes, setOpenBoxes] = useState(() => new Set())
  const [boxContents, setBoxContents] = useState({})   // boxId -> contents[]
  const loadBoxContents = async (id) => {
    try {
      const d = await getBoxContents(id)
      setBoxContents((m) => ({ ...m, [id]: d.contents || [] }))
    } catch {
      setBoxContents((m) => ({ ...m, [id]: [] }))
    }
  }
  const toggleBox = (id) => {
    const opening = !openBoxes.has(id)
    setOpenBoxes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    if (opening) loadBoxContents(id)
  }
  const onRemoveContent = async (boxId, c) => {
    if (!c.content_id) {
      emitToast('이 항목은 제품 수정에서 박스를 해제하세요.', 'info'); return
    }
    if (!window.confirm(`${c.name} 을(를) 박스에서 뺄까요?`)) return
    try {
      await removeFromBox(c.content_id)
      emitToast('박스에서 뺐습니다.', 'success')
      await loadBoxContents(boxId)
      await Promise.all([loadBoxes(), reload()])
    } catch (e) {
      emitToast(e.message || '빼기 실패', 'error')
    }
  }

  const loadBoxes = useCallback(async () => {
    try {
      const data = await listWarehouseBox()
      setBoxes(data.items || [])
    } catch { /* 박스 로드 실패 무시 */ }
  }, [])

  const loadRacks = useCallback(async () => {
    try {
      const data = await listWarehouseRack()
      setRacks(data.items || [])
    } catch { /* 랙 로드 실패 무시 */ }
  }, [])

  // 위치 지정된 NC — 박스 없이 랙에 직접 둔 부적합품 (박스 안 NC 는 박스 내용물로 표시됨)
  // 검색어(keyword)를 BE 로 전달 — 누락 시 검색과 무관하게 전체 NC 가 떠버림 (2026-06-10 수정).
  const loadNc = useCallback(async () => {
    try {
      const data = await getStockLocation({ source: 'nc', page_size: 500, keyword: keyword || undefined })
      const located = (data.items || []).filter((r) => r.rack_id != null && !r.box_id)
      setNcLocated(located)
    } catch { setNcLocated([]) }
  }, [keyword])

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await listWarehouse({ keyword: keyword || undefined })
      setItems(data.items || [])
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [keyword])

  useEffect(() => { loadBoxes() }, [loadBoxes])
  useEffect(() => { loadRacks() }, [loadRacks])
  useEffect(() => { loadNc() }, [loadNc])
  useEffect(() => { reload() }, [reload])

  // 랙 → 박스 → 제품 계층 그룹 (2026-06-09). 박스는 자기 랙 아래(내용물은 펼칠 때 lazy 로드),
  // 박스에 안 담긴(box_id 없는) 제품은 랙 직속.
  const grouped = useMemo(() => {
    const rackById = new Map(racks.map((r) => [r.id, r]))
    const groups = new Map()  // key(rackId|'none') -> { rackId, rack, boxes:[], loose:[] }
    const ensure = (rackId) => {
      const key = rackId ?? 'none'
      if (!groups.has(key)) {
        groups.set(key, {
          rackId: rackId ?? null,
          rack: rackId ? rackById.get(rackId) || null : null,
          boxes: [], loose: [], nc: [],
        })
      }
      return groups.get(key)
    }
    // 빈 랙도 그룹 생성 — 항목이 없어도 드릴다운에 떠야 랙/단 QR 출력 가능 (2026-06-11)
    racks.forEach((r) => ensure(r.id))
    boxes.forEach((b) => ensure(b.rack_id ?? null).boxes.push(b))
    items.forEach((it) => { if (!it.box_id) ensure(it.rack_id ?? null).loose.push(it) })
    ncLocated.forEach((n) => ensure(n.rack_id ?? null).nc.push(n))
    let rows = [...groups.values()].map((g) => ({
      ...g,
      itemCount: g.boxes.reduce((n, b) => n + (b.item_count || 0), 0) + g.loose.length + g.nc.length,
    }))
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      rows = rows
        .map((g) => ({
          ...g,
          boxes: g.boxes.filter((b) =>
            (b.name || '').toLowerCase().includes(kw) || (b.code || '').toLowerCase().includes(kw)),
        }))
        .filter((g) => g.boxes.length > 0 || g.loose.length > 0 || g.nc.length > 0)
    }
    rows.sort((a, b) => {
      if (a.rackId === null) return 1
      if (b.rackId === null) return -1
      return (a.rack?.coord || '').localeCompare(b.rack?.coord || '')
    })
    return rows
  }, [items, boxes, racks, ncLocated, keyword])

  // ── 제품 모달 ──
  const openCreateProduct = () => setModal({ mode: 'create', editId: null, form: { ...EMPTY_PRODUCT_FORM } })
  const openEditProduct = (row) => setModal({
    mode: 'edit', editId: row.id,
    form: {
      item_id: row.item_id || '',
      // 연동 Item 은 외부 표시명으로 표시 (2026-06-13) — 제품명(name)과 별개
      itemQuery: row.item_display || row.item_part_no || '',
      box_id: row.box_id || '',
      name: row.name || '',
      spec: row.spec || '',
      attributesText: attrsToText(row.attributes),
      quantity: row.quantity ?? '',
      unit: row.unit || 'ea',
      usage: row.usage || 'PROD',
      usage_note: row.usage_note || '',
      rack_id: row.rack_id ?? null, shelf: row.shelf ?? null, bin: row.bin ?? null,
      location: row.location || '',
      memo: row.memo || '',
    },
  })
  const closeModal = () => setModal(null)
  const setField = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))

  const onSave = async () => {
    const { mode, editId, form } = modal
    const finalName = form.name.trim() || form.itemQuery?.trim() || ''
    if (!finalName && !form.item_id) {
      emitToast('제품명 또는 Item을 입력해주세요.', 'error'); return
    }
    const body = {
      item_id: form.item_id ? Number(form.item_id) : null,
      box_id: form.box_id ? Number(form.box_id) : null,
      name: finalName,
      spec: form.spec.trim(),
      attributes: textToAttrs(form.attributesText),
      quantity: form.quantity === '' ? 0 : Number(form.quantity),
      unit: form.unit.trim() || 'ea',
      usage: form.usage || 'PROD',
      usage_note: form.usage === 'ETC' ? (form.usage_note || '').trim() : '',
      rack_id: form.rack_id ?? null,
      shelf: form.shelf ?? null,
      bin: form.bin ?? null,
      location: form.location.trim(),
      memo: form.memo.trim(),
    }
    try {
      if (mode === 'create') {
        await createWarehouse(body)
        emitToast('등록되었습니다.', 'success')
      } else {
        await updateWarehouse(editId, body)
        emitToast('수정되었습니다.', 'success')
      }
      closeModal()
      await Promise.all([reload(), loadBoxes()])
    } catch (e) {
      emitToast(e.message || '저장 실패', 'error')
    }
  }

  const onDeleteProduct = async (row) => {
    if (!window.confirm(`"${row.name}" 항목을 삭제할까요?`)) return
    try {
      await deleteWarehouse(row.id)
      emitToast('삭제되었습니다.', 'success')
      await Promise.all([reload(), loadBoxes()])
    } catch (e) {
      emitToast(e.message || '삭제 실패', 'error')
    }
  }

  // ── 박스 관리 모달 ──
  const openBoxManage = () => setBoxModal({ form: { ...EMPTY_BOX_FORM }, editBoxId: null })
  const closeBoxModal = () => setBoxModal(null)
  const setBoxField = (k, v) => setBoxModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))
  const startEditBox = (box) => setBoxModal({
    editBoxId: box.id,
    form: {
      name: box.name || '',
      rack_id: box.rack_id ?? null, shelf: box.shelf ?? null, bin: box.bin ?? null,
      location: box.location || '', memo: box.memo || '',
    },
  })
  const resetBoxForm = () => setBoxModal({ form: { ...EMPTY_BOX_FORM }, editBoxId: null })

  const onSaveBox = async () => {
    const { form, editBoxId } = boxModal
    if (!form.name.trim()) {
      emitToast('박스 이름을 입력해주세요.', 'error'); return
    }
    const body = {
      name: form.name.trim(),
      rack_id: form.rack_id ?? null, shelf: form.shelf ?? null, bin: form.bin ?? null,
      location: form.location.trim(), memo: form.memo.trim(),
    }
    try {
      if (editBoxId) {
        await updateWarehouseBox(editBoxId, body)
        emitToast('박스 수정됨', 'success')
      } else {
        await createWarehouseBox(body)
        emitToast('박스 추가됨', 'success')
      }
      resetBoxForm()
      await Promise.all([loadBoxes(), reload()])
    } catch (e) {
      emitToast(e.message || '박스 저장 실패', 'error')
    }
  }

  const onDeleteBox = async (box) => {
    const cnt = box.item_count || 0
    const msg = cnt > 0
      ? `박스 "${box.name}" 삭제? (안의 ${cnt}개 제품은 박스에서 빠지고 보존됩니다)`
      : `박스 "${box.name}" 삭제?`
    if (!window.confirm(msg)) return
    try {
      await deleteWarehouseBox(box.id)
      emitToast('박스 삭제됨', 'success')
      if (boxModal?.editBoxId === box.id) resetBoxForm()
      await Promise.all([loadBoxes(), reload()])
    } catch (e) {
      emitToast(e.message || '박스 삭제 실패', 'error')
    }
  }

  const onPrintBox = async (box) => {
    try {
      await printWarehouseBox(box.id)
      emitToast(`박스 라벨 출력 요청됨 (${box.name})`, 'success')
    } catch (e) {
      emitToast(e.message || '라벨 출력 실패', 'error')
    }
  }

  // ── 랙 관리 모달 ──
  const openRackManage = () => setRackModal({ form: { ...EMPTY_RACK_FORM }, editRackId: null })
  const closeRackModal = () => setRackModal(null)
  const setRackField = (k, v) => setRackModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))
  const resetRackForm = () => setRackModal({ form: { ...EMPTY_RACK_FORM }, editRackId: null })
  const startEditRack = (rk) => setRackModal({
    editRackId: rk.id,
    form: {
      zone: rk.zone || '', aisle: rk.aisle || '', rack: rk.rack || '',
      name: rk.name || '',
      shelf_count: String(rk.shelf_count || 1),
      bin_count: String(rk.bin_count || 1),
      memo: rk.memo || '',
    },
  })

  const onSaveRack = async () => {
    const { form, editRackId } = rackModal
    if (!form.zone.trim()) { emitToast('Zone(영문)을 입력해주세요.', 'error'); return }
    const body = {
      zone: form.zone.trim().toUpperCase(),
      aisle: form.aisle.trim(),
      rack: form.rack.trim(),
      name: form.name.trim(),
      shelf_count: Math.max(1, Number(form.shelf_count) || 1),
      bin_count: Math.max(1, Number(form.bin_count) || 1),
      memo: form.memo.trim(),
    }
    try {
      if (editRackId) {
        await updateWarehouseRack(editRackId, body)
        emitToast('랙 수정됨', 'success')
      } else {
        await createWarehouseRack(body)
        emitToast('랙 추가됨', 'success')
      }
      resetRackForm()
      await loadRacks()
    } catch (e) {
      emitToast(e.message || '랙 저장 실패', 'error')
    }
  }

  const onDeleteRack = async (rk) => {
    if (!window.confirm(`랙 "${rk.name}" 삭제할까요?`)) return
    try {
      await deleteWarehouseRack(rk.id)
      emitToast('랙 삭제됨', 'success')
      if (rackModal?.editRackId === rk.id) resetRackForm()
      await loadRacks()
    } catch (e) {
      emitToast(e.message || '랙 삭제 실패', 'error')
    }
  }

  const onPrintRack = async (rk) => {
    try {
      await printWarehouseRack(rk.id)
      emitToast(`랙 QR 출력 요청됨 (${rk.coord})`, 'success')
    } catch (e) {
      emitToast(e.message || 'QR 출력 실패', 'error')
    }
  }

  // 단별 QR — 그 단 1장만 출력 (랙은 모든 단 N장). 단 행 인라인 버튼에서 호출 (2026-06-11).
  const onPrintRackShelf = async (rk, shelf) => {
    try {
      await printWarehouseRack(rk.id, { shelf })
      emitToast(`단 QR 출력 요청됨 (${rk.coord}-${String(shelf).padStart(2, '0')})`, 'success')
    } catch (e) {
      emitToast(e.message || 'QR 출력 실패', 'error')
    }
  }

  // 제품 QR 출력 — QR=lot_no(원자재·자석) 또는 name(LAN TOOL 등)
  const onPrintItem = async (it) => {
    try {
      await printWarehouseItem(it.id)
      emitToast(`QR 출력 요청됨 (${it.lot_no || it.name})`, 'success')
    } catch (e) {
      emitToast(e.message || 'QR 출력 실패', 'error')
    }
  }

  // 제품 1행 렌더 (박스 안 / 랙 직속 공용) — 공통 그리드 .row 사용 (모든 행 컬럼 정렬 통일)
  const renderItem = (it) => (
    <div key={it.id} className={s.row}>
      <span className={s.cMarker} />
      <span className={s.cName} title={it.memo || it.name}>
        {it.name}
        {it.lot_no ? <span className={s.lotText}>{it.lot_no}</span> : null}
        {it.item_id ? <span className={s.itemBadge}>{it.item_display || `Item#${it.item_id}`}</span> : null}
        {it.usage && it.usage !== 'PROD' ? (
          <span className={s.usageBadge}>
            {USAGE_LABELS[it.usage] || it.usage}{it.usage === 'ETC' && it.usage_note ? ` · ${it.usage_note}` : ''}
          </span>
        ) : null}
      </span>
      <span className={s.cSub} title={it.spec || ''}>{it.spec || '—'}</span>
      <span className={s.cQty}>{it.quantity}<i className={s.unit}> {it.unit}</i></span>
      <span className={s.cActions}>
        <button type="button" className={s.linkBtn}
          onClick={() => onPrintItem(it)} title={`STOCK 라벨 (QR=${it.lot_no || it.name})`}>QR</button>
        <button type="button" className={s.linkBtn} onClick={() => openEditProduct(it)}>수정</button>
        <button type="button" className={s.linkDanger} onClick={() => onDeleteProduct(it)}>삭제</button>
      </span>
    </div>
  )

  // 박스 1블록 렌더 (헤더 행 + 펼침 시 내용물)
  const renderBox = (box) => {
    const open = openBoxes.has(box.id)
    const contents = boxContents[box.id]
    return (
      <div key={box.id} className={s.boxBlock}>
        <div className={`${s.row} ${s.boxRow}`} onClick={() => toggleBox(box.id)}>
          <span className={s.cMarker}>
            <span className={s.boxChevron}>{open ? '▾' : '▸'}</span>
            <span className={s.boxIcon}>📦</span>
          </span>
          <span className={s.cName}>{box.name || box.code}</span>
          <span className={`${s.cSub} ${s.mono}`}>{box.location_full || '—'}</span>
          <span className={s.cQty}>{box.item_count}<i className={s.unit}> 개</i></span>
          <span className={s.cActions} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={s.linkBtn} onClick={() => onPrintBox(box)}>QR</button>
            <button type="button" className={s.linkBtn} onClick={() => startEditBox(box)}>수정</button>
            <button type="button" className={s.linkDanger} onClick={() => onDeleteBox(box)}>삭제</button>
          </span>
        </div>
        {open && (
          <div className={s.boxItems}>
            {!contents ? (
              <div className={s.boxEmpty}>불러오는 중…</div>
            ) : contents.length === 0 ? (
              <div className={s.boxEmpty}>비어 있음 — 제품 수정/부적합품 관리에서 이 박스를 지정하세요</div>
            ) : contents.map((c) => (
              <div key={c.content_id ?? `${c.item_type}-${c.item_id}`} className={s.row}>
                <span className={s.cMarker}>
                  <span className={`${s.cTag} ${s['ct_' + c.item_type] || ''}`}>
                    {CONTENT_LABELS[c.item_type] || c.item_type}
                  </span>
                </span>
                <span className={s.cName}>
                  {c.name}
                  {c.ref ? <span className={s.cRef}>{c.ref}</span> : null}
                </span>
                <span className={s.cSub} title={c.sub || ''}>{c.sub || '—'}</span>
                <span className={s.cQty}>{c.qty ?? '—'}</span>
                <span className={s.cActions}>
                  {c.content_id
                    ? <button type="button" className={s.linkDanger} onClick={() => onRemoveContent(box.id, c)}>빼기</button>
                    : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // NC(부적합) 1행 렌더 — 박스 없이 랙에 직접 둔 부적합품
  const renderNc = (n) => (
    <div key={`nc-${n.ref}`} className={s.row}>
      <span className={s.cMarker}>
        <span className={`${s.cTag} ${s.ct_nc}`}>부적합</span>
      </span>
      <span className={s.cName}>
        {n.name}
        {n.ref ? <span className={s.cRef}>{n.ref}</span> : null}
      </span>
      <span className={s.cSub} title={n.nc?.defect_detail || n.spec || ''}>
        {n.nc?.defect_type || n.spec || '—'}
      </span>
      <span className={s.cQty}>{n.qty}</span>
      <span className={s.cActions} />
    </div>
  )

  // 랙 그룹을 단(shelf)별로 버킷팅 — 단 미지정(null)은 맨 뒤
  // seedAll=true 면 랙 마스터의 모든 단(1..shelf_count)을 빈 버킷으로 생성 —
  //   드릴다운에서 빈 단도 떠야 단별 QR 출력 가능 (검색 모드는 항목 있는 단만, 2026-06-11)
  const bucketByShelf = (g, seedAll = false) => {
    const map = new Map()  // shelf|'none' -> { shelf, boxes, loose, nc }
    const ensure = (sh) => {
      const key = sh ?? 'none'
      if (!map.has(key)) map.set(key, { shelf: sh ?? null, boxes: [], loose: [], nc: [] })
      return map.get(key)
    }
    if (seedAll && g.rack) seq(g.rack.shelf_count).forEach((n) => ensure(n))
    g.boxes.forEach((b) => ensure(b.shelf ?? null).boxes.push(b))
    g.loose.forEach((it) => ensure(it.shelf ?? null).loose.push(it))
    g.nc.forEach((n) => ensure(n.shelf ?? null).nc.push(n))
    const arr = [...map.values()]
    arr.sort((a, b) => {
      if (a.shelf === null) return 1
      if (b.shelf === null) return -1
      return a.shelf - b.shelf
    })
    return arr
  }

  // 단(shelf) 버킷을 칸(bin) 단위로 — bucketByShelf 와 동일 패턴 (드릴다운 4단계, 2026-06-10)
  // seedRack 주어지면 모든 칸(1..bin_count)을 빈 버킷으로 생성 (단 미지정 버킷은 시딩 안 함)
  const bucketByBin = (bk, seedRack = null) => {
    const map = new Map()  // bin|'none' -> { bin, boxes, loose, nc }
    const ensure = (bn) => {
      const key = bn ?? 'none'
      if (!map.has(key)) map.set(key, { bin: bn ?? null, boxes: [], loose: [], nc: [] })
      return map.get(key)
    }
    if (seedRack && bk.shelf != null) seq(seedRack.bin_count).forEach((n) => ensure(n))
    bk.boxes.forEach((b) => ensure(b.bin ?? null).boxes.push(b))
    bk.loose.forEach((it) => ensure(it.bin ?? null).loose.push(it))
    bk.nc.forEach((n) => ensure(n.bin ?? null).nc.push(n))
    const arr = [...map.values()]
    arr.sort((a, b) => {
      if (a.bin === null) return 1
      if (b.bin === null) return -1
      return a.bin - b.bin
    })
    return arr
  }

  const rackLabelOf = (g) =>
    g.rack ? (g.rack.name || g.rack.coord) : (g.rackId ? '(삭제된 랙)' : '위치 미지정')

  // ── 드릴다운 현재 선택 계산 (검색 중이면 무시) ──
  const searching = keyword.trim() !== ''
  const navLevel = nav.rackId === undefined ? 0 : nav.shelf === undefined ? 1 : nav.bin === undefined ? 2 : 3
  const selGroup = nav.rackId === undefined ? null : (grouped.find((g) => g.rackId === nav.rackId) || null)
  const shelfBuckets = selGroup ? bucketByShelf(selGroup, true) : []
  const selShelf = nav.shelf === undefined ? null : (shelfBuckets.find((bk) => bk.shelf === nav.shelf) || null)
  const binBuckets = selShelf ? bucketByBin(selShelf, selGroup?.rack || null) : []
  const selBin = nav.bin === undefined ? null : (binBuckets.find((bb) => bb.bin === nav.bin) || null)

  // 선택한 랙/단/칸이 데이터 갱신으로 사라지면 그 레벨로 안전 복귀
  useEffect(() => {
    if (nav.rackId !== undefined && !grouped.some((g) => g.rackId === nav.rackId)) {
      setNav({ rackId: undefined, shelf: undefined, bin: undefined })
    }
  }, [grouped, nav.rackId])

  const enterRack  = (rackId) => setNav({ rackId, shelf: undefined, bin: undefined })
  const enterShelf = (shelf)  => setNav((n) => ({ ...n, shelf, bin: undefined }))
  const enterBin   = (bin)    => setNav((n) => ({ ...n, bin }))
  const goBack = () => setNav((n) => {
    if (n.bin !== undefined) return { ...n, bin: undefined }
    if (n.shelf !== undefined) return { ...n, shelf: undefined }
    return { rackId: undefined, shelf: undefined, bin: undefined }
  })

  // 브레드크럼 — 각 단계 클릭 시 그 레벨로 복귀 (마지막=현재 위치는 비활성)
  const crumbs = [{ label: '창고', go: () => setNav({ rackId: undefined, shelf: undefined, bin: undefined }) }]
  if (selGroup) crumbs.push({ label: rackLabelOf(selGroup), go: () => setNav({ rackId: nav.rackId, shelf: undefined, bin: undefined }) })
  if (nav.shelf !== undefined) crumbs.push({ label: nav.shelf != null ? `${nav.shelf}단` : '단 미지정', go: () => setNav({ rackId: nav.rackId, shelf: nav.shelf, bin: undefined }) })
  if (nav.bin !== undefined) crumbs.push({ label: nav.bin != null ? `${nav.bin}칸` : '칸 미지정', go: null })

  // 클릭 가능한 네비게이션 행 (랙/단/칸 공용) — actions 는 진입 막고 별도 동작
  const renderNavRow = (key, label, meta, onClick, actions = null) => (
    <div key={key} className={s.navRow} onClick={onClick} role="button" tabIndex={0}>
      <span className={s.navLabel}>{label}</span>
      <span className={s.navMeta}>{meta}</span>
      {actions && <span className={s.navActions} onClick={(e) => e.stopPropagation()}>{actions}</span>}
      <span className={s.navChevron}>›</span>
    </div>
  )

  // ── QR 스캔 (위치 보기 / 옮기기) — 랙 QR(coord) / 박스 QR(BOX-id) ──
  const rackCoordOf = (r) => r.coord || [r.zone, r.aisle, r.rack].filter(Boolean).join('-')

  // 스캔값 → 위치(랙/박스) 식별. 위치 아니면 null (제품 QR 등)
  //   'A-00-07'   → 랙 (단 미지정)
  //   'A-00-07-1' → 랙 + 1단 (단별 QR, 2026-06-11)
  const parseLocation = (v) => {
    const mBox = v.match(/^BOX-(\d+)$/i)
    if (mBox) {
      const box = boxes.find((b) => b.id === Number(mBox[1]))
      return box ? { kind: 'box', id: box.id, label: box.name || `BOX-${box.id}` } : null
    }
    const exact = racks.find((r) => rackCoordOf(r) === v)
    if (exact) return { kind: 'rack', id: exact.id, shelf: null, label: rackCoordOf(exact) }
    // 좌표-단 (예: A-00-07-1) — 좌표가 prefix 이고 뒤가 단 번호
    for (const r of racks) {
      const coord = rackCoordOf(r)
      if (coord && v.startsWith(`${coord}-`)) {
        const shelf = Number(v.slice(coord.length + 1))
        if (Number.isInteger(shelf) && shelf > 0) {
          return { kind: 'rack', id: r.id, shelf, label: `${coord}-${String(shelf).padStart(2, '0')}` }
        }
      }
    }
    return null
  }

  // 위치로 드릴다운 점프 (보기)
  const jumpToLocation = (loc) => {
    setKeyword('')
    if (loc.kind === 'rack') {
      // 단까지 지정된 QR(A-00-07-1)이면 그 단으로, 아니면 단 목록
      setNav({ rackId: loc.id, shelf: loc.shelf ?? undefined, bin: undefined })
    } else {
      const box = boxes.find((b) => b.id === loc.id)
      if (box) {
        setNav({ rackId: box.rack_id ?? null, shelf: box.shelf ?? null, bin: box.bin ?? null })
        setOpenBoxes((prev) => new Set(prev).add(box.id))
        if (!boxContents[box.id]) loadBoxContents(box.id)
      }
    }
  }

  const closeScan = () => {
    const moved = moveLog.length > 0
    setScanOpen(false); setScanLoc(null); setMoveDest(null); setMoveLog([])
    if (moved) { reload(); loadBoxes(); loadNc() }   // 이동 결과 반영
  }

  const viewScanLoc = () => {   // [내용 보기] — 스캔한 위치로 점프 후 닫기
    if (scanLoc) jumpToLocation(scanLoc)
    closeScan()
  }

  // QRScanner onScan — 옮기기 목적지가 잡혀있으면 대상 이동, 아니면 위치 스캔
  const handleScan = async (raw) => {
    const v = (raw || '').trim()
    if (!v) return
    if (moveDest) {
      try {
        await scanMove({ dest_kind: moveDest.kind, dest_id: moveDest.id, dest_shelf: moveDest.shelf ?? null, target_scan: v })
        setMoveLog((log) => [{ scan: v, ok: true }, ...log])
        emitToast(`${v} → ${moveDest.label} 이동`, 'success')
      } catch (e) {
        setMoveLog((log) => [{ scan: v, ok: false, err: e.message }, ...log])
        emitToast(e.message || '이동 실패', 'error')
      }
      return
    }
    const loc = parseLocation(v)
    if (!loc) { emitToast(`위치 QR(랙/박스)을 먼저 스캔하세요: ${v}`, 'error'); return }
    setScanLoc(loc)   // 보기/옮기기 선택 대기
  }

  return (
    <div className="page-flat">
      <PageHeader title="창고" subtitle="랙·박스·제품·부적합품 위치 관리" onBack={onBack} />

      <div className={s.toolbar}>
        <input type="text" className={s.search} placeholder="제품명/규격/메모/위치 검색"
          value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <button type="button" className={s.toolBtn} onClick={() => setScanOpen(true)}>QR 스캔</button>
        <button type="button" className={s.toolBtn} onClick={openRackManage}>랙 관리</button>
        <button type="button" className={s.toolBtn} onClick={openBoxManage}>박스 관리</button>
        <button type="button" className="btn-primary" onClick={openCreateProduct}>+ 제품</button>
      </div>

      {loading && <p className={s.msg}>로딩 중…</p>}
      {error && <p className={s.error}>{error}</p>}

      {!loading && !error && (
        <div className={s.tree}>
          {grouped.length === 0 ? (
            <p className={s.empty}>등록된 항목이 없습니다.</p>
          ) : searching ? (
            /* ── 검색 모드 — 랙/단 평면 펼침 (찾기용, 드릴다운 무시) ── */
            grouped.map((g) => (
              <div key={g.rackId ?? 'none'} className={s.rackGroup}>
                <div className={s.rackHeader}>
                  <span className={s.rackTitle}>
                    {rackLabelOf(g)}
                    {g.rack && <span className={s.rackCoord}>{g.rack.coord}</span>}
                  </span>
                  <span className={s.rackMeta}>박스 {g.boxes.length} · 제품 {g.itemCount}</span>
                  {g.rack && (
                    <span className={s.rackActions}>
                      <button type="button" className={s.linkBtn} onClick={() => onPrintRack(g.rack)}>QR</button>
                      <button type="button" className={s.linkBtn} onClick={() => startEditRack(g.rack)}>수정</button>
                    </span>
                  )}
                </div>
                {(() => {
                  const buckets = bucketByShelf(g)
                  const flat = buckets.length === 1 && buckets[0].shelf === null
                  return buckets.map((bk) => (
                    <Fragment key={bk.shelf ?? 'none'}>
                      {!flat && (
                        <div className={s.shelfHeader}>
                          <span className={s.shelfLabel}>{bk.shelf != null ? `${bk.shelf}단` : '단 미지정'}</span>
                          <span className={s.shelfMeta}>박스 {bk.boxes.length} · 제품 {bk.loose.length + bk.nc.length}</span>
                        </div>
                      )}
                      {bk.boxes.map(renderBox)}
                      {bk.loose.map((it) => renderItem(it))}
                      {bk.nc.map(renderNc)}
                    </Fragment>
                  ))
                })()}
              </div>
            ))
          ) : (
            /* ── 드릴다운 모드 — 랙 › 단 › 칸 › 항목 (한 레벨씩) ── */
            <>
              <div className={s.breadcrumb}>
                {navLevel > 0 && (
                  <button type="button" className={s.backBtn} onClick={goBack}>← 뒤로</button>
                )}
                <div className={s.crumbs}>
                  {crumbs.map((c, i) => (
                    <Fragment key={i}>
                      {i > 0 && <span className={s.crumbSep}>›</span>}
                      {c.go ? (
                        <button type="button" className={s.crumb} onClick={c.go}>{c.label}</button>
                      ) : (
                        <span className={s.crumbCurrent}>{c.label}</span>
                      )}
                    </Fragment>
                  ))}
                </div>
                {/* 상단 일괄 "QR 출력" 제거 (2026-06-11) — 각 단 행에 인라인 QR 버튼으로 이전.
                    랙 단위 일괄 QR 은 navLevel 0 의 랙 행 QR 버튼에서 가능. */}
              </div>

              {navLevel === 0 && grouped.map((g) =>
                renderNavRow(
                  g.rackId ?? 'none',
                  <>{rackLabelOf(g)}{g.rack && <span className={s.rackCoord}>{g.rack.coord}</span>}</>,
                  `박스 ${g.boxes.length} · 제품 ${g.itemCount}`,
                  () => enterRack(g.rackId),
                  g.rack ? (
                    <>
                      <button type="button" className={s.linkBtn} onClick={() => onPrintRack(g.rack)}>QR</button>
                      <button type="button" className={s.linkBtn} onClick={() => startEditRack(g.rack)}>수정</button>
                    </>
                  ) : null,
                ))}

              {navLevel === 1 && shelfBuckets.map((bk) =>
                renderNavRow(
                  bk.shelf ?? 'none',
                  bk.shelf != null ? `${bk.shelf}단` : '단 미지정',
                  `박스 ${bk.boxes.length} · 제품 ${bk.loose.length + bk.nc.length}`,
                  () => enterShelf(bk.shelf),
                  /* 단별 QR — 그 단 1장만 출력 (랙 행과 동일 패턴, 2026-06-11).
                     단 미지정 행(shelf=null)은 QR 발급 불가 → 버튼 숨김. */
                  bk.shelf != null && selGroup?.rack ? (
                    <button type="button" className={s.linkBtn}
                      onClick={() => onPrintRackShelf(selGroup.rack, bk.shelf)}>QR</button>
                  ) : null,
                ))}

              {navLevel === 2 && binBuckets.map((bb) =>
                renderNavRow(
                  bb.bin ?? 'none',
                  bb.bin != null ? `${bb.bin}칸` : '칸 미지정',
                  `박스 ${bb.boxes.length} · 제품 ${bb.loose.length + bb.nc.length}`,
                  () => enterBin(bb.bin),
                ))}

              {navLevel === 3 && (
                selBin && (selBin.boxes.length + selBin.loose.length + selBin.nc.length) > 0 ? (
                  <>
                    {selBin.boxes.map(renderBox)}
                    {selBin.loose.map((it) => renderItem(it))}
                    {selBin.nc.map(renderNc)}
                  </>
                ) : (
                  <p className={s.empty}>이 칸에 항목이 없습니다.</p>
                )
              )}
            </>
          )}
        </div>
      )}

      {/* ── QR 스캔 모달 (위치 보기 / 옮기기) ── */}
      {scanOpen && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && closeScan()}>
          <div className={s.scanModal} onClick={(e) => e.stopPropagation()}>
            {/* 옮기기 목적지 배너 */}
            {moveDest && (
              <div className={s.scanBanner}>
                <span>📥 목적지 <b>{moveDest.label}</b> ({moveDest.kind === 'box' ? '박스' : '랙'}) — 옮길 항목 QR을 스캔하세요</span>
                <button type="button" className={s.linkBtn} onClick={() => setMoveDest(null)}>변경</button>
              </div>
            )}
            {/* 위치 스캔 후 보기/옮기기 선택 (목적지 미확정 + 위치 스캔됨) */}
            {scanLoc && !moveDest ? (
              <div className={s.scanChoose}>
                <p className={s.scanChooseTitle}>
                  {scanLoc.label} <span className={s.scanChooseKind}>{scanLoc.kind === 'box' ? '박스' : '랙'}</span>
                </p>
                <div className={s.scanChooseBtns}>
                  <button type="button" className="btn-secondary btn-md" onClick={viewScanLoc}>내용 보기</button>
                  <button type="button" className="btn-primary btn-md"
                    onClick={() => { setMoveDest(scanLoc); setScanLoc(null) }}>여기로 옮기기</button>
                </div>
                <button type="button" className={s.linkBtn} onClick={() => setScanLoc(null)}>다시 스캔</button>
              </div>
            ) : (
              <QRScanner
                processLabel={moveDest ? `옮길 항목 스캔 → ${moveDest.label}` : '위치 QR (랙·박스) 스캔'}
                onScan={handleScan}
                onBack={closeScan}
                compact
              />
            )}
            {/* 이동 로그 */}
            {moveLog.length > 0 && (
              <div className={s.scanLog}>
                {moveLog.map((m, i) => (
                  <div key={i} className={m.ok ? s.scanLogOk : s.scanLogErr}>
                    {m.ok ? '✓' : '✗'} {m.scan}{m.err ? ` — ${m.err}` : ''}
                  </div>
                ))}
                <button type="button" className="btn-primary btn-md btn-full" onClick={closeScan}>완료</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 제품 입력 모달 ── */}
      {modal && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className={s.modal}>
            <h2 className={s.modalTitle}>{modal.mode === 'create' ? '신규 제품' : '제품 수정'}</h2>
            <div className={s.formGrid}>
              <label>Item (품번/품목 검색)
                <ItemCombobox
                  query={modal.form.itemQuery}
                  selectedId={modal.form.item_id}
                  onQueryChange={(v) => setField('itemQuery', v)}
                  onSelect={(item) => {
                    if (item) {
                      // 표시는 외부 표시명(name) 우선 — 제품명(name 필드)은 동기화 안 함 (2026-06-13).
                      //   제품명은 자유 입력 유지, 규격만 비어있을 때 Item 규격으로 채움.
                      setModal((m) => ({ ...m, form: {
                        ...m.form,
                        item_id: item.id,
                        itemQuery: item.name || item.part_no,
                        spec: m.form.spec || item.spec || '',
                      }}))
                    } else {
                      setField('item_id', '')
                    }
                  }}
                />
              </label>
              <label><span className={s.lblRow}>담을 박스 <span className={s.optional}>(선택)</span></span>
                <select value={modal.form.box_id}
                  onChange={(e) => setField('box_id', e.target.value)}>
                  <option value="">박스 없음</option>
                  {boxes.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
              <label>제품명
                <input type="text" value={modal.form.name}
                  onChange={(e) => setField('name', e.target.value)} placeholder="제품명" />
              </label>
              <label>규격
                <input type="text" value={modal.form.spec}
                  onChange={(e) => setField('spec', e.target.value)} placeholder="규격" />
              </label>
              <label>수량
                <input type="number" step="any" value={modal.form.quantity}
                  onChange={(e) => setField('quantity', e.target.value)} placeholder="0" />
              </label>
              <label>단위
                <input type="text" value={modal.form.unit}
                  onChange={(e) => setField('unit', e.target.value)} placeholder="ea / kg / 매" />
              </label>
              <label>용도
                <select value={modal.form.usage}
                  onChange={(e) => setField('usage', e.target.value)}>
                  {USAGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              {modal.form.usage === 'ETC' && (
                <label>용도 상세
                  <input type="text" value={modal.form.usage_note}
                    onChange={(e) => setField('usage_note', e.target.value)} placeholder="예: 연구용" />
                </label>
              )}
              <label className={s.fullRow}>위치 (랙 → 단/칸) <span className={s.optional}>박스 담기면 비워도 박스 위치 상속</span>
                <LocationFields form={modal.form} racks={racks}
                  onPickRack={(r) => setModal((m) => ({ ...m, form: {
                    ...m.form, rack_id: r?.id ?? null, shelf: null, bin: null,
                  } }))}
                  onCellChange={(k, v) => setField(k, v)} />
              </label>
              <label className={s.fullRow}>속성 (key=value 줄바꿈)
                <textarea rows={2} value={modal.form.attributesText}
                  onChange={(e) => setField('attributesText', e.target.value)}
                  placeholder={'color=red\nweight=10kg'} />
              </label>
              <label className={s.fullRow}>메모
                <textarea rows={2} value={modal.form.memo}
                  onChange={(e) => setField('memo', e.target.value)} placeholder="메모 (선택)" />
              </label>
            </div>
            <div className={s.modalBtnRow}>
              <button type="button" className="btn-secondary" onClick={closeModal}>취소</button>
              <button type="button" className="btn-primary" onClick={onSave}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 박스 관리 모달 (넓은 레이아웃) ── */}
      {boxModal && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && closeBoxModal()}>
          <div className={`${s.modal} ${s.modalWide}`}>
            <h2 className={s.modalTitle}>박스 관리</h2>

            {/* 추가/수정 폼 — 한 줄 가로 배치 */}
            <div className={s.boxForm}>
              <label className={`${s.rackField} ${s.grow}`}>박스 이름
                <input type="text" value={boxModal.form.name}
                  onChange={(e) => setBoxField('name', e.target.value)} placeholder="예: BOX-001" />
              </label>
              <div className={`${s.rackField} ${s.locField}`}>위치 (랙 → 단/칸)
                <LocationFields form={boxModal.form} racks={racks}
                  onPickRack={(r) => setBoxModal((m) => ({ ...m, form: {
                    ...m.form, rack_id: r?.id ?? null, shelf: null, bin: null,
                  } }))}
                  onCellChange={(k, v) => setBoxField(k, v)} />
              </div>
              <label className={`${s.rackField} ${s.grow}`}>비고
                <input type="text" value={boxModal.form.memo}
                  onChange={(e) => setBoxField('memo', e.target.value)} placeholder="비고 (선택)" />
              </label>
              <div className={s.rackFormBtns}>
                {boxModal.editBoxId && (
                  <button type="button" className={s.linkBtn} onClick={resetBoxForm}>새 박스로</button>
                )}
                <button type="button" className="btn-primary" onClick={onSaveBox}>
                  {boxModal.editBoxId ? '박스 수정' : '박스 추가'}
                </button>
              </div>
            </div>

            {/* 박스 목록 (thin 테이블) */}
            <div className={s.tableWrap} style={{ marginTop: 14 }}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>박스명</th>
                    <th>위치</th>
                    <th className={s.numCol}>제품수</th>
                    <th>비고</th>
                    <th className={s.actCol}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.length === 0 ? (
                    <tr><td colSpan={5} className={s.empty}>등록된 박스가 없습니다.</td></tr>
                  ) : boxes.map((b) => (
                    <tr key={b.id} className={boxModal.editBoxId === b.id ? s.activeRow : undefined}>
                      <td className={s.nameCell}>{b.name}</td>
                      <td>{b.location_full || b.location || '—'}</td>
                      <td className={s.numCol}>{b.item_count}</td>
                      <td className={s.ellip} title={b.memo || ''}>{b.memo || '—'}</td>
                      <td className={s.actCol}>
                        <button type="button" className={s.linkBtn} onClick={() => onPrintBox(b)}>QR</button>
                        <button type="button" className={s.linkBtn} onClick={() => startEditBox(b)}>수정</button>
                        <button type="button" className={s.linkDanger} onClick={() => onDeleteBox(b)}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={s.modalBtnRow}>
              <button type="button" className="btn-secondary" onClick={closeBoxModal}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 랙 관리 모달 (넓은 레이아웃) ── */}
      {rackModal && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && closeRackModal()}>
          <div className={`${s.modal} ${s.modalWide}`}>
            <h2 className={s.modalTitle}>랙 관리</h2>

            {/* 추가/수정 폼 — 한 줄 가로 배치 */}
            <div className={s.rackForm}>
              <label className={`${s.rackField} ${s.coord}`}>Zone
                <input type="text" maxLength={4} value={rackModal.form.zone}
                  onChange={(e) => setRackField('zone', e.target.value.toUpperCase())} placeholder="A" />
              </label>
              <label className={`${s.rackField} ${s.coord}`}>Aisle
                <input type="text" maxLength={6} value={rackModal.form.aisle}
                  onChange={(e) => setRackField('aisle', e.target.value)} placeholder="01" />
              </label>
              <label className={`${s.rackField} ${s.coord}`}>Rack
                <input type="text" maxLength={6} value={rackModal.form.rack}
                  onChange={(e) => setRackField('rack', e.target.value)} placeholder="01" />
              </label>
              <label className={`${s.rackField} ${s.num}`}>단(Shelf)
                <input type="number" min="1" value={rackModal.form.shelf_count}
                  onChange={(e) => setRackField('shelf_count', e.target.value)} placeholder="1" />
              </label>
              <label className={`${s.rackField} ${s.num}`}>칸(Bin)
                <input type="number" min="1" value={rackModal.form.bin_count}
                  onChange={(e) => setRackField('bin_count', e.target.value)} placeholder="1" />
              </label>
              <label className={`${s.rackField} ${s.grow}`}>표시명 <span className={s.optional}>(비면 좌표로 자동)</span>
                <input type="text" value={rackModal.form.name}
                  onChange={(e) => setRackField('name', e.target.value)} placeholder="예: A동 1번 랙" />
              </label>
              <label className={`${s.rackField} ${s.grow}`}>비고
                <input type="text" value={rackModal.form.memo}
                  onChange={(e) => setRackField('memo', e.target.value)} placeholder="비고 (선택)" />
              </label>
              <div className={s.rackFormBtns}>
                {rackModal.editRackId && (
                  <button type="button" className={s.linkBtn} onClick={resetRackForm}>새 랙으로</button>
                )}
                <button type="button" className="btn-primary" onClick={onSaveRack}>
                  {rackModal.editRackId ? '랙 수정' : '랙 추가'}
                </button>
              </div>
            </div>

            {/* 랙 목록 — 전체 컬럼 */}
            <div className={s.tableWrap} style={{ marginTop: 14 }}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>좌표</th>
                    <th>표시명</th>
                    <th className={s.numCol}>단</th>
                    <th className={s.numCol}>칸</th>
                    <th className={s.numCol}>총 칸수</th>
                    <th>비고</th>
                    <th className={s.actCol}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {racks.length === 0 ? (
                    <tr><td colSpan={7} className={s.empty}>등록된 랙이 없습니다.</td></tr>
                  ) : racks.map((r) => (
                    <tr key={r.id} className={rackModal.editRackId === r.id ? s.activeRow : undefined}>
                      <td className={s.nameCell}>{r.coord || '—'}</td>
                      <td>{r.name}</td>
                      <td className={s.numCol}>{r.shelf_count}</td>
                      <td className={s.numCol}>{r.bin_count}</td>
                      <td className={s.numCol}>{r.cell_count}</td>
                      <td className={s.ellip} title={r.memo || ''}>{r.memo || '—'}</td>
                      <td className={s.actCol}>
                        <button type="button" className={s.linkBtn} onClick={() => onPrintRack(r)}>QR</button>
                        <button type="button" className={s.linkBtn} onClick={() => startEditRack(r)}>수정</button>
                        <button type="button" className={s.linkDanger} onClick={() => onDeleteRack(r)}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={s.modalBtnRow}>
              <button type="button" className="btn-secondary" onClick={closeRackModal}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
