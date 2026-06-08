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

const COL_COUNT = 10


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

  // 제품 입력 모달 — { mode, editId, form } | null
  const [modal, setModal] = useState(null)
  // 박스 관리 모달 — { form, editBoxId } | null
  const [boxModal, setBoxModal] = useState(null)

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
    form: { name: box.name || '', location: box.location || '', memo: box.memo || '' },
  })
  const resetBoxForm = () => setBoxModal({ form: { ...EMPTY_BOX_FORM }, editBoxId: null })

  const onSaveBox = async () => {
    const { form, editBoxId } = boxModal
    if (!form.name.trim()) {
      emitToast('박스 이름을 입력해주세요.', 'error'); return
    }
    const body = { name: form.name.trim(), location: form.location.trim(), memo: form.memo.trim() }
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

  return (
    <div className="page-flat">
      <PageHeader title="창고" subtitle="박스·제품 자유 입력 재고 관리" onBack={onBack} />

      <div className={s.toolbar}>
        <input type="text" className={s.search} placeholder="제품명/규격/메모/위치 검색"
          value={keyword} onChange={(e) => setKeyword(e.target.value)} />
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
                <th>박스</th>
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
                  <td className={s.boxCell}>{r.box_name || '—'}</td>
                  <td className={s.nameCell}>{r.name}</td>
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
                    {r.location
                      ? r.location
                      : r.box_location
                        ? <span className={s.inheritLoc} title="박스 위치">{r.box_location}</span>
                        : '—'}
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
              <label>담을 박스 <span className={s.optional}>(선택)</span>
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
            <div className={s.modalBtnRow}>
              <button type="button" className="btn-secondary" onClick={closeModal}>취소</button>
              <button type="button" className="btn-primary" onClick={onSave}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 박스 관리 모달 ── */}
      {boxModal && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && closeBoxModal()}>
          <div className={s.modal}>
            <h2 className={s.modalTitle}>박스 관리</h2>

            {/* 추가/수정 폼 */}
            <div className={s.boxFormGrid}>
              <label>박스 이름
                <input type="text" value={boxModal.form.name}
                  onChange={(e) => setBoxField('name', e.target.value)} placeholder="예: BOX-001" />
              </label>
              <label>위치
                <input type="text" value={boxModal.form.location}
                  onChange={(e) => setBoxField('location', e.target.value)} placeholder="예: 창고2-A열" />
              </label>
              <label className={s.fullRow}>비고
                <input type="text" value={boxModal.form.memo}
                  onChange={(e) => setBoxField('memo', e.target.value)} placeholder="비고 (선택)" />
              </label>
            </div>
            <div className={s.modalBtnRow}>
              {boxModal.editBoxId && (
                <button type="button" className={s.linkBtn} onClick={resetBoxForm}>새 박스로</button>
              )}
              <button type="button" className="btn-primary" onClick={onSaveBox}>
                {boxModal.editBoxId ? '박스 수정' : '박스 추가'}
              </button>
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
                      <td>{b.location || '—'}</td>
                      <td className={s.numCol}>{b.item_count}</td>
                      <td className={s.ellip} title={b.memo || ''}>{b.memo || '—'}</td>
                      <td className={s.actCol}>
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
    </div>
  )
}
