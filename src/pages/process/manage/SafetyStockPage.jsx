// pages/process/manage/SafetyStockPage.jsx
// 안전재고 전용 설정 화면 (2026-07-28).
//   ⚠️ 품목의 다른 속성(재질·규격·타입별 스펙…)은 여기서 건드리지 않는다 — 임계값 조정과
//     현재고 대조에만 집중. 품목 마스터(ItemManagePage)의 안전재고 칸은 존치(신규 생성 시 편의).
//   현재고 = 창고 '생산(PROD)' 용도 수량 합 (예비/기타 제외) — 매일 07:00 알림 메일과 같은 기준.
//   권한: 창고 라우터와 동일(로그인) — 품목 마스터 편집권(ADMIN_BOM) 없이도 임계값만 조정 가능.
//
// 감시 두 갈래 (BE 와 동일 구조):
//   ① 묶음 — 구성 품목 재고 '합계' 기준. 자석은 같은 규격이 극성별로 쪼개져(MG-20iAZ/N/S)
//      실제 소요가 세트 단위라 합계로 봐야 의미가 있음 (사용자 요구 2026-07-28).
//   ② 품목 — Item.safety_stock 개별 기준.
import { useState, useEffect, useCallback, useMemo } from 'react'
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

const PAGE_SIZE = 15
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
  const [rows, setRows] = useState([])        // 품목 감시
  const [groups, setGroups] = useState([])    // 묶음 감시
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
    if (!srcId || !dstId || srcId === dstId || busy) return
    setBusy(true)
    try {
      const name = nextReserveName()
      await createSafetyStockGroup({ name, safety_stock: 0, item_ids: [srcId, dstId], note: '' })
      await load()
      ok(`묶음 "${name}" 생성됨 — 이름·수량을 바꿀 수 있어요.`)
    } catch (e) { err(e.message || '묶음 생성 실패') } finally { setBusy(false) }
  }

  const itemShortage = rows.filter((r) => r.deficit > 0).length
  const groupShortage = groups.filter((g) => g.is_active && g.deficit > 0).length

  return (
    <div className="page-flat">
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
          표 머리글을 누르면 그 항목으로 정렬됩니다.
        </p>

        <GroupSection
          groups={groups} busy={busy} setBusy={setBusy} loaded={loaded}
          onChanged={load} onOk={ok} onErr={err}
        />

        <ItemSection
          rows={rows} setRows={setRows} busy={busy} setBusy={setBusy} loaded={loaded}
          onOk={ok} onErr={err} onGroupItems={createGroupFromItems}
        />

        <AddWatchItem
          busy={busy}
          watchedIds={rows.map((r) => r.item_id)}
          onAdded={(row) => {
            setRows((prev) => [...prev, row])
            ok(`${row.name} 감시 대상에 추가됨`)
          }}
          onError={err}
        />
      </div>
    </div>
  )
}


// ═══════════════ 묶음(그룹) 감시 ═══════════════
function GroupSection({ groups, busy, setBusy, loaded, onChanged, onOk, onErr }) {
  const [drafts, setDrafts] = useState({})     // {group_id: 기준 입력값}
  const [openId, setOpenId] = useState(null)   // 펼친 묶음 (구성 품목)
  const [adding, setAdding] = useState(false)  // 새 묶음 폼 열림
  const [nf, setNf] = useState({ name: '', safety_stock: '' })
  const [dropGid, setDropGid] = useState(null)     // 드롭 대상 하이라이트 중인 묶음 id
  const [editName, setEditName] = useState(null)   // {id, value} — 이름 인라인 수정 중

  const st = useSortPage(groups, 'deficit', 'desc')

  // 품목을 묶음 위로 드롭 → 그 묶음에 담기
  const doDropItem = async (g, itemId) => {
    if (!itemId || busy) return
    setBusy(true)
    try {
      await addSafetyStockGroupItems(g.group_id, [itemId])
      await onChanged()
      onOk(`품목이 "${g.name}" 에 담김`)
    } catch (e) { onErr(e.message || '추가 실패') } finally { setBusy(false) }
  }

  // 묶음 이름 인라인 수정
  const startName = (g) => setEditName({ id: g.group_id, value: g.name })
  const cancelName = () => setEditName(null)
  const saveName = async (g) => {
    if (!editName || editName.id !== g.group_id) return
    const v = (editName.value || '').trim()
    if (!v || v === g.name) { cancelName(); return }
    setEditName(null)
    setBusy(true)
    try {
      await updateSafetyStockGroup(g.group_id, { name: v })
      await onChanged()
      onOk(`이름이 "${v}" 로 변경됨`)
    } catch (e) { onErr(e.message || '이름 변경 실패') } finally { setBusy(false) }
  }

  const doCreate = async () => {
    const name = nf.name.trim()
    const v = Number(nf.safety_stock)
    if (!name) { onErr('묶음 이름을 입력해주세요.'); return }
    if (nf.safety_stock === '' || Number.isNaN(v) || v < 0) { onErr('기준 수량을 0 이상 숫자로 입력해주세요.'); return }
    setBusy(true)
    try {
      const r = await createSafetyStockGroup({ name, safety_stock: v, item_ids: [], note: '' })
      await onChanged()
      setNf({ name: '', safety_stock: '' })
      setAdding(false)
      setOpenId(r.group?.group_id ?? null)   // 바로 펼쳐서 품목을 담게
      onOk(`묶음 "${name}" 생성됨 — 아래에서 품목을 담아주세요.`)
    } catch (e) { onErr(e.message || '묶음 생성 실패') } finally { setBusy(false) }
  }

  const doSave = async (g) => {
    const raw = drafts[g.group_id]
    const v = Number(raw)
    if (raw === '' || raw == null || Number.isNaN(v) || v < 0) { onErr('기준 수량을 0 이상 숫자로 입력해주세요.'); return }
    setBusy(true)
    try {
      await updateSafetyStockGroup(g.group_id, { safety_stock: v })
      await onChanged()
      setDrafts((d) => { const n = { ...d }; delete n[g.group_id]; return n })
      onOk(`${g.name} 기준 ${fmt(v)}${g.unit} 저장됨`)
    } catch (e) { onErr(e.message || '저장 실패') } finally { setBusy(false) }
  }

  const doToggleActive = async (g) => {
    setBusy(true)
    try {
      await updateSafetyStockGroup(g.group_id, { is_active: !g.is_active })
      await onChanged()
    } catch (e) { onErr(e.message || '변경 실패') } finally { setBusy(false) }
  }

  const doDelete = async (g) => {
    if (!window.confirm(`묶음 "${g.name}" 을(를) 삭제할까요?\n구성 품목의 개별 안전재고 설정은 그대로 남습니다.`)) return
    setBusy(true)
    try {
      await deleteSafetyStockGroup(g.group_id)
      await onChanged()
      onOk(`묶음 "${g.name}" 삭제됨`)
    } catch (e) { onErr(e.message || '삭제 실패') } finally { setBusy(false) }
  }

  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle}>묶음 감시 <span className={styles.watched}>구성 품목 재고 합계 기준</span></h3>
        <button type="button" className={`btn-secondary btn-sm ${styles.smallBtn}`}
          disabled={busy} onClick={() => setAdding((v) => !v)}>
          {adding ? '취소' : '묶음 추가'}
        </button>
      </div>

      {adding && (
        <div className={styles.addRow}>
          <input className={styles.searchInput} value={nf.name} placeholder="묶음 이름 (예: Φ20 자석 극성 합계)"
            onChange={(e) => setNf((f) => ({ ...f, name: e.target.value }))} />
          <input className={styles.qtyInput} type="number" min="0" step="any" placeholder="기준"
            value={nf.safety_stock}
            onChange={(e) => setNf((f) => ({ ...f, safety_stock: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') doCreate() }} />
          <button type="button" className={`btn-primary btn-sm ${styles.smallBtn}`}
            disabled={busy} onClick={doCreate}>생성</button>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.expandCol} aria-label="펼치기" />
              <SortTh label="묶음" sortKey="name" state={st} />
              <SortTh label="품목수" sortKey="member_count" state={st} align="right" />
              <SortTh label="현재고 합계" sortKey="current" state={st} align="right" />
              <SortTh label="안전재고" sortKey="safety_stock" state={st} align="right" />
              <SortTh label="상태" sortKey="deficit" state={st} />
              <th aria-label="작업" />
            </tr>
          </thead>
          <tbody>
            {st.pageRows.map((g) => {
              const draft = drafts[g.group_id]
              const dirty = draft !== undefined && String(draft) !== String(g.safety_stock)
              const open = openId === g.group_id
              return [
                <tr key={g.group_id}
                  className={`${g.is_active ? '' : styles.inactive} ${dropGid === g.group_id ? styles.dropHover : ''}`.trim() || undefined}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes(DND_MIME)) return
                    e.preventDefault()
                    if (dropGid !== g.group_id) setDropGid(g.group_id)
                  }}
                  onDragLeave={() => setDropGid((x) => (x === g.group_id ? null : x))}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDropGid(null)
                    const src = Number(e.dataTransfer.getData(DND_MIME))
                    if (src) doDropItem(g, src)
                  }}>
                  <td className={styles.expandCol}>
                    <button type="button" className={styles.expandBtn}
                      onClick={() => setOpenId(open ? null : g.group_id)}>{open ? '▾' : '▸'}</button>
                  </td>
                  <td>
                    {editName && editName.id === g.group_id ? (
                      <input className={styles.nameInput} autoFocus disabled={busy}
                        value={editName.value}
                        onChange={(e) => setEditName((s) => ({ ...s, value: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveName(g)
                          else if (e.key === 'Escape') cancelName()
                        }}
                        onBlur={() => saveName(g)} />
                    ) : (
                      <button type="button" className={styles.nameEditBtn} title="이름 수정"
                        disabled={busy} onClick={() => startName(g)}>{g.name}</button>
                    )}
                    {!g.is_active && <span className={styles.watched}> · 감시 꺼짐</span>}
                    {g.unit_mixed && <span className={styles.shortage}> · ⚠ 단위 불일치</span>}
                  </td>
                  <td className={styles.num}>{g.member_count}</td>
                  <td className={styles.num}>{fmt(g.current)}{g.unit}</td>
                  <td className={styles.num}>
                    <input className={styles.qtyInput} type="number" min="0" step="any" disabled={busy}
                      value={draft !== undefined ? draft : g.safety_stock}
                      onChange={(e) => setDrafts((d) => ({ ...d, [g.group_id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter' && dirty) doSave(g) }} />
                    {' '}{g.unit}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${g.deficit > 0 ? styles.shortage : styles.ok}`}>
                      {g.deficit > 0 ? `⚠ 부족 ${fmt(g.deficit)}${g.unit}` : `여유 ${fmt(-g.deficit)}${g.unit}`}
                    </span>
                  </td>
                  <td className={styles.actions}>
                    <button type="button" className={`btn-primary btn-sm ${styles.smallBtn}`}
                      disabled={busy || !dirty} onClick={() => doSave(g)}>저장</button>
                    <button type="button" className={`btn-text ${styles.smallBtn}`}
                      disabled={busy} onClick={() => doToggleActive(g)}>{g.is_active ? '감시 끄기' : '감시 켜기'}</button>
                    <button type="button" className={`btn-text ${styles.smallBtn}`}
                      disabled={busy} onClick={() => doDelete(g)}>삭제</button>
                  </td>
                </tr>,
                open && (
                  <tr key={`${g.group_id}-d`}>
                    <td colSpan={7} className={styles.detailCell}>
                      <GroupMembers group={g} busy={busy} setBusy={setBusy}
                        onChanged={onChanged} onOk={onOk} onErr={onErr} />
                    </td>
                  </tr>
                ),
              ]
            })}
            {loaded && groups.length === 0 && (
              <tr><td colSpan={7} className={styles.empty}>
                묶음이 없습니다 — 자석 극성 계열처럼 합계로 봐야 하는 자재가 있으면 "묶음 추가" 로 만들어주세요.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager state={st} />
    </section>
  )
}


// 묶음 구성 품목 — 목록 + 제거 + 품목 담기
function GroupMembers({ group, busy, setBusy, onChanged, onOk, onErr }) {
  const doRemove = async (m) => {
    setBusy(true)
    try {
      await removeSafetyStockGroupItem(group.group_id, m.item_id)
      await onChanged()
    } catch (e) { onErr(e.message || '제거 실패') } finally { setBusy(false) }
  }
  const doAdd = async (it) => {
    setBusy(true)
    try {
      await addSafetyStockGroupItems(group.group_id, [it.id])
      await onChanged()
      onOk(`${it.name || it.part_no} → "${group.name}" 에 담김`)
    } catch (e) { onErr(e.message || '추가 실패') } finally { setBusy(false) }
  }

  return (
    <div>
      {group.members.length === 0 ? (
        <p className={styles.hint}>담긴 품목이 없습니다 — 아래에서 검색해 담아주세요. (합계 0 으로 계산됩니다)</p>
      ) : (
        <ul className={styles.memberList}>
          {group.members.map((m) => (
            <li key={m.item_id} className={styles.memberItem}>
              <span className={styles.grow}>
                {m.name}<span className={styles.partNo}> · {m.part_no}{m.spec ? ` · ${m.spec}` : ''}</span>
              </span>
              <span className={styles.watched}>{fmt(m.current)}{m.unit}</span>
              <button type="button" className={`btn-text ${styles.smallBtn}`}
                disabled={busy} onClick={() => doRemove(m)}>제거</button>
            </li>
          ))}
        </ul>
      )}
      <ItemSearchBox
        title="이 묶음에 품목 담기"
        excludeIds={group.members.map((m) => m.item_id)}
        excludeLabel="이미 담김"
        busy={busy}
        onError={onErr}
        renderAction={(it) => (
          <button type="button" className={`btn-primary btn-sm ${styles.smallBtn}`}
            disabled={busy} onClick={() => doAdd(it)}>담기</button>
        )}
      />
    </div>
  )
}


// ═══════════════ 품목 감시 ═══════════════
const DND_MIME = 'application/x-ss-item'   // 드래그 페이로드 = 품목 id

function ItemSection({ rows, setRows, busy, setBusy, loaded, onOk, onErr, onGroupItems }) {
  const [drafts, setDrafts] = useState({})
  const [dropId, setDropId] = useState(null)   // 드롭 대상으로 하이라이트 중인 품목 id
  const st = useSortPage(rows, 'deficit', 'desc')

  const doSave = async (row) => {
    const raw = drafts[row.item_id]
    const v = Number(raw)
    if (raw === '' || raw == null || Number.isNaN(v)) { onErr('안전재고 값을 숫자로 입력해주세요.'); return }
    if (v < 0) { onErr('안전재고는 0 이상으로 입력해주세요.'); return }
    setBusy(true)
    try {
      const r = await setSafetyStock(row.item_id, v)
      // 응답이 곧 갱신된 행 (현재고·부족분 재계산 포함) — 전체 재조회 없이 그 행만 교체
      setRows((prev) => prev.map((x) => (x.item_id === row.item_id ? { ...x, ...r } : x)))
      setDrafts((d) => { const n = { ...d }; delete n[row.item_id]; return n })
      onOk(`${row.name} 안전재고 ${fmt(v)}${row.unit} 저장됨`)
    } catch (e) { onErr(e.message || '저장 실패') } finally { setBusy(false) }
  }

  const doRemove = async (row) => {
    if (!window.confirm(`${row.name} 을(를) 안전재고 감시에서 제외할까요?\n제외하면 부족해도 알림이 가지 않습니다.`)) return
    setBusy(true)
    try {
      await setSafetyStock(row.item_id, null)
      setRows((prev) => prev.filter((x) => x.item_id !== row.item_id))
      onOk(`${row.name} 감시 해제됨`)
    } catch (e) { onErr(e.message || '해제 실패') } finally { setBusy(false) }
  }

  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle}>품목 감시 <span className={styles.watched}>품목별 개별 기준</span></h3>
        <span className={styles.dndHint}>품목을 다른 품목·묶음 위로 끌어다 놓으면 묶음이 됩니다</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortTh label="품목" sortKey="name" state={st} />
              <SortTh label="품번" sortKey="part_no" state={st} />
              <SortTh label="규격" sortKey="spec" state={st} />
              <SortTh label="현재고" sortKey="current" state={st} align="right" />
              <SortTh label="안전재고" sortKey="safety_stock" state={st} align="right" />
              <SortTh label="상태" sortKey="deficit" state={st} />
              <th aria-label="작업" />
            </tr>
          </thead>
          <tbody>
            {st.pageRows.map((r) => {
              const draft = drafts[r.item_id]
              const dirty = draft !== undefined && String(draft) !== String(r.safety_stock)
              return (
                <tr key={r.item_id}
                  draggable={!busy}
                  onDragStart={(e) => {
                    // 수량 입력·버튼에서 시작한 드래그는 무시 (입력 방해 방지)
                    if (e.target.closest('input, button')) { e.preventDefault(); return }
                    e.dataTransfer.effectAllowed = 'copy'
                    e.dataTransfer.setData(DND_MIME, String(r.item_id))
                  }}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes(DND_MIME)) return
                    e.preventDefault()
                    if (dropId !== r.item_id) setDropId(r.item_id)
                  }}
                  onDragLeave={() => setDropId((t) => (t === r.item_id ? null : t))}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDropId(null)
                    const src = Number(e.dataTransfer.getData(DND_MIME))
                    if (src && src !== r.item_id) onGroupItems(src, r.item_id)
                  }}
                  className={`${styles.dragRow} ${dropId === r.item_id ? styles.dropHover : ''}`.trim()}>
                  <td>{r.name}</td>
                  <td className={styles.partNo}>{r.part_no}</td>
                  <td>{r.spec || '-'}</td>
                  <td className={styles.num}>{fmt(r.current)}{r.unit}</td>
                  <td className={styles.num}>
                    <input className={styles.qtyInput} type="number" min="0" step="any" disabled={busy}
                      value={draft !== undefined ? draft : r.safety_stock}
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.item_id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter' && dirty) doSave(r) }} />
                    {' '}{r.unit}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${r.deficit > 0 ? styles.shortage : styles.ok}`}>
                      {r.deficit > 0 ? `⚠ 부족 ${fmt(r.deficit)}${r.unit}` : `여유 ${fmt(-r.deficit)}${r.unit}`}
                    </span>
                  </td>
                  <td className={styles.actions}>
                    <button type="button" className={`btn-primary btn-sm ${styles.smallBtn}`}
                      disabled={busy || !dirty} onClick={() => doSave(r)}>저장</button>
                    <button type="button" className={`btn-text ${styles.smallBtn}`}
                      disabled={busy} onClick={() => doRemove(r)}>해제</button>
                  </td>
                </tr>
              )
            })}
            {loaded && rows.length === 0 && (
              <tr><td colSpan={7} className={styles.empty}>
                설정된 품목이 없습니다 — 아래에서 품목을 찾아 안전재고를 지정해주세요.
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
// 감시 대상 추가 / 묶음에 품목 담기 두 곳에서 씀 — 행 액션만 renderAction 으로 갈아끼움.
function ItemSearchBox({ title, excludeIds = [], excludeLabel = '이미 등록', busy, onError, renderAction }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)   // null = 검색 전
  const [searching, setSearching] = useState(false)
  const st = useSortPage(results || [], 'part_no', 'asc', 10)

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


// 감시 대상 추가 — 검색 결과에서 기준값을 입력하고 바로 등록
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
        title="감시 대상 추가 (품목별 기준)"
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
