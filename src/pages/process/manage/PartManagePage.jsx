// pages/process/manage/PartManagePage.jsx
// 부품 마스터 ("사물 사전") — 구매링크/사진/공급사/단가. BOM 이 이걸 참조 (2026-05-19, team_rnd 전용)
//
// 흐름:
//   GET/POST/PUT/DELETE /part        → CRUD
//   POST/GET/DELETE /part/{id}/photo → 사진 S3
//   공급사 = 기존 Company 마스터 재사용 (드롭다운)

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  getParts, getPart, createPart, updatePart, deletePart, hardDeletePart,
  uploadPartPhoto, getPartPhotoUrl, deletePartPhoto, getCompanies,
} from '@/api'
import s from './PartManagePage.module.css'

const EMPTY = {
  part_no: '', name: '', material: '', spec: '', manufacturer: '',
  supplier_id: null, purchase_link: '', unit: 'EA', unit_price: null,
  notes: '', display_order: 999,
}

export default function PartManagePage({ onBack }) {
  const [items, setItems] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [parts, comps] = await Promise.all([
        getParts(!showInactive, filter.trim()),
        getCompanies(true).then((r) => r.companies || r || []).catch(() => []),
      ])
      setItems(parts)
      setCompanies(Array.isArray(comps) ? comps : [])
    } catch (e) {
      setError(e.message || '부품 목록 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [showInactive, filter])

  useEffect(() => { reload() }, [reload])

  const supplierName = (id) => companies.find((c) => c.id === id)?.name || '-'

  const handleDelete = async (p) => {
    if (!confirm(`'${p.part_no}' 비활성화할까요?`)) return
    try { await deletePart(p.id); reload() } catch (e) { alert(e.message) }
  }
  const handleHard = async (p) => {
    if (!confirm(`'${p.part_no}' 완전 삭제할까요? 되돌릴 수 없습니다.`)) return
    try { await hardDeletePart(p.id); reload() } catch (e) { alert(e.message) }
  }

  return (
    <div className="page-flat">
      <PageHeader title="부품 마스터" subtitle="사물 사전 · 구매링크/사진/공급사 · BOM 이 참조" onBack={onBack} />

      <div className={s.toolbar}>
        <input className={s.search} placeholder="부품번호 / 부품명 / 제조사 검색"
          value={filter} onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && reload()} />
        <label className={s.chk}>
          <input type="checkbox" checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)} /> 비활성 포함
        </label>
        <button type="button" className="btn-primary btn-md"
          onClick={() => setEditing({ ...EMPTY })}>+ 새 부품</button>
      </div>

      {loading && <p className={s.info}>로딩 중...</p>}
      {error && <p className={s.err}>{error}</p>}

      {!loading && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>사진</th><th>부품번호</th><th>부품명</th><th>재질</th>
                <th>제조사</th><th>공급사</th><th>단가</th><th>구매</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={9} className={s.empty}>등록된 부품이 없어요.</td></tr>
              ) : items.map((p) => (
                <tr key={p.id} className={p.is_active ? '' : s.inactiveRow}>
                  <td><Thumb partId={p.id} hasPhoto={p.has_photo} /></td>
                  <td className={s.mono}>{p.part_no}</td>
                  <td>{p.name || '-'}</td>
                  <td>{p.material || '-'}</td>
                  <td>{p.manufacturer || '-'}</td>
                  <td>{supplierName(p.supplier_id)}</td>
                  <td className={s.num}>{p.unit_price != null ? p.unit_price.toLocaleString() : '-'}</td>
                  <td>{p.purchase_link
                    ? <a href={p.purchase_link} target="_blank" rel="noreferrer" className={s.link}>🔗</a>
                    : '-'}</td>
                  <td className={s.actions}>
                    <button type="button" className={s.act} onClick={async () => {
                      try { setEditing(await getPart(p.id)) } catch (e) { alert(e.message) }
                    }}>편집</button>
                    {p.is_active
                      ? <button type="button" className={s.actWarn} onClick={() => handleDelete(p)}>비활성</button>
                      : <button type="button" className={s.actDanger} onClick={() => handleHard(p)}>완전삭제</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PartEditModal
          editing={editing} companies={companies}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload() }}
        />
      )}
    </div>
  )
}

// 썸네일 — presigned URL lazy 로드
function Thumb({ partId, hasPhoto }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let on = true
    if (hasPhoto) getPartPhotoUrl(partId).then((u) => on && setUrl(u)).catch(() => {})
    return () => { on = false }
  }, [partId, hasPhoto])
  if (!hasPhoto) return <span className={s.noimg}>—</span>
  return url ? <img src={url} alt="" className={s.thumb} /> : <span className={s.noimg}>…</span>
}

function PartEditModal({ editing, companies, onClose, onSaved }) {
  const isNew = !editing.id
  const [f, setF] = useState({
    ...EMPTY, ...editing,
    supplier_id: editing.supplier_id ?? null,
    unit_price: editing.unit_price ?? null,
  })
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [photoUrl, setPhotoUrl] = useState(null)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    let on = true
    if (editing.id && editing.has_photo) {
      getPartPhotoUrl(editing.id).then((u) => on && setPhotoUrl(u)).catch(() => {})
    }
    return () => { on = false }
  }, [editing.id, editing.has_photo])

  const save = async () => {
    if (!f.part_no.trim()) { setFormErr('부품번호는 필수입니다.'); return }
    setSaving(true); setFormErr('')
    const payload = {
      part_no: f.part_no.trim(), name: f.name, material: f.material,
      spec: f.spec, manufacturer: f.manufacturer,
      supplier_id: f.supplier_id ? Number(f.supplier_id) : null,
      purchase_link: f.purchase_link, unit: f.unit || 'EA',
      unit_price: f.unit_price === '' || f.unit_price == null ? null : Number(f.unit_price),
      notes: f.notes, display_order: Number(f.display_order) || 999,
    }
    try {
      if (isNew) await createPart(payload)
      else await updatePart(editing.id, payload)
      onSaved()
    } catch (e) {
      setFormErr(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !editing.id) {
      if (!editing.id) alert('사진은 부품 저장 후 등록할 수 있어요.')
      return
    }
    try {
      await uploadPartPhoto(editing.id, file)
      const u = await getPartPhotoUrl(editing.id)
      setPhotoUrl(`${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`)
    } catch (err) { alert(err.message) }
  }
  const onRemovePhoto = async () => {
    if (!editing.id || !confirm('사진을 제거할까요?')) return
    try { await deletePartPhoto(editing.id); setPhotoUrl(null) } catch (e) { alert(e.message) }
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHead}>
          <h2>{isNew ? '새 부품' : `부품 편집 — ${editing.part_no}`}</h2>
          <button type="button" className={s.x} onClick={onClose}>✕</button>
        </div>

        <div className={s.grid}>
          <L label="부품번호 *"><input value={f.part_no} onChange={(e) => set('part_no', e.target.value)} /></L>
          <L label="부품명"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></L>
          <L label="재질"><input value={f.material} onChange={(e) => set('material', e.target.value)} /></L>
          <L label="규격"><input value={f.spec} onChange={(e) => set('spec', e.target.value)} /></L>
          <L label="제조사"><input value={f.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} /></L>
          <L label="공급사">
            <select value={f.supplier_id ?? ''} onChange={(e) => set('supplier_id', e.target.value || null)}>
              <option value="">(없음)</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </L>
          <L label="단위"><input value={f.unit} onChange={(e) => set('unit', e.target.value)} /></L>
          <L label="단가"><input type="number" value={f.unit_price ?? ''} onChange={(e) => set('unit_price', e.target.value)} /></L>
          <L label="정렬"><input type="number" value={f.display_order} onChange={(e) => set('display_order', e.target.value)} /></L>
        </div>
        <L label="구매 링크"><input value={f.purchase_link} onChange={(e) => set('purchase_link', e.target.value)} placeholder="https://..." /></L>
        <L label="비고"><textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></L>

        <div className={s.photoSect}>
          <span className={s.fieldLabel}>제품 사진</span>
          {photoUrl
            ? <img src={photoUrl} alt="" className={s.photoPreview} />
            : <div className={s.photoEmpty}>{isNew ? '저장 후 등록 가능' : '사진 없음'}</div>}
          <div className={s.photoBtns}>
            <label className={s.fileBtn}>
              사진 선택
              <input type="file" accept="image/*" hidden onChange={onPickPhoto} />
            </label>
            {photoUrl && <button type="button" className={s.actDanger} onClick={onRemovePhoto}>제거</button>}
          </div>
        </div>

        {formErr && <p className={s.err}>{formErr}</p>}
        <div className={s.modalFoot}>
          <button type="button" className="btn-secondary btn-md" onClick={onClose}>취소</button>
          <button type="button" className="btn-primary btn-md" onClick={save} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

function L({ label, children }) {
  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
    </label>
  )
}
