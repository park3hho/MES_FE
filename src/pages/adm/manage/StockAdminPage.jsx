// pages/adm/manage/StockAdminPage.jsx
// 재고 직접 관리 (Stock Admin) — team_rnd 전용 (2026-05-01)
//
// 공장 내 inventory 테이블의 모든 행을 표 형식으로 보여주고 직접 CRUD.
// LOT 흐름과 무관하게 DB 행을 수동 보정 (재해 복구 / 데이터 정합성 수정용).
//
// 구성:
//   - 필터 바: process / status 셀렉트, lot_no 검색, 페이지네이션
//   - 테이블: inventory 스키마 모든 컬럼
//   - 행 클릭 → 인라인 편집 (저장 / 취소)
//   - + 새 행 버튼 → 모달
//   - 행별 [삭제] 버튼 (확인 후 hard delete)

import { useState, useEffect, useCallback, useMemo } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  getStockAdminList, createStockRow, updateStockRow, deleteStockRow,
} from '@/api'
import { PROCESS_LIST } from '@/constants/processConst'

// inventory.status 가능 값 — BE core/lot_config.py 와 동기화
const STATUS_OPTIONS = [
  'in_stock', 'in_inspection', 'consumed',
  'discarded', 'repair', 'shipped', 'internal_use',
]

const PROCESS_OPTIONS = [
  { code: '', name: '전체 공정' },
  ...PROCESS_LIST,
]

// 편집 가능 필드 (id/created_at/updated_at 제외)
const EDITABLE_FIELDS = [
  'lot_no', 'process', 'quantity', 'status',
  'consumed_by', 'repair_from', 'repair_reason', 'repair_category',
  'group_key', 'motor_type', 'internal_memo',
]

const fmtDate = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

const EMPTY_ROW = {
  lot_no: '', process: '', quantity: 0, status: 'in_stock',
  consumed_by: '', repair_from: '', repair_reason: '', repair_category: '',
  group_key: '', motor_type: '', internal_memo: '',
}

export default function StockAdminPage({ onBack }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  // 필터/페이지
  const [process, setProcess] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 50

  // 편집 상태 — { [id]: {field: value, ...} } (id=='__new' 인 경우 신규 행 모달)
  const [editing, setEditing] = useState({})    // { [id]: {...fields} }
  const [savingId, setSavingId] = useState(null)

  // 신규 행 모달
  const [showNew, setShowNew] = useState(false)
  const [newRow, setNewRow] = useState(EMPTY_ROW)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total])

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getStockAdminList({ process, status, search, page, pageSize })
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (e) {
      setError(e.message || '목록 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [process, status, search, page])

  // 필터 변경 시 1페이지로 리셋 + debounce
  useEffect(() => {
    setPage(1)
  }, [process, status, search])

  useEffect(() => {
    const t = setTimeout(reload, 300)
    return () => clearTimeout(t)
  }, [reload])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2500)
    return () => clearTimeout(t)
  }, [msg])

  // ── 편집 ────────────────────────────────────────
  const startEdit = (row) => {
    setEditing((m) => ({ ...m, [row.id]: { ...row } }))
  }
  const cancelEdit = (id) => {
    setEditing((m) => {
      const next = { ...m }
      delete next[id]
      return next
    })
  }
  const setEditField = (id, field, value) => {
    setEditing((m) => ({ ...m, [id]: { ...m[id], [field]: value } }))
  }
  const saveEdit = async (id) => {
    const e = editing[id]
    if (!e) return
    setSavingId(id)
    try {
      const payload = {}
      EDITABLE_FIELDS.forEach((f) => { payload[f] = e[f] ?? '' })
      // quantity 숫자 변환
      payload.quantity = Number(payload.quantity) || 0
      const r = await updateStockRow(id, payload)
      setItems((arr) => arr.map((it) => (it.id === id ? r.item : it)))
      cancelEdit(id)
      setMsg(`수정 완료 — id=${id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  // ── 삭제 ────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(null)
  const handleDelete = async (id) => {
    setSavingId(id)
    try {
      await deleteStockRow(id)
      setItems((arr) => arr.filter((it) => it.id !== id))
      setTotal((t) => Math.max(0, t - 1))
      setConfirmDelete(null)
      setMsg(`삭제 완료 — id=${id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  // ── 신규 행 ──────────────────────────────────────
  const handleCreate = async () => {
    if (!newRow.lot_no || !newRow.process) {
      return setError('lot_no / process 는 필수입니다.')
    }
    setSavingId('__new')
    try {
      const payload = { ...newRow, quantity: Number(newRow.quantity) || 0 }
      await createStockRow(payload)
      setShowNew(false)
      setNewRow(EMPTY_ROW)
      setMsg(`등록 완료 — ${payload.lot_no}`)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="재고 직접 관리"
        subtitle="inventory 테이블 직접 CRUD — team_rnd 전용 / LOT 흐름 무관"
        onBack={onBack}
      />

      {msg && <div style={{ margin: '8px 16px', padding: '8px 12px', background: '#ecfdf5', color: '#065f46', borderRadius: 6, fontSize: 13 }}>{msg}</div>}
      {error && <div style={{ margin: '8px 16px', padding: '8px 12px', background: '#fef2f2', color: '#b91c1c', borderRadius: 6, fontSize: 13 }}>⚠ {error}</div>}

      {/* 필터 바 */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        padding: '12px 16px', borderBottom: '1px solid #f0f2f6',
      }}>
        <select value={process} onChange={(e) => setProcess(e.target.value)} className="form-input" style={{ width: 160, height: 36, fontSize: 13 }}>
          {PROCESS_OPTIONS.map((p) => (
            <option key={p.code} value={p.code}>{p.code ? `${p.code} · ${p.name}` : p.name}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-input" style={{ width: 160, height: 36, fontSize: 13 }}>
          <option value="">전체 status</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="LOT 번호 검색"
          className="form-input"
          style={{ flex: 1, minWidth: 200, height: 36, fontSize: 13 }}
        />
        <span style={{ fontSize: 12, color: '#5f6b7a' }}>
          {loading ? '...' : `${total}건 · ${page}/${totalPages}`}
        </span>
        <button type="button" className="btn-primary btn-sm" onClick={() => setShowNew(true)}>
          + 새 행
        </button>
      </div>

      {/* 테이블 */}
      <div style={{ overflowX: 'auto', padding: '0 8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1400 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e8ee' }}>
              {['id', 'lot_no', 'process', 'qty', 'status',
                'consumed_by', 'repair_from', 'repair_reason', 'repair_cat',
                'group_key', 'motor', 'internal_memo',
                'created_at', 'updated_at', 'actions'].map((h) => (
                <th key={h} style={{ padding: '8px 6px', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 && (
              <tr><td colSpan={15} style={{ padding: 40, textAlign: 'center', color: '#9aa3b3' }}>표시할 재고가 없습니다.</td></tr>
            )}
            {items.map((row) => {
              const e = editing[row.id]
              const isEdit = !!e
              const v = isEdit ? e : row
              const cell = (field, type = 'text', opts) => {
                if (!isEdit) return <span>{row[field] ?? ''}</span>
                if (type === 'select') {
                  return (
                    <select
                      value={v[field] ?? ''}
                      onChange={(ev) => setEditField(row.id, field, ev.target.value)}
                      style={{ width: '100%', fontSize: 12, padding: '2px 4px' }}
                    >
                      {opts.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
                    </select>
                  )
                }
                return (
                  <input
                    type={type}
                    value={v[field] ?? ''}
                    onChange={(ev) => setEditField(row.id, field, ev.target.value)}
                    style={{ width: '100%', fontSize: 12, padding: '2px 4px', border: '1px solid #d0d7e0', borderRadius: 4 }}
                  />
                )
              }
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid #f0f2f6', background: isEdit ? '#fffbeb' : undefined }}>
                  <td style={{ padding: '6px', color: '#9aa3b3' }}>{row.id}</td>
                  <td style={{ padding: '6px', fontWeight: 600 }}>{cell('lot_no')}</td>
                  <td style={{ padding: '6px' }}>{cell('process')}</td>
                  <td style={{ padding: '6px' }}>{cell('quantity', 'number')}</td>
                  <td style={{ padding: '6px' }}>
                    {isEdit
                      ? cell('status', 'select', STATUS_OPTIONS.map((s) => ({ value: s, label: s })))
                      : <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 6px',
                          background: row.status === 'in_stock' ? '#ecfdf5' : '#f3f4f6',
                          color: row.status === 'discarded' ? '#b91c1c' : '#3b4252',
                          borderRadius: 4,
                        }}>{row.status}</span>}
                  </td>
                  <td style={{ padding: '6px' }}>{cell('consumed_by')}</td>
                  <td style={{ padding: '6px' }}>{cell('repair_from')}</td>
                  <td style={{ padding: '6px' }}>{cell('repair_reason')}</td>
                  <td style={{ padding: '6px' }}>{cell('repair_category')}</td>
                  <td style={{ padding: '6px' }}>{cell('group_key')}</td>
                  <td style={{ padding: '6px' }}>{cell('motor_type')}</td>
                  <td style={{ padding: '6px' }}>{cell('internal_memo')}</td>
                  <td style={{ padding: '6px', fontSize: 11, color: '#5f6b7a' }}>{fmtDate(row.created_at)}</td>
                  <td style={{ padding: '6px', fontSize: 11, color: '#5f6b7a' }}>{fmtDate(row.updated_at)}</td>
                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                    {isEdit ? (
                      <>
                        <button type="button" className="btn-primary btn-sm" onClick={() => saveEdit(row.id)} disabled={savingId === row.id}>저장</button>
                        <button type="button" className="btn-ghost btn-sm" onClick={() => cancelEdit(row.id)} disabled={savingId === row.id} style={{ marginLeft: 4 }}>취소</button>
                      </>
                    ) : confirmDelete === row.id ? (
                      <>
                        <button type="button" className="btn-danger btn-sm" onClick={() => handleDelete(row.id)} disabled={savingId === row.id}>삭제 확정</button>
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmDelete(null)} style={{ marginLeft: 4 }}>취소</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => startEdit(row)}>편집</button>
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmDelete(row.id)} style={{ marginLeft: 4, color: '#b91c1c' }}>삭제</button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 16 }}>
        <button type="button" className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← 이전</button>
        <span style={{ fontSize: 13, alignSelf: 'center' }}>{page} / {totalPages}</span>
        <button type="button" className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>다음 →</button>
      </div>

      {/* 신규 행 모달 */}
      {showNew && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={() => !savingId && setShowNew(false)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 24, width: 'min(560px, 92vw)',
            maxHeight: '90vh', overflowY: 'auto',
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>새 재고 행 추가</h2>
            <p style={{ fontSize: 12, color: '#5f6b7a', marginBottom: 16 }}>
              ⚠ inventory 테이블에 직접 행을 추가합니다. LOT 흐름과 별개라 데이터 일관성은 수동 관리.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {EDITABLE_FIELDS.map((f) => {
                if (f === 'status') {
                  return (
                    <label key={f} style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
                      <span style={{ marginBottom: 4, fontWeight: 600 }}>status</span>
                      <select value={newRow[f]} onChange={(ev) => setNewRow({ ...newRow, [f]: ev.target.value })} className="form-input" style={{ height: 36 }}>
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                  )
                }
                const isRequired = f === 'lot_no' || f === 'process'
                return (
                  <label key={f} style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
                    <span style={{ marginBottom: 4, fontWeight: 600 }}>
                      {f}{isRequired && <span style={{ color: '#b91c1c' }}> *</span>}
                    </span>
                    <input
                      type={f === 'quantity' ? 'number' : 'text'}
                      value={newRow[f]}
                      onChange={(ev) => setNewRow({ ...newRow, [f]: ev.target.value })}
                      className="form-input"
                      style={{ height: 36 }}
                    />
                  </label>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" className="btn-secondary btn-md" onClick={() => setShowNew(false)} disabled={savingId === '__new'}>취소</button>
              <button type="button" className="btn-primary btn-md" onClick={handleCreate} disabled={savingId === '__new'}>
                {savingId === '__new' ? '저장 중...' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
