// pages/process/manage/StockLocationPage.jsx
// 재고 현황 (통합) — Warehouse + Inventory + RotorStock 를 위치/상태/NC 로 읽기 (2026-06-09)
//
// 설계: docs/stock-location-design.md (A2)
//   - 한 테이블로 합치지 않고 BE 가 union 정규화 (stock_overview 패턴).
//   - NC 는 Inventory.nc_no 조인으로 배지 표시 (복사 X — 동기화 자동).
//   - 수정/삭제는 소스별 원본 엔드포인트로 라우팅 (2026-06-13). 부적합(NC)은 처분 로직이
//     따로라 여기선 편집 제외 (BE 가 id 미전달 → 버튼 안 뜸).
import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  getStockLocation,
  updateWarehouse, deleteWarehouse,
  updateStockRow, deleteStockRow,
  updateRotorStock, deleteRotorStock,
  createNc,
} from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import s from './StockLocationPage.module.css'

// 소스별 수정/삭제 라우팅 — 각 도메인 원본 엔드포인트 (2026-06-13)
const UPDATE_BY_SOURCE = {
  warehouse: updateWarehouse,
  inventory: updateStockRow,
  rotor: updateRotorStock,
}
const DELETE_BY_SOURCE = {
  warehouse: deleteWarehouse,
  inventory: deleteStockRow,
  rotor: deleteRotorStock,
}
// inventory.status 선택지 (BaseModel 상태값과 동기 — core/lot_config INVENTORY_STATUSES)
const INV_STATUS_OPTS = [
  { v: 'in_stock', label: '재고' },
  { v: 'repair', label: '재공정' },
  { v: 'internal_use', label: '내부사용' },
  { v: 'nonconforming', label: '부적합' },
  { v: 'discarded', label: '폐기' },
]

const SOURCE_LABELS = { warehouse: '창고', inventory: '공정', rotor: '로터', nc: '부적합' }
const SOURCE_TABS = [
  { key: '', label: '전체' },
  { key: 'warehouse', label: '창고' },
  { key: 'inventory', label: '공정' },
  { key: 'rotor', label: '로터' },
  { key: 'nc', label: '부적합(LOT없음)' },
]
const STATUS_BADGE = {
  nonconforming: { label: '부적합', cls: 'bad' },
  repair: { label: '재공정', cls: 'warn' },
  internal_use: { label: '내부사용', cls: 'muted' },
  in_stock: { label: '재고', cls: 'ok' },
}
const PAGE_SIZE = 50

export default function StockLocationPage({ onBack }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [ncCount, setNcCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [keyword, setKeyword] = useState('')
  const [source, setSource] = useState('')
  const [ncOnly, setNcOnly] = useState(false)
  const [page, setPage] = useState(1)
  const timerRef = useRef(null)

  // 수정 모달 — { row, form } | null (2026-06-13)
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  // 부적합 처리 모달 — { row, defectType, defectDetail } | null (2026-06-18)
  const [ncModal, setNcModal] = useState(null)
  const [ncSaving, setNcSaving] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await getStockLocation({
        keyword: keyword || undefined,
        source: source || undefined,
        status: ncOnly ? 'nonconforming' : undefined,
        page,
        page_size: PAGE_SIZE,
      })
      setItems(data.items || [])
      setTotal(data.total || 0)
      setNcCount(data.nc_count || 0)
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [keyword, source, ncOnly, page])

  // 필터/페이지 변경 시 재조회 (키워드는 디바운스)
  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(reload, 250)
    return () => clearTimeout(timerRef.current)
  }, [reload])

  // 필터 바꾸면 1페이지로
  const onFilter = (fn) => { setPage(1); fn() }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── 수정/삭제 (소스별 라우팅) ──
  const editable = (r) => r.id != null && UPDATE_BY_SOURCE[r.source]

  const openEdit = (r) => {
    // 소스별 편집 가능 필드만 form 에 — 저장 시 동일 키로 patch 전송
    if (r.source === 'warehouse') {
      setEdit({ row: r, form: { name: r.name || '', spec: r.spec || '', quantity: String(r.qty ?? '') } })
    } else if (r.source === 'inventory') {
      setEdit({ row: r, form: { quantity: String(r.qty ?? ''), status: r.status || 'in_stock' } })
    } else if (r.source === 'rotor') {
      setEdit({ row: r, form: { quantity: String(r.qty ?? '') } })
    }
  }
  const setF = (k, v) => setEdit((e) => ({ ...e, form: { ...e.form, [k]: v } }))

  const onSaveEdit = async () => {
    const { row, form } = edit
    const patch = {}
    if ('name' in form) patch.name = form.name.trim()
    if ('spec' in form) patch.spec = form.spec.trim()
    if ('status' in form) patch.status = form.status
    if ('quantity' in form) {
      const q = Number(form.quantity)
      if (Number.isNaN(q) || q < 0) { emitToast('수량을 올바르게 입력해주세요.', 'error'); return }
      patch.quantity = q
    }
    setSaving(true)
    try {
      await UPDATE_BY_SOURCE[row.source](row.id, patch)
      emitToast('수정되었습니다.', 'success')
      setEdit(null)
      await reload()
    } catch (e) {
      emitToast(e.message || '수정 실패', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async (r) => {
    if (!window.confirm(`"${r.name || r.ref}" 재고를 삭제할까요?\n(복구 불가)`)) return
    try {
      await DELETE_BY_SOURCE[r.source](r.id)
      emitToast('삭제되었습니다.', 'success')
      await reload()
    } catch (e) {
      emitToast(e.message || '삭제 실패', 'error')
    }
  }

  // ── 부적합 처리 (2026-06-18) — 공정/로터 재고를 NC 격리. createNc → BE 레지스트리가
  //   StatorInventory/RotorInventory/RotorStock 중 lot_no 매칭 행을 nonconforming 으로 격리. ──
  const canNc = (r) => !!r.ref && r.status !== 'nonconforming' && (r.source === 'inventory' || r.source === 'rotor')
  const onNcSubmit = async () => {
    if (ncSaving || !ncModal) return
    if (!ncModal.defectType.trim()) { emitToast('불량유형을 입력해주세요.', 'error'); return }
    setNcSaving(true)
    try {
      await createNc({
        source_type: 'MANUAL',          // 작업자 발견 (검사 없이 직접 격리)
        lot_no: ncModal.row.ref,
        defect_type: ncModal.defectType.trim(),
        defect_detail: ncModal.defectDetail.trim(),
        quantity: ncModal.row.qty,
      })
      emitToast('부적합 처리되었습니다.', 'success')
      setNcModal(null)
      await reload()
    } catch (e) {
      emitToast(e.message || '부적합 처리 실패', 'error')
    } finally {
      setNcSaving(false)
    }
  }

  return (
    <div className="page-flat">
      <PageHeader title="재고 현황" subtitle="창고·공정·로터 통합 위치 + 부적합(NC) 표시" onBack={onBack} />

      <div className={s.toolbar}>
        <input type="text" className={s.search} placeholder="LOT/품명/규격 검색"
          value={keyword} onChange={(e) => onFilter(() => setKeyword(e.target.value))} />
        <div className={s.tabs}>
          {SOURCE_TABS.map((t) => (
            <button key={t.key} type="button"
              className={`${s.tab} ${source === t.key ? s.tabOn : ''}`}
              onClick={() => onFilter(() => setSource(t.key))}>{t.label}</button>
          ))}
        </div>
        <button type="button"
          className={`${s.ncBtn} ${ncOnly ? s.ncBtnOn : ''}`}
          onClick={() => onFilter(() => setNcOnly((v) => !v))}>
          부적합만{ncCount ? ` (${ncCount})` : ''}
        </button>
      </div>

      {loading && <p className={s.msg}>로딩 중…</p>}
      {error && <p className={s.error}>{error}</p>}

      {!loading && !error && (
        <>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>소스</th>
                  <th>식별(LOT)</th>
                  <th>품명</th>
                  <th>규격</th>
                  <th className={s.numCol}>수량</th>
                  <th>단위</th>
                  <th>위치</th>
                  <th>상태</th>
                  <th className={s.actCol}>작업</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={9} className={s.empty}>해당 조건의 재고가 없습니다.</td></tr>
                ) : items.map((r) => {
                  const badge = STATUS_BADGE[r.status] || { label: r.status, cls: 'muted' }
                  return (
                    <tr key={`${r.source}-${r.ref}`}>
                      <td><span className={s.srcTag}>{SOURCE_LABELS[r.source] || r.source}</span></td>
                      <td className={s.mono}>{r.ref}</td>
                      <td className={s.nameCell}>
                        {r.name}
                        {r.nc && (
                          <span className={s.ncTag} title={r.nc.defect_detail || r.nc.defect_type}>
                            {r.nc.nc_no}{r.nc.defect_type ? ` · ${r.nc.defect_type}` : ''}
                          </span>
                        )}
                      </td>
                      <td className={s.ellip} title={r.spec}>{r.spec || '—'}</td>
                      <td className={s.numCol}>{r.qty}</td>
                      <td>{r.unit}</td>
                      <td className={r.location_full ? s.mono : s.unset}>
                        {r.location_full || '위치 미지정'}
                      </td>
                      <td><span className={`${s.badge} ${s[badge.cls]}`}>{badge.label}</span></td>
                      <td className={s.actCol}>
                        {editable(r) && (
                          <>
                            <button type="button" className={s.linkBtn} onClick={() => openEdit(r)}>수정</button>
                            <button type="button" className={s.linkDanger} onClick={() => onDelete(r)}>삭제</button>
                          </>
                        )}
                        {canNc(r) && (
                          <button type="button" className={s.linkDanger}
                            onClick={() => setNcModal({ row: r, defectType: '', defectDetail: '' })}>부적합</button>
                        )}
                        {!editable(r) && !canNc(r) && <span className={s.unset}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className={s.pager}>
            <span className={s.pagerInfo}>총 {total}건 · {page}/{totalPages}</span>
            <div className={s.pagerBtns}>
              <button type="button" className={s.pageBtn} disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}>이전</button>
              <button type="button" className={s.pageBtn} disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>다음</button>
            </div>
          </div>
        </>
      )}

      {/* ── 수정 모달 (소스별 필드) ── */}
      {edit && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className={s.modal}>
            <h2 className={s.modalTitle}>
              재고 수정
              <span className={s.modalSub}>{SOURCE_LABELS[edit.row.source]} · {edit.row.ref}</span>
            </h2>
            <div className={s.formCol}>
              {'name' in edit.form && (
                <label>품명
                  <input type="text" value={edit.form.name}
                    onChange={(e) => setF('name', e.target.value)} placeholder="품명" />
                </label>
              )}
              {'spec' in edit.form && (
                <label>규격
                  <input type="text" value={edit.form.spec}
                    onChange={(e) => setF('spec', e.target.value)} placeholder="규격" />
                </label>
              )}
              {'status' in edit.form && (
                <label>상태
                  <select value={edit.form.status} onChange={(e) => setF('status', e.target.value)}>
                    {INV_STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </label>
              )}
              {'quantity' in edit.form && (
                <label>수량
                  <input type="number" step="any" min="0" value={edit.form.quantity}
                    onChange={(e) => setF('quantity', e.target.value)} placeholder="0" />
                </label>
              )}
            </div>
            <div className={s.modalBtns}>
              <button type="button" className="btn-secondary" onClick={() => setEdit(null)} disabled={saving}>취소</button>
              <button type="button" className="btn-primary" onClick={onSaveEdit} disabled={saving}>
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 부적합 처리 모달 (2026-06-18) — createNc → 레지스트리 격리 ── */}
      {ncModal && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && setNcModal(null)}>
          <div className={s.modal}>
            <h2 className={s.modalTitle}>
              부적합 처리
              <span className={s.modalSub}>{SOURCE_LABELS[ncModal.row.source]} · {ncModal.row.ref}</span>
            </h2>
            <div className={s.formCol}>
              <label>불량유형 *
                <input type="text" value={ncModal.defectType} autoFocus
                  onChange={(e) => setNcModal((m) => ({ ...m, defectType: e.target.value }))}
                  placeholder="예: 외관불량 / 치수불량 / 통전불량" />
              </label>
              <label>불량내용
                <textarea rows={3} value={ncModal.defectDetail}
                  onChange={(e) => setNcModal((m) => ({ ...m, defectDetail: e.target.value }))}
                  placeholder="상세 불량 내용 (선택)" />
              </label>
            </div>
            <div className={s.modalBtns}>
              <button type="button" className="btn-secondary" onClick={() => setNcModal(null)} disabled={ncSaving}>취소</button>
              <button type="button" className="btn-danger" onClick={onNcSubmit} disabled={ncSaving}>
                {ncSaving ? '처리 중…' : '부적합 처리'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
