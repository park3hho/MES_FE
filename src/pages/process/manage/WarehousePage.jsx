// pages/process/manage/WarehousePage.jsx
// 창고 — 플랫 dense 테이블 (2026-06-08 v5)
//
// 구조 (v5 — 사용자 확정):
//   - 아코디언/아이콘 제거. 제품 1행 = 평범한 테이블 행.
//   - 박스는 별도 행이 아니라 "박스" 컬럼(평문 텍스트)으로 표시.
//   - 박스 그룹끼리 모이도록 박스명 → 제품명 순 정렬.
//   - 박스 생성/수정/삭제는 "박스 관리" 모달에서.
//   - 행 얇게, 수정/삭제는 평범한 텍스트 버튼.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  listWarehouse, createWarehouse, updateWarehouse, deleteWarehouse,
  listWarehouseBox, createWarehouseBox, updateWarehouseBox, deleteWarehouseBox,
  printWarehouseBox,
  listWarehouseRack, createWarehouseRack, updateWarehouseRack, deleteWarehouseRack,
  printWarehouseRack,
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
  rack_id: null, shelf: null, bin: null,
  location: '', memo: '',
}
const EMPTY_BOX_FORM = {
  name: '', rack_id: null, shelf: null, bin: null, location: '', memo: '',
}
const EMPTY_RACK_FORM = {
  zone: '', aisle: '', rack: '', name: '', shelf_count: '1', bin_count: '1', memo: '',
}

const COL_COUNT = 9

const seq = (n) => Array.from({ length: Math.max(0, n) }, (_, i) => i + 1)

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

  // 제품 입력 모달 — { mode, editId, form } | null
  const [modal, setModal] = useState(null)
  // 박스 관리 모달 — { form, editBoxId } | null
  const [boxModal, setBoxModal] = useState(null)
  // 랙 관리 모달 — { form, editRackId } | null
  const [rackModal, setRackModal] = useState(null)

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
  useEffect(() => { reload() }, [reload])

  // 박스명 → 제품명 순 정렬 (박스 그룹끼리 모임, 미담김은 맨 뒤)
  const sorted = useMemo(() => {
    const arr = [...items]
    arr.sort((a, b) => {
      const ba = a.box_name || '', bb = b.box_name || ''
      if (ba !== bb) {
        if (!ba) return 1
        if (!bb) return -1
        return ba.localeCompare(bb)
      }
      return (a.name || '').localeCompare(b.name || '')
    })
    return arr
  }, [items])

  // ── 제품 모달 ──
  const openCreateProduct = () => setModal({ mode: 'create', editId: null, form: { ...EMPTY_PRODUCT_FORM } })
  const openEditProduct = (row) => setModal({
    mode: 'edit', editId: row.id,
    form: {
      item_id: row.item_id || '',
      itemQuery: row.item_part_no || row.name || '',
      box_id: row.box_id || '',
      name: row.name || '',
      spec: row.spec || '',
      attributesText: attrsToText(row.attributes),
      quantity: row.quantity ?? '',
      unit: row.unit || 'ea',
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

  return (
    <div className="page-flat">
      <PageHeader title="창고" subtitle="박스·제품 자유 입력 재고 관리" onBack={onBack} />

      <div className={s.toolbar}>
        <input type="text" className={s.search} placeholder="제품명/규격/메모/위치 검색"
          value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <button type="button" className={s.toolBtn} onClick={openRackManage}>랙 관리</button>
        <button type="button" className={s.toolBtn} onClick={openBoxManage}>박스 관리</button>
        <button type="button" className="btn-primary" onClick={openCreateProduct}>+ 제품</button>
      </div>

      {loading && <p className={s.msg}>로딩 중…</p>}
      {error && <p className={s.error}>{error}</p>}

      {!loading && !error && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>제품명</th>
                <th>Item</th>
                <th>규격</th>
                <th>속성</th>
                <th className={s.numCol}>수량</th>
                <th>단위</th>
                <th>위치</th>
                <th>메모</th>
                <th className={s.actCol}>작업</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={COL_COUNT} className={s.empty}>등록된 항목이 없습니다.</td></tr>
              ) : sorted.map((r) => (
                <tr key={r.id}>
                  <td className={s.nameCell}>
                    {r.name}
                    {r.box_name && <span className={s.boxTag} title="담긴 박스">{r.box_name}</span>}
                  </td>
                  <td>{r.item_id || '—'}</td>
                  <td>{r.spec || '—'}</td>
                  <td className={s.ellip} title={r.attributes && Object.keys(r.attributes).length
                    ? Object.entries(r.attributes).map(([k, v]) => `${k}=${v}`).join(', ') : ''}>
                    {r.attributes && Object.keys(r.attributes).length
                      ? Object.entries(r.attributes).map(([k, v]) => `${k}=${v}`).join(', ')
                      : '—'}
                  </td>
                  <td className={s.numCol}>{r.quantity}</td>
                  <td>{r.unit}</td>
                  <td>
                    {r.location_full
                      ? r.location_full
                      : r.box_location
                        ? <span className={s.inheritLoc} title="박스 위치">{r.box_location}</span>
                        : (r.location || '—')}
                  </td>
                  <td className={s.ellip} title={r.memo || ''}>{r.memo || '—'}</td>
                  <td className={s.actCol}>
                    <button type="button" className={s.linkBtn} onClick={() => openEditProduct(r)}>수정</button>
                    <button type="button" className={s.linkDanger} onClick={() => onDeleteProduct(r)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                      setModal((m) => ({ ...m, form: {
                        ...m.form,
                        item_id: item.id,
                        itemQuery: item.part_no,
                        name: item.name || m.form.name,
                        spec: item.spec || m.form.spec,
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
