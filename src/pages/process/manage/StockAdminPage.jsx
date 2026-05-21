// pages/adm/manage/StockAdminPage.jsx
// 재고 직접 관리 (Stock Admin) — team_rnd 전용 (2026-05-01 v2)
//
// 변경 (v2):
//   - C(생성) 제거 — U/D 만 지원
//   - 인라인 편집 → 모달 편집 (행 가로 짤림 해결)
//   - 행 클릭 = 편집 모달 오픈 / 모달 안 [삭제] 버튼
//   - 컬럼 컴팩트 dense 그리드 — 모든 컬럼 한 화면에 (가로 스크롤 최소)
//
// inventory 테이블 모든 행 + 모든 컬럼 표시. LOT 흐름과 무관 (수동 보정용).

import { useState, useEffect, useCallback, useMemo } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  getStockAdminList, updateStockRow, deleteStockRow,
} from '@/api'
import { PROCESS_LIST } from '@/constants/processConst'
import { TOAST_MSG_MS } from '@/constants/etcConst'

const STATUS_OPTIONS = [
  'in_stock', 'in_inspection', 'consumed',
  'discarded', 'repair', 'shipped', 'internal_use',
]

// PROCESS_LIST 는 {key, label, desc} 형식 — 그대로 사용
const PROCESS_OPTIONS = [
  { key: '', label: '전체 공정' },
  ...PROCESS_LIST,
]

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
    return `${String(d.getFullYear()).slice(2)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

// 정렬 가능한 컬럼 — BE _SORT_FIELDS 와 동기화 (id / created_at / updated_at)
//   FE 헤더 라벨 ↔ BE 정렬 키 매핑. 현재 노출되는 컬럼은 id / updated_at.
const SORTABLE_COLS = { id: 'id', updated_at: 'updated_at' }

const STATUS_COLORS = {
  in_stock:      { bg: '#dcfce7', fg: '#166534' },
  in_inspection: { bg: '#fef3c7', fg: '#92400e' },
  consumed:      { bg: '#e5e7eb', fg: '#374151' },
  discarded:     { bg: '#fee2e2', fg: '#991b1b' },
  repair:        { bg: '#fce7f3', fg: '#9d174d' },
  shipped:       { bg: '#dbeafe', fg: '#1e40af' },
  internal_use:  { bg: '#ede9fe', fg: '#5b21b6' },
}

export default function StockAdminPage({ onBack }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const [process, setProcess] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 50
  // 정렬 — 헤더 클릭 토글. 같은 컬럼 재클릭 → desc↔asc, 다른 컬럼 클릭 → desc 부터 (2026-05-04)
  const [sortBy, setSortBy] = useState('updated_at')
  const [sortOrder, setSortOrder] = useState('desc')
  // 기간 필터 (2026-05-06) — date input "YYYY-MM-DD" 형식. 둘 다 비우면 전체 기간.
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateField, setDateField] = useState('updated_at')   // 'updated_at' | 'created_at'

  // 모달 편집 상태
  const [editTarget, setEditTarget] = useState(null)   // 원본 행
  const [editForm, setEditForm] = useState(null)       // 편집 중 form
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total])

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await getStockAdminList({
        process, status, search, page, pageSize, sortBy, sortOrder,
        dateFrom, dateTo, dateField,
      })
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (e) {
      setError(e.message || '목록 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [process, status, search, page, sortBy, sortOrder, dateFrom, dateTo, dateField])

  useEffect(() => { setPage(1) }, [process, status, search, sortBy, sortOrder, dateFrom, dateTo, dateField])

  // 정렬 컬럼 클릭 — 같은 컬럼 재클릭 시 desc↔asc, 다른 컬럼 클릭 시 desc 부터
  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortBy(col)
      setSortOrder('desc')
    }
  }
  const sortIcon = (col) => (sortBy !== col ? '' : sortOrder === 'desc' ? ' ↓' : ' ↑')
  useEffect(() => {
    const t = setTimeout(reload, 300)
    return () => clearTimeout(t)
  }, [reload])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), TOAST_MSG_MS)
    return () => clearTimeout(t)
  }, [msg])

  // ── 편집 모달 ──
  const openEdit = (row) => {
    setEditTarget(row)
    setEditForm({ ...row })
    setConfirmDelete(false)
  }
  const closeEdit = () => {
    if (saving) return
    setEditTarget(null)
    setEditForm(null)
    setConfirmDelete(false)
  }
  const setField = (field, value) =>
    setEditForm((f) => ({ ...f, [field]: value }))

  const handleSave = async () => {
    if (!editTarget || !editForm) return
    setSaving(true); setError('')
    try {
      const payload = {}
      EDITABLE_FIELDS.forEach((f) => { payload[f] = editForm[f] ?? '' })
      payload.quantity = Number(payload.quantity) || 0
      const r = await updateStockRow(editTarget.id, payload)
      setItems((arr) => arr.map((it) => (it.id === editTarget.id ? r.item : it)))
      setMsg(`수정 완료 — id=${editTarget.id}`)
      closeEdit()
    } catch (err) {
      setError(err.message || '수정 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editTarget) return
    setSaving(true); setError('')
    try {
      await deleteStockRow(editTarget.id)
      setItems((arr) => arr.filter((it) => it.id !== editTarget.id))
      setTotal((t) => Math.max(0, t - 1))
      setMsg(`삭제 완료 — id=${editTarget.id}`)
      closeEdit()
    } catch (err) {
      setError(err.message || '삭제 실패')
    } finally {
      setSaving(false)
    }
  }

  // ── 표시 헬퍼 ──
  const StatusChip = ({ value }) => {
    const c = STATUS_COLORS[value] || { bg: '#f3f4f6', fg: '#374151' }
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '2px 6px',
        background: c.bg, color: c.fg, borderRadius: 4,
        whiteSpace: 'nowrap',
      }}>{value}</span>
    )
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="재고 직접 관리"
        subtitle="inventory 테이블 직접 수정/삭제 — team_rnd 전용 / LOT 흐름 무관"
        onBack={onBack}
      />

      {msg && <div style={{ margin: '8px 16px', padding: '8px 12px', background: '#ecfdf5', color: '#065f46', borderRadius: 6, fontSize: 13 }}>{msg}</div>}
      {error && <div style={{ margin: '8px 16px', padding: '8px 12px', background: '#fef2f2', color: '#b91c1c', borderRadius: 6, fontSize: 13 }}>⚠ {error}</div>}

      {/* 필터 바 */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        padding: '10px 16px', borderBottom: '1px solid #e5e8ee',
      }}>
        <select value={process} onChange={(e) => setProcess(e.target.value)} className="form-input" style={{ width: 160, padding: '6px 8px', fontSize: 12, lineHeight: 1.3 }}>
          {PROCESS_OPTIONS.map((p) => (
            <option key={p.key || 'all'} value={p.key}>
              {p.key ? `${p.key} · ${p.label}` : p.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-input" style={{ width: 170, padding: '6px 8px', fontSize: 12, lineHeight: 1.3 }}>
          <option value="">전체 status</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="LOT 번호 검색"
          className="form-input"
          style={{ flex: 1, minWidth: 160, padding: '6px 10px', fontSize: 12, lineHeight: 1.3 }}
        />
        <span style={{ fontSize: 11, color: '#5f6b7a', whiteSpace: 'nowrap' }}>
          {loading ? '...' : `${total}건 · ${page}/${totalPages}`}
        </span>
        <button type="button" className="btn-ghost btn-sm" onClick={reload} disabled={loading}>↻</button>

        {/* 기간 필터 (2026-05-06) — date_field 선택 + from/to date input */}
        <div style={{ flexBasis: '100%', height: 0 }} />
        <select
          value={dateField}
          onChange={(e) => setDateField(e.target.value)}
          className="form-input"
          style={{ width: 130, padding: '6px 8px', fontSize: 12, lineHeight: 1.3 }}
          title="기간 필터 적용 컬럼"
        >
          <option value="updated_at">updated_at</option>
          <option value="created_at">created_at</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="form-input"
          style={{ width: 150, padding: '6px 10px', fontSize: 12, lineHeight: 1.3 }}
          title="시작일 (포함)"
        />
        <span style={{ fontSize: 12, color: '#5f6b7a' }}>~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="form-input"
          style={{ width: 150, padding: '6px 10px', fontSize: 12, lineHeight: 1.3 }}
          title="종료일 (포함, 그 날 23:59:59)"
        />
        {(dateFrom || dateTo) && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => { setDateFrom(''); setDateTo('') }}
            title="기간 초기화"
            style={{ fontSize: 11 }}
          >
            기간 ✕
          </button>
        )}
      </div>

      {/* 테이블 — dense 컴팩트 */}
      <div style={{ overflowX: 'auto', padding: '0 8px', fontSize: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e8ee', textAlign: 'left' }}>
              {['id', 'lot_no', 'process', 'qty', 'status',
                'consumed_by', 'repair_from', 'repair_reason', 'repair_cat',
                'group', 'motor', 'memo', 'updated_at'].map((h) => {
                const sortKey = SORTABLE_COLS[h]
                const isSortable = !!sortKey
                return (
                  <th
                    key={h}
                    onClick={isSortable ? () => toggleSort(sortKey) : undefined}
                    style={{
                      padding: '6px 6px',
                      whiteSpace: 'nowrap',
                      fontWeight: 700,
                      fontSize: 11,
                      color: isSortable ? '#1f2a44' : '#3b4252',
                      cursor: isSortable ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                    title={isSortable ? '클릭하여 정렬' : undefined}
                  >
                    {h}{sortIcon(sortKey || '')}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 && (
              <tr><td colSpan={13} style={{ padding: 40, textAlign: 'center', color: '#9aa3b3' }}>표시할 재고가 없습니다.</td></tr>
            )}
            {items.map((row) => (
              <tr
                key={row.id}
                onClick={() => openEdit(row)}
                style={{ borderBottom: '1px solid #f0f2f6', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
                title="클릭하여 편집"
              >
                <td style={{ padding: '6px', color: '#9aa3b3', fontSize: 11 }}>{row.id}</td>
                <td style={{ padding: '6px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.lot_no}</td>
                <td style={{ padding: '6px' }}>{row.process}</td>
                <td style={{ padding: '6px', textAlign: 'right' }}>{row.quantity}</td>
                <td style={{ padding: '6px' }}><StatusChip value={row.status} /></td>
                <td style={{ padding: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#5f6b7a' }} title={row.consumed_by}>{row.consumed_by || '—'}</td>
                <td style={{ padding: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#5f6b7a' }} title={row.repair_from}>{row.repair_from || '—'}</td>
                <td style={{ padding: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#5f6b7a' }} title={row.repair_reason}>{row.repair_reason || '—'}</td>
                <td style={{ padding: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#5f6b7a' }} title={row.repair_category}>{row.repair_category || '—'}</td>
                <td style={{ padding: '6px' }}>{row.group_key || '—'}</td>
                <td style={{ padding: '6px' }}>{row.motor_type ? row.motor_type[0].toUpperCase() : '—'}</td>
                <td style={{ padding: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#5f6b7a' }} title={row.internal_memo}>{row.internal_memo || '—'}</td>
                <td style={{ padding: '6px', fontSize: 11, color: '#5f6b7a' }}>{fmtDate(row.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 16 }}>
        <button type="button" className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← 이전</button>
        <span style={{ fontSize: 13, alignSelf: 'center', minWidth: 80, textAlign: 'center' }}>{page} / {totalPages}</span>
        <button type="button" className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>다음 →</button>
      </div>

      {/* 편집 모달 */}
      {editTarget && editForm && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
          onClick={closeEdit}
        >
          <div
            style={{
              background: '#fff', borderRadius: 10, width: 'min(640px, 94vw)',
              maxHeight: '92vh', overflowY: 'auto',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid #e5e8ee',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>재고 행 편집</div>
                <div style={{ fontSize: 12, color: '#5f6b7a' }}>
                  id <strong>{editTarget.id}</strong> · {editTarget.lot_no} · {editTarget.process}
                </div>
              </div>
              <button type="button" onClick={closeEdit} disabled={saving}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9aa3b3' }}>✕</button>
            </div>

            {/* 폼 — dense 2열 grid */}
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {EDITABLE_FIELDS.map((f) => (
                <label key={f} style={{ display: 'flex', flexDirection: 'column', fontSize: 11, gridColumn: ['internal_memo', 'repair_reason'].includes(f) ? 'span 2' : 'auto' }}>
                  <span style={{ marginBottom: 3, fontWeight: 700, color: '#3b4252' }}>{f}</span>
                  {f === 'status' ? (
                    <select
                      value={editForm[f] ?? ''}
                      onChange={(e) => setField(f, e.target.value)}
                      className="form-input"
                      style={{ padding: '6px 8px', fontSize: 12, lineHeight: 1.3 }}
                      disabled={saving}
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input
                      type={f === 'quantity' ? 'number' : 'text'}
                      value={editForm[f] ?? ''}
                      onChange={(e) => setField(f, e.target.value)}
                      className="form-input"
                      style={{ padding: '6px 10px', fontSize: 12, lineHeight: 1.3 }}
                      disabled={saving}
                    />
                  )}
                </label>
              ))}

              {/* 메타 — 읽기 전용 */}
              <div style={{ gridColumn: 'span 2', marginTop: 4, padding: '8px 10px', background: '#f9fafb', borderRadius: 6, fontSize: 11, color: '#5f6b7a' }}>
                created_at: {fmtDate(editTarget.created_at)} · updated_at: {fmtDate(editTarget.updated_at)}
              </div>
            </div>

            {/* 푸터 */}
            <div style={{
              padding: '12px 20px', borderTop: '1px solid #e5e8ee',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
            }}>
              {/* 좌측: 삭제 (확인 2단계) */}
              {confirmDelete ? (
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>정말 삭제할까요?</span>
                  <button type="button" className="btn-danger btn-sm" onClick={handleDelete} disabled={saving}>
                    {saving ? '삭제 중…' : '확정'}
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmDelete(false)} disabled={saving}>
                    취소
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} disabled={saving}
                  style={{
                    fontSize: 12, padding: '6px 12px', border: '1px solid #fecaca',
                    background: '#fff', color: '#b91c1c', borderRadius: 6, cursor: 'pointer',
                  }}>
                  🗑 행 삭제
                </button>
              )}

              {/* 우측: 저장 / 취소 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-secondary btn-md" onClick={closeEdit} disabled={saving}>취소</button>
                <button type="button" className="btn-primary btn-md" onClick={handleSave} disabled={saving}>
                  {saving ? '저장 중…' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
