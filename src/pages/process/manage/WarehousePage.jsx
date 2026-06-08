// pages/process/manage/WarehousePage.jsx
// 자유 입력 단순 재고 — CRUD 테이블 + 박스 담기 (2026-06-08)
//
// 구조: 박스 필터 칩 + 검색 + 박스 관리/신규 버튼 + 테이블 + 입력 모달 + 박스 관리 모달
//   - Item 콤보박스로 품번/품목 검색 → 연동 시 name/spec 자동 채움
//   - attributes 는 자유 형식 JSON — 텍스트박스로 key=value 라인 입력
//   - 박스(WarehouseBox)에 담아 그룹 관리 (1:N — 한 객체는 한 박스)
import { useCallback, useEffect, useRef, useState } from 'react'
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


const EMPTY_FORM = {
  item_id: '', itemQuery: '', box_id: '', name: '', spec: '', attributesText: '',
  quantity: '', unit: 'ea', location: '', memo: '',
}

const EMPTY_BOX_FORM = { name: '', location: '', memo: '' }


/** 검색 가능한 Item 콤보박스 */
function ItemCombobox({ query, selectedId, onSelect, onQueryChange }) {
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef(null)
  const timerRef = useRef(null)

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // 디바운스 검색 (300ms)
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

  const handleSelect = (item) => {
    onSelect(item)
    setOpen(false)
  }

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
      {open && (query.length >= 1) && (
        <div className={s.comboDropdown}>
          {loading && <div className={s.comboMsg}>검색 중…</div>}
          {!loading && options.length === 0 && (
            <div className={s.comboMsg}>
              일치하는 Item 없음 — 그대로 저장 가능
            </div>
          )}
          {options.map((it) => (
            <button
              key={it.id}
              type="button"
              className={s.comboOption}
              onClick={() => handleSelect(it)}
            >
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
  // 박스 필터: '' = 전체, '0' = 미지정, 그 외 = box_id
  const [boxFilter, setBoxFilter] = useState('')

  // 입력 모달 — { mode, form, editId }
  const [modal, setModal] = useState(null)
  // 박스 관리 모달 — { boxForm, editBoxId } | null
  const [boxModal, setBoxModal] = useState(null)

  const loadBoxes = useCallback(async () => {
    try {
      const data = await listWarehouseBox()
      setBoxes(data.items || [])
    } catch { /* 박스 로드 실패는 무시 (객체 목록은 계속 표시) */ }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const filters = { keyword: keyword || undefined }
      // '0' = 미지정 → box_id 필터 없이 전체 가져온 뒤 FE 에서 box 없는 것만 (BE box_id=0 매칭 불가)
      if (boxFilter && boxFilter !== '0') filters.box_id = Number(boxFilter)
      const data = await listWarehouse(filters)
      const rows = boxFilter === '0'
        ? (data.items || []).filter((r) => !r.box_id)
        : (data.items || [])
      setItems(rows)
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [keyword, boxFilter])

  useEffect(() => { loadBoxes() }, [loadBoxes])
  useEffect(() => { reload() }, [reload])

  // ── 객체 모달 ──
  const openCreate = () => setModal({
    mode: 'create',
    form: { ...EMPTY_FORM, box_id: boxFilter && boxFilter !== '0' ? boxFilter : '' },
    editId: null,
  })
  const openEdit = (row) => setModal({
    mode: 'edit',
    editId: row.id,
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
    const { form, mode, editId } = modal
    const finalName = form.name.trim() || form.itemQuery?.trim() || ''
    if (!finalName && !form.item_id) {
      emitToast('제품명 또는 Item을 입력해주세요.', 'error')
      return
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

  const onDelete = async (row) => {
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
  const openBoxManage = () => setBoxModal({ boxForm: { ...EMPTY_BOX_FORM }, editBoxId: null })
  const closeBoxModal = () => setBoxModal(null)
  const setBoxField = (k, v) => setBoxModal((m) => ({ ...m, boxForm: { ...m.boxForm, [k]: v } }))
  const startEditBox = (box) => setBoxModal((m) => ({
    ...m, editBoxId: box.id,
    boxForm: { name: box.name || '', location: box.location || '', memo: box.memo || '' },
  }))
  const resetBoxForm = () => setBoxModal((m) => ({ ...m, editBoxId: null, boxForm: { ...EMPTY_BOX_FORM } }))

  const onSaveBox = async () => {
    const { boxForm, editBoxId } = boxModal
    if (!boxForm.name.trim()) {
      emitToast('박스 이름을 입력해주세요.', 'error')
      return
    }
    const body = {
      name: boxForm.name.trim(),
      location: boxForm.location.trim(),
      memo: boxForm.memo.trim(),
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
      await loadBoxes()
    } catch (e) {
      emitToast(e.message || '박스 저장 실패', 'error')
    }
  }

  const onDeleteBox = async (box) => {
    if (!window.confirm(`박스 "${box.name}" 삭제? (안에 든 ${box.item_count}개 항목은 박스 미지정 상태로 남습니다)`)) return
    try {
      await deleteWarehouseBox(box.id)
      emitToast('박스 삭제됨', 'success')
      if (boxFilter === String(box.id)) setBoxFilter('')
      await Promise.all([loadBoxes(), reload()])
    } catch (e) {
      emitToast(e.message || '박스 삭제 실패', 'error')
    }
  }

  return (
    <div className="page-flat">
      <PageHeader title="창고 (자유 입력)" subtitle="제품명/규격/수량/위치 등 자유 형식 재고 관리 · 박스 그룹" onBack={onBack} />

      {/* 박스 필터 칩 */}
      <div className={s.boxFilterRow}>
        <button type="button"
          className={`${s.boxChip} ${boxFilter === '' ? s.boxChipOn : ''}`}
          onClick={() => setBoxFilter('')}>전체</button>
        <button type="button"
          className={`${s.boxChip} ${boxFilter === '0' ? s.boxChipOn : ''}`}
          onClick={() => setBoxFilter('0')}>미지정</button>
        {boxes.map((b) => (
          <button key={b.id} type="button"
            className={`${s.boxChip} ${boxFilter === String(b.id) ? s.boxChipOn : ''}`}
            onClick={() => setBoxFilter(String(b.id))}>
            📦 {b.name} <span className={s.boxChipCount}>{b.item_count}</span>
          </button>
        ))}
        <button type="button" className={s.boxManageBtn} onClick={openBoxManage}>박스 관리</button>
      </div>

      <div className={s.toolbar}>
        <input
          type="text"
          className={s.search}
          placeholder="이름/규격/메모/위치 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button type="button" className="btn-primary" onClick={openCreate}>+ 신규</button>
      </div>

      {loading && <p className={s.msg}>로딩 중…</p>}
      {error && <p className={s.error}>{error}</p>}

      {!loading && !error && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>박스</th>
                <th>Item</th>
                <th>제품명</th>
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
              {items.length === 0 ? (
                <tr><td colSpan={10} className={s.empty}>등록된 재고가 없습니다.</td></tr>
              ) : items.map((r) => (
                <tr key={r.id}>
                  <td>{r.box_name ? <span className={s.boxTag}>📦 {r.box_name}</span> : '—'}</td>
                  <td>{r.item_id || '—'}</td>
                  <td>{r.name}</td>
                  <td>{r.spec || '—'}</td>
                  <td className={s.attrCell}>
                    {r.attributes && Object.keys(r.attributes).length
                      ? Object.entries(r.attributes).map(([k, v]) => `${k}=${v}`).join(' / ')
                      : '—'}
                  </td>
                  <td className={s.numCol}>{r.quantity}</td>
                  <td>{r.unit}</td>
                  <td>
                    {r.location
                      ? r.location
                      : r.box_location
                        ? <span className={s.inheritLoc} title="박스 위치 (상속)">{r.box_location}</span>
                        : '—'}
                  </td>
                  <td className={s.memoCell}>{r.memo || '—'}</td>
                  <td className={s.actionCell}>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => openEdit(r)}>수정</button>
                    <button type="button" className="btn-text" onClick={() => onDelete(r)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 객체 입력 모달 */}
      {modal && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className={s.modal}>
            <h2 className={s.modalTitle}>{modal.mode === 'create' ? '신규 재고 등록' : '재고 수정'}</h2>
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
              <label>담을 박스
                <select value={modal.form.box_id}
                  onChange={(e) => setField('box_id', e.target.value)}>
                  <option value="">미지정</option>
                  {boxes.map((b) => (
                    <option key={b.id} value={b.id}>📦 {b.name}{b.location ? ` (${b.location})` : ''}</option>
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
                    return b && b.location ? `비우면 박스 위치: ${b.location}` : '예: A-1, 창고 2'
                  })()} />
              </label>
              <label className={s.fullRow}>속성 (key=value 줄바꿈)
                <textarea rows={3} value={modal.form.attributesText}
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

      {/* 박스 관리 모달 */}
      {boxModal && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && closeBoxModal()}>
          <div className={s.modal}>
            <h2 className={s.modalTitle}>박스 관리</h2>

            {/* 박스 추가/수정 폼 */}
            <div className={s.boxFormGrid}>
              <label>박스 이름
                <input type="text" value={boxModal.boxForm.name}
                  onChange={(e) => setBoxField('name', e.target.value)} placeholder="예: BOX-001, 자재함A" />
              </label>
              <label>위치
                <input type="text" value={boxModal.boxForm.location}
                  onChange={(e) => setBoxField('location', e.target.value)} placeholder="예: 창고2-A열" />
              </label>
              <label className={s.fullRow}>비고
                <input type="text" value={boxModal.boxForm.memo}
                  onChange={(e) => setBoxField('memo', e.target.value)} placeholder="비고 (선택)" />
              </label>
            </div>
            <div className={s.modalBtnRow}>
              {boxModal.editBoxId && (
                <button type="button" className="btn-text" onClick={resetBoxForm}>새 박스로</button>
              )}
              <button type="button" className="btn-primary" onClick={onSaveBox}>
                {boxModal.editBoxId ? '박스 수정' : '박스 추가'}
              </button>
            </div>

            {/* 박스 목록 */}
            <div className={s.boxList}>
              {boxes.length === 0 ? (
                <p className={s.empty}>등록된 박스가 없습니다.</p>
              ) : boxes.map((b) => (
                <div key={b.id} className={`${s.boxListItem} ${boxModal.editBoxId === b.id ? s.boxListItemActive : ''}`}>
                  <div className={s.boxListInfo}>
                    <span className={s.boxListName}>📦 {b.name}</span>
                    {b.location && <span className={s.boxListSub}>{b.location}</span>}
                    <span className={s.boxListCount}>{b.item_count}개</span>
                  </div>
                  <div className={s.actionCell}>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => startEditBox(b)}>수정</button>
                    <button type="button" className="btn-text" onClick={() => onDeleteBox(b)}>삭제</button>
                  </div>
                </div>
              ))}
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
