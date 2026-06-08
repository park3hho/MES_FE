// pages/process/manage/WarehousePage.jsx
// 자유 입력 단순 재고 — CRUD 테이블 (2026-06-08)
//
// 구조: 검색 + 신규 버튼 + 테이블 (이름/규격/속성/수량/단위/위치/메모/액션) + 입력 모달
//   - Item 번호 입력 시 BE 가 Item 데이터로 자동 채움 (Item.spec/name 등)
//   - attributes 는 자유 형식 JSON — 텍스트박스로 key=value 라인 입력
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  listWarehouse, createWarehouse, updateWarehouse, deleteWarehouse,
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
  item_id: '', name: '', spec: '', attributesText: '',
  quantity: '', unit: 'ea', location: '', memo: '',
}


export default function WarehousePage({ onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  // 입력 모달 — { mode: 'create'|'edit', form, editId }
  const [modal, setModal] = useState(null)

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

  useEffect(() => { reload() }, [reload])

  const openCreate = () => setModal({ mode: 'create', form: { ...EMPTY_FORM }, editId: null })
  const openEdit = (row) => setModal({
    mode: 'edit',
    editId: row.id,
    form: {
      item_id: row.item_id || '',
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
    if (!form.name?.trim() && !form.item_id) {
      emitToast('제품명 또는 Item 번호를 입력해주세요.', 'error')
      return
    }
    const body = {
      item_id: form.item_id ? Number(form.item_id) : null,
      name: form.name.trim(),
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
      await reload()
    } catch (e) {
      emitToast(e.message || '저장 실패', 'error')
    }
  }

  const onDelete = async (row) => {
    if (!window.confirm(`"${row.name}" 항목을 삭제할까요?`)) return
    try {
      await deleteWarehouse(row.id)
      emitToast('삭제되었습니다.', 'success')
      await reload()
    } catch (e) {
      emitToast(e.message || '삭제 실패', 'error')
    }
  }

  return (
    <div className="page-flat">
      <PageHeader title="재고 (자유 입력)" subtitle="제품명/규격/수량/위치 등 자유 형식 재고 관리" onBack={onBack} />

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
                <tr><td colSpan={9} className={s.empty}>등록된 재고가 없습니다.</td></tr>
              ) : items.map((r) => (
                <tr key={r.id}>
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
                  <td>{r.location || '—'}</td>
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

      {modal && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className={s.modal}>
            <h2 className={s.modalTitle}>{modal.mode === 'create' ? '신규 재고 등록' : '재고 수정'}</h2>
            <div className={s.formGrid}>
              <label>Item 번호 (선택)
                <input type="number" value={modal.form.item_id}
                  onChange={(e) => setField('item_id', e.target.value)} placeholder="Item ID" />
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
                  onChange={(e) => setField('location', e.target.value)} placeholder="예: A-1, 창고 2" />
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
    </div>
  )
}
