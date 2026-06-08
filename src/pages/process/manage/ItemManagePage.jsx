// pages/process/manage/ItemManagePage.jsx
// 품목 마스터 ("사물 사전") — Toss flat: 모달 X, 페이지 내 뷰 전환 (2026-05-19, team_rnd 전용)
//
// view: list | editor(신규/수정 — 사진 포함) | category(분류 트리 관리)
//   분류 = 관리형 트리(대>중>소). 기능별·공정무관. 공급사 = Company 마스터 재사용.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  hardDeleteItem,
  uploadItemPhoto,
  getItemPhotoUrl,
  deleteItemPhoto,
  listItemAttachments,
  uploadItemAttachment,
  getItemAttachmentUrl,
  deleteItemAttachment,
  getCompanies,
  getItemWhereUsed,
  getItemCategoryTree,
  createItemCategory,
  updateItemCategory,
  deleteItemCategory,
} from '@/api'
import { useViewHistorySync } from '@/hooks/useViewHistorySync'
import { useColWidths } from '@/hooks/useColWidths'
import { useToast } from '@/contexts/ToastContext'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import { flattenTree, pathOf, flatOptions, composeFullCode } from '@/utils/categoryTree'
import BomTypeBadge from '@/components/common/BomTypeBadge'
// 이미지 자동 압축 + 업로드 에러 메시지 변환 (2026-05-26)
import {
  downscaleImageIfNeeded, parseUploadError, isImageFile,
} from '@/utils/imageCompress'
import s from './ItemManagePage.module.css'

// 클라이언트 측 업로드 한도 — BE 한도(사진 10MB / 첨부 20MB)보다 살짝 작게 잡아 nginx/네트워크 마진 확보
const PHOTO_MAX_BYTES  = 9 * 1024 * 1024
const ATTACH_MAX_BYTES = 18 * 1024 * 1024

const EMPTY = {
  part_no: '',
  name: '',
  material: '',
  spec: '',
  manufacturer_id: null,
  supplier_id: null,
  purchase_link: '',
  unit: 'EA',
  unit_qty: 1, // 단위당 수량(입수) — 2026-05-20. 기본 1.
  unit_price: null, // 원가 (구매·외주). FG/SEMI 는 보통 NULL — BOM 자식 합이 진실.
  sale_price: null, // 판매가 (FG 외부 판매 시). BOM 계산 무관. (2026-05-20)
  notes: '',
  lifecycle: 'ACTIVE',
  category_id: null,
  display_order: 999,
  // 내부 식별코드 컴포넌트 (사진1, 2026-05-23)
  external_code: '', // 외부 부품코드 (옛 part_no 의미)
  reserved: '', // 예비번호 (1자) — 식별코드 일부, 있을 때만 자동 채번에 포함
  etc: '', // 기타 (3자) — 식별코드 일부, 있을 때만 자동 채번에 포함
}

// 단위 프리셋 (2026-05-20) — datalist 타입어헤드 후보. 기존 품목들이 쓴 단위가 자동으로 합쳐짐.
//   자유 입력 허용 (프리셋 외 새 단위 입력 시 그대로 저장 → 다음 진입부터 후보로 노출됨).
const UNIT_PRESETS = [
  'EA',
  '개',
  'pcs',
  'set',
  'kg',
  'g',
  'mg',
  'ton',
  'L',
  'mL',
  'm',
  'cm',
  'mm',
  'km',
  '장',
  '롤',
  '묶음',
  'box',
]

// 품목 수명주기 — BE models/meta/item.py 와 동기 (2026-05-20 4-state 확장)
//   ACTIVE → EOM(생산중단) → EOS(판매중단) → EOD(단종, 옛 EOL 대체)
const LIFECYCLE = [
  { v: 'ACTIVE', label: '양산', cls: 'lcActive' },
  { v: 'EOM', label: '생산중단', cls: 'lcEom' },
  { v: 'EOS', label: '판매중단', cls: 'lcEos' },
  { v: 'EOD', label: '단종', cls: 'lcEod' },
]
// 옛 EOL → EOD 자동 매핑 (DB 마이그 전 응답 안전망)
const lcOf = (v) => {
  if (v === 'EOL') v = 'EOD'
  return LIFECYCLE.find((x) => x.v === v) || LIFECYCLE[0]
}
const isInactive = (v) => v === 'EOD' || v === 'EOL' // EOL 호환

// 품목번호 — 사용자가 4자리 숫자 직접 입력, 1→0001 관대 padding (2026-05-26).
// 숫자 외 문자는 제거. 빈 값은 빈 값 유지(중복검사 트리거 안 함).
const pad4PartNo = (v) => {
  const digits = String(v ?? '').replace(/\D/g, '')
  return digits ? digits.padStart(4, '0') : ''
}

// composeFullCode → utils/categoryTree.js 로 이동 (2026-05-26) — BomManagePage 와 공통 사용.

// ── 컬럼 너비 드래그 — hooks/useColWidths 로 분리 (2026-05-21) ──
// 목록 표 10컬럼: 품목번호/품목명/분류/재질/제조사/공급사/단가/상태/구매/(액션)
// v2 (2026-05-26) — 11컬럼: 품목번호/품목명/규격/분류/재질/제조사/공급사/단가/상태/구매/액션
const COLW_KEY = 'itemMaster.colW.v2'
const COLW_DEFAULT = [9, 14, 8, 11, 8, 10, 10, 7, 7, 6, 10] // 합 100(%), 11컬럼

export default function ItemManagePage({ onBack }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [items, setItems] = useState([])
  const [companies, setCompanies] = useState([])
  const [catTree, setCatTree] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [catFilter, setCatFilter] = useState('') // '' = 전체 분류 (id)
  const [view, setView] = useState({ mode: 'list' }) // list | editor | category
  // 정렬 (2026-05-27) — 컬럼 헤더 클릭 토글. 같은 키 재클릭 시 asc↔desc.
  //   품목번호는 특별 — 대분류 약자 → 중분류 약자 → 숫자 part_no 순 복합 키.
  const [sortKey, setSortKey] = useState('partNo')
  const [sortDir, setSortDir] = useState('asc')   // 'asc' | 'desc'
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }
  // 목록 표 컬럼 너비 (엑셀식 드래그, localStorage 기억) — 2026-05-20
  const {
    tableRef,
    widths: colW,
    startResize,
  } = useColWidths({
    storageKey: COLW_KEY,
    defaults: COLW_DEFAULT,
  })
  // 브라우저 뒤로가기 ↔ view.mode 동기화 (훅으로 분리, 2026-05-21).
  useViewHistorySync(view.mode, setView, 'item-modal')

  const loadCats = useCallback(
    () =>
      getItemCategoryTree(true)
        .then(setCatTree)
        .catch(() => setCatTree([])),
    [],
  )
  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [pp, comps] = await Promise.all([
        getItems(!showInactive, filter.trim(), catFilter),
        getCompanies(true)
          .then((r) => r.companies || r || [])
          .catch(() => []),
      ])
      setItems(pp)
      setCompanies(Array.isArray(comps) ? comps : [])
    } catch (e) {
      setError(e.message || '품목 목록 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [showInactive, filter, catFilter])

  useEffect(() => {
    reload()
  }, [reload])
  useEffect(() => {
    loadCats()
  }, [loadCats])

  const supplierName = (id) => companies.find((c) => c.id === id)?.name || '-'
  // 제조사도 공급사와 동일 — Company 마스터에서 이름 해석 (FK, 2026-05-19)
  const manufacturerName = (id) => companies.find((c) => c.id === id)?.name || '-'
  // 카테고리 트리 인덱스 — list 표시에서 풀 식별코드 합성 (2026-05-26)
  const { byId: catById, parentOf: catParentOf } = useMemo(
    () => flattenTree(catTree), [catTree],
  )

  // 품목번호 복합 정렬 키 — 대분류 약자(1자) | 중분류 약자(5자) | 숫자(8자 zero-pad) (2026-05-27)
  //   빈 약자는 '~' 로 채워 정렬 맨 뒤로 (사용자가 분류 안 지정한 품목은 아래로).
  const partNoSortKey = (item) => {
    let lvl1Code = ''
    let lvl2Code = ''
    let cur = item.category_id
    let g = 0
    while (cur != null && catById[cur] && g < 8) {
      const node = catById[cur]
      if (node.level === 1) lvl1Code = node.code || ''
      else if (node.level === 2) lvl2Code = node.code || ''
      cur = catParentOf[cur]
      g += 1
    }
    const num = parseInt(item.part_no || '0', 10) || 0
    return `${(lvl1Code || '~').padEnd(1, '~')}|${(lvl2Code || '~~~~~').padEnd(5, '~')}|${String(num).padStart(8, '0')}`
  }

  // 정렬된 items (2026-05-27) — sortKey/sortDir/items/catTree/companies 의존
  const sortedItems = useMemo(() => {
    if (!items?.length) return items || []
    // 각 컬럼별 정렬 키 (raw 비교용)
    const keyFn = {
      partNo:        partNoSortKey,
      name:          (p) => (p.name || '').toLowerCase(),
      spec:          (p) => (p.spec || '').toLowerCase(),
      categoryPath:  (p) => (p.category_path || '').toLowerCase(),
      material:      (p) => (p.material || '').toLowerCase(),
      manufacturer:  (p) => manufacturerName(p.manufacturer_id).toLowerCase(),
      supplier:      (p) => supplierName(p.supplier_id).toLowerCase(),
      unitPrice:     (p) => p.unit_price != null ? Number(p.unit_price) : Number.NEGATIVE_INFINITY,
      lifecycle:     (p) => lcOf(p.lifecycle).label,
      purchaseLink:  (p) => p.purchase_link ? 1 : 0,
    }[sortKey] || partNoSortKey
    const dir = sortDir === 'desc' ? -1 : 1
    const arr = [...items]
    arr.sort((a, b) => {
      const ka = keyFn(a)
      const kb = keyFn(b)
      if (ka < kb) return -1 * dir
      if (ka > kb) return 1 * dir
      return 0
    })
    return arr
  }, [items, sortKey, sortDir, catById, catParentOf, companies])  // companies → manufacturer/supplier 이름 의존
  const backToList = () => {
    setView({ mode: 'list' })
    reload()
  }
  const catOptions = flatOptions(catTree)

  const handleDelete = async (p) => {
    if (
      !(await confirm({
        title: '품목 단종 처리',
        message: `'${p.part_no}' 을(를) 단종(EOD) 처리할까요?\n신규 BOM 투입이 차단됩니다. (행/이력은 보존)`,
        confirmText: '단종',
      }))
    )
      return
    try {
      await deleteItem(p.id)
      reload()
      toast('단종 처리되었습니다', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  const handleRestore = async (p) => {
    try {
      await updateItem(p.id, { lifecycle: 'ACTIVE' })
      reload()
      toast('양산 상태로 복원되었습니다', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  const handleHard = async (p) => {
    if (
      !(await confirm({
        title: '품목 완전 삭제',
        message: `'${p.part_no}' 을(를) 완전 삭제합니다. 되돌릴 수 없습니다.`,
        confirmText: '완전 삭제',
        danger: true,
        requireText: p.part_no,
      }))
    )
      return
    try {
      await hardDeleteItem(p.id)
      reload()
      toast('완전 삭제되었습니다', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  if (view.mode === 'category') {
    return (
      <div className="page-flat">
        <PageHeader
          title="품목 분류 관리"
          subtitle="대 › 중 › 소 · 기능별(공정 무관)"
          onBack={backToList}
        />
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
        <ItemEditor
          editing={view.data}
          items={items}
          companies={companies}
          catTree={catTree}
          // 단위 datalist 후보 — 프리셋 + 기존 품목에서 실제 쓰인 단위 union (2026-05-20)
          //   사용자가 새 단위를 저장하면 다음 진입부터 자동으로 후보에 포함됨.
          unitOptions={Array.from(
            new Set([...UNIT_PRESETS, ...items.map((it) => it.unit).filter((u) => u && u.trim())]),
          )}
          onCatChanged={loadCats}
          onCancel={backToList}
          onSaved={backToList}
        />
      </div>
    )
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="품목 마스터"
        subtitle="사물 사전 · 분류/구매링크/사진/공급사 · BOM 이 참조"
        onBack={onBack}
      />

      <div className={s.toolbar}>
        <input
          className={s.search}
          placeholder="품목번호 / 품목명 / 제조사 검색"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && reload()}
        />
        <select
          className={s.catSel}
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
        >
          <option value="">전체 분류</option>
          {catOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <label className={s.chk}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />{' '}
          단종 포함
        </label>
        <button
          type="button"
          className="btn-secondary btn-md"
          onClick={() => setView({ mode: 'category' })}
        >
          분류 관리
        </button>
        <button
          type="button"
          className="btn-primary btn-md"
          onClick={() => setView({ mode: 'editor', data: { ...EMPTY } })}
        >
          + 새 품목
        </button>
      </div>

      {loading && <p className={s.info}>로딩 중...</p>}
      {error && <p className={s.err}>{error}</p>}

      {!loading && (
        <div className={s.tableWrap}>
          <table className={s.table} ref={tableRef}>
            <colgroup>
              {colW.map((w, i) => (
                <col key={i} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {/* 각 컬럼 헤더 클릭 → 정렬 토글 (2026-05-27). colGrip 클릭은 stopPropagation 으로 분리. */}
                {[
                  { label: '품목번호', key: 'partNo',       gripIdx: 0 },
                  { label: '품목명',   key: 'name',         gripIdx: 1 },
                  { label: '규격',     key: 'spec',         gripIdx: 2 },
                  { label: '분류',     key: 'categoryPath', gripIdx: 3 },
                  { label: '재질',     key: 'material',     gripIdx: 4 },
                  { label: '제조사',   key: 'manufacturer', gripIdx: 5 },
                  { label: '공급사',   key: 'supplier',     gripIdx: 6 },
                  { label: '단가',     key: 'unitPrice',    gripIdx: 7 },
                  { label: '상태',     key: 'lifecycle',    gripIdx: 8 },
                  { label: '구매',     key: 'purchaseLink', gripIdx: 9 },
                ].map((c) => {
                  const active = sortKey === c.key
                  return (
                    <th
                      key={c.key}
                      className={`${s.sortable} ${active ? s.sortActive : ''}`}
                      onClick={() => handleSort(c.key)}
                      title={`${c.label} 기준 정렬`}
                    >
                      {c.label}
                      {c.key === 'partNo' && (
                        <span
                          className={s.thInfoIcon}
                          tabIndex={0}
                          role="img"
                          aria-label="품목번호 형식 안내"
                          onClick={(e) => e.stopPropagation()}
                        >
                          ⓘ
                          <span className={s.thInfoTip} role="tooltip">
                            <b>형식</b> &nbsp;<code>대분류 - 중분류 - 4자리시퀀스</code>
                            <br />
                            <b>예)</b> <code>H-PLT-0001</code> = 반제품(H) › Plate(PLT) › 0001
                            <span className={s.thInfoTipDim}>
                              · 분류(대/중) 약자 + 시퀀스로 자동 채번<br />
                              · 직접 입력 시 4자리 숫자, 중복 검사 후 사용<br />
                              · 예비/기타 약자 있으면 끝에 접미사 부착
                            </span>
                          </span>
                        </span>
                      )}
                      <span className={s.sortArrow}>
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </span>
                      <span className={s.colGrip}
                        onMouseDown={startResize(c.gripIdx)}
                        onClick={(e) => e.stopPropagation()} />
                    </th>
                  )
                })}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className={s.empty}>
                    등록된 품목이 없어요.
                  </td>
                </tr>
              ) : (
                sortedItems.map((p) => {
                  const lc = lcOf(p.lifecycle)
                  const rowCls = isInactive(p.lifecycle)
                    ? s.inactiveRow
                    : p.lifecycle === 'EOM'
                      ? s.eomRow
                      : p.lifecycle === 'EOS'
                        ? s.eosRow
                        : ''
                  return (
                    <tr key={p.id} className={rowCls}>
                      <td className={s.mono}>
                        <span className={p.external_code ? s.partNoHover : undefined}
                          title={p.external_code ? `외부코드: ${p.external_code}` : undefined}>
                          {composeFullCode(p, catById, catParentOf)}
                          {p.external_code && <span className={s.extBadge}>ext</span>}
                        </span>
                      </td>
                      <td>{p.name || '-'}</td>
                      <td>{p.spec || '-'}</td>
                      <td>
                        {p.category_path ? (
                          <span className={s.catBadge}>{p.category_path}</span>
                        ) : (
                          <span className={s.noimg}>-</span>
                        )}
                      </td>
                      <td>{p.material || '-'}</td>
                      <td>{manufacturerName(p.manufacturer_id)}</td>
                      <td>{supplierName(p.supplier_id)}</td>
                      <td className={s.num}>
                        {p.unit_price != null ? p.unit_price.toLocaleString() : '-'}
                      </td>
                      <td>
                        <span className={`${s.lcBadge} ${s[lc.cls]}`}>{lc.label}</span>
                      </td>
                      <td>
                        {p.purchase_link ? (
                          <a
                            href={p.purchase_link}
                            target="_blank"
                            rel="noreferrer"
                            className={s.link}
                          >
                            🔗
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className={s.actions}>
                        <button
                          type="button"
                          className={s.act}
                          onClick={async () => {
                            try {
                              setView({ mode: 'editor', data: await getItem(p.id) })
                            } catch (e) {
                              toast(e.message, 'error')
                            }
                          }}
                        >
                          편집
                        </button>
                        {!isInactive(p.lifecycle) ? (
                          <button
                            type="button"
                            className={s.actWarn}
                            onClick={() => handleDelete(p)}
                          >
                            단종
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={s.act}
                              onClick={() => handleRestore(p)}
                            >
                              복구
                            </button>
                            <button
                              type="button"
                              className={s.actDanger}
                              onClick={() => handleHard(p)}
                            >
                              완전삭제
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// 사진 썸네일 컬럼 제거 (2026-05-20) — 목록에선 불필요, 상세/편집 화면에서만 확인.

// ════════════════════════════════════════════
// 분류 트리 관리 (대 고정 6, 중/소 CRUD) — Toss flat
// ════════════════════════════════════════════
// 약자(code) 인라인 입력 — 노드 행에 직접 노출, onBlur 시 자동 저장 (2026-05-23)
// CategoryManager 안에서 정의하면 매 렌더마다 컴포넌트가 재정의돼 state 가 손실되므로 외부로 분리.
function CodeInput({ n, onChanged }) {
  const toast = useToast()
  const [draft, setDraft] = useState(n.code || '')
  useEffect(() => {
    setDraft(n.code || '')
  }, [n.code])
  const maxLen = n.level === 1 ? 1 : n.level === 2 ? 5 : 16
  const placeholder = n.level === 1 ? '대 1자' : n.level === 2 ? '중 2~5자' : '약자'
  const save = async () => {
    const trimmed = draft.trim()
    if (trimmed === (n.code || '')) return // 변경 없으면 noop
    try {
      await updateItemCategory(n.id, { code: trimmed })
      onChanged()
    } catch (e) {
      toast(e.message, 'error')
      setDraft(n.code || '') // 실패 시 원복
    }
  }
  return (
    <input
      className={s.catCodeInput}
      value={draft}
      maxLength={maxLen}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      title={`약자 ${maxLen}자 max — 식별코드 자동 채번용 (현: ${n.code || '없음'})`}
    />
  )
}

function CategoryManager({ tree, onChanged }) {
  const toast = useToast()
  const confirm = useConfirm()
  // 대분류 접기/펼치기 (2026-05-27) — Set 에 들어있으면 접힘. default 펼침.
  //   localStorage 안 함 — 단순. 새로고침 시 다시 펼침.
  const [collapsed, setCollapsed] = useState(() => new Set())
  const toggleCollapse = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  // 삭제 차단 시 인라인 reassign 패널 상태 (2026-05-21)
  //   BE 가 "이 분류를 쓰는 품목이 N개..." 409 던지면 사용처 품목을 보여주고
  //   다른 분류로 일괄 이동 → 삭제 재시도. (모달 X, Toss flat 인라인)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [busyReassign, setBusyReassign] = useState(false)

  const addChild = async (parent) => {
    if (parent && parent.level >= 3) {
      toast('소분류 아래에는 더 만들 수 없어요 (대›중›소).', 'warn')
      return
    }
    const name = prompt(parent ? `'${parent.name}' 하위 분류명` : '대분류명 (시드 외 추가 비권장)')
    if (!name || !name.trim()) return
    try {
      // 약자(code)는 생성 후 노드 행의 약자 input 에서 직접 입력·수정 (인라인 UX, 2026-05-23).
      await createItemCategory({
        parent_id: parent ? parent.id : null,
        name: name.trim(),
      })
      onChanged()
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  const rename = async (n) => {
    // 이름만 변경 — 약자(code)는 노드 행의 인라인 input 에서 직접 수정 (2026-05-23)
    const name = prompt('새 분류명', n.name)
    if (!name || !name.trim() || name.trim() === n.name) return
    try {
      await updateItemCategory(n.id, { name: name.trim() })
      onChanged()
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  const remove = async (n) => {
    if (
      !(await confirm({
        title: '분류 삭제',
        message: `'${n.name}' 분류를 삭제할까요?\n하위 분류가 있거나 사용 중이면 거부됩니다.`,
        confirmText: '삭제',
        danger: true,
      }))
    )
      return
    try {
      await deleteItemCategory(n.id)
      onChanged()
    } catch (e) {
      const msg = String(e.message || '')
      // BE 메시지: "이 분류를 쓰는 품목이 N개 있어 삭제할 수 없습니다..."
      if (/품목이.*삭제할 수 없습니다/.test(msg)) {
        try {
          const items = await getItems(true, '', n.id)
          setPendingDelete({ node: n, items, targetId: '' })
        } catch (ee) {
          toast(msg, 'error')
        }
      } else {
        toast(msg, 'error')
      }
    }
  }
  const performReassign = async () => {
    if (!pendingDelete) return
    if (!pendingDelete.targetId) {
      toast('이동할 분류를 선택하세요.', 'warn')
      return
    }
    const targetId = Number(pendingDelete.targetId)
    setBusyReassign(true)
    try {
      // 일괄 이동 — N 개 PUT (admin 규모 가정, 보통 < 100)
      for (const it of pendingDelete.items) {
        await updateItem(it.id, { category_id: targetId })
      }
      // 재시도
      await deleteItemCategory(pendingDelete.node.id)
      setPendingDelete(null)
      onChanged()
    } catch (e) {
      toast(`일괄 이동/삭제 실패: ${e.message}`, 'error')
    } finally {
      setBusyReassign(false)
    }
  }
  const Node = ({ n }) => {
    const isTop = n.level === 1
    const hasChildren = n.children?.length > 0
    const isCollapsed = isTop && collapsed.has(n.id)
    return (
      <li className={`${s.catNode} ${isTop ? s.catNodeTop : ''}`}>
        <div className={`${s.catRow} ${isTop ? s.catRowTop : ''}`}>
          <span className={s.catName}>
            {/* 대분류 토글 (자식 있을 때만) — 항목 많아지면 접어서 보기 (2026-05-27) */}
            {isTop && hasChildren ? (
              <button
                type="button"
                className={s.catToggleBtn}
                onClick={() => toggleCollapse(n.id)}
                title={isCollapsed ? '펼치기' : '접기'}
                aria-label={isCollapsed ? '펼치기' : '접기'}
              >
                {isCollapsed ? '▶' : '▼'}
              </button>
            ) : (
              <span className={s.catToggleSpacer} aria-hidden="true" />
            )}
            <b>{n.name}</b>
            <span className={`${s.catLvl} ${s[`catLvl${n.level}`] || ''}`}>
              {['', '대', '중', '소'][n.level] || ''}
            </span>
            {/* 약자 인라인 input — 항상 노출, onBlur 즉시 저장 (2026-05-23) */}
            <CodeInput n={n} onChanged={onChanged} />
          </span>
          <span className={s.catBtns}>
            {n.level < 3 && (
              <button
                type="button"
                className={s.catAddBtn}
                onClick={() => addChild(n)}
                title={`'${n.name}' 하위 분류 추가`}
              >
                + 하위
              </button>
            )}
            <button
              type="button"
              className={s.catIconBtn}
              onClick={() => rename(n)}
              title="이름 변경"
              aria-label="이름 변경"
            >
              ✎
            </button>
            {n.level > 1 && (
              <button
                type="button"
                className={`${s.catIconBtn} ${s.catIconBtnDanger}`}
                onClick={() => remove(n)}
                title="삭제"
                aria-label="삭제"
              >
                ✕
              </button>
            )}
          </span>
        </div>
        {hasChildren && !isCollapsed && (
          <ul className={s.catChildren}>
            {n.children.map((c) => (
              <Node key={c.id} n={c} />
            ))}
          </ul>
        )}
      </li>
    )
  }
  // reassign 옵션 목록 — 자기 자신/하위 제외 (자기 자신은 무의미, 하위는 어차피 없음 — 있으면 delete 가 먼저 막힘)
  const reassignOptions = pendingDelete
    ? flatOptions(tree).filter((o) => o.id !== pendingDelete.node.id)
    : []
  return (
    <>
      <p className={s.info}>
        대분류 6종은 고정(삭제 불가). 중/소분류는 자유롭게 추가·수정·삭제하세요. 기능별(공정 무관).
      </p>
      {pendingDelete && (
        <div className={s.reassignPanel}>
          <div className={s.reassignTitle}>
            <span className={s.reassignBadge}>삭제 차단</span>
            <b>'{pendingDelete.node.name}'</b> 사용 중 품목 {pendingDelete.items.length}개
          </div>
          <p className={s.info}>아래 품목을 다른 분류로 일괄 이동한 뒤 삭제를 재시도합니다.</p>
          <ul className={s.reassignList}>
            {pendingDelete.items.map((it) => (
              <li key={it.id}>
                <span className={s.mono}>{it.part_no}</span>
                {it.name ? <span className={s.reassignSub}> · {it.name}</span> : null}
                {it.category_path ? (
                  <span className={s.reassignSub}> · {it.category_path}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className={s.reassignPick}>
            <span className={s.fieldLabel}>이동할 분류</span>
            <select
              value={pendingDelete.targetId || ''}
              onChange={(e) => setPendingDelete((p) => ({ ...p, targetId: e.target.value }))}
            >
              <option value="">(선택)</option>
              {reassignOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className={s.reassignBtns}>
            <button
              type="button"
              className="btn-secondary btn-md"
              onClick={() => setPendingDelete(null)}
              disabled={busyReassign}
            >
              취소
            </button>
            <button
              type="button"
              className="btn-primary btn-md"
              onClick={performReassign}
              disabled={busyReassign || !pendingDelete.targetId}
            >
              {busyReassign ? '이동 중...' : `${pendingDelete.items.length}개 일괄 이동 & 삭제`}
            </button>
          </div>
        </div>
      )}
      <ul className={s.catTree}>
        {(tree || []).map((n) => (
          <Node key={n.id} n={n} />
        ))}
      </ul>
    </>
  )
}

// ════════════════════════════════════════════
// 편집 (인라인) — 모달 제거
// ════════════════════════════════════════════
function ItemEditor({
  editing,
  items = [],
  companies,
  catTree,
  unitOptions = [],
  onCatChanged,
  onCancel,
  onSaved,
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const isNew = !editing.id
  // 신규 폼 자동 채번 — 전체 items 의 part_no 중 가장 큰 숫자 + 1, 4자리 padding (2026-05-26).
  //   사용자가 input 에서 자유 수정 가능. 중복 시 입력 즉시 inline 경고. 편집 모드는 그대로 둠.
  //   useState 함수형 initial — 폼 진입 시 단 1회 계산, 다른 사용자 동시 추가로 폼이 덮어쓰여지지 않음.
  const [f, setF] = useState(() => {
    const initialPartNo = editing.id
      ? editing.part_no || ''
      : (() => {
          const maxN = (items || []).reduce((acc, p) => {
            const n = parseInt(p.part_no || '0', 10)
            return Number.isFinite(n) && n > acc ? n : acc
          }, 0)
          return String(maxN + 1).padStart(4, '0')
        })()
    return {
      ...EMPTY,
      ...editing,
      manufacturer_id: editing.manufacturer_id ?? null,
      supplier_id: editing.supplier_id ?? null,
      unit_qty: editing.unit_qty ?? 1,
      unit_price: editing.unit_price ?? null,
      category_id: editing.category_id ?? null,
      part_no: initialPartNo,
    }
  })
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [photoUrl, setPhotoUrl] = useState(null)
  const [used, setUsed] = useState(null) // 상향 where-used (기존 품목 편집 시)
  const [drag, setDrag] = useState(false) // 사진 드래그&드롭 하이라이트
  // 다중 첨부 (사진/파일 통합) — 2026-05-20
  const [attachments, setAttachments] = useState([])
  const [attachBusy, setAttachBusy] = useState(false)
  const [attachDrag, setAttachDrag] = useState(false)
  // 업로드 에러 — 버튼 아래에 명시 표시 (2026-05-26). 토스트만으로는 사용자가 놓치기 쉬움.
  const [photoError, setPhotoError] = useState('')
  const [attachError, setAttachError] = useState('')
  // 분류 빠른 검색 (2026-05-26) — datalist 자동완성. 옵션 선택 시 cascade 자동 설정.
  const [catSearch, setCatSearch] = useState('')
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  // 제조사 = 'manufacturer' 역할 보유 회사만 (공급사는 전체 — 사용자 결정 2026-05-19).
  // 현재 값이 역할 미보유 회사라도 선택 유지되도록 항상 포함.
  const manufacturerCompanies = companies.filter(
    (c) =>
      (Array.isArray(c.roles) && c.roles.includes('manufacturer')) ||
      String(c.id) === String(f.manufacturer_id),
  )

  const { byId, parentOf } = flattenTree(catTree)
  // 현재 category_id 의 조상 체인 [대,중,소] (preset 용)
  const chain = []
  {
    let cur = f.category_id
    let g = 0
    while (cur != null && byId[cur] && g < 8) {
      chain.unshift(cur)
      cur = parentOf[cur]
      g += 1
    }
  }
  const lvl1 = chain[0] ?? ''
  const lvl2 = chain[1] ?? ''
  const lvl3 = chain[2] ?? ''
  const roots = catTree || []
  const mids = lvl1 ? byId[lvl1]?.children || [] : []
  const subs = lvl2 ? byId[lvl2]?.children || [] : []
  // FG/SEMI 판정 — root 카테고리 이름으로 (2026-05-21).
  //   완제품/반제품은 BOM 자식 합이 원가의 진실 → 원가/구매 관련 필드는 readonly.
  //   허용: 품목번호/품목명/단위/입수/분류/사진/첨부/수명주기/sale_price/정렬/비고
  //   차단: 재질/규격/제조사/공급사/단가(unit_price)/구매링크
  const rootCatName = lvl1 ? byId[lvl1]?.name || '' : ''
  const isFG = rootCatName === '완제품'
  const isSEMI = rootCatName === '반제품'
  const isFgOrSemi = isFG || isSEMI
  // 가장 깊은 선택을 category_id 로 (소>중>대)
  const pickCat = (l1, l2, l3) => set('category_id', l3 || l2 || l1 || null)

  // 분류 빠른 검색 옵션 — 평면 path 형식 (2026-05-26).
  //   datalist 자동완성용. 사용자가 옵션 클릭하면 chain 따라 cascade 자동 설정.
  const catSearchOpts = useMemo(() => {
    const opts = []
    const walk = (nodes, prefix) => {
      ;(nodes || []).forEach((n) => {
        const path = prefix ? `${prefix} › ${n.name}` : n.name
        opts.push({ id: n.id, label: path })
        if (n.children?.length) walk(n.children, path)
      })
    }
    walk(catTree || [], '')
    return opts
  }, [catTree])

  // 검색 input 변경 — 옵션 label 과 정확히 일치하면 chain 따라가서 cascade 자동 설정.
  const onCatSearchChange = (v) => {
    setCatSearch(v)
    const found = catSearchOpts.find((o) => o.label === v)
    if (!found) return
    const ids = []
    let cur = found.id
    let g = 0
    while (cur != null && byId[cur] && g < 8) {
      ids.unshift(cur)
      cur = parentOf[cur]
      g += 1
    }
    pickCat(ids[0] ?? null, ids[1] ?? null, ids[2] ?? null)
    setCatSearch('') // 선택 후 비움 — 다음 검색 준비 + cascade 가 진실의 원천
  }

  // 중/소분류 — 일반 select 드롭다운 (2026-05-20 사용자 결정으로 datalist+자동생성 폐기).
  //   새 분류 추가는 분류 관리 페이지에서 진행 (편집 화면은 선택 전용).

  useEffect(() => {
    let on = true
    if (editing.id && editing.has_photo) {
      getItemPhotoUrl(editing.id)
        .then((u) => on && setPhotoUrl(u))
        .catch(() => {})
    }
    if (editing.id) {
      getItemWhereUsed(editing.id)
        .then((u) => on && setUsed(u))
        .catch(() => on && setUsed([]))
    }
    return () => {
      on = false
    }
  }, [editing.id, editing.has_photo])

  const save = async () => {
    // part_no — 사용자가 4자리 숫자 직접 입력. 자동 채번 폐기 (2026-05-26 사용자 결정).
    // 1 → 0001 관대 padding. 비었으면 저장 차단. 중복 검사는 입력 단계에서 inline 표시.
    setSaving(true)
    setFormErr('')
    const partNo = pad4PartNo(f.part_no)
    if (!partNo) {
      setFormErr('품목번호 (4자리 숫자) 를 입력하세요.')
      setSaving(false)
      return
    }
    // 동시 저장 race 대비 — submit 시점에도 중복이면 차단(입력 단계 경고와 동일 정책).
    if (items.some((p) => p.part_no === partNo && p.id !== editing.id)) {
      setFormErr(`이미 사용 중인 품목번호입니다 (${partNo}).`)
      setSaving(false)
      return
    }
    const payload = {
      part_no: partNo,
      name: f.name,
      material: f.material,
      spec: f.spec,
      manufacturer_id: f.manufacturer_id ? Number(f.manufacturer_id) : null,
      supplier_id: f.supplier_id ? Number(f.supplier_id) : null,
      purchase_link: f.purchase_link,
      unit: f.unit || 'EA',
      unit_qty: f.unit_qty === '' || f.unit_qty == null ? 1 : Number(f.unit_qty), // 입수 기본 1 (2026-05-20)
      unit_price: f.unit_price === '' || f.unit_price == null ? null : Number(f.unit_price),
      sale_price: f.sale_price === '' || f.sale_price == null ? null : Number(f.sale_price), // 누락 보정 (2026-05-23)
      notes: f.notes,
      lifecycle: f.lifecycle || 'ACTIVE',
      category_id: f.category_id ? Number(f.category_id) : null,
      display_order: Number(f.display_order) || 999,
      // 내부 식별코드 컴포넌트 (2026-05-23) — 외부 부품코드 + 예비/기타
      external_code: (f.external_code || '').trim(),
      reserved: (f.reserved || '').trim(),
      etc: (f.etc || '').trim(),
    }
    try {
      if (isNew) await createItem(payload)
      else await updateItem(editing.id, payload)
      toast(isNew ? '품목이 등록되었습니다' : '저장되었습니다', 'success')
      onSaved()
    } catch (e) {
      setFormErr(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const uploadFile = async (file) => {
    setPhotoError('')
    if (!file) return
    if (!editing.id) {
      setPhotoError('사진은 품목 저장 후 등록할 수 있어요.')
      return
    }
    if (!isImageFile(file)) {
      setPhotoError('이미지 파일만 업로드할 수 있어요. (HEIC 는 사진 앱에서 JPG 로 저장 후 시도)')
      return
    }
    try {
      // 자동 압축 — 한도 초과 시 canvas 다운샘플 + JPEG 재인코딩
      const { file: toUpload, compressed, originalSize, compressedSize } =
        await downscaleImageIfNeeded(file, { maxBytes: PHOTO_MAX_BYTES })
      await uploadItemPhoto(editing.id, toUpload)
      if (compressed) {
        toast(`자동 압축: ${fmtSize(originalSize)} → ${fmtSize(compressedSize)}`, 'info')
      }
      const u = await getItemPhotoUrl(editing.id)
      setPhotoUrl(`${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`)
    } catch (err) {
      setPhotoError(parseUploadError(err))
    }
  }
  const onPickPhoto = (e) => uploadFile(e.target.files?.[0])
  const onDrop = (e) => {
    e.preventDefault()
    setDrag(false)
    uploadFile(e.dataTransfer.files?.[0])
  }
  const onRemovePhoto = async () => {
    if (!editing.id) return
    if (!(await confirm({ message: '사진을 제거할까요?', confirmText: '제거', danger: true })))
      return
    try {
      await deleteItemPhoto(editing.id)
      setPhotoUrl(null)
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  // ── 다중 첨부 (사진/파일 통합) — 2026-05-20 ──
  useEffect(() => {
    // 품목 전환 시 이전 에러 흔적 제거 (2026-05-26)
    setPhotoError('')
    setAttachError('')
    if (!editing.id) {
      setAttachments([])
      return
    }
    let on = true
    listItemAttachments(editing.id)
      .then((list) => {
        if (on) setAttachments(list || [])
      })
      .catch(() => {})
    return () => {
      on = false
    }
  }, [editing.id])

  const uploadAttachFiles = async (files) => {
    setAttachError('')
    if (!editing.id) {
      setAttachError('첨부는 품목 저장 후 등록할 수 있어요.')
      return
    }
    if (!files || !files.length) return
    setAttachBusy(true)
    const failures = []
    try {
      const added = []
      for (const f of Array.from(files)) {
        try {
          // 이미지면 자동 압축 시도. 비-이미지는 한도 초과면 즉시 실패 (압축 불가).
          let toUpload = f
          if (isImageFile(f)) {
            const r = await downscaleImageIfNeeded(f, { maxBytes: ATTACH_MAX_BYTES })
            toUpload = r.file
            if (r.compressed) {
              toast(`'${f.name}' 자동 압축: ${fmtSize(r.originalSize)} → ${fmtSize(r.compressedSize)}`, 'info')
            }
          } else if (f.size > ATTACH_MAX_BYTES) {
            failures.push(`'${f.name}': 한도 초과 (${fmtSize(f.size)}) — 직접 줄여서 다시 시도`)
            continue
          }
          const a = await uploadItemAttachment(editing.id, toUpload)
          if (a) added.push(a)
        } catch (e) {
          failures.push(`'${f.name}': ${parseUploadError(e)}`)
        }
      }
      if (added.length) setAttachments((prev) => [...prev, ...added])
      if (failures.length) setAttachError(failures.join('\n'))
    } finally {
      setAttachBusy(false)
    }
  }
  const onPickAttach = (e) => uploadAttachFiles(e.target.files)
  const onDropAttach = (e) => {
    e.preventDefault()
    setAttachDrag(false)
    uploadAttachFiles(e.dataTransfer.files)
  }
  const onRemoveAttach = async (att) => {
    if (
      !(await confirm({
        message: `'${att.filename}' 첨부를 제거할까요?`,
        confirmText: '제거',
        danger: true,
      }))
    )
      return
    try {
      await deleteItemAttachment(att.id)
      setAttachments((prev) => prev.filter((a) => a.id !== att.id))
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  const onOpenAttach = async (att) => {
    try {
      const url = await getItemAttachmentUrl(att.id, true)
      if (url) window.open(url, '_blank', 'noopener')
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  const fmtSize = (n) => {
    if (!n) return ''
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <>
      {/* 1. 분류 — 최상단(분류 약자 기반 자동 채번이 여기서 결정됨) */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>분류 (대 › 중 › 소)</h3>
        {/* 빠른 검색 + 새로고침 (2026-05-26) — 분류 관리에서 신규 추가한 분류 즉시 반영 */}
        <div className={s.catToolbar}>
          <input
            className={s.catSearch}
            value={catSearch}
            onChange={(e) => onCatSearchChange(e.target.value)}
            list="cat-search-options"
            placeholder="🔍 분류 빠른 선택 — 입력하면 자동 완성 (예: Stator)"
          />
          <datalist id="cat-search-options">
            {catSearchOpts.map((o) => (
              <option key={o.id} value={o.label} />
            ))}
          </datalist>
          <button
            type="button"
            className={s.catRefreshBtn}
            onClick={onCatChanged}
            title="분류 관리에서 추가한 새 분류 가져오기"
          >
            🔄
          </button>
        </div>
        <div className={s.catCascade}>
          <select value={lvl1} onChange={(e) => pickCat(e.target.value || null, '', '')}>
            <option value="">(대분류)</option>
            {roots.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <select
            value={lvl2}
            disabled={!lvl1}
            onChange={(e) => pickCat(lvl1, e.target.value || null, '')}
          >
            <option value="">(중분류)</option>
            {mids.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <select
            value={lvl3}
            disabled={!lvl2}
            onChange={(e) => pickCat(lvl1, lvl2, e.target.value || null)}
          >
            <option value="">(소분류)</option>
            {subs.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
        <p className={s.catHint}>새 분류가 필요하면 상단 "분류 관리" 에서 추가해 주세요.</p>
        {isFgOrSemi && (
          <div className={s.fgSemiHint}>
            📦 <b>{rootCatName}</b> — 원가/구매 관련(제조사/공급사/단가/구매링크)만 직접 입력 불가
            (BOM 자식 합이 진실). 재질·규격 등 본질 속성은 자유 입력 가능합니다.
          </div>
        )}
      </section>

      {/* 2. 고유번호 — 내부 식별(자동 채번 결과 + 컴포넌트) */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>고유번호 (내부 식별)</h3>
        <div className={s.grid}>
          <L label="품목번호 (4자리 숫자, 필수)">
            <input
              value={f.part_no || ''}
              maxLength={4}
              inputMode="numeric"
              placeholder="예: 1 → 0001"
              onChange={(e) => set('part_no', e.target.value.replace(/\D/g, ''))}
              onBlur={() => {
                if (f.part_no) set('part_no', pad4PartNo(f.part_no))
              }}
            />
            {(() => {
              // 입력 즉시 중복 검사 — pad4 한 값으로 items 에서 같은 part_no 검색(본인 제외).
              const padded = pad4PartNo(f.part_no)
              if (!padded) return null
              const dup = items.some((p) => p.part_no === padded && p.id !== editing.id)
              return dup ? (
                <span className={s.partNoDup}>⚠ 이미 사용 중인 번호 ({padded})</span>
              ) : null
            })()}
          </L>
          <L label="예비번호 (1자, 선택)">
            <input
              value={f.reserved || ''}
              maxLength={1}
              onChange={(e) => set('reserved', e.target.value)}
            />
          </L>
          <L label="기타 (3자, 선택)">
            <input value={f.etc || ''} maxLength={3} onChange={(e) => set('etc', e.target.value)} />
          </L>
        </div>
      </section>

      {/* 3. 외부 식별 — 외부에서 통용되는 코드·이름(둘 다 선택) */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>외부 식별</h3>
        <div className={s.grid}>
          <L label="외부 부품코드">
            <input
              value={f.external_code || ''}
              onChange={(e) => set('external_code', e.target.value)}
              placeholder="외부에서 쓰는 부품번호 (선택)"
            />
          </L>
          <L label="품목명 (외부 표시명)">
            <input value={f.name} onChange={(e) => set('name', e.target.value)} />
          </L>
        </div>
      </section>

      {/* 4. 속성 — 물리/가격 속성 */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>속성</h3>
        <div className={s.grid}>
          {/* 재질·규격은 FG/SEMI 라도 본질 속성이라 자유 입력 (2026-05-26).
              같은 분류 안에 사이즈/재질 다른 변형(예: Stator Φ90 / Φ60) 구분 필요. */}
          <L label="재질">
            <input
              value={f.material}
              onChange={(e) => set('material', e.target.value)}
            />
          </L>
          <L label="규격">
            <input
              value={f.spec}
              onChange={(e) => set('spec', e.target.value)}
            />
          </L>
          <L label="단위">
            {/* 단위 — 타입어헤드 콤보(datalist). 자유 입력 허용. (2026-05-20) */}
            <input
              value={f.unit}
              onChange={(e) => set('unit', e.target.value)}
              list="item-unit-options"
              placeholder="EA / kg / m / 장 … 또는 직접 입력"
              autoComplete="off"
            />
            <datalist id="item-unit-options">
              {unitOptions.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </L>
          <L label="단위당 수량">
            {/* 입수 — 1 단위 = 몇 개. 예: '박스' + 10 → 1박스=10개. 기본 1. (2026-05-20) */}
            <input
              type="number"
              min="0"
              step="any"
              value={f.unit_qty ?? 1}
              onChange={(e) => set('unit_qty', e.target.value)}
              placeholder="1"
            />
          </L>
        </div>
      </section>

      {/* 5. 벤더 — 제조사·공급사(Company 마스터 재사용) */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>벤더</h3>
        <div className={s.grid}>
          <L label={isFgOrSemi ? '제조사 (자동)' : '제조사'}>
            <select
              value={f.manufacturer_id ?? ''}
              onChange={(e) => set('manufacturer_id', e.target.value || null)}
              disabled={isFgOrSemi}
              title={
                isFgOrSemi
                  ? `${rootCatName} 은 외주 제조사가 의미상 BOM 별로 다름 — 사내 생산이라 직접 입력 불가`
                  : ''
              }
            >
              <option value="">(없음)</option>
              {manufacturerCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </L>
          <L label={isFgOrSemi ? '공급사 (자동)' : '공급사'}>
            <select
              value={f.supplier_id ?? ''}
              onChange={(e) => set('supplier_id', e.target.value || null)}
              disabled={isFgOrSemi}
              title={
                isFgOrSemi ? `${rootCatName} 은 외부 구매 대상이 아니므로 공급사 의미 없음` : ''
              }
            >
              <option value="">(없음)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </L>
        </div>
      </section>

      {/* 6. 기타 — 운영 메타(수명주기/정렬) + 가격 + 부가 자료(링크/비고/사진/첨부).
              가격(단가/판매가)은 사용자 요청으로 속성→기타 이동 (2026-05-26). */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>기타</h3>
        <div className={s.grid}>
          <L label="수명주기">
            <select
              value={f.lifecycle || 'ACTIVE'}
              onChange={(e) => set('lifecycle', e.target.value)}
            >
              {LIFECYCLE.map((x) => (
                <option key={x.v} value={x.v}>
                  {x.label}
                </option>
              ))}
            </select>
          </L>
          <L label="정렬">
            <input
              type="number"
              value={f.display_order}
              onChange={(e) => set('display_order', e.target.value)}
            />
          </L>
          <L label={isFgOrSemi ? '단가 (BOM 합)' : '단가'}>
            <input
              type="number"
              value={f.unit_price ?? ''}
              onChange={(e) => set('unit_price', e.target.value)}
              disabled={isFgOrSemi}
              title={
                isFgOrSemi ? `${rootCatName} 의 원가는 BOM 자식 합이 진실 — 직접 입력 불가` : ''
              }
              placeholder={isFgOrSemi ? 'BOM 자식 합 자동' : ''}
            />
          </L>
          <L label="판매가">
            <input
              type="number"
              value={f.sale_price ?? ''}
              onChange={(e) => set('sale_price', e.target.value)}
              placeholder="외부 판매 시"
            />
          </L>
        </div>

        <L label={isFgOrSemi ? '구매 링크 (해당없음)' : '구매 링크'}>
          <input
            value={f.purchase_link}
            onChange={(e) => set('purchase_link', e.target.value)}
            placeholder={
              isFgOrSemi ? `${rootCatName} 은 사내 생산이라 구매 링크 의미 없음` : 'https://...'
            }
            disabled={isFgOrSemi}
            title={isFgOrSemi ? `${rootCatName} 은 외부 구매 대상이 아님` : ''}
          />
        </L>
        <L label="비고">
          <textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </L>

        <div className={s.photoSect}>
          <span className={s.fieldLabel}>품목 사진</span>
          <div
            className={`${s.photoDrop} ${drag ? s.dropActive : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              if (!drag) setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            {photoUrl ? (
              <img src={photoUrl} alt="" className={s.photoPreview} />
            ) : (
              <div className={s.photoEmpty}>
                {drag ? '여기에 놓기' : isNew ? '저장 후 등록 가능' : '사진 없음 · 드래그&드롭'}
              </div>
            )}
          </div>
          <div className={s.photoBtns}>
            <label className={s.fileBtn}>
              사진 선택
              <input type="file" accept="image/*" hidden onChange={onPickPhoto} />
            </label>
            {photoUrl && (
              <button type="button" className={s.actDanger} onClick={onRemovePhoto}>
                제거
              </button>
            )}
          </div>
          {photoError && <p className={s.uploadErr}>{photoError}</p>}
        </div>

        {/* 첨부 파일 (사진/파일 통합, N개) — 2026-05-20. 신규 품목은 저장 후 첨부 가능. */}
        <div className={s.attachSect}>
          <span className={s.fieldLabel}>관련 첨부 (사진/파일 · 여러 개)</span>
          <div
            className={`${s.attachDrop} ${attachDrag ? s.dropActive : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              if (!attachDrag) setAttachDrag(true)
            }}
            onDragLeave={() => setAttachDrag(false)}
            onDrop={onDropAttach}
          >
            {attachments.length === 0 ? (
              <div className={s.attachEmpty}>
                {attachDrag
                  ? '여기에 놓기'
                  : isNew
                    ? '저장 후 첨부 가능'
                    : '첨부 없음 · 드래그&드롭 또는 파일 선택'}
              </div>
            ) : (
              <ul className={s.attachList}>
                {attachments.map((a) => (
                  <li key={a.id} className={s.attachRow}>
                    <span className={s.attachKind}>{a.kind === 'photo' ? '🖼️' : '📎'}</span>
                    <button
                      type="button"
                      className={s.attachName}
                      onClick={() => onOpenAttach(a)}
                      title="열기"
                    >
                      {a.filename}
                    </button>
                    <span className={s.attachSize}>{fmtSize(a.size_bytes)}</span>
                    <button type="button" className={s.actDanger} onClick={() => onRemoveAttach(a)}>
                      제거
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={s.photoBtns}>
            <label
              className={s.fileBtn}
              style={attachBusy ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
            >
              {attachBusy ? '업로드 중…' : '파일 선택 (다중)'}
              <input
                type="file"
                multiple
                hidden
                onChange={onPickAttach}
                disabled={attachBusy || isNew}
              />
            </label>
          </div>
          {attachError && <p className={s.uploadErr}>{attachError}</p>}
        </div>
      </section>

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
                  <tr>
                    <th>상위 품목번호</th>
                    <th>제품/품목명</th>
                    <th>변형</th>
                    <th>버전</th>
                    <th>수량</th>
                  </tr>
                </thead>
                <tbody>
                  {used.map((u) => (
                    <tr key={u.bom_id} className={u.is_active ? '' : s.inactiveRow}>
                      <td className={s.mono}>{u.parent_part_no}</td>
                      <td>{u.parent_part_name || '-'}</td>
                      <td>
                        {/* 데이터는 별 필드(bom_type / derive_seq), 화면은 붙여서 "MBOM #2" */}
                        <BomTypeBadge type={u.bom_type} deriveSeq={u.derive_seq || 1} />
                        {u.bom_label && <span className={s.ro}> · {u.bom_label}</span>}
                        {u.is_default && <span className={s.defBadge}>★표준</span>}
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
        <button type="button" className="btn-secondary btn-md" onClick={onCancel}>
          취소
        </button>
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
