// pages/process/manage/BomManagePage.jsx
// 제품 BOM — 표준 PLM (2026-05-19 재구조화) · Toss flat (모달 X, 페이지 내 뷰 전환)
//
// 정체 = Part 하나. BOM = "적용 품목(parent Part)" 의 구성문서.
//   라인 = 자식 Part 선택 + 수량 (식별/규격/단가는 Part 가 제공 — 자유텍스트/하위BOM 없음)
//   재귀: 자식 Part 가 자기 BOM 을 가지면 트리에서 자동 전개
// view: list | editor | tree | log

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  getBoms, getBom, getBomTree,
  createBom, updateBom, deleteBom, hardDeleteBom,
  deriveBom, releaseBom, unreleaseBom, resyncBom, getBomResyncPreview,
  closeBom, reopenBom,
  getItems, getBomVersionLog, bumpBomMajor,
  getSubstituteGroups,
  getItemCategoryTree,
} from '@/api'
import { useViewHistorySync } from '@/hooks/useViewHistorySync'
import { useToast } from '@/contexts/ToastContext'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import BomTypeBadge from '@/components/common/BomTypeBadge'
import { flattenTree, composeFullCode } from '@/utils/categoryTree'
import s from './BomManagePage.module.css'
import BomResyncPreview from './BomResyncPreview'

const EMPTY_HEADER = {
  parent_part_id: null, bom_type: 'EBOM',  // 2026-05-20: PLM 타입 (EBOM/MBOM/SBOM)
  label: '', is_default: false, applied_date: '',
  author: '', approver: '', reviewer: '', notes: '', display_order: 999,
}
// substitute_group_id = 이 라인의 대체품 그룹 (재사용 마스터). null = 대체품 없음.
//   그룹 자체는 '대체품 그룹' 관리 페이지에서 — 여기선 드롭다운으로 선택만 (2026-05-22).
// role = 이 라인의 역할 (예: PCB의 "Ground", "VCC") — 비고와 분리된 식별용 별칭 (2026-05-26)
const EMPTY_ITEM = { seq: 0, part_id: null, quantity: 1, role: '', remark: '', substitute_group_id: null }
const EMPTY_REV = { no: 1, revised_date: '', reason: '', circulation: [] }

// readOnly: true 면 모든 액션(추가/편집/PLM 전이/삭제 등) 숨김 — BomViewPage 가 wrapper 로 사용 (2026-05-26)
export default function BomManagePage({ onBack, readOnly = false }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [items, setItems] = useState([])
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')   // '' = 전체 (EBOM/MBOM/SBOM, 2026-05-20)
  const [showInactive, setShowInactive] = useState(false)
  const [view, setView] = useState({ mode: 'list' })
  // 행 단위 더보기(▶) 토글 — PLM 전이/종결/삭제 액션은 펼쳤을 때만 노출 (2026-05-21)
  //   popover 는 position:fixed + 동적 좌표 — tableWrap 의 overflow 영향 X (잘림 방지).
  //   상태 = {id, top, right} | null. 한 번에 한 행만 펼침.
  const [openActions, setOpenActions] = useState(null)
  const toggleActions = (e, id) => {
    if (openActions?.id === id) { setOpenActions(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    setOpenActions({
      id,
      top: r.bottom + 4,
      right: window.innerWidth - r.right,
    })
  }
  // 외부 클릭 / 스크롤 / 리사이즈 시 popover 자동 닫기
  useEffect(() => {
    if (openActions === null) return
    const onMouseDown = (e) => {
      // popover 자체와 ▶ 버튼 둘 다 무시
      if (e.target.closest(`.${s.actExtraGroup}`)) return
      if (e.target.closest(`.${s.actMore}`)) return
      setOpenActions(null)
    }
    const onScrollOrResize = () => setOpenActions(null)
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [openActions])
  // 브라우저 뒤로가기 ↔ view.mode 동기화 (훅으로 분리, 2026-05-21).
  useViewHistorySync(view.mode, setView, 'bom-modal')

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
  // 분류 트리 (2026-05-26) — 리스트 적용 품목번호 풀 식별코드 합성용.
  const [catTree, setCatTree] = useState([])
  const loadCats = useCallback(
    () => getItemCategoryTree(true).then(setCatTree).catch(() => setCatTree([])),
    [],
  )
  useEffect(() => { reload() }, [reload])
  useEffect(() => { loadParts() }, [loadParts])
  useEffect(() => { loadCats() }, [loadCats])

  // 적용 품목 풀 식별코드(F-ASD-0012A)·규격 lookup — parts × catTree 합성 (2026-05-26).
  const { byId: catById, parentOf: catParentOf } = useMemo(
    () => flattenTree(catTree), [catTree],
  )
  const partByPartNo = useMemo(() => {
    const m = {}
    for (const p of parts) if (p.part_no) m[p.part_no] = p
    return m
  }, [parts])

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
            quantity: it.quantity,
            role: it.role || '',          // 역할 로드 (2026-05-27 누락 fix)
            remark: it.remark || '',
            // 대체품 그룹 — 응답의 FK id 보존, 저장 시 그대로 전송 (2026-05-22)
            substitute_group_id: it.substitute_group_id || null,
          })),
          _revisions: (b.revisions || []).map((r) => ({
            ...r, revised_date: r.revised_date || '', circulation: r.circulation || [],
          })),
        },
      })
    } catch (e) { toast(e.message, 'error') }
  }

  // PLM 정석 체인 (2026-05-21): EBOM → MBOM, MBOM(확정) → SBOM
  // 종결(EOD/EOM) 출처에서도 파생 가능 — frozen 설계로 신규 제조/서비스
  const handleDerive = async (source, targetType) => {
    const tLabel = targetType === 'MBOM' ? '제조 BOM (MBOM)' : '서비스 BOM (SBOM)'
    const sLabel = source.bom_type === 'EBOM' ? '설계 BOM (EBOM)' : '제조 BOM (MBOM)'
    const frozenMsg = source.closed_at
      ? `\n⚠ 출처는 이미 종결(${({EBOM:'EOD',MBOM:'EOM'})[source.bom_type] || 'CLOSED'})된 frozen 설계입니다.\n   파생본 source_ver = v${source.version || '1.0'} 으로 고정 (이후 STALE 안 뜸).\n`
      : ''
    if (!await confirm({
      title: `${tLabel} 파생`,
      message:
        `${source.code} 의 ${sLabel} v${source.version || '1.0'} 에서 ${tLabel} 을 파생할까요?\n` +
        frozenMsg +
        `\n· 출처 항목이 그대로 복제됩니다 (INHERITED)\n` +
        `· 새 ${tLabel} 은 "작성중(DRAFT)" 상태로 생성\n` +
        `· 부자재/소모품 추가하고 "확정" 누르면 정식 사용 가능`,
      confirmText: '파생',
    })) return
    try {
      const saved = await deriveBom(source.id, targetType)
      reload()
      if (saved?.warnings?.length) toast(`파생됨 (경고): ${saved.warnings.join(', ')}`, 'warn')
      else toast(`${tLabel} 파생 완료`, 'success')
    } catch (e) { toast(e.message, 'error') }
  }
  const handleRelease = async (b) => {
    if (!await confirm({
      title: 'BOM 확정',
      message: `${b.code} ${b.bom_type}(v${b.version}) 을 확정할까요?\n생산계획·작업지시에서 사용 가능 상태가 됩니다.`,
      confirmText: '확정',
    })) return
    try { await releaseBom(b.id); reload(); toast('확정되었습니다', 'success') }
    catch (e) { toast(e.message, 'error') }
  }
  const handleUnrelease = async (b) => {
    if (!await confirm({
      title: '확정 회수',
      message: `${b.code} ${b.bom_type}(v${b.version}) 확정을 회수할까요?\nDRAFT 로 돌아가 다시 수정 가능 상태가 됩니다.`,
      confirmText: '회수',
    })) return
    try { await unreleaseBom(b.id); reload(); toast('확정이 회수되었습니다', 'success') }
    catch (e) { toast(e.message, 'error') }
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
    if (!reason.trim()) { toast('종결 사유는 필수입니다.', 'warn'); return }
    try {
      const saved = await closeBom(b.id, reason.trim())
      reload()
      // BE 가 STALE derived 등 경고를 응답에 담아 보냄 (2026-05-21)
      if (saved?.warnings?.length) toast(`종결됨 (경고): ${saved.warnings.join(', ')}`, 'warn')
      else toast('종결 처리되었습니다', 'success')
    } catch (e) { toast(e.message, 'error') }
  }
  const handleReopen = async (b) => {
    if (!await confirm({
      title: '종결 해제',
      message: `${b.code} ${b.bom_type}(v${b.version}) 종결을 해제할까요?`,
      confirmText: '해제',
    })) return
    try { await reopenBom(b.id); reload(); toast('종결이 해제되었습니다', 'success') }
    catch (e) { toast(e.message, 'error') }
  }

  // Phase 4 (2026-05-21) — 출처(EBOM 또는 MBOM) 와 3-way merge 동기화
  // 2026-05-21 수정: 즉시 적용 X — 미리보기 뷰로 진입 → diff 확인 후 적용
  const handleResync = (b) => {
    setView({ mode: 'resyncPreview', bom: b })
  }

  const handleDelete = async (b) => {
    if (!await confirm({
      title: 'BOM 비활성화',
      message: `'${b.code}' BOM 을 비활성화할까요?\n목록에서 숨겨지지만 데이터는 보존됩니다.`,
      confirmText: '비활성화',
    })) return
    try { await deleteBom(b.id); reload(); toast('비활성화되었습니다', 'success') }
    catch (e) { toast(e.message, 'error') }
  }
  const handleHardDelete = async (b) => {
    if (!await confirm({
      title: 'BOM 완전 삭제',
      message: `'${b.code}' BOM 을 완전 삭제합니다. 되돌릴 수 없습니다.\n(적용 품목 자체는 보존됩니다)`,
      confirmText: '완전 삭제',
      danger: true,
      requireText: b.code,
    })) return
    try { await hardDeleteBom(b.id); reload(); toast('완전 삭제되었습니다', 'success') }
    catch (e) { toast(e.message, 'error') }
  }

  // readOnly 모드면 editor 진입 자체를 차단 — top-level 버튼은 이미 숨김(추가 방어, 2026-05-26).
  //   콘솔/state 조작으로 view.mode='editor' 강제 진입해도 list 로 자연 fall-through.
  if (view.mode === 'editor' && !readOnly) {
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
        <PageHeader title={`버전 이력 — ${view.bom.code}`} subtitle="이 BOM 의 변경 기록 (자동 + 수동)" onBack={backToList} />
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
      <PageHeader
        title={readOnly ? 'BOM 조회' : '제품 BOM'}
        subtitle={readOnly ? '읽기 전용 · 수정 불가' : '적용 품목별 구성 명세 · 다단계 · 개정 이력'}
        onBack={onBack}
      />

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
        <button type="button" className="btn-secondary btn-md" onClick={() => reload()}
          title="목록 새로고침">↻ 새로고침</button>
        {!readOnly && (
          <button type="button" className="btn-primary btn-md" onClick={openNew}>+ 새 BOM</button>
        )}
      </div>

      {loading && <p className={s.info}>로딩 중...</p>}
      {error && <p className={s.err}>{error}</p>}

      {!loading && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>유형</th>
                <th>적용 품목번호</th><th>제품/품목명</th><th>규격</th><th>변형</th><th>버전</th>
                <th>적용일</th><th>구성품</th><th>작성</th><th>상태</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={11} className={s.empty}>등록된 BOM 이 없어요.</td></tr>
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
                      <td colSpan={11}>
                        <span className={s.sectionHeaderText}>
                          {g.label} <span className={s.sectionHeaderCount}>{g.items.length}</span>
                        </span>
                      </td>
                    </tr>
                    {g.items.map((b) => (
                <tr key={b.id} className={b.is_active ? '' : s.inactiveRow}>
                  {/* 유형 = bom_type 배지만. 종결(EOD/EOM/EOS)·STALE 상태 배지는
                      별도 "상태" 컬럼(액션 버튼 바로 앞)으로 분리 (2026-05-21). */}
                  <td>
                    <BomTypeBadge type={b.bom_type} mode="type" />
                  </td>
                  {/* 적용 품목번호 — 풀 식별코드 (분류 약자+part_no+예비+기타) (2026-05-26) */}
                  <td className={s.mono}>
                    {composeFullCode(partByPartNo[b.code] || { part_no: b.code }, catById, catParentOf)}
                  </td>
                  <td>{b.name || '-'}</td>
                  {/* 규격 — 적용 품목의 spec (2026-05-26). parts 매칭 안 되면 '-' */}
                  <td>{partByPartNo[b.code]?.spec || '-'}</td>
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
                        title={`대체품 그룹이 지정된 라인 ${b.alt_total}개`}>
                        🔁{b.alt_total}
                      </span>
                    )}
                  </td>
                  <td>{b.author || '-'}</td>
                  {/* 상태 = 종결(EOD/EOM/EOS) · STALE 배지 — 액션 버튼 바로 앞 (2026-05-21) */}
                  <td className={s.statusCell}>
                    <BomTypeBadge
                      type={b.bom_type}
                      mode="status"
                      closedAt={b.closed_at}
                      closedReason={b.closed_reason}
                      syncState={b.sync_state}
                    />
                  </td>
                  <td className={s.actions}>
                    {/* 공통(항상 노출): 트리/이력/편집 */}
                    <button type="button" className={s.act} onClick={() => setView({ mode: 'tree', id: b.id })}>트리</button>
                    <button type="button" className={s.act} onClick={() => setView({ mode: 'log', bom: b })}>이력</button>
                    {!readOnly && (
                      <button type="button" className={s.act} onClick={() => openEdit(b.id)}>편집</button>
                    )}
                    {/* 더보기 토글 — PLM 전이/종결/삭제 액션은 ▶ 뒤로 숨김 (2026-05-21).
                        readOnly 모드에서는 모든 PLM 액션이 숨겨지므로 토글 자체를 안 렌더 (2026-05-26) */}
                    {!readOnly && (
                      <button type="button" className={s.actMore}
                        title="PLM 전이/종결/삭제 액션"
                        onClick={(e) => toggleActions(e, b.id)}>
                        {openActions?.id === b.id ? '◀' : '▶'}
                      </button>
                    )}
                    {!readOnly && openActions?.id === b.id && (
                      <span className={s.actExtraGroup}
                        style={{ top: openActions.top, right: openActions.right }}>
                        {/* 정석 체인 (2026-05-21): 활성 행이면 노출 (종결 EOD/EOM 출처도 frozen 으로 파생 가능) */}
                        {b.is_active && (b.bom_type === 'EBOM' || !b.bom_type) && (
                          <button type="button" className={s.act}
                            title={b.closed_at
                              ? '종결된 설계 BOM(EBOM) — frozen 으로 제조 BOM(MBOM) 파생'
                              : '이 설계 BOM(EBOM)에서 제조 BOM(MBOM) 파생'}
                            onClick={() => handleDerive(b, 'MBOM')}>MBOM 생성</button>
                        )}
                        {b.is_active && b.bom_type === 'MBOM' && b.status === 'RELEASED' && (
                          <button type="button" className={s.act}
                            title={b.closed_at
                              ? '종결된 제조 BOM(MBOM) — frozen 으로 서비스 BOM(SBOM) 파생'
                              : '이 확정 제조 BOM(MBOM)에서 서비스 BOM(SBOM) 파생'}
                            onClick={() => handleDerive(b, 'SBOM')}>SBOM 생성</button>
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
                            style={{ color: 'var(--color-danger-dark)', borderColor: 'var(--color-danger-border-light)' }}
                            title="출처 EBOM 과 3-way merge 동기화"
                            onClick={() => handleResync(b)}>동기화</button>
                        )}
                        {/* Phase 종결 (EOD/EOM/EOS) — 활성+미종결만 종결 가능 / 종결 시 재개 (2026-05-21) */}
                        {b.is_active && !b.closed_at && (b.bom_type === 'EBOM' || b.status === 'RELEASED') && (
                          <button type="button" className={s.act}
                            style={{ color: 'var(--color-warning-dark)', borderColor: 'var(--color-warning-border-light)' }}
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
  const toast = useToast()
  const isNew = !editing.id
  const [h, setH] = useState(editing)
  const [rows, setRows] = useState(editing._items || [])
  const [revs, setRevs] = useState(editing._revisions || [])
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')
  // 대체품 그룹 목록 — 라인 드롭다운 선택지 (재사용 마스터, 2026-05-22)
  const [subGroups, setSubGroups] = useState([])
  useEffect(() => {
    getSubstituteGroups(true).then(setSubGroups).catch(() => setSubGroups([]))
  }, [])

  const set = (k, v) => setH((p) => ({ ...p, [k]: v }))
  const setRow = (i, k, v) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const addRow = () => setRows((p) => [...p, { ...EMPTY_ITEM, seq: p.length }])
  const delRow = (i) => setRows((p) => p.filter((_, idx) => idx !== i))
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
        quantity: Number(r.quantity) || 0,
        role: (r.role || '').trim(),       // 역할 (2026-05-26)
        remark: r.remark || '',
        // 대체품 그룹 — 선택된 그룹 FK id (없으면 null). BE 가 유효성 검증 (2026-05-22)
        substitute_group_id: r.substitute_group_id ? Number(r.substitute_group_id) : null,
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
      if (saved?.warnings?.length) toast(`저장됨 (경고): ${saved.warnings.join(', ')}`, 'warn')
      else toast(isNew ? 'BOM 이 생성되었습니다' : '저장되었습니다', 'success')
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
            표준 BOM 으로 설정
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
              <th>규격</th><th>제조사</th><th>단위</th><th>수량</th><th>단가</th>
              <th>역할</th><th>비고</th><th>대체품 그룹</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              // EBOM = live 우선(가격 변경 즉시 반영), 파생(M/SBOM) = snapshot 우선(frozen)
              const p = partForDisplay(r)
              return (
                <tr key={i}>
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
                  {/* 역할 — 비고와 분리된 식별용 별칭 (예: Ground, VCC) (2026-05-26) */}
                  <td>
                    <input
                      value={r.role || ''}
                      maxLength={60}
                      placeholder="예: Ground"
                      onChange={(e) => setRow(i, 'role', e.target.value)}
                    />
                  </td>
                  <td><input value={r.remark} onChange={(e) => setRow(i, 'remark', e.target.value)} /></td>
                  {/* 대체품 그룹 — 재사용 마스터에서 드롭다운 선택만 (2026-05-22) */}
                  <td>
                    <select value={r.substitute_group_id ?? ''}
                      onChange={(e) => setRow(i, 'substitute_group_id', e.target.value || null)}>
                      <option value="">(없음)</option>
                      {subGroups.map((g) => (
                        <option key={g.id} value={g.id}>🔁 {g.name}</option>
                      ))}
                    </select>
                  </td>
                  <td><button type="button" className={s.delRow} onClick={() => delRow(i)}>✕</button></td>
                </tr>
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
        {/* 이 노드 금액이 어느 BOM(타입/버전) 기준인지 — 파생 BOM 은 snapshot,
            깊은 sub-assembly 는 그 BOM 의 현재값이라 출처를 명시 (2026-05-21) */}
        {node.is_assembly && node.sub_bom_type && (
          <>
            <BomTypeBadge type={node.sub_bom_type} mode="type" />
            {node.sub_bom_version && <span className={s.ro}>v{node.sub_bom_version}</span>}
          </>
        )}
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
  const toast = useToast()
  const confirm = useConfirm()
  const [logs, setLogs] = useState(null)
  const [err, setErr] = useState('')
  const [bumping, setBumping] = useState(false)

  useEffect(() => { getBomVersionLog(bom.id).then(setLogs).catch((e) => setErr(e.message)) }, [bom.id])

  const doBumpMajor = async () => {
    if (!await confirm({
      title: '정식 버전 올리기',
      message:
        `'${bom.code}' 의 정식 버전을 한 단계 올릴까요?\n` +
        `· 큰 자리 +1 (예: v1.3 → v2.0)\n` +
        `· 자동 반영으로 쌓인 작은 변경 이력(.x) 은 0 으로 초기화됩니다.\n` +
        `· 보통 의미 있는 설계 변경/승인 완료 후 누릅니다.`,
      confirmText: '버전 올리기',
    })) return
    setBumping(true)
    try { await bumpBomMajor(bom.id); onBumped(); toast('정식 버전이 올라갔습니다', 'success') }
    catch (e) { toast(e.message, 'error') }
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
          {bumping ? '처리 중...' : '정식 개정 발행 (큰 자리 ↑)'}
        </button>
      </div>
      {err && <p className={s.err}>{err}</p>}
      {!logs && !err && <p className={s.info}>불러오는 중...</p>}
      {logs && logs.length === 0 && <p className={s.info}>버전 변경 이력이 없습니다.</p>}
      {logs && logs.length > 0 && (
        <div className={s.treeWrap}>
          {Object.entries(grouped).map(([eid, rs]) => {
            // event 묶음의 첫 row 가 대표 (kind/reason/source_ref/details 모두 동일). 2026-05-21
            const head = rs[0]
            const details = head.details || []
            return (
              <div key={eid} className={s.logEvent}>
                <div className={s.logTop}>
                  <span className={s.verBadge}>v{head.version}</span>
                  <span className={s.logKind} data-kind={head.kind}>
                    {head.kind === 'manual' ? '정식 개정' : '자동 반영'}
                  </span>
                  <span className={s.logSrc}>← {head.source_ref}</span>
                  <span className={s.treeSum}>{fmtKst(head.created_at)}</span>
                </div>
                <div className={s.logReason}>
                  {head.reason}{rs.length > 1 ? ` · ${rs.length}개 BOM 전파` : ''}
                </div>
                {details.length > 0 && (
                  <ul className={s.logDetailsList}>
                    {details.map((d, i) => (
                      <li key={i} className={s.logDetailItem}>
                        {renderDetail(d)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

const fmtWon = (v) =>
  v == null ? '-' : `₩${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`

// 버전이력 details 한 줄 렌더 — type/field 별 사람 친화 출력 (2026-05-21)
function renderDetail(d) {
  const label = d.field_label || d.field || '필드'
  if (d.type === 'price_change') {
    const before = d.before == null ? '미설정' : fmtWon(d.before)
    const after = d.after == null ? '미설정' : fmtWon(d.after)
    const diff = (d.before != null && d.after != null) ? (Number(d.after) - Number(d.before)) : null
    const pct = (d.before && diff != null) ? ((diff / Number(d.before)) * 100) : null
    const sign = diff == null ? '' : (diff > 0 ? '▲' : (diff < 0 ? '▼' : '='))
    const diffText = diff == null
      ? ''
      : ` (${sign} ${fmtWon(Math.abs(diff))}${pct != null ? `, ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : ''})`
    return (
      <>
        <span style={{ fontWeight: 700 }}>{label}</span>{' '}
        <span style={{ color: 'var(--color-text-sub)' }}>{before}</span>{' → '}
        <span style={{ fontWeight: 700 }}>{after}</span>
        <span style={{ color: diff > 0 ? 'var(--color-warning-mid)' : (diff < 0 ? 'var(--color-success-dark)' : 'var(--color-text-sub)'), marginLeft: 6 }}>
          {diffText}
        </span>
      </>
    )
  }
  // 일반 필드 변경
  return (
    <>
      <span style={{ fontWeight: 700 }}>{label}</span>{' '}
      <span style={{ color: 'var(--color-text-sub)' }}>{String(d.before ?? '')}</span>{' → '}
      <span style={{ fontWeight: 700 }}>{String(d.after ?? '')}</span>
    </>
  )
}

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
