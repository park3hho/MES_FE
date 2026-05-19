// pages/process/manage/ItemManagePage.jsx
// 품목 마스터 ("사물 사전") — Toss flat: 모달 X, 페이지 내 뷰 전환 (2026-05-19, team_rnd 전용)
//
// view: list | editor(신규/수정 — 사진 포함) | category(분류 트리 관리)
//   분류 = 관리형 트리(대>중>소). 기능별·공정무관. 공급사 = Company 마스터 재사용.

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  getItems, getItem, createItem, updateItem, deleteItem, hardDeleteItem,
  uploadItemPhoto, getItemPhotoUrl, deleteItemPhoto, getCompanies,
  getItemWhereUsed, getItemCategoryTree,
  createItemCategory, updateItemCategory, deleteItemCategory,
} from '@/api'
import s from './ItemManagePage.module.css'

const EMPTY = {
  part_no: '', name: '', material: '', spec: '', manufacturer_id: null,
  supplier_id: null, purchase_link: '', unit: 'EA', unit_price: null,
  notes: '', lifecycle: 'ACTIVE', category_id: null, display_order: 999,
}

// 품목 수명주기 — BE models/meta/item.py 와 동기 (ACTIVE→EOM→EOL)
const LIFECYCLE = [
  { v: 'ACTIVE', label: '양산', cls: 'lcActive' },
  { v: 'EOM', label: '생산중단', cls: 'lcEom' },
  { v: 'EOL', label: '단종', cls: 'lcEol' },
]
const lcOf = (v) => LIFECYCLE.find((x) => x.v === v) || LIFECYCLE[0]

// ── 분류 트리 헬퍼 ───────────────────────────────────────────
function flattenTree(tree) {
  const byId = {}
  const parentOf = {}
  const walk = (nodes, pid) => (nodes || []).forEach((n) => {
    byId[n.id] = n
    parentOf[n.id] = pid
    if (n.children?.length) walk(n.children, n.id)
  })
  walk(tree, null)
  return { byId, parentOf }
}
function pathOf(id, byId, parentOf) {
  const names = []
  let cur = id
  let guard = 0
  while (cur != null && byId[cur] && guard < 8) {
    names.unshift(byId[cur].name)
    cur = parentOf[cur]
    guard += 1
  }
  return names.join(' › ')
}
function flatOptions(tree, depth = 0, acc = []) {
  ;(tree || []).forEach((n) => {
    acc.push({ id: n.id, label: `${'  '.repeat(depth)}${n.name}` })
    if (n.children?.length) flatOptions(n.children, depth + 1, acc)
  })
  return acc
}

export default function ItemManagePage({ onBack }) {
  const [items, setItems] = useState([])
  const [companies, setCompanies] = useState([])
  const [catTree, setCatTree] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [catFilter, setCatFilter] = useState('')   // '' = 전체 분류 (id)
  const [view, setView] = useState({ mode: 'list' })   // list | editor | category

  const loadCats = useCallback(
    () => getItemCategoryTree(true).then(setCatTree).catch(() => setCatTree([])),
    [],
  )
  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [pp, comps] = await Promise.all([
        getItems(!showInactive, filter.trim(), catFilter),
        getCompanies(true).then((r) => r.companies || r || []).catch(() => []),
      ])
      setItems(pp)
      setCompanies(Array.isArray(comps) ? comps : [])
    } catch (e) {
      setError(e.message || '품목 목록 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [showInactive, filter, catFilter])

  useEffect(() => { reload() }, [reload])
  useEffect(() => { loadCats() }, [loadCats])

  const supplierName = (id) => companies.find((c) => c.id === id)?.name || '-'
  // 제조사도 공급사와 동일 — Company 마스터에서 이름 해석 (FK, 2026-05-19)
  const manufacturerName = (id) => companies.find((c) => c.id === id)?.name || '-'
  const backToList = () => { setView({ mode: 'list' }); reload() }
  const catOptions = flatOptions(catTree)

  const handleDelete = async (p) => {
    if (!confirm(`'${p.part_no}' 을(를) 단종(EOL) 처리할까요?\n신규 BOM 투입이 차단됩니다. (행/이력은 보존)`)) return
    try { await deleteItem(p.id); reload() } catch (e) { alert(e.message) }
  }
  const handleRestore = async (p) => {
    try { await updateItem(p.id, { lifecycle: 'ACTIVE' }); reload() } catch (e) { alert(e.message) }
  }
  const handleHard = async (p) => {
    if (!confirm(`'${p.part_no}' 완전 삭제할까요? 되돌릴 수 없습니다.`)) return
    try { await hardDeleteItem(p.id); reload() } catch (e) { alert(e.message) }
  }

  if (view.mode === 'category') {
    return (
      <div className="page-flat">
        <PageHeader title="품목 분류 관리" subtitle="대 › 중 › 소 · 기능별(공정 무관)" onBack={backToList} />
        <CategoryManager tree={catTree} onChanged={loadCats} />
      </div>
    )
  }

  if (view.mode === 'editor') {
    return (
      <div className="page-flat">
        <PageHeader
          title={view.data.id ? `품목 편집 — ${view.data.part_no}` : '새 품목'}
          subtitle="사물 사전 · 분류/구매링크/사진/공급사"
          onBack={backToList}
        />
        <ItemEditor editing={view.data} companies={companies} catTree={catTree}
          onCancel={backToList} onSaved={backToList} />
      </div>
    )
  }

  return (
    <div className="page-flat">
      <PageHeader title="품목 마스터" subtitle="사물 사전 · 분류/구매링크/사진/공급사 · BOM 이 참조" onBack={onBack} />

      <div className={s.toolbar}>
        <input className={s.search} placeholder="품목번호 / 품목명 / 제조사 검색"
          value={filter} onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && reload()} />
        <select className={s.catSel} value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">전체 분류</option>
          {catOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <label className={s.chk}>
          <input type="checkbox" checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)} /> 단종 포함
        </label>
        <button type="button" className="btn-secondary btn-md"
          onClick={() => setView({ mode: 'category' })}>분류 관리</button>
        <button type="button" className="btn-primary btn-md"
          onClick={() => setView({ mode: 'editor', data: { ...EMPTY } })}>+ 새 품목</button>
      </div>

      {loading && <p className={s.info}>로딩 중...</p>}
      {error && <p className={s.err}>{error}</p>}

      {!loading && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>사진</th><th>품목번호</th><th>품목명</th><th>분류</th><th>재질</th>
                <th>제조사</th><th>공급사</th><th>단가</th><th>상태</th><th>구매</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={11} className={s.empty}>등록된 품목이 없어요.</td></tr>
              ) : items.map((p) => {
                const lc = lcOf(p.lifecycle)
                const rowCls = p.lifecycle === 'EOL' ? s.inactiveRow
                  : p.lifecycle === 'EOM' ? s.eomRow : ''
                return (
                <tr key={p.id} className={rowCls}>
                  <td><Thumb itemId={p.id} hasPhoto={p.has_photo} /></td>
                  <td className={s.mono}>{p.part_no}</td>
                  <td>{p.name || '-'}</td>
                  <td>{p.category_path
                    ? <span className={s.catBadge}>{p.category_path}</span>
                    : <span className={s.noimg}>-</span>}</td>
                  <td>{p.material || '-'}</td>
                  <td>{manufacturerName(p.manufacturer_id)}</td>
                  <td>{supplierName(p.supplier_id)}</td>
                  <td className={s.num}>{p.unit_price != null ? p.unit_price.toLocaleString() : '-'}</td>
                  <td><span className={`${s.lcBadge} ${s[lc.cls]}`}>{lc.label}</span></td>
                  <td>{p.purchase_link
                    ? <a href={p.purchase_link} target="_blank" rel="noreferrer" className={s.link}>🔗</a>
                    : '-'}</td>
                  <td className={s.actions}>
                    <button type="button" className={s.act} onClick={async () => {
                      try { setView({ mode: 'editor', data: await getItem(p.id) }) }
                      catch (e) { alert(e.message) }
                    }}>편집</button>
                    {p.lifecycle !== 'EOL'
                      ? <button type="button" className={s.actWarn} onClick={() => handleDelete(p)}>단종</button>
                      : <>
                          <button type="button" className={s.act} onClick={() => handleRestore(p)}>복구</button>
                          <button type="button" className={s.actDanger} onClick={() => handleHard(p)}>완전삭제</button>
                        </>}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Thumb({ itemId, hasPhoto }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let on = true
    if (hasPhoto) getItemPhotoUrl(itemId).then((u) => on && setUrl(u)).catch(() => {})
    return () => { on = false }
  }, [itemId, hasPhoto])
  if (!hasPhoto) return <span className={s.noimg}>—</span>
  return url ? <img src={url} alt="" className={s.thumb} /> : <span className={s.noimg}>…</span>
}

// ════════════════════════════════════════════
// 분류 트리 관리 (대 고정 6, 중/소 CRUD) — Toss flat
// ════════════════════════════════════════════
function CategoryManager({ tree, onChanged }) {
  const addChild = async (parent) => {
    if (parent && parent.level >= 3) { alert('소분류 아래에는 더 만들 수 없어요 (대›중›소).'); return }
    const name = prompt(parent ? `'${parent.name}' 하위 분류명` : '대분류명 (시드 외 추가 비권장)')
    if (!name || !name.trim()) return
    try { await createItemCategory({ parent_id: parent ? parent.id : null, name: name.trim() }); onChanged() }
    catch (e) { alert(e.message) }
  }
  const rename = async (n) => {
    const name = prompt('새 분류명', n.name)
    if (!name || !name.trim() || name.trim() === n.name) return
    try { await updateItemCategory(n.id, { name: name.trim() }); onChanged() }
    catch (e) { alert(e.message) }
  }
  const remove = async (n) => {
    if (!confirm(`'${n.name}' 분류를 삭제할까요? (하위/사용중이면 거부됨)`)) return
    try { await deleteItemCategory(n.id); onChanged() } catch (e) { alert(e.message) }
  }
  const Node = ({ n }) => (
    <li className={s.catNode}>
      <div className={s.catRow}>
        <span className={s.catName}>
          <b>{n.name}</b>
          <span className={s.catLvl}>{['', '대', '중', '소'][n.level] || ''}</span>
        </span>
        <span className={s.catBtns}>
          {n.level < 3 && <button type="button" className={s.act} onClick={() => addChild(n)}>+ 하위</button>}
          <button type="button" className={s.act} onClick={() => rename(n)}>이름변경</button>
          {n.level > 1 && <button type="button" className={s.actDanger} onClick={() => remove(n)}>삭제</button>}
        </span>
      </div>
      {n.children?.length > 0 && (
        <ul className={s.catChildren}>{n.children.map((c) => <Node key={c.id} n={c} />)}</ul>
      )}
    </li>
  )
  return (
    <>
      <p className={s.info}>대분류 6종은 고정(삭제 불가). 중/소분류는 자유롭게 추가·수정·삭제하세요. 기능별(공정 무관).</p>
      <ul className={s.catTree}>
        {(tree || []).map((n) => <Node key={n.id} n={n} />)}
      </ul>
    </>
  )
}

// ════════════════════════════════════════════
// 편집 (인라인) — 모달 제거
// ════════════════════════════════════════════
function ItemEditor({ editing, companies, catTree, onCancel, onSaved }) {
  const isNew = !editing.id
  const [f, setF] = useState({
    ...EMPTY, ...editing,
    manufacturer_id: editing.manufacturer_id ?? null,
    supplier_id: editing.supplier_id ?? null,
    unit_price: editing.unit_price ?? null,
    category_id: editing.category_id ?? null,
  })
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [photoUrl, setPhotoUrl] = useState(null)
  const [used, setUsed] = useState(null)   // 상향 where-used (기존 품목 편집 시)
  const [drag, setDrag] = useState(false)  // 사진 드래그&드롭 하이라이트
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  // 제조사 = 'manufacturer' 역할 보유 회사만 (공급사는 전체 — 사용자 결정 2026-05-19).
  // 현재 값이 역할 미보유 회사라도 선택 유지되도록 항상 포함.
  const manufacturerCompanies = companies.filter(
    (c) => (Array.isArray(c.roles) && c.roles.includes('manufacturer'))
      || String(c.id) === String(f.manufacturer_id),
  )

  const { byId, parentOf } = flattenTree(catTree)
  // 현재 category_id 의 조상 체인 [대,중,소] (preset 용)
  const chain = []
  { let cur = f.category_id; let g = 0
    while (cur != null && byId[cur] && g < 8) { chain.unshift(cur); cur = parentOf[cur]; g += 1 } }
  const lvl1 = chain[0] ?? ''
  const lvl2 = chain[1] ?? ''
  const lvl3 = chain[2] ?? ''
  const roots = catTree || []
  const mids = lvl1 ? (byId[lvl1]?.children || []) : []
  const subs = lvl2 ? (byId[lvl2]?.children || []) : []
  // 가장 깊은 선택을 category_id 로 (소>중>대)
  const pickCat = (l1, l2, l3) => set('category_id', l3 || l2 || l1 || null)

  useEffect(() => {
    let on = true
    if (editing.id && editing.has_photo) {
      getItemPhotoUrl(editing.id).then((u) => on && setPhotoUrl(u)).catch(() => {})
    }
    if (editing.id) {
      getItemWhereUsed(editing.id).then((u) => on && setUsed(u)).catch(() => on && setUsed([]))
    }
    return () => { on = false }
  }, [editing.id, editing.has_photo])

  const save = async () => {
    if (!f.part_no.trim()) { setFormErr('품목번호는 필수입니다.'); return }
    setSaving(true); setFormErr('')
    const payload = {
      part_no: f.part_no.trim(), name: f.name, material: f.material,
      spec: f.spec,
      manufacturer_id: f.manufacturer_id ? Number(f.manufacturer_id) : null,
      supplier_id: f.supplier_id ? Number(f.supplier_id) : null,
      purchase_link: f.purchase_link, unit: f.unit || 'EA',
      unit_price: f.unit_price === '' || f.unit_price == null ? null : Number(f.unit_price),
      notes: f.notes, lifecycle: f.lifecycle || 'ACTIVE',
      category_id: f.category_id ? Number(f.category_id) : null,
      display_order: Number(f.display_order) || 999,
    }
    try {
      if (isNew) await createItem(payload)
      else await updateItem(editing.id, payload)
      onSaved()
    } catch (e) {
      setFormErr(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const uploadFile = async (file) => {
    if (!file) return
    if (!editing.id) { alert('사진은 품목 저장 후 등록할 수 있어요.'); return }
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드할 수 있어요.'); return }
    try {
      await uploadItemPhoto(editing.id, file)
      const u = await getItemPhotoUrl(editing.id)
      setPhotoUrl(`${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`)
    } catch (err) { alert(err.message) }
  }
  const onPickPhoto = (e) => uploadFile(e.target.files?.[0])
  const onDrop = (e) => {
    e.preventDefault(); setDrag(false)
    uploadFile(e.dataTransfer.files?.[0])
  }
  const onRemovePhoto = async () => {
    if (!editing.id || !confirm('사진을 제거할까요?')) return
    try { await deleteItemPhoto(editing.id); setPhotoUrl(null) } catch (e) { alert(e.message) }
  }

  return (
    <>
      <div className={s.grid}>
        <L label="품목번호 *"><input value={f.part_no} onChange={(e) => set('part_no', e.target.value)} /></L>
        <L label="품목명"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></L>
        <L label="재질"><input value={f.material} onChange={(e) => set('material', e.target.value)} /></L>
        <L label="규격"><input value={f.spec} onChange={(e) => set('spec', e.target.value)} /></L>
        <L label="제조사">
          <select value={f.manufacturer_id ?? ''} onChange={(e) => set('manufacturer_id', e.target.value || null)}>
            <option value="">(없음)</option>
            {manufacturerCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </L>
        <L label="공급사">
          <select value={f.supplier_id ?? ''} onChange={(e) => set('supplier_id', e.target.value || null)}>
            <option value="">(없음)</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </L>
        <L label="단위"><input value={f.unit} onChange={(e) => set('unit', e.target.value)} /></L>
        <L label="단가"><input type="number" value={f.unit_price ?? ''} onChange={(e) => set('unit_price', e.target.value)} /></L>
        <L label="수명주기">
          <select value={f.lifecycle || 'ACTIVE'} onChange={(e) => set('lifecycle', e.target.value)}>
            {LIFECYCLE.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
          </select>
        </L>
        <L label="정렬"><input type="number" value={f.display_order} onChange={(e) => set('display_order', e.target.value)} /></L>
      </div>

      <div className={s.catPick}>
        <span className={s.fieldLabel}>분류 (대 › 중 › 소)</span>
        <div className={s.catCascade}>
          <select value={lvl1} onChange={(e) => pickCat(e.target.value || null, '', '')}>
            <option value="">(대분류)</option>
            {roots.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <select value={lvl2} disabled={!lvl1}
            onChange={(e) => pickCat(lvl1, e.target.value || null, '')}>
            <option value="">(중분류)</option>
            {mids.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <select value={lvl3} disabled={!lvl2}
            onChange={(e) => pickCat(lvl1, lvl2, e.target.value || null)}>
            <option value="">(소분류)</option>
            {subs.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
      </div>

      <L label="구매 링크"><input value={f.purchase_link} onChange={(e) => set('purchase_link', e.target.value)} placeholder="https://..." /></L>
      <L label="비고"><textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></L>

      <div className={s.photoSect}>
        <span className={s.fieldLabel}>품목 사진</span>
        <div
          className={`${s.photoDrop} ${drag ? s.dropActive : ''}`}
          onDragOver={(e) => { e.preventDefault(); if (!drag) setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          {photoUrl
            ? <img src={photoUrl} alt="" className={s.photoPreview} />
            : <div className={s.photoEmpty}>
                {drag ? '여기에 놓기' : isNew ? '저장 후 등록 가능' : '사진 없음 · 드래그&드롭'}
              </div>}
        </div>
        <div className={s.photoBtns}>
          <label className={s.fileBtn}>
            사진 선택
            <input type="file" accept="image/*" hidden onChange={onPickPhoto} />
          </label>
          {photoUrl && <button type="button" className={s.actDanger} onClick={onRemovePhoto}>제거</button>}
        </div>
      </div>

      {!isNew && (
        <div className={s.usedSect}>
          <span className={s.fieldLabel}>사용처 (이 품목을 쓰는 상위 BOM/제품)</span>
          {used == null && <p className={s.info}>조회 중...</p>}
          {used && used.length === 0 && (
            <p className={s.info}>상위 사용처 없음 (최상위 제품이거나 아직 미사용)</p>
          )}
          {used && used.length > 0 && (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr><th>상위 품목번호</th><th>제품/품목명</th><th>변형</th><th>버전</th><th>수량</th></tr>
                </thead>
                <tbody>
                  {used.map((u) => (
                    <tr key={u.bom_id} className={u.is_active ? '' : s.inactiveRow}>
                      <td className={s.mono}>{u.parent_part_no}</td>
                      <td>{u.parent_part_name || '-'}</td>
                      <td>
                        {u.bom_label || <span className={s.noimg}>-</span>}
                        {u.is_default && <span className={s.defBadge}>표준</span>}
                      </td>
                      <td>v{u.bom_version}</td>
                      <td className={s.num}>{u.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {formErr && <p className={s.err}>{formErr}</p>}
      <div className={s.footRow}>
        <button type="button" className="btn-secondary btn-md" onClick={onCancel}>취소</button>
        <button type="button" className="btn-primary btn-md" onClick={save} disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </>
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
