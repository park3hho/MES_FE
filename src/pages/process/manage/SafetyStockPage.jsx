// pages/process/manage/SafetyStockPage.jsx
// 안전재고 전용 설정 화면 (2026-07-28).
//   ⚠️ 품목의 다른 속성(재질·규격·타입별 스펙…)은 여기서 건드리지 않는다 — 임계값 조정과
//     현재고 대조에만 집중. 품목 마스터(ItemManagePage)의 안전재고 칸은 존치(신규 생성 시 편의).
//   현재고 = 창고 '생산(PROD)' 용도 수량 합 (예비/기타 제외) — 매일 07:00 알림 메일과 같은 기준.
//   권한: 창고 라우터와 동일(로그인) — 품목 마스터 편집권(ADMIN_BOM) 없이도 임계값만 조정 가능.
//
// 안전재고 항목 두 갈래 (BE 와 동일 구조):
//   ① 묶음 — 구성 품목 재고 '합계' 기준. 자석은 같은 규격이 극성별로 쪼개져(MG-20iAZ/N/S)
//      실제 소요가 세트 단위라 합계로 봐야 의미가 있음 (사용자 요구 2026-07-28).
//   ② 품목 — Item.safety_stock 개별 기준.
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import {
  getSafetyStockList, setSafetyStock, searchWarehouseItems,
  createSafetyStockGroup, updateSafetyStockGroup, deleteSafetyStockGroup,
  addSafetyStockGroupItems, removeSafetyStockGroupItem,
} from '@/api'
import styles from './SafetyStockPage.module.css'

// 정수면 소수점 없이 (자석 ea 기본), 소수면 그대로 — BE _fmt_qty 와 같은 표기
const fmt = (v) => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)))
}

const PAGE_SIZE = 9       // 한 페이지 9행 (사용자 요청 2026-07-30) — 넘으면 페이지네이션
const SEARCH_LIMIT = 50   // 한 번에 받아올 검색 결과 상한 — 이후는 클라이언트 페이징


// ── 정렬 + 페이지네이션 공용 훅 ──
// 세 표(묶음/품목/검색결과)가 같은 규칙으로 동작하도록 한 곳에 모음.
// 정렬 키가 바뀌면 1페이지로 되돌림 — 정렬했는데 엉뚱한 페이지에 남아 "결과가 없다"고 오해하는 것 방지.
function useSortPage(rows, initialKey, initialDir = 'desc', pageSize = PAGE_SIZE) {
  const [sortKey, setSortKey] = useState(initialKey)
  const [sortDir, setSortDir] = useState(initialDir)
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => {
    const arr = [...(rows || [])]
    arr.sort((a, b) => {
      const x = a[sortKey]
      const y = b[sortKey]
      let c
      if (typeof x === 'number' && typeof y === 'number') c = x - y
      else c = String(x ?? '').localeCompare(String(y ?? ''), 'ko')
      return sortDir === 'asc' ? c : -c
    })
    return arr
  }, [rows, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)      // 행이 줄어 페이지가 사라져도 빈 화면 안 되게
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  const toggle = (key) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  return { pageRows, sortKey, sortDir, toggle, page: safePage, totalPages, setPage, total: sorted.length }
}

// 정렬 가능한 표 헤더
function SortTh({ label, sortKey: key, state, align }) {
  const active = state.sortKey === key
  return (
    <th className={align === 'right' ? styles.num : undefined}>
      <button type="button" className={styles.sortBtn} onClick={() => state.toggle(key)}>
        {label}
        <span className={active ? styles.sortMark : styles.sortMarkIdle}>
          {active ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

function Pager({ state }) {
  if (state.total === 0) return null
  return (
    <div className={styles.pager}>
      <button type="button" className={`btn-text ${styles.smallBtn}`}
        disabled={state.page <= 1} onClick={() => state.setPage(state.page - 1)}>이전</button>
      <span className={styles.pagerInfo}>
        {state.page} / {state.totalPages} · 전체 {state.total}건
      </span>
      <button type="button" className={`btn-text ${styles.smallBtn}`}
        disabled={state.page >= state.totalPages} onClick={() => state.setPage(state.page + 1)}>다음</button>
    </div>
  )
}


export default function SafetyStockPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])        // 품목별 개별 기준
  const [groups, setGroups] = useState([])    // 묶음(합계) 기준
  const [msg, setMsg] = useState(null)        // {type:'ok'|'err', text}
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await getSafetyStockList()
      setRows(r.rows || [])
      setGroups(r.groups || [])
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '불러오기 실패' })
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const ok = (text) => setMsg({ type: 'ok', text })
  const err = (text) => setMsg({ type: 'err', text })

  // 예비1, 예비2 … 다음 빈 번호 (기존 "예비N" 이름에서 최대값 +1)
  const nextReserveName = () => {
    const nums = groups
      .map((g) => /^예비\s*(\d+)$/.exec((g.name || '').trim()))
      .filter(Boolean)
      .map((m) => Number(m[1]))
    return `예비${nums.length ? Math.max(...nums) + 1 : 1}`
  }

  // 드래그앤드롭 — 품목 A 를 품목 B 위로 → 두 품목으로 새 묶음 자동 생성 (개별 설정은 병존 유지)
  const createGroupFromItems = async (srcId, dstId) => {
    if (!srcId || !dstId || srcId === dstId || busy) return null
    setBusy(true)
    try {
      const name = nextReserveName()
      const r = await createSafetyStockGroup({ name, safety_stock: 0, item_ids: [srcId, dstId], note: '' })
      await load()
      ok(`묶음 "${name}" 생성됨 — 이름·수량을 바꿀 수 있어요.`)
      return r.group?.group_id ?? null
    } catch (e) { err(e.message || '묶음 생성 실패'); return null } finally { setBusy(false) }
  }

  // 빈 묶음 하나 추가 (예비N) — 이후 드래그/검색으로 품목을 담음
  const addEmptyGroup = async () => {
    if (busy) return null
    setBusy(true)
    try {
      const name = nextReserveName()
      const r = await createSafetyStockGroup({ name, safety_stock: 0, item_ids: [], note: '' })
      await load()
      ok(`빈 묶음 "${name}" 생성됨 — 품목을 끌어다 담거나 검색해 담아주세요.`)
      return r.group?.group_id ?? null
    } catch (e) { err(e.message || '묶음 생성 실패'); return null } finally { setBusy(false) }
  }

  const itemShortage = rows.filter((r) => r.deficit > 0).length
  const groupShortage = groups.filter((g) => g.is_active && g.deficit > 0).length

  return (
    <div className={`page-flat ${styles.widePage}`}>
      <PageHeader
        title="안전재고 설정"
        subtitle="품목·묶음별 안전재고 기준과 현재 재고 대조 — 미달 시 알림 메일 발송"
        onBack={() => nav('/admin/manage')}
      />
      <div className="page-content">
        {msg && (
          <p className={`${styles.msg} ${msg.type === 'err' ? styles.msgErr : styles.msgOk}`}>
            {msg.text}
          </p>
        )}

        <div className={styles.summary}>
          <span>묶음 <b className={styles.summaryNum}>{groups.length}</b>건</span>
          <span>품목 <b className={styles.summaryNum}>{rows.length}</b>건</span>
          <span>
            부족{' '}
            <b className={`${styles.summaryNum} ${(itemShortage + groupShortage) ? styles.shortage : styles.ok}`}>
              {itemShortage + groupShortage}
            </b>건
          </span>
        </div>
        <p className={styles.hint}>
          ※ 현재고는 창고 <b>생산</b> 용도 수량의 합입니다 (예비·기타 용도 제외).
          부족이 있으면 매일 07:00 에 알림 메일이 발송됩니다 — 수신자는 <b>알림 발송 설정</b> 에서 지정합니다.
          품목을 다른 품목·묶음 위로 끌어다 놓으면 묶음이 됩니다.
        </p>

        {/* 좌: 항목 추가(검색) / 우: 항목 목록 — 위아래로 쌓으면 추가↔확인 사이를 스크롤로 오가야 함 (2026-07-30) */}
        <div className={styles.split}>
          <AddWatchItem
            busy={busy}
            watchedIds={rows.map((r) => r.item_id)}
            onAdded={() => { load(); ok('품목이 설정됨') }}
            onError={err}
          />

          <StockTree
            groups={groups} rows={rows} busy={busy} setBusy={setBusy} loaded={loaded}
            onChanged={load} onOk={ok} onErr={err}
            onGroupItems={createGroupFromItems} onAddEmptyGroup={addEmptyGroup}
          />
        </div>
      </div>
    </div>
  )
}


// ═══════════════ 통합 트리 (묶음=폴더 + 개별 품목) ═══════════════
const DND_MIME = 'application/x-ss-item'   // 드래그 페이로드 = 품목 id

function StockTree({ groups, rows, busy, setBusy, loaded, onChanged, onOk, onErr, onGroupItems, onAddEmptyGroup }) {
  const [collapsed, setCollapsed] = useState(() => new Set())   // 접힌 묶음 id (기본 펼침)
  const [gDraft, setGDraft] = useState({})     // {group_id: 묶음 기준 입력값}
  const [iDraft, setIDraft] = useState({})     // {item_id: 개별 기준 입력값}
  const [editName, setEditName] = useState(null)   // {id, value} — 이름 인라인 수정
  const [dropId, setDropId] = useState(null)   // 드롭 대상 품목 id
  const [dropGid, setDropGid] = useState(null) // 드롭 대상 묶음 id

  const rowsById = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(r.item_id, r)
    return m
  }, [rows])
  const memberIds = useMemo(() => {
    const s = new Set()
    for (const g of groups) for (const m of (g.members || [])) s.add(m.item_id)
    return s
  }, [groups])

  // 정렬 규칙 (사용자 요청 2026-07-30): ① 폴더(묶음)가 항상 위 ② 그 안에서는 **이름순 고정**.
  //   ★ 부족분(deficit) 기준으로 정렬하면 기준값을 저장할 때마다 그 행이 다른 자리로 튀어
  //     "방금 고친 줄이 어디 갔지" 가 반복된다. 이름순은 저장해도 위치가 변하지 않는다.
  const sortedGroups = useMemo(() =>
    [...groups].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko')),
  [groups])
  const ungrouped = useMemo(() => rows.filter((r) => !memberIds.has(r.item_id)), [rows, memberIds])
  const st = useSortPage(ungrouped, 'name', 'asc')

  const isOpen = (id) => !collapsed.has(id)
  const toggleOpen = (id) => setCollapsed((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  // ── 묶음 기준 저장 / 알림 토글 / 삭제 ──
  const saveGroupQty = async (g) => {
    const raw = gDraft[g.group_id]
    const v = Number(raw)
    if (raw === '' || raw == null || Number.isNaN(v) || v < 0) { onErr('기준 수량을 0 이상 숫자로 입력해주세요.'); return }
    setBusy(true)
    try {
      await updateSafetyStockGroup(g.group_id, { safety_stock: v })
      await onChanged()
      setGDraft((d) => { const n = { ...d }; delete n[g.group_id]; return n })
      onOk(`"${g.name}" 기준 ${fmt(v)} 저장됨`)
    } catch (e) { onErr(e.message || '저장 실패') } finally { setBusy(false) }
  }
  const toggleActive = async (g) => {
    setBusy(true)
    try { await updateSafetyStockGroup(g.group_id, { is_active: !g.is_active }); await onChanged() }
    catch (e) { onErr(e.message || '변경 실패') } finally { setBusy(false) }
  }
  const removeGroup = async (g) => {
    if (!window.confirm(`묶음 "${g.name}" 을(를) 삭제할까요?\n구성 품목의 개별 설정은 그대로 남습니다.`)) return
    setBusy(true)
    try { await deleteSafetyStockGroup(g.group_id); await onChanged(); onOk(`묶음 "${g.name}" 삭제됨`) }
    catch (e) { onErr(e.message || '삭제 실패') } finally { setBusy(false) }
  }

  // ── 묶음 이름 인라인 수정 ──
  const startName = (g) => setEditName({ id: g.group_id, value: g.name })
  const cancelName = () => setEditName(null)
  const saveName = async (g) => {
    if (!editName || editName.id !== g.group_id) return
    const v = (editName.value || '').trim()
    if (!v || v === g.name) { cancelName(); return }
    setEditName(null)
    setBusy(true)
    try { await updateSafetyStockGroup(g.group_id, { name: v }); await onChanged(); onOk(`이름이 "${v}" 로 변경됨`) }
    catch (e) { onErr(e.message || '이름 변경 실패') } finally { setBusy(false) }
  }

  // ── 개별 품목 기준 저장 / 해제 (묶음 구성품·미묶음 공용) ──
  const saveItemQty = async (itemId, label) => {
    const raw = iDraft[itemId]
    const v = Number(raw)
    if (raw === '' || raw == null || Number.isNaN(v) || v < 0) { onErr('안전재고 값을 0 이상 숫자로 입력해주세요.'); return }
    setBusy(true)
    try {
      await setSafetyStock(itemId, v)
      await onChanged()
      setIDraft((d) => { const n = { ...d }; delete n[itemId]; return n })
      onOk(`${label} 개별 기준 ${fmt(v)} 저장됨`)
    } catch (e) { onErr(e.message || '저장 실패') } finally { setBusy(false) }
  }
  const removeItemWatch = async (r) => {
    if (!window.confirm(`${r.name} 을(를) 개별 설정에서 제외할까요?\n제외하면 부족해도 알림이 가지 않습니다.`)) return
    setBusy(true)
    try { await setSafetyStock(r.item_id, null); await onChanged(); onOk(`${r.name} 개별 설정 해제됨`) }
    catch (e) { onErr(e.message || '해제 실패') } finally { setBusy(false) }
  }

  // ── 묶음 담기 / 빼기 ──
  const addToGroup = async (g, itemId) => {
    if (!itemId || busy) return
    setBusy(true)
    try { await addSafetyStockGroupItems(g.group_id, [itemId]); await onChanged(); onOk(`품목이 "${g.name}" 에 담김`) }
    catch (e) { onErr(e.message || '추가 실패') } finally { setBusy(false) }
  }
  const removeFromGroup = async (g, m) => {
    setBusy(true)
    try { await removeSafetyStockGroupItem(g.group_id, m.item_id); await onChanged(); onOk(`"${m.name}" 을(를) 묶음에서 뺐어요`) }
    catch (e) { onErr(e.message || '제거 실패') } finally { setBusy(false) }
  }

  const handleAddEmpty = async () => {
    const id = await onAddEmptyGroup()
    if (id != null) setCollapsed((s) => { const n = new Set(s); n.delete(id); return n })   // 새 묶음 펼침
  }

  const empty = loaded && groups.length === 0 && ungrouped.length === 0

  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle}>안전재고 항목 <span className={styles.watched}>묶음(합계) · 품목(개별)</span></h3>
        <button type="button" className={`btn-secondary btn-sm ${styles.smallBtn}`}
          disabled={busy} onClick={handleAddEmpty}>+ 묶음 추가</button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.expandCol} aria-label="펼치기" />
              {/* 정렬 머리글은 '미묶음 품목' 구간에만 적용됨 — 묶음(폴더)은 항상 위·이름순 고정 */}
              <SortTh label="품목 · 묶음" sortKey="name" state={st} />
              <th className={styles.num}>현재고</th>
              <th className={styles.num}>안전재고</th>
              <SortTh label="상태" sortKey="deficit" state={st} />
              <th aria-label="작업" />
            </tr>
          </thead>
          <tbody>
            {/* ── 묶음(폴더) 맨 위 ── */}
            {sortedGroups.map((g) => {
              const open = isOpen(g.group_id)
              const gd = gDraft[g.group_id]
              const gDirty = gd !== undefined && String(gd) !== String(g.safety_stock)
              const drop = dropGid === g.group_id
              return (
                <Fragment key={`g-${g.group_id}`}>
                  <tr
                    className={`${styles.groupRow} ${g.is_active ? '' : styles.inactive} ${drop ? styles.dropHover : ''}`.trim()}
                    onDragOver={(e) => { if (!e.dataTransfer.types.includes(DND_MIME)) return; e.preventDefault(); if (dropGid !== g.group_id) setDropGid(g.group_id) }}
                    onDragLeave={() => setDropGid((x) => (x === g.group_id ? null : x))}
                    onDrop={(e) => { e.preventDefault(); setDropGid(null); const src = Number(e.dataTransfer.getData(DND_MIME)); if (src) addToGroup(g, src) }}>
                    <td className={styles.expandCol}>
                      <button type="button" className={styles.expandBtn} onClick={() => toggleOpen(g.group_id)}>{open ? '▾' : '▸'}</button>
                    </td>
                    <td>
                      <span className={styles.folderIcon}>🗀</span>
                      {editName && editName.id === g.group_id ? (
                        <input className={styles.nameInput} autoFocus disabled={busy}
                          value={editName.value}
                          onChange={(e) => setEditName((s) => ({ ...s, value: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveName(g); else if (e.key === 'Escape') cancelName() }}
                          onBlur={() => saveName(g)} />
                      ) : (
                        <button type="button" className={styles.nameEditBtn} title="이름 수정" disabled={busy} onClick={() => startName(g)}>{g.name}</button>
                      )}
                      <span className={styles.tag}>묶음 {g.member_count}</span>
                      {!g.is_active && <span className={styles.watched}> · 알림 꺼짐</span>}
                      {g.unit_mixed && <span className={styles.shortage}> · ⚠ 단위 불일치</span>}
                    </td>
                    <td className={styles.num}>{fmt(g.current)}{g.unit}</td>
                    <td className={styles.num}>
                      <input className={styles.qtyInput} type="number" min="0" step="any" disabled={busy}
                        value={gd !== undefined ? gd : g.safety_stock}
                        onChange={(e) => setGDraft((d) => ({ ...d, [g.group_id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter' && gDirty) saveGroupQty(g) }} />
                      {' '}{g.unit}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${g.deficit > 0 ? styles.shortage : styles.ok}`}>
                        {g.deficit > 0 ? `⚠ 부족 ${fmt(g.deficit)}${g.unit}` : `여유 ${fmt(-g.deficit)}${g.unit}`}
                      </span>
                    </td>
                    <td className={styles.actions}>
                      <button type="button" className={`btn-primary btn-sm ${styles.smallBtn}`} disabled={busy || !gDirty} onClick={() => saveGroupQty(g)}>저장</button>
                      <button type="button" className={`btn-text ${styles.smallBtn}`} disabled={busy} onClick={() => toggleActive(g)}>{g.is_active ? '알림 끄기' : '알림 켜기'}</button>
                      <button type="button" className={`btn-text ${styles.smallBtn}`} disabled={busy} onClick={() => removeGroup(g)}>삭제</button>
                    </td>
                  </tr>

                  {open && (g.members || []).map((m) => {
                    const wr = rowsById.get(m.item_id)   // 개별 설정된 경우만 존재
                    const idv = iDraft[m.item_id]
                    const cur = wr ? wr.safety_stock : ''
                    const dirty = idv !== undefined && String(idv) !== String(cur)
                    return (
                      <tr key={`g-${g.group_id}-m-${m.item_id}`} className={styles.childRow}>
                        <td className={styles.expandCol} />
                        <td className={styles.childCell}>
                          <span className={styles.childBullet}>·</span>
                          {m.name}<span className={styles.partNo}> · {m.part_no}{m.spec ? ` · ${m.spec}` : ''}</span>
                        </td>
                        <td className={styles.num}>{fmt(m.current)}{m.unit}</td>
                        <td className={styles.num}>
                          <input className={styles.qtyInput} type="number" min="0" step="any" disabled={busy} placeholder="개별"
                            value={idv !== undefined ? idv : cur}
                            onChange={(e) => setIDraft((d) => ({ ...d, [m.item_id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter' && dirty) saveItemQty(m.item_id, m.name) }} />
                          {' '}{m.unit}
                        </td>
                        <td>
                          {wr ? (
                            <span className={`${styles.badge} ${wr.deficit > 0 ? styles.shortage : styles.ok}`}>
                              {wr.deficit > 0 ? `⚠ 부족 ${fmt(wr.deficit)}${wr.unit}` : `여유 ${fmt(-wr.deficit)}${wr.unit}`}
                            </span>
                          ) : <span className={styles.watched}>개별 미설정</span>}
                        </td>
                        <td className={styles.actions}>
                          <button type="button" className={`btn-primary btn-sm ${styles.smallBtn}`} disabled={busy || !dirty} onClick={() => saveItemQty(m.item_id, m.name)}>저장</button>
                          <button type="button" className={`btn-text ${styles.smallBtn}`} disabled={busy} onClick={() => removeFromGroup(g, m)}>묶음에서 빼기</button>
                        </td>
                      </tr>
                    )
                  })}

                </Fragment>
              )
            })}

            {/* ── 미묶음 개별 품목 ── */}
            {st.pageRows.map((r) => {
              const idv = iDraft[r.item_id]
              const dirty = idv !== undefined && String(idv) !== String(r.safety_stock)
              const drop = dropId === r.item_id
              return (
                <tr key={`i-${r.item_id}`}
                  draggable={!busy}
                  onDragStart={(e) => {
                    if (e.target.closest('input, button')) { e.preventDefault(); return }
                    e.dataTransfer.effectAllowed = 'copy'
                    e.dataTransfer.setData(DND_MIME, String(r.item_id))
                  }}
                  onDragOver={(e) => { if (!e.dataTransfer.types.includes(DND_MIME)) return; e.preventDefault(); if (dropId !== r.item_id) setDropId(r.item_id) }}
                  onDragLeave={() => setDropId((t) => (t === r.item_id ? null : t))}
                  onDrop={(e) => { e.preventDefault(); setDropId(null); const src = Number(e.dataTransfer.getData(DND_MIME)); if (src && src !== r.item_id) onGroupItems(src, r.item_id) }}
                  className={`${styles.dragRow} ${drop ? styles.dropHover : ''}`.trim()}>
                  <td className={styles.expandCol} />
                  <td>{r.name}<span className={styles.partNo}> · {r.part_no}{r.spec ? ` · ${r.spec}` : ''}</span></td>
                  <td className={styles.num}>{fmt(r.current)}{r.unit}</td>
                  <td className={styles.num}>
                    <input className={styles.qtyInput} type="number" min="0" step="any" disabled={busy}
                      value={idv !== undefined ? idv : r.safety_stock}
                      onChange={(e) => setIDraft((d) => ({ ...d, [r.item_id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter' && dirty) saveItemQty(r.item_id, r.name) }} />
                    {' '}{r.unit}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${r.deficit > 0 ? styles.shortage : styles.ok}`}>
                      {r.deficit > 0 ? `⚠ 부족 ${fmt(r.deficit)}${r.unit}` : `여유 ${fmt(-r.deficit)}${r.unit}`}
                    </span>
                  </td>
                  <td className={styles.actions}>
                    <button type="button" className={`btn-primary btn-sm ${styles.smallBtn}`} disabled={busy || !dirty} onClick={() => saveItemQty(r.item_id, r.name)}>저장</button>
                    <button type="button" className={`btn-text ${styles.smallBtn}`} disabled={busy} onClick={() => removeItemWatch(r)}>해제</button>
                  </td>
                </tr>
              )
            })}

            {empty && (
              <tr><td colSpan={6} className={styles.empty}>
                설정된 항목이 없습니다 — 위에서 품목을 찾아 추가하거나, 품목끼리 끌어다 묶어주세요.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager state={st} />
    </section>
  )
}

// ═══════════════ 품목 검색 (공용) ═══════════════
// 안전재고 항목 추가에서 사용 — 행 액션만 renderAction 으로 갈아끼움.
function ItemSearchBox({ title, excludeIds = [], excludeLabel = '이미 등록', busy, onError, renderAction }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)   // null = 검색 전
  const [searching, setSearching] = useState(false)
  const st = useSortPage(results || [], 'part_no', 'asc', PAGE_SIZE)

  const doSearch = async () => {
    const kw = q.trim()
    if (!kw) return
    setSearching(true)
    try {
      setResults(await searchWarehouseItems(kw, [], SEARCH_LIMIT))
    } catch (e) {
      onError(e.message || '검색 실패')
    } finally { setSearching(false) }
  }

  return (
    <div className={styles.addBox}>
      {title && <h4 className={styles.addTitle}>{title}</h4>}
      <div className={styles.addRow}>
        <input className={styles.searchInput} value={q} placeholder="품번 또는 품목명 검색"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }} />
        <button type="button" className={`btn-secondary btn-sm ${styles.smallBtn}`}
          disabled={searching} onClick={doSearch}>
          {searching ? '검색 중…' : '검색'}
        </button>
      </div>

      {results && results.length === 0 && (
        <p className={styles.hint}>검색 결과가 없습니다.</p>
      )}

      {results && results.length > 0 && (
        <>
          {results.length >= SEARCH_LIMIT && (
            <p className={styles.hint}>
              결과가 {SEARCH_LIMIT}건에서 잘렸습니다 — 찾는 품목이 없으면 검색어를 더 구체적으로 입력해주세요.
            </p>
          )}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <SortTh label="품번" sortKey="part_no" state={st} />
                  <SortTh label="품목명" sortKey="name" state={st} />
                  <SortTh label="규격" sortKey="spec" state={st} />
                  <SortTh label="단위" sortKey="unit" state={st} />
                  <th aria-label="작업" />
                </tr>
              </thead>
              <tbody>
                {st.pageRows.map((it) => (
                  <tr key={it.id}>
                    <td>{it.part_no}</td>
                    <td>{it.name || '-'}</td>
                    <td>{it.spec || '-'}</td>
                    <td>{it.unit || 'EA'}</td>
                    <td className={styles.actions}>
                      {excludeIds.includes(it.id)
                        ? <span className={styles.watched}>{excludeLabel}</span>
                        : renderAction(it)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager state={st} />
        </>
      )}
    </div>
  )
}


// 안전재고 항목 추가 — 검색 결과에서 기준값을 입력하고 바로 등록
function AddWatchItem({ busy, watchedIds, onAdded, onError }) {
  const [qty, setQty] = useState({})   // {item_id: 입력값}

  const doAdd = async (it) => {
    const raw = qty[it.id]
    const v = Number(raw)
    if (raw == null || raw === '' || Number.isNaN(v) || v < 0) {
      onError('안전재고 값을 0 이상 숫자로 입력해주세요.')
      return
    }
    try {
      const r = await setSafetyStock(it.id, v)
      onAdded(r)
      setQty((s) => { const n = { ...s }; delete n[it.id]; return n })
    } catch (e) {
      onError(e.message || '추가 실패')
    }
  }

  return (
    <section className={styles.block}>
      <ItemSearchBox
        title="안전재고 항목 추가"
        excludeIds={watchedIds}
        excludeLabel="설정됨"
        busy={busy}
        onError={onError}
        renderAction={(it) => (
          <span className={styles.inlineAdd}>
            <input className={styles.qtyInput} type="number" min="0" step="any" placeholder="기준"
              value={qty[it.id] ?? ''}
              onChange={(e) => setQty((s) => ({ ...s, [it.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') doAdd(it) }} />
            <button type="button" className={`btn-primary btn-sm ${styles.smallBtn}`}
              disabled={busy} onClick={() => doAdd(it)}>추가</button>
          </span>
        )}
      />
    </section>
  )
}
