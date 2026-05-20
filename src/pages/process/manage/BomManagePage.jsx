// pages/process/manage/BomManagePage.jsx
// 제품 BOM — 표준 PLM (2026-05-19 재구조화) · Toss flat (모달 X, 페이지 내 뷰 전환)
//
// 정체 = Part 하나. BOM = "적용 품목(parent Part)" 의 구성문서.
//   라인 = 자식 Part 선택 + 수량 (식별/규격/단가는 Part 가 제공 — 자유텍스트/하위BOM 없음)
//   재귀: 자식 Part 가 자기 BOM 을 가지면 트리에서 자동 전개
// view: list | editor | tree | log

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '@/components/common/PageHeader'
import {
  getBoms, getBom, getBomTree,
  createBom, updateBom, deleteBom, hardDeleteBom,
  deriveBom, releaseBom, unreleaseBom, resyncBom, getBomResyncPreview,
  closeBom, reopenBom,
  getItems, getBomVersionLog, bumpBomMajor,
} from '@/api'
import s from './BomManagePage.module.css'
import BomResyncPreview from './BomResyncPreview'

const EMPTY_HEADER = {
  parent_part_id: null, bom_type: 'EBOM',  // 2026-05-20: PLM 타입 (EBOM/MBOM/SBOM)
  label: '', is_default: false, applied_date: '',
  author: '', approver: '', reviewer: '', notes: '', display_order: 999,
}
// alternates = 같은 자리에 사용 가능한 동등품 그룹 (AVL — Approved Vendor List, 2026-05-21)
//   primary = part_id, alternates 는 추가 후보. SNBT 가 실제 소비분 기록.
const EMPTY_ITEM = { seq: 0, part_id: null, quantity: 1, remark: '', alternates: [] }
const EMPTY_REV = { no: 1, revised_date: '', reason: '', circulation: [] }

export default function BomManagePage({ onBack }) {
  const [items, setItems] = useState([])
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')   // '' = 전체 (EBOM/MBOM/SBOM, 2026-05-20)
  const [showInactive, setShowInactive] = useState(false)
  const [view, setView] = useState({ mode: 'list' })
  // 행 단위 더보기(▶) 토글 — PLM 전이/종결/삭제 액션은 펼쳤을 때만 노출 (2026-05-21)
  // 한 번에 한 행만 펼침 (단일 id 보관). popover 는 absolute 로 떠서 행 너비 영향 X.
  const [openActions, setOpenActions] = useState(null)
  const toggleActions = (id) => setOpenActions((p) => (p === id ? null : id))
  // 외부 클릭 시 popover 자동 닫기
  useEffect(() => {
    if (openActions === null) return
    const handler = (e) => {
      if (!e.target.closest(`.${s.actions}`)) setOpenActions(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openActions])
  // 브라우저 뒤로가기 동기화 — react-router useSearchParams 기반 (2026-05-21).
  //   view.mode 가 non-list 가 되면 URL search 에 ?v=mode 추가 (history push 자동)
  //   사용자가 뒤로가기 → URL search 변화 → useEffect 가 감지해서 view 도 list 로 동기
  //   react-router 가 popstate listener 관리 — 직접 등록 X (충돌 방지)
  //   data/bom 객체 prefetch 패턴 유지 — URL 직접 진입 미지원, 뒤로가기만 보장
  const [sp, setSp] = useSearchParams()
  const syncSpRef = useRef(false)
  useEffect(() => {
    if (syncSpRef.current) { syncSpRef.current = false; return }
    const urlMode = sp.get('v') || 'list'
    if (view.mode === urlMode) return
    const next = new URLSearchParams(sp)
    if (view.mode === 'list') next.delete('v')
    else next.set('v', view.mode)
    setSp(next)
  }, [view.mode])
  useEffect(() => {
    const urlMode = sp.get('v') || 'list'
    if (urlMode === view.mode) return
    syncSpRef.current = true
    if (urlMode === 'list') {
      setView({ mode: 'list' })
      reload()
    } else if (view.mode === 'list') {
      const next = new URLSearchParams(sp)
      next.delete('v')
      setSp(next, { replace: true })
    }
  }, [sp])

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems(await getBoms(!showInactive, filter.trim(), typeFilter)) }
    catch (e) { setError(e.message || 'BOM 목록 로드 실패') }
    finally { setLoading(false) }
  }, [showInactive, filter, typeFilter])

  // 품목 단가/스펙은 Part 가 단일 진실원천(BOM 은 스냅샷 안 함) — 편집기 진입마다
  // 재조회해야 최신 단가가 보임. 마운트 1회 로드만 하면 가격 변경이 안 비침.
  const loadParts = useCallback(
    () => getItems(true).then(setParts).catch(() => setParts([])),
    [],
  )
  useEffect(() => { reload() }, [reload])
  useEffect(() => { loadParts() }, [loadParts])

  const partLabel = (id) => {
    const p = parts.find((x) => x.id === id)
    return p ? `${p.part_no}${p.name ? ` · ${p.name}` : ''}` : `#${id}`
  }
  const backToList = () => { setView({ mode: 'list' }); reload() }

  const openNew = () => {
    loadParts()
    setView({
      mode: 'editor',
      data: { ...EMPTY_HEADER, _items: [{ ...EMPTY_ITEM }], _revisions: [] },
    })
  }
  const openEdit = async (id) => {
    try {
      loadParts()
      const b = await getBom(id)
      setView({
        mode: 'editor',
        data: {
          ...b,
          applied_date: b.applied_date || '',
          // it.part = BE 가 방금 Part 에서 라이브 계산한 단가/스펙 — 표시 폴백용 보존
          _items: (b.items || []).map((it) => ({
            seq: it.seq, part_id: it.part_id, _part: it.part,
            quantity: it.quantity, remark: it.remark || '',
            // 동등품 그룹 (AVL) — 응답에서 보존, 저장 시 그대로 전송 (2026-05-21)
            alternates: (it.alternates || []).map((a) => ({
              part_id: a.part_id, _part: a.part,
              seq: a.seq || 0, eqv_note: a.eqv_note || '',
            })),
          })),
          _revisions: (b.revisions || []).map((r) => ({
            ...r, revised_date: r.revised_date || '', circulation: r.circulation || [],
          })),
        },
      })
    } catch (e) { alert(e.message) }
  }

  // PLM 정석 체인 (2026-05-21): EBOM → MBOM, MBOM(확정) → SBOM
  // 종결(EOD/EOM) 출처에서도 파생 가능 — frozen 설계로 신규 제조/서비스
  const handleDerive = async (source, targetType) => {
    const tLabel = targetType === 'MBOM' ? '제조 BOM (MBOM)' : '서비스 BOM (SBOM)'
    const sLabel = source.bom_type === 'EBOM' ? '설계 BOM (EBOM)' : '제조 BOM (MBOM)'
    const frozenMsg = source.closed_at
      ? `\n⚠ 출처는 이미 종결(${({EBOM:'EOD',MBOM:'EOM'})[source.bom_type] || 'CLOSED'})된 frozen 설계입니다.\n   파생본 source_ver = v${source.version || '1.0'} 으로 고정 (이후 STALE 안 뜸).\n`
      : ''
    if (!confirm(
      `${source.code} 의 ${sLabel} v${source.version || '1.0'} 에서 ${tLabel} 을 파생할까요?\n` +
      frozenMsg +
      `\n· 출처 항목이 그대로 복제됩니다 (INHERITED)\n` +
      `· 새 ${tLabel} 은 "작성중(DRAFT)" 상태로 생성\n` +
      `· 부자재/소모품 추가하고 "확정" 누르면 정식 사용 가능`,
    )) return
    try {
      const saved = await deriveBom(source.id, targetType)
      reload()
      if (saved?.warnings?.length) alert(`파생됨 (경고):\n\n${saved.warnings.join('\n')}`)
    } catch (e) { alert(e.message) }
  }
  const handleRelease = async (b) => {
    if (!confirm(`${b.code} ${b.bom_type}(v${b.version}) 을 확정할까요?\n생산계획·작업지시에서 사용 가능 상태가 됩니다.`)) return
    try { await releaseBom(b.id); reload() } catch (e) { alert(e.message) }
  }
  const handleUnrelease = async (b) => {
    if (!confirm(`${b.code} ${b.bom_type}(v${b.version}) 확정을 회수할까요?\nDRAFT 로 돌아가 다시 수정 가능 상태가 됩니다.`)) return
    try { await unreleaseBom(b.id); reload() } catch (e) { alert(e.message) }
  }
  // Phase 종결 (EOD/EOM/EOS) — bom_type 으로 라벨 계산 (2026-05-21)
  const PHASE_CLOSE_LABEL = { EBOM: 'EOD (설계 종료)', MBOM: 'EOM (제조 종료)', SBOM: 'EOS (서비스 종료)' }
  const handleClose = async (b) => {
    const phase = PHASE_CLOSE_LABEL[b.bom_type] || '종결'
    const reason = prompt(
      `${b.code} ${b.bom_type}(v${b.version}) 을 ${phase} 처리합니다.\n\n` +
      `종결 사유를 입력하세요 (audit 용, 필수):`,
      '',
    )
    if (reason == null) return            // 취소
    if (!reason.trim()) { alert('종결 사유는 필수입니다.'); return }
    try {
      const saved = await closeBom(b.id, reason.trim())
      reload()
      // BE 가 STALE derived 등 경고를 응답에 담아 보냄 (2026-05-21)
      if (saved?.warnings?.length) alert(`종결됨 (경고):\n\n${saved.warnings.join('\n')}`)
    } catch (e) { alert(e.message) }
  }
  const handleReopen = async (b) => {
    if (!confirm(`${b.code} ${b.bom_type}(v${b.version}) 종결을 해제할까요?`)) return
    try { await reopenBom(b.id); reload() } catch (e) { alert(e.message) }
  }

  // Phase 4 (2026-05-21) — 출처(EBOM 또는 MBOM) 와 3-way merge 동기화
  // 2026-05-21 수정: 즉시 적용 X — 미리보기 뷰로 진입 → diff 확인 후 적용
  const handleResync = (b) => {
    setView({ mode: 'resyncPreview', bom: b })
  }

  const handleDelete = async (b) => {
    if (!confirm(`'${b.code}' BOM 비활성화할까요?`)) return
    try { await deleteBom(b.id); reload() } catch (e) { alert(e.message) }
  }
  const handleHardDelete = async (b) => {
    if (!confirm(`'${b.code}' BOM 완전 삭제할까요? (품목은 보존)`)) return
    try { await hardDeleteBom(b.id); reload() } catch (e) { alert(e.message) }
  }

  if (view.mode === 'editor') {
    return (
      <div className="page-flat">
        <PageHeader
          title={view.data.id ? `BOM 편집 — ${view.data.code}` : '새 BOM'}
          subtitle="적용 품목(Item) 의 구성 명세 · 다단계 트리"
          onBack={backToList}
        />
        <BomEditor editing={view.data} allParts={parts}
          onCancel={backToList} onSaved={backToList} />
      </div>
    )
  }
  if (view.mode === 'tree') {
    return (
      <div className="page-flat">
        <PageHeader title="BOM 트리" subtitle="Part 재귀 전개 · 금액 roll-up" onBack={backToList} />
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
  // Phase 4.1 (2026-05-21) — 동기화 미리보기 → 적용 분리 뷰
  if (view.mode === 'resyncPreview') {
    return (
      <BomResyncPreview
        bom={view.bom}
        onBack={backToList}
        onApplied={backToList}
      />
    )
  }

  return (
    <div className="page-flat">
      <PageHeader title="제품 BOM" subtitle="적용 품목별 구성 명세 · 다단계 · 개정 이력" onBack={onBack} />

      <div className={s.toolbar}>
        <input className={s.search} placeholder="품목번호 / 제품명 검색"
          value={filter} onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && reload()} />
        {/* BOM 타입 필터 — 2026-05-20 */}
        <select className={s.catSel || ''} value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid var(--color-border)',
                   borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
                   background: 'var(--color-surface)' }}>
          <option value="">전체 BOM 타입</option>
          <option value="EBOM">설계 BOM (EBOM)</option>
          <option value="MBOM">제조 BOM (MBOM)</option>
          <option value="SBOM">서비스 BOM (SBOM)</option>
        </select>
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
                <th>유형</th>
                <th>적용 품목번호</th><th>제품/품목명</th><th>변형</th><th>버전</th>
                <th>적용일</th><th>구성품</th><th>작성</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={9} className={s.empty}>등록된 BOM 이 없어요.</td></tr>
              ) : (() => {
                // 작성중 (M/SBOM DRAFT) / 확정 (EBOM 항상 + M/SBOM RELEASED) 두 섹션 분리 (2026-05-20)
                const drafts = items.filter((b) =>
                  (b.bom_type === 'MBOM' || b.bom_type === 'SBOM') && b.status === 'DRAFT',
                )
                const released = items.filter((b) => !drafts.includes(b))
                const groups = []
                if (drafts.length) groups.push({ label: '작성중', items: drafts, key: 'draft' })
                if (released.length) groups.push({ label: '확정', items: released, key: 'released' })
                return groups.map((g) => (
                  <Fragment key={g.key}>
                    <tr className={s.sectionHeaderRow}>
                      <td colSpan={9}>
                        <span className={s.sectionHeaderText}>
                          {g.label} <span className={s.sectionHeaderCount}>{g.items.length}</span>
                        </span>
                      </td>
                    </tr>
                    {g.items.map((b) => (
                <tr key={b.id} className={b.is_active ? '' : s.inactiveRow}>
                  {/* 유형 = bom_type 배지. DRAFT 배지 제거 (2026-05-21) — "작성중" 섹션 그룹이
                      이미 시각적으로 분리해주므로 행 배지 중복 노이즈 제거. */}
                  <td>
                    <span className={`${s.typeBadge} ${s[`type${b.bom_type}`] || ''}`}>
                      {b.bom_type || 'EBOM'}
                    </span>
                    {/* Phase 종결 — closed_at != NULL 이면 bom_type 으로 EOD/EOM/EOS 표시 (2026-05-21) */}
                    {b.closed_at && (
                      <span className={s.closedBadge}
                        title={`${b.closed_reason || '종결됨'} (${b.closed_at.slice(0,10)})`}>
                        {({ EBOM: 'EOD', MBOM: 'EOM', SBOM: 'EOS' })[b.bom_type] || 'CLOSED'}
                      </span>
                    )}
                    {b.sync_state === 'STALE' && !b.closed_at && (
                      <span className={s.staleBadge} title="출처 BOM 변경됨 — 동기화 검토 필요">변경 내역 확인 요망</span>
                    )}
                  </td>
                  <td className={s.mono}>{b.code}</td>
                  <td>{b.name || '-'}</td>
                  <td>
                    {b.label || <span className={s.ro}>-</span>}
                    {b.is_default && <span className={s.defBadge}>표준</span>}
                  </td>
                  <td><span className={s.verBadge}>v{b.version || '1.0'}</span></td>
                  <td className={s.dateCell}>{b.applied_date || '-'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {b.item_count}
                    {b.alt_total > 0 && (
                      <span className={s.altCountBadge}
                        title={`동등품(AVL) 총 ${b.alt_total}개 등록됨`}>
                        +{b.alt_total}
                      </span>
                    )}
                  </td>
                  <td>{b.author || '-'}</td>
                  <td className={s.actions}>
                    {/* 공통(항상 노출): 트리/이력/편집 */}
                    <button type="button" className={s.act} onClick={() => setView({ mode: 'tree', id: b.id })}>트리</button>
                    <button type="button" className={s.act} onClick={() => setView({ mode: 'log', bom: b })}>이력</button>
                    <button type="button" className={s.act} onClick={() => openEdit(b.id)}>편집</button>
                    {/* 더보기 토글 — PLM 전이/종결/삭제 액션은 ▶ 뒤로 숨김 (2026-05-21) */}
                    <button type="button" className={s.actMore}
                      title="PLM 전이/종결/삭제 액션"
                      onClick={() => toggleActions(b.id)}>
                      {openActions === b.id ? '◀' : '▶'}
                    </button>
                    {openActions === b.id && (
                      <span className={s.actExtraGroup}>
                        {/* 정석 체인 (2026-05-21): 활성 행이면 노출 (종결 EOD/EOM 출처도 frozen 으로 파생 가능) */}
                        {b.is_active && (b.bom_type === 'EBOM' || !b.bom_type) && (
                          <button type="button" className={s.act}
                            title={b.closed_at
                              ? '종결된 설계 BOM(EBOM) — frozen 으로 제조 BOM(MBOM) 파생'
                              : '이 설계 BOM(EBOM)에서 제조 BOM(MBOM) 파생'}
                            onClick={() => handleDerive(b, 'MBOM')}>→ 제조 BOM</button>
                        )}
                        {b.is_active && b.bom_type === 'MBOM' && b.status === 'RELEASED' && (
                          <button type="button" className={s.act}
                            title={b.closed_at
                              ? '종결된 제조 BOM(MBOM) — frozen 으로 서비스 BOM(SBOM) 파생'
                              : '이 확정 제조 BOM(MBOM)에서 서비스 BOM(SBOM) 파생'}
                            onClick={() => handleDerive(b, 'SBOM')}>→ 서비스 BOM</button>
                        )}
                        {b.is_active && !b.closed_at && (b.bom_type === 'MBOM' || b.bom_type === 'SBOM') && b.status === 'DRAFT' && (
                          <button type="button" className={s.actPrimary || s.act}
                            style={{ color: 'var(--color-success, #1f9d55)', borderColor: 'var(--color-success, #1f9d55)' }}
                            title="작성중 → 확정 (생산/서비스 사용 가능)"
                            onClick={() => handleRelease(b)}>확정</button>
                        )}
                        {b.is_active && !b.closed_at && (b.bom_type === 'MBOM' || b.bom_type === 'SBOM') && b.status === 'RELEASED' && (
                          <button type="button" className={s.actWarn} title="확정 → 작성중 회수"
                            onClick={() => handleUnrelease(b)}>회수</button>
                        )}
                        {/* Phase 4 — STALE 파생에 동기화 (종결 BOM 은 가림) */}
                        {b.is_active && !b.closed_at && b.sync_state === 'STALE' && (b.bom_type === 'MBOM' || b.bom_type === 'SBOM') && (
                          <button type="button" className={s.act}
                            style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                            title="출처 EBOM 과 3-way merge 동기화"
                            onClick={() => handleResync(b)}>동기화</button>
                        )}
                        {/* Phase 종결 (EOD/EOM/EOS) — 활성+미종결만 종결 가능 / 종결 시 재개 (2026-05-21) */}
                        {b.is_active && !b.closed_at && (b.bom_type === 'EBOM' || b.status === 'RELEASED') && (
                          <button type="button" className={s.act}
                            style={{ color: '#7c2d12', borderColor: '#fde68a' }}
                            title={`${({ EBOM:'설계 종료(EOD)', MBOM:'제조 종료(EOM)', SBOM:'서비스 종료(EOS)' })[b.bom_type] || '종결'} — 사유 필수`}
                            onClick={() => handleClose(b)}>
                            {({ EBOM: '설계 종료', MBOM: '제조 종료', SBOM: '서비스 종료' })[b.bom_type] || '종결'}
                          </button>
                        )}
                        {b.is_active && b.closed_at && (
                          <button type="button" className={s.act}
                            title="종결 해제 — 다시 활성 상태로"
                            onClick={() => handleReopen(b)}>재개</button>
                        )}
                        {b.is_active
                          ? <button type="button" className={s.actWarn} onClick={() => handleDelete(b)}>비활성</button>
                          : <button type="button" className={s.actDanger} onClick={() => handleHardDelete(b)}>완전삭제</button>}
                      </span>
                    )}
                  </td>
                </tr>
                    ))}
                  </Fragment>
                ))
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════
// 편집 (인라인) — 적용 Part + 자식 Part 라인 + 개정이력
// ════════════════════════════════════════════
function BomEditor({ editing, allParts = [], onCancel, onSaved }) {
  const isNew = !editing.id
  const [h, setH] = useState(editing)
  const [rows, setRows] = useState(editing._items || [])
  const [revs, setRevs] = useState(editing._revisions || [])
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  const set = (k, v) => setH((p) => ({ ...p, [k]: v }))
  const setRow = (i, k, v) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const addRow = () => setRows((p) => [...p, { ...EMPTY_ITEM, seq: p.length, alternates: [] }])
  const delRow = (i) => setRows((p) => p.filter((_, idx) => idx !== i))
  // 동등품(AVL) 조작 — primary part_id 와 이미 추가된 part 는 옵션에서 자동 제외 (2026-05-21)
  const addAlt = (i, partIdStr) => {
    if (!partIdStr) return
    const partId = Number(partIdStr)
    setRows((p) => p.map((r, idx) => idx === i
      ? { ...r, alternates: [...(r.alternates || []), { part_id: partId, seq: (r.alternates || []).length, eqv_note: '' }] }
      : r))
  }
  const removeAlt = (i, ai) => {
    setRows((p) => p.map((r, idx) => idx === i
      ? { ...r, alternates: (r.alternates || []).filter((_, k) => k !== ai) }
      : r))
  }
  const setAltNote = (i, ai, note) => {
    setRows((p) => p.map((r, idx) => idx === i
      ? { ...r, alternates: (r.alternates || []).map((a, k) => k === ai ? { ...a, eqv_note: note } : a) }
      : r))
  }
  const setRev = (i, k, v) => setRevs((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const addRev = () => setRevs((p) => [...p, { ...EMPTY_REV, no: p.length + 1 }])
  const delRev = (i) => setRevs((p) => p.filter((_, idx) => idx !== i))

  const partById = (id) => allParts.find((x) => String(x.id) === String(id))
  // 적용 품목 자신은 자식 후보에서 제외 (즉시 자기참조 방지 — 깊은 사이클은 BE 409)
  // select onChange 가 e.target.value(string)로 넣으므로 String() 비교 필수
  // (number !== string 이면 가드가 무효). partById 와 동일 패턴.
  const childOpts = allParts.filter((p) => String(p.id) !== String(h.parent_part_id))
  // 파생 BOM 의 단가/스펙은 BomItem snapshot 우선 (resync 전까지 frozen — 정석 PLM, 2026-05-21)
  //   EBOM 편집: live (Item.unit_price 최신) — 설계 원본
  //   M/SBOM 편집: BE 가 보낸 r._part (snapshot_first 적용된 brief) 우선 — 변경 내역 확인 후 동기화
  const isDerivedBom = editing.bom_type && editing.bom_type !== 'EBOM'
  const partForDisplay = (r) => (
    isDerivedBom
      ? (r._part || partById(r.part_id))
      : (partById(r.part_id) || r._part)
  )

  const save = async () => {
    if (!h.parent_part_id) { setFormErr('적용 품목(Item)을 선택하세요.'); return }
    if (rows.some((r) => !r.part_id)) { setFormErr('모든 구성품 라인에 품목을 선택하세요.'); return }
    setSaving(true); setFormErr('')
    const payload = {
      parent_part_id: Number(h.parent_part_id),
      // bom_type 은 생성 시에만 전달 (BE BomUpdate 가 이 필드 없음 — 불변, 2026-05-20)
      ...(isNew ? { bom_type: h.bom_type || 'EBOM' } : {}),
      label: h.label || '',
      is_default: !!h.is_default,
      applied_date: h.applied_date || null,
      author: h.author, approver: h.approver, reviewer: h.reviewer,
      notes: h.notes, display_order: Number(h.display_order) || 999,
      items: rows.map((r, i) => ({
        seq: i, part_id: Number(r.part_id),
        quantity: Number(r.quantity) || 0, remark: r.remark || '',
        // 동등품(AVL) — primary 와 동일 part / 빈 part 는 BE 가 스킵 (2026-05-21)
        alternates: (r.alternates || [])
          .filter((a) => a.part_id && Number(a.part_id) !== Number(r.part_id))
          .map((a, ai) => ({
            part_id: Number(a.part_id),
            seq: Number(a.seq) || ai,
            eqv_note: (a.eqv_note || '').slice(0, 200),
          })),
      })),
      revisions: revs.map((r) => ({
        no: Number(r.no) || 1, revised_date: r.revised_date || null,
        reason: r.reason || '',
        circulation: Array.isArray(r.circulation) ? r.circulation
          : String(r.circulation || '').split(',').map((x) => x.trim()).filter(Boolean),
      })),
    }
    try {
      const saved = isNew
        ? await createBom(payload)
        : await updateBom(editing.id, payload)
      if (saved?.warnings?.length) alert(`저장됨 (경고):\n\n${saved.warnings.join('\n')}`)
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
        {/* BOM 타입 — 생성 시만 선택 가능, 이후 불변 (2026-05-20) */}
        <Field label={`BOM 타입${isNew ? ' *' : ' (불변)'}`}>
          <select value={h.bom_type || 'EBOM'}
            onChange={(e) => set('bom_type', e.target.value)}
            disabled={!isNew}>
            <option value="EBOM">설계 BOM (EBOM)</option>
            <option value="MBOM">제조 BOM (MBOM)</option>
            <option value="SBOM">서비스 BOM (SBOM)</option>
          </select>
        </Field>
        {/* 적용 품목 — 생성 시만 선택 가능, 이후 불변 (2026-05-21).
            바꾸려면 그 BOM 자체가 잘못된 거 → 비활성 후 신규 생성. */}
        <Field label={`적용 품목 (Item)${isNew ? ' *' : ' (불변)'}`}>
          <select value={h.parent_part_id ?? ''}
            onChange={(e) => set('parent_part_id', e.target.value || null)}
            disabled={!isNew}>
            <option value="">(선택)</option>
            {allParts.map((p) => (
              <option key={p.id} value={p.id}>{p.part_no}{p.name ? ` · ${p.name}` : ''}</option>
            ))}
          </select>
        </Field>
        <Field label="변형 라벨"><input value={h.label} placeholder="예: 구성 A / B사 품목" onChange={(e) => set('label', e.target.value)} /></Field>
        <Field label="표준 BOM">
          <label className={s.chkInline}>
            <input type="checkbox" checked={!!h.is_default} onChange={(e) => set('is_default', e.target.checked)} />
            현재 표준 BOM
          </label>
        </Field>
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
              <th>#</th><th>품목 (Item) *</th><th>품목번호</th><th>품목명</th>
              <th>규격</th><th>제조사</th><th>단위</th><th>수량</th><th>단가</th><th>비고</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              // EBOM = live 우선(가격 변경 즉시 반영), 파생(M/SBOM) = snapshot 우선(frozen)
              const p = partForDisplay(r)
              const alts = r.alternates || []
              // 동등품 후보 = 전체 부품 - 적용품목 - primary - 이미 추가된 동등품
              const altUsed = new Set([
                String(h.parent_part_id), String(r.part_id),
                ...alts.map((a) => String(a.part_id)),
              ])
              const altOpts = allParts.filter((x) => !altUsed.has(String(x.id)))
              return (
                <Fragment key={i}>
                <tr>
                  <td>{i + 1}</td>
                  <td>
                    <select value={r.part_id ?? ''} onChange={(e) => setRow(i, 'part_id', e.target.value || null)}>
                      <option value="">(선택)</option>
                      {childOpts.map((c) => (
                        <option key={c.id} value={c.id}>{c.part_no}{c.name ? ` · ${c.name}` : ''}</option>
                      ))}
                    </select>
                  </td>
                  <td className={s.ro}>{p?.part_no || '-'}</td>
                  <td className={s.ro}>{p?.name || '-'}</td>
                  <td className={s.ro}>{p?.spec || '-'}</td>
                  <td className={s.ro}>{p?.manufacturer_name || '-'}</td>
                  <td className={s.ro}>{p?.unit || '-'}</td>
                  <td className={s.tiny}><input type="number" value={r.quantity} onChange={(e) => setRow(i, 'quantity', e.target.value)} /></td>
                  <td className={s.ro}>{p?.unit_price != null ? p.unit_price.toLocaleString() : '-'}</td>
                  <td><input value={r.remark} onChange={(e) => setRow(i, 'remark', e.target.value)} /></td>
                  <td><button type="button" className={s.delRow} onClick={() => delRow(i)}>✕</button></td>
                </tr>
                {/* 동등품(AVL) 서브행 — 같은 자리에 사용 가능한 후보 (2026-05-21) */}
                <tr className={s.altSubRow}>
                  <td></td>
                  <td colSpan={10} className={s.altCell}>
                    <span className={s.altLabel}>동등품 (AVL)</span>
                    {alts.map((a, ai) => {
                      const ap = partById(a.part_id) || a._part
                      const apLabel = ap
                        ? `${ap.part_no}${ap.name ? ` · ${ap.name}` : ''}`
                        : `#${a.part_id}`
                      return (
                        <span className={s.altChip} key={ai} title={ap?.spec || ''}>
                          <span className={s.altChipText}>{apLabel}</span>
                          <input
                            className={s.altChipNote}
                            placeholder="동등성 근거"
                            value={a.eqv_note || ''}
                            onChange={(e) => setAltNote(i, ai, e.target.value)}
                          />
                          <button
                            type="button"
                            className={s.altChipX}
                            title="동등품 제거"
                            onClick={() => removeAlt(i, ai)}
                          >×</button>
                        </span>
                      )
                    })}
                    {r.part_id ? (
                      <select
                        className={s.altAddSel}
                        value=""
                        onChange={(e) => { addAlt(i, e.target.value); e.target.value = '' }}
                      >
                        <option value="">+ 동등품 추가</option>
                        {altOpts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.part_no}{c.name ? ` · ${c.name}` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={s.altHint}>primary 부품을 먼저 선택하세요</span>
                    )}
                  </td>
                </tr>
                </Fragment>
              )
            })}
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
// 트리뷰 (Part 재귀)
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
      <div className={s.treeWrap}><TreeNode node={data.tree} /></div>
    </>
  )
}

function TreeNode({ node }) {
  if (!node) return null
  const lvl = node.level || 1
  return (
    <div>
      <div className={node.is_assembly ? s.treeBom : s.treeItem} style={{ paddingLeft: (lvl - 1) * 18 }}>
        <span className={s.lvl}>{'.'.repeat(lvl - 1)}{lvl}</span>
        <span className={s.pno}>{node.part_no}</span>
        <span>{node.name || ''}</span>
        {node.quantity != null && <span className={s.qty}>×{node.quantity}</span>}
        {node.cycle && <span className={s.cycle}>⚠ 순환</span>}
        <span className={s.treeSum}>{fmtWon(node.rolled_price)}</span>
      </div>
      {(node.items || []).map((c, i) => <TreeNode key={i} node={c} />)}
    </div>
  )
}

// ════════════════════════════════════════════
// 버전 이력 (인라인) — event 묶음 + 정식개정
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
                <span className={s.treeSum}>{fmtKst(rs[0].created_at)}</span>
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

// created_at 은 UTC(+00:00, use_tz=True) 로 옴 — 슬라이스 말고 KST 로 변환해 표시.
// 기기 시간대와 무관하게 항상 KST 고정.
const fmtKst = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
