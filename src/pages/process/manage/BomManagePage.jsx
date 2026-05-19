// pages/process/manage/BomManagePage.jsx
// 제품 BOM 다단계 관리 (2026-05-19, team_rnd 전용) — Toss flat: 모달 X, 페이지 내 뷰 전환
//
// view: list | editor(신규/수정) | tree(재귀 전개) | log(버전 이력)
//   전부 page-flat 안에서 컨텐츠 교체 (오버레이/카드 없음). Rev 컬럼 제거 (version 으로 일원화).

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  getBoms, getBom, getBomTree,
  createBom, updateBom, deleteBom, hardDeleteBom,
  getParts, getBomVersionLog, bumpBomMajor,
} from '@/api'
import s from './BomManagePage.module.css'

const EMPTY_HEADER = {
  code: '', name: '', applied_date: '',
  author: '', approver: '', reviewer: '', notes: '', display_order: 999,
}
const EMPTY_ITEM = {
  seq: 0, child_bom_id: null, part_id: null,
  part_no: '', part_name: '', material: '',
  spec: '', manufacturer: '', vendor: '', unit: 'EA', quantity: 1,
  unit_price: null, remark: '',
}
const EMPTY_REV = { no: 1, revised_date: '', reason: '', circulation: [] }

export default function BomManagePage({ onBack }) {
  const [items, setItems] = useState([])
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  // view = { mode:'list' } | {mode:'editor', data} | {mode:'tree', id} | {mode:'log', bom}
  const [view, setView] = useState({ mode: 'list' })

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      setItems(await getBoms(!showInactive, filter.trim()))
    } catch (e) {
      setError(e.message || 'BOM 목록 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [showInactive, filter])

  useEffect(() => { reload() }, [reload])
  useEffect(() => { getParts(true).then(setParts).catch(() => setParts([])) }, [])

  const backToList = () => { setView({ mode: 'list' }); reload() }

  const openNew = () => setView({
    mode: 'editor',
    data: { ...EMPTY_HEADER, _items: [{ ...EMPTY_ITEM }], _revisions: [] },
  })
  const openEdit = async (id) => {
    try {
      const b = await getBom(id)
      setView({
        mode: 'editor',
        data: {
          ...b,
          applied_date: b.applied_date || '',
          _items: (b.items || []).map((it) => ({ ...it })),
          _revisions: (b.revisions || []).map((r) => ({
            ...r, revised_date: r.revised_date || '', circulation: r.circulation || [],
          })),
        },
      })
    } catch (e) { alert(e.message) }
  }

  const handleDelete = async (b) => {
    if (!confirm(`'${b.code}' 비활성화할까요? (소프트 삭제)`)) return
    try { await deleteBom(b.id); reload() } catch (e) { alert(e.message) }
  }
  const handleHardDelete = async (b) => {
    if (!confirm(`'${b.code}' 완전 삭제할까요? 되돌릴 수 없습니다.`)) return
    try { await hardDeleteBom(b.id); reload() } catch (e) { alert(e.message) }
  }

  // ── 뷰 분기 (전부 page-flat 안, 모달 없음) ──
  if (view.mode === 'editor') {
    return (
      <div className="page-flat">
        <PageHeader
          title={view.data.id ? `BOM 편집 — ${view.data.code}` : '새 BOM'}
          subtitle="구성품 명세 · 다단계 트리"
          onBack={backToList}
        />
        <BomEditor editing={view.data} allBoms={items} allParts={parts}
          onCancel={backToList} onSaved={backToList} />
      </div>
    )
  }
  if (view.mode === 'tree') {
    return (
      <div className="page-flat">
        <PageHeader title="BOM 트리" subtitle="재귀 전개 · 금액 roll-up" onBack={backToList} />
        <BomTreeView bomId={view.id} />
      </div>
    )
  }
  if (view.mode === 'log') {
    return (
      <div className="page-flat">
        <PageHeader title={`버전 이력 — ${view.bom.code}`} subtitle="auto PATCH 전파 (event 묶음)" onBack={backToList} />
        <VersionLogView bom={view.bom} onBumped={backToList} />
      </div>
    )
  }

  // list
  return (
    <div className="page-flat">
      <PageHeader title="제품 BOM" subtitle="구성품 명세 · 다단계 트리 · 개정 이력" onBack={onBack} />

      <div className={s.toolbar}>
        <input className={s.search} placeholder="코드 / 제품명 검색"
          value={filter} onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && reload()} />
        <label className={s.chk}>
          <input type="checkbox" checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)} /> 비활성 포함
        </label>
        <button type="button" className="btn-primary btn-md" onClick={openNew}>+ 새 BOM</button>
      </div>

      {loading && <p className={s.info}>로딩 중...</p>}
      {error && <p className={s.err}>{error}</p>}

      {!loading && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>코드</th><th>제품/부품명</th><th>버전</th>
                <th>적용일</th><th>구성품</th><th>작성</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className={s.empty}>등록된 BOM 이 없어요.</td></tr>
              ) : items.map((b) => (
                <tr key={b.id} className={b.is_active ? '' : s.inactiveRow}>
                  <td className={s.mono}>{b.code}</td>
                  <td>{b.name || '-'}</td>
                  <td><span className={s.verBadge}>v{b.version || '1.0'}</span></td>
                  <td className={s.dateCell}>{b.applied_date || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{b.item_count}</td>
                  <td>{b.author || '-'}</td>
                  <td className={s.actions}>
                    <button type="button" className={s.act} onClick={() => setView({ mode: 'tree', id: b.id })}>트리</button>
                    <button type="button" className={s.act} onClick={() => setView({ mode: 'log', bom: b })}>이력</button>
                    <button type="button" className={s.act} onClick={() => openEdit(b.id)}>편집</button>
                    {b.is_active
                      ? <button type="button" className={s.actWarn} onClick={() => handleDelete(b)}>비활성</button>
                      : <button type="button" className={s.actDanger} onClick={() => handleHardDelete(b)}>완전삭제</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════
// 편집 (인라인 — 헤더 + 구성품 + 개정이력)
// ════════════════════════════════════════════
function BomEditor({ editing, allBoms, allParts = [], onCancel, onSaved }) {
  const isNew = !editing.id
  const [h, setH] = useState(editing)
  const [rows, setRows] = useState(editing._items || [])
  const [revs, setRevs] = useState(editing._revisions || [])
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  const set = (k, v) => setH((p) => ({ ...p, [k]: v }))
  const setRow = (i, k, v) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const addRow = () => setRows((p) => [...p, { ...EMPTY_ITEM, seq: p.length }])
  const delRow = (i) => setRows((p) => p.filter((_, idx) => idx !== i))
  const onPickPart = (i, val) => {
    if (!val) { setRows((p) => p.map((r, idx) => idx === i ? { ...r, part_id: null } : r)); return }
    const pt = allParts.find((x) => String(x.id) === String(val))
    if (!pt) return
    setRows((p) => p.map((r, idx) => idx === i ? {
      ...r, part_id: pt.id,
      part_no: pt.part_no || r.part_no, part_name: pt.name || r.part_name,
      material: pt.material || r.material, spec: pt.spec || r.spec,
      manufacturer: pt.manufacturer || r.manufacturer, unit: pt.unit || r.unit,
      unit_price: pt.unit_price ?? r.unit_price,
    } : r))
  }
  const setRev = (i, k, v) => setRevs((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const addRev = () => setRevs((p) => [...p, { ...EMPTY_REV, no: p.length + 1 }])
  const delRev = (i) => setRevs((p) => p.filter((_, idx) => idx !== i))

  const childOpts = allBoms.filter((b) => b.id !== editing.id)

  const save = async () => {
    if (!h.code.trim()) { setFormErr('코드는 필수입니다.'); return }
    setSaving(true); setFormErr('')
    const payload = {
      code: h.code.trim(), name: h.name,
      applied_date: h.applied_date || null,
      author: h.author, approver: h.approver, reviewer: h.reviewer,
      notes: h.notes, display_order: Number(h.display_order) || 999,
      items: rows.map((r, i) => ({
        seq: i,
        child_bom_id: r.child_bom_id ? Number(r.child_bom_id) : null,
        part_id: r.part_id ? Number(r.part_id) : null,
        part_no: r.part_no || '', part_name: r.part_name || '',
        material: r.material || '', spec: r.spec || '',
        manufacturer: r.manufacturer || '', vendor: r.vendor || '',
        unit: r.unit || 'EA', quantity: Number(r.quantity) || 0,
        unit_price: r.unit_price === '' || r.unit_price == null ? null : Number(r.unit_price),
        remark: r.remark || '',
      })),
      revisions: revs.map((r) => ({
        no: Number(r.no) || 1, revised_date: r.revised_date || null,
        reason: r.reason || '',
        circulation: Array.isArray(r.circulation) ? r.circulation
          : String(r.circulation || '').split(',').map((x) => x.trim()).filter(Boolean),
      })),
    }
    try {
      if (isNew) await createBom(payload)
      else await updateBom(editing.id, payload)
      onSaved()
    } catch (e) {
      setFormErr(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className={s.hGrid}>
        <Field label="코드 *"><input value={h.code} onChange={(e) => set('code', e.target.value)} /></Field>
        <Field label="제품/부품명"><input value={h.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="적용일자"><input type="date" value={h.applied_date} onChange={(e) => set('applied_date', e.target.value)} /></Field>
        <Field label="작성"><input value={h.author} onChange={(e) => set('author', e.target.value)} /></Field>
        <Field label="승인"><input value={h.approver} onChange={(e) => set('approver', e.target.value)} /></Field>
        <Field label="검토"><input value={h.reviewer} onChange={(e) => set('reviewer', e.target.value)} /></Field>
        <Field label="정렬"><input type="number" value={h.display_order} onChange={(e) => set('display_order', e.target.value)} /></Field>
      </div>
      <Field label="비고"><textarea rows={2} value={h.notes} onChange={(e) => set('notes', e.target.value)} /></Field>

      <div className={s.sectTitle}>구성품 ({rows.length})
        <button type="button" className={s.addBtn} onClick={addRow}>+ 행 추가</button>
      </div>
      <div className={s.itemsWrap}>
        <table className={s.itemsTable}>
          <thead>
            <tr>
              <th>#</th><th>부품(사물사전)</th><th>부품번호</th><th>부품명</th><th>재질</th><th>규격</th>
              <th>제조사</th><th>공급자</th><th>단위</th><th>수량</th><th>단가</th>
              <th>하위BOM</th><th>비고</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <select value={r.part_id ?? ''} onChange={(e) => onPickPart(i, e.target.value)}>
                    <option value="">(직접입력)</option>
                    {allParts.map((p) => (
                      <option key={p.id} value={p.id}>{p.part_no}{p.name ? ` · ${p.name}` : ''}</option>
                    ))}
                  </select>
                </td>
                <td><input value={r.part_no} onChange={(e) => setRow(i, 'part_no', e.target.value)} /></td>
                <td><input value={r.part_name} onChange={(e) => setRow(i, 'part_name', e.target.value)} /></td>
                <td><input value={r.material} onChange={(e) => setRow(i, 'material', e.target.value)} /></td>
                <td><input value={r.spec} onChange={(e) => setRow(i, 'spec', e.target.value)} /></td>
                <td><input value={r.manufacturer} onChange={(e) => setRow(i, 'manufacturer', e.target.value)} /></td>
                <td><input value={r.vendor} onChange={(e) => setRow(i, 'vendor', e.target.value)} /></td>
                <td className={s.tiny}><input value={r.unit} onChange={(e) => setRow(i, 'unit', e.target.value)} /></td>
                <td className={s.tiny}><input type="number" value={r.quantity} onChange={(e) => setRow(i, 'quantity', e.target.value)} /></td>
                <td className={s.tiny}><input type="number" value={r.unit_price ?? ''} onChange={(e) => setRow(i, 'unit_price', e.target.value)} /></td>
                <td>
                  <select value={r.child_bom_id ?? ''} onChange={(e) => setRow(i, 'child_bom_id', e.target.value || null)}>
                    <option value="">(leaf)</option>
                    {childOpts.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
                  </select>
                </td>
                <td><input value={r.remark} onChange={(e) => setRow(i, 'remark', e.target.value)} /></td>
                <td><button type="button" className={s.delRow} onClick={() => delRow(i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.sectTitle}>개정 이력 ({revs.length})
        <button type="button" className={s.addBtn} onClick={addRev}>+ 개정 추가</button>
      </div>
      <div className={s.itemsWrap}>
        <table className={s.itemsTable}>
          <thead>
            <tr><th>No</th><th>개정일자</th><th>개정 사유</th><th>회람(쉼표구분)</th><th></th></tr>
          </thead>
          <tbody>
            {revs.map((r, i) => (
              <tr key={i}>
                <td className={s.tiny}><input type="number" value={r.no} onChange={(e) => setRev(i, 'no', e.target.value)} /></td>
                <td><input type="date" value={r.revised_date} onChange={(e) => setRev(i, 'revised_date', e.target.value)} /></td>
                <td><input value={r.reason} onChange={(e) => setRev(i, 'reason', e.target.value)} /></td>
                <td><input
                  value={Array.isArray(r.circulation) ? r.circulation.join(', ') : r.circulation}
                  onChange={(e) => setRev(i, 'circulation', e.target.value)} /></td>
                <td><button type="button" className={s.delRow} onClick={() => delRev(i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

function Field({ label, children }) {
  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
    </label>
  )
}

// ════════════════════════════════════════════
// 트리뷰 (인라인)
// ════════════════════════════════════════════
function BomTreeView({ bomId }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { getBomTree(bomId).then(setData).catch((e) => setErr(e.message)) }, [bomId])

  if (err) return <p className={s.err}>{err}</p>
  if (!data) return <p className={s.info}>전개 중...</p>
  return (
    <>
      <p className={s.info}>총 금액(roll-up): <b>{fmtWon(data.tree?.rolled_price)}</b></p>
      <div className={s.treeWrap}>
        <TreeNode node={data.tree} level={1} />
      </div>
    </>
  )
}

function TreeNode({ node, level }) {
  if (!node) return null
  return (
    <div>
      <div className={s.treeBom} style={{ paddingLeft: (level - 1) * 18 }}>
        <span className={s.lvl}>{'.'.repeat(level - 1)}{level}</span>
        <b>{node.code}</b> {node.name && <span className={s.treeName}>{node.name}</span>}
        {node.cycle && <span className={s.cycle}>⚠ 순환</span>}
        <span className={s.treeSum}>{fmtWon(node.rolled_price)}</span>
      </div>
      {(node.items || []).map((it, i) => (
        <div key={i}>
          {it.child ? (
            <TreeNode node={it.child} level={level + 1} />
          ) : (
            <div className={s.treeItem} style={{ paddingLeft: level * 18 }}>
              <span className={s.lvl}>{'.'.repeat(level)}{level + 1}</span>
              {it.part_no && <span className={s.pno}>{it.part_no}</span>}
              <span>{it.part_name || '-'}</span>
              {it.spec && <span className={s.spec}>{it.spec}</span>}
              <span className={s.qty}>{it.quantity} {it.unit}</span>
              <span className={s.treeSum}>{fmtWon(it.price)}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════
// 버전 이력 (인라인) — event 묶음 + 정식개정 버튼
// ════════════════════════════════════════════
function VersionLogView({ bom, onBumped }) {
  const [logs, setLogs] = useState(null)
  const [err, setErr] = useState('')
  const [bumping, setBumping] = useState(false)

  useEffect(() => { getBomVersionLog(bom.id).then(setLogs).catch((e) => setErr(e.message)) }, [bom.id])

  const doBumpMajor = async () => {
    if (!confirm(`'${bom.code}' 정식 개정(MAJOR↑)할까요? PATCH 는 0으로 리셋됩니다.`)) return
    setBumping(true)
    try { await bumpBomMajor(bom.id); onBumped() }
    catch (e) { alert(e.message) }
    finally { setBumping(false) }
  }

  const grouped = (logs || []).reduce((acc, l) => {
    const k = l.event_id || l.id
    if (!acc[k]) acc[k] = []
    acc[k].push(l)
    return acc
  }, {})

  return (
    <>
      <div className={s.footRow} style={{ justifyContent: 'flex-start', marginTop: 0, marginBottom: 12 }}>
        <span className={s.verBadge}>v{bom.version || '1.0'}</span>
        <button type="button" className="btn-secondary btn-md" onClick={doBumpMajor} disabled={bumping}>
          {bumping ? '처리 중...' : '정식 개정 (MAJOR ↑, PATCH=0)'}
        </button>
      </div>
      {err && <p className={s.err}>{err}</p>}
      {!logs && !err && <p className={s.info}>불러오는 중...</p>}
      {logs && logs.length === 0 && <p className={s.info}>버전 변경 이력이 없습니다.</p>}
      {logs && logs.length > 0 && (
        <div className={s.treeWrap}>
          {Object.entries(grouped).map(([eid, rs]) => (
            <div key={eid} className={s.logEvent}>
              <div className={s.logTop}>
                <span className={s.verBadge}>v{rs[0].version}</span>
                <span className={s.logKind} data-kind={rs[0].kind}>
                  {rs[0].kind === 'manual' ? '정식개정' : '자동전파'}
                </span>
                <span className={s.logSrc}>← {rs[0].source_ref}</span>
                <span className={s.treeSum}>
                  {rs[0].created_at ? rs[0].created_at.slice(0, 16).replace('T', ' ') : ''}
                </span>
              </div>
              <div className={s.logReason}>
                {rs[0].reason}{rs.length > 1 ? ` · ${rs.length}개 BOM 전파` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

const fmtWon = (v) =>
  v == null ? '-' : `₩${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`
