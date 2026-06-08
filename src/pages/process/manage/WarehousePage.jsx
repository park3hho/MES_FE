// pages/process/manage/WarehousePage.jsx
// 창고 — 박스·제품 통합 테이블 (2026-06-08 v4)
//
// 구조 (v4 — 사용자 확정):
//   - 한 테이블에 박스 행 + 제품 행. 1열 = 박스명(박스 행) 또는 제품명(제품 행).
//   - 박스 행 클릭 → 안의 제품 펼침/접힘 (아코디언). 필터 칩·배지 없음.
//   - 박스에 안 담긴 제품은 그냥 일반 행 ("미지정" 라벨 없음).
//   - 검색 중이면 매칭 제품 있는 박스 자동 펼침.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  listWarehouse, createWarehouse, updateWarehouse, deleteWarehouse,
  listWarehouseBox, createWarehouseBox, updateWarehouseBox, deleteWarehouseBox,
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
  quantity: '', unit: 'ea', location: '', memo: '',
}
const EMPTY_BOX_FORM = { name: '', location: '', memo: '' }

const COL_COUNT = 9


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
  // 펼쳐진 박스 id 집합 (아코디언)
  const [expandedBoxes, setExpandedBoxes] = useState(new Set())

  // 신규 메뉴 드롭다운
  const [showNewMenu, setShowNewMenu] = useState(false)
  const newRef = useRef(null)

  // 통합 모달 — { type: 'product'|'box', mode, form, editId }
  const [modal, setModal] = useState(null)

  useEffect(() => {
    if (!showNewMenu) return
    const handler = (e) => {
      if (newRef.current && !newRef.current.contains(e.target)) setShowNewMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showNewMenu])

  const loadBoxes = useCallback(async () => {
    try {
      const data = await listWarehouseBox()
      setBoxes(data.items || [])
    } catch { /* 박스 로드 실패 무시 */ }
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
  useEffect(() => { reload() }, [reload])

  // 박스별 그룹핑 + 미담김 제품 (검색 중이면 빈 박스 숨김)
  const grouped = useMemo(() => {
    const boxMap = new Map()
    boxes.forEach((b) => boxMap.set(b.id, { box: b, items: [] }))
    const unboxed = []
    items.forEach((item) => {
      if (item.box_id && boxMap.has(item.box_id)) boxMap.get(item.box_id).items.push(item)
      else unboxed.push(item)
    })
    const groups = [...boxMap.values()]
    const visible = keyword ? groups.filter((g) => g.items.length > 0) : groups
    return { boxGroups: visible, unboxed }
  }, [items, boxes, keyword])

  const toggleBox = (id) => setExpandedBoxes((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // ── 모달 열기 ──
  const openCreateProduct = (preBoxId = '') => {
    setModal({
      type: 'product', mode: 'create', editId: null,
      form: { ...EMPTY_PRODUCT_FORM, box_id: preBoxId },
    })
    setShowNewMenu(false)
  }

  const openEditProduct = (row) => setModal({
    type: 'product', mode: 'edit', editId: row.id,
    form: {
      item_id: row.item_id || '',
      itemQuery: row.item_part_no || row.name || '',
      box_id: row.box_id || '',
      name: row.name || '',
      spec: row.spec || '',
      attributesText: attrsToText(row.attributes),
      quantity: row.quantity ?? '',
      unit: row.unit || 'ea',
      location: row.location || '',
      memo: row.memo || '',
    },
  })

  const openCreateBox = () => {
    setModal({ type: 'box', mode: 'create', editId: null, form: { ...EMPTY_BOX_FORM } })
    setShowNewMenu(false)
  }

  const openEditBox = (box) => setModal({
    type: 'box', mode: 'edit', editId: box.id,
    form: { name: box.name || '', location: box.location || '', memo: box.memo || '' },
  })

  const closeModal = () => setModal(null)
  const setField = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }))

  // ── 저장 ──
  const onSave = async () => {
    const { type, mode, editId, form } = modal

    if (type === 'box') {
      if (!form.name.trim()) {
        emitToast('박스 이름을 입력해주세요.', 'error'); return
      }
      const body = { name: form.name.trim(), location: form.location.trim(), memo: form.memo.trim() }
      try {
        if (mode === 'create') {
          await createWarehouseBox(body)
          emitToast('박스가 등록되었습니다.', 'success')
        } else {
          await updateWarehouseBox(editId, body)
          emitToast('박스가 수정되었습니다.', 'success')
        }
        closeModal()
        await loadBoxes()
      } catch (e) {
        emitToast(e.message || '박스 저장 실패', 'error')
      }
      return
    }

    // 제품 저장
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
      location: form.location.trim(),
      memo: form.memo.trim(),
    }
    try {
      if (mode === 'create') {
        await createWarehouse(body)
        // 박스에 담은 경우 그 박스 펼치기
        if (body.box_id) setExpandedBoxes((prev) => new Set(prev).add(body.box_id))
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

  const onDeleteBox = async (box) => {
    const cnt = box.item_count || 0
    const msg = cnt > 0
      ? `박스 "${box.name}" 삭제? (안의 ${cnt}개 제품은 박스에서 빠지고 보존됩니다)`
      : `박스 "${box.name}" 삭제?`
    if (!window.confirm(msg)) return
    try {
      await deleteWarehouseBox(box.id)
      emitToast('박스 삭제됨', 'success')
      await Promise.all([loadBoxes(), reload()])
    } catch (e) {
      emitToast(e.message || '박스 삭제 실패', 'error')
    }
  }

  // ── 제품 행 렌더 (1열 = 제품명) ──
  const renderProductRow = (r, indent) => (
    <tr key={r.id}>
      <td className={indent ? s.indentCell : undefined}>{r.name}</td>
      <td>{r.item_id || '—'}</td>
      <td>{r.spec || '—'}</td>
      <td className={s.attrCell}>
        {r.attributes && Object.keys(r.attributes).length
          ? Object.entries(r.attributes).map(([k, v]) => `${k}=${v}`).join(', ')
          : '—'}
      </td>
      <td className={s.numCol}>{r.quantity}</td>
      <td>{r.unit}</td>
      <td>
        {r.location
          ? r.location
          : r.box_location
            ? <span className={s.inheritLoc} title="박스 위치">{r.box_location}</span>
            : '—'}
      </td>
      <td className={s.memoCell}>{r.memo || '—'}</td>
      <td>
        <div className={s.actionCell}>
          <button type="button" className="btn-ghost btn-sm" onClick={() => openEditProduct(r)}>수정</button>
          <button type="button" className="btn-text" onClick={() => onDeleteProduct(r)}>삭제</button>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="page-flat">
      <PageHeader title="창고" subtitle="박스·제품 자유 입력 재고 관리" onBack={onBack} />

      <div className={s.toolbar}>
        <input type="text" className={s.search} placeholder="제품명/규격/메모/위치 검색"
          value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <div className={s.newWrap} ref={newRef}>
          <button type="button" className="btn-primary" onClick={() => setShowNewMenu((v) => !v)}>
            + 신규
          </button>
          {showNewMenu && (
            <div className={s.newMenu}>
              <button type="button" className={s.newMenuItem} onClick={() => openCreateProduct()}>
                🏷️ 제품
              </button>
              <button type="button" className={s.newMenuItem} onClick={openCreateBox}>
                📦 박스
              </button>
            </div>
          )}
        </div>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {/* 박스 행 (아코디언) + 펼침 시 소속 제품 */}
              {grouped.boxGroups.map(({ box, items: boxItems }) => {
                const expanded = !!keyword || expandedBoxes.has(box.id)
                return (
                  <Fragment key={`box-${box.id}`}>
                    <tr className={s.boxRow} onClick={() => !keyword && toggleBox(box.id)}>
                      <td>
                        <span className={s.boxToggle}>{expanded ? '▼' : '▶'}</span>
                        📦 <strong>{box.name}</strong>
                        <span className={s.boxCount}>{boxItems.length}</span>
                      </td>
                      <td colSpan={COL_COUNT - 2} className={s.boxLocCell}>
                        {box.location || ''}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className={s.actionCell}>
                          <button type="button" className="btn-ghost btn-sm"
                            onClick={() => openCreateProduct(String(box.id))}>담기</button>
                          <button type="button" className="btn-ghost btn-sm"
                            onClick={() => openEditBox(box)}>수정</button>
                          <button type="button" className="btn-text"
                            onClick={() => onDeleteBox(box)}>삭제</button>
                        </div>
                      </td>
                    </tr>
                    {expanded && boxItems.map((r) => renderProductRow(r, true))}
                    {expanded && boxItems.length === 0 && (
                      <tr><td colSpan={COL_COUNT} className={s.emptyBox}>비어있음 — "담기"로 제품 추가</td></tr>
                    )}
                  </Fragment>
                )
              })}

              {/* 박스에 안 담긴 제품 — 일반 행 */}
              {grouped.unboxed.map((r) => renderProductRow(r, false))}

              {/* 빈 상태 */}
              {grouped.boxGroups.length === 0 && grouped.unboxed.length === 0 && (
                <tr><td colSpan={COL_COUNT} className={s.empty}>등록된 항목이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 통합 모달 (제품 / 박스) ── */}
      {modal && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className={s.modal}>
            <h2 className={s.modalTitle}>
              {modal.type === 'box'
                ? (modal.mode === 'create' ? '신규 박스' : '박스 수정')
                : (modal.mode === 'create' ? '신규 제품' : '제품 수정')}
            </h2>

            {modal.type === 'box' ? (
              <div className={s.formGrid}>
                <label>박스 이름
                  <input type="text" value={modal.form.name}
                    onChange={(e) => setField('name', e.target.value)} placeholder="예: BOX-001" />
                </label>
                <label>위치
                  <input type="text" value={modal.form.location}
                    onChange={(e) => setField('location', e.target.value)} placeholder="예: 창고2-A열" />
                </label>
                <label className={s.fullRow}>비고
                  <input type="text" value={modal.form.memo}
                    onChange={(e) => setField('memo', e.target.value)} placeholder="비고 (선택)" />
                </label>
              </div>
            ) : (
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
                <label>담을 박스 <span className={s.optional}>(선택)</span>
                  <select value={modal.form.box_id}
                    onChange={(e) => setField('box_id', e.target.value)}>
                    <option value="">박스 없음</option>
                    {boxes.map((b) => (
                      <option key={b.id} value={b.id}>📦 {b.name}</option>
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
                <label>위치
                  <input type="text" value={modal.form.location}
                    onChange={(e) => setField('location', e.target.value)}
                    placeholder={(() => {
                      const b = boxes.find((x) => String(x.id) === String(modal.form.box_id))
                      return b && b.location ? `비우면 박스 위치: ${b.location}` : '예: A-1, 창고2'
                    })()} />
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
            )}

            <div className={s.modalBtnRow}>
              <button type="button" className="btn-secondary" onClick={closeModal}>취소</button>
              <button type="button" className="btn-primary" onClick={onSave}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
