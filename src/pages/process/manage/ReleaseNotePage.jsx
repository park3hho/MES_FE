// pages/process/manage/ReleaseNotePage.jsx
// 배포 문서 — 3단 문서형 레이아웃 (2026-08-27 전환). 1.0.0 부터, 배포 1건 = 문서 1건.
//
//   ┌ 트리 ┬ 본문 ────────────┬ 목차 ┐
//   │ 구성도│ 선택한 문서 전체    │ 섹션 │
//   │ 1.0.0│ (또는 다이어그램)   │ 점프 │
//   └──────┴──────────────────┴──────┘
//
// ★ 목록을 훑는 화면이 아니라 **한 문서를 읽는** 화면이다 — 좌측에서 고르고 가운데서 읽는다.
//   (아코디언은 섹션·이미지·선행작업이 겹겹이 들어가는 문서엔 맞지 않아 폐기했다)
// ★ 트리는 **오래된 순** — 제품 역사를 위에서 아래로 따라 읽는 순서다(사용자 확정).
//   BE 는 최신순으로 주므로 여기서 뒤집는다.
// ★ 목록은 한 번만 받아 검색을 클라이언트에서 한다 — 배포당 1행이라 수년치도 수백 행.
// ★ draft('작성 중')는 관리 권한자에게만 온다 — BE 가 drafts 키 자체를 안 내린다.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  getReleaseNotes, getReleaseNote, getArchDiagram,
  setReleasePrereqDone, addReleasePostscript, deleteReleaseNote, publishReleaseNote,
} from '@/api'
import PageHeader from '@/components/common/PageHeader'
import { canAccess, Feature } from '@/constants/permissions'
import { SECTION_LABELS } from '@/constants/releaseConst'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import { useToast } from '@/contexts/ToastContext'
import { fmtKstDate } from '@/utils/dateConvert'

import ReleaseDiagram from './ReleaseDiagram'
import ReleaseDiagramEditor from './ReleaseDiagramEditor'
import ReleaseNoteDoc, { secAnchor, ANCHOR_PREREQ, ANCHOR_POST } from './ReleaseNoteDoc'
import ReleaseNoteEditor from './ReleaseNoteEditor'
import s from './ReleaseNotePage.module.css'

// 트리 맨 위 고정 항목. 문서 버전과 같은 네임스페이스를 쓰므로 예약어다 — 버전이 'diagram' 일 수는 없다.
const DIAGRAM = 'diagram'

export default function ReleaseNotePage({ user, onBack }) {
  const toast = useToast()
  const confirm = useConfirm()
  const canManage = canAccess(user, Feature.RELEASE_MANAGE)

  // 선택 = URL 이 진실 — 특정 버전 문서를 링크로 공유할 수 있어야 한다 (?v=1.0.0 / ?v=diagram)
  const [params, setParams] = useSearchParams()
  const sel = params.get('v') || DIAGRAM
  const select = useCallback((v) => {
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.set('v', v)
      return next
    }, { replace: true })
  }, [setParams])

  const [data, setData] = useState(null)       // { items, drafts? }
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState({})     // { [version]: 상세 } — 고를 때 1건씩 받아 캐시
  const [editing, setEditing] = useState(null) // null | 'new' | {id, ...}
  const [editDiagram, setEditDiagram] = useState(false)
  const [navOpen, setNavOpen] = useState(false)   // 모바일 트리 드로어

  // silent=true — 스피너를 띄우지 않는 재조회. ★ 다이어그램 편집 중에는 반드시 이걸 써야 한다:
  //   setLoading(true) 가 편집기를 언마운트시켜 입력 중이던 값·포커스가 매 저장마다 날아간다.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const [list, diagram] = await Promise.all([
        getReleaseNotes(),
        // ★ 실패를 '빈 목록' 으로 위조하지 않는다 — 이 load 는 다이어그램 편집기도 먹이기 때문에,
        //   GET 만 실패했을 때 []로 덮으면 편집 중이던 구성이 통째로 사라진 것처럼 보인다.
        getArchDiagram(true).catch(() => null),
      ])
      setData(list)
      if (diagram) {
        setNodes(diagram.nodes || [])
        setEdges(diagram.edges || [])
      }
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 트리 — 발행분은 오래된 순, 작성 중은 맨 아래(다음 배포라 흐름의 끝)
  const published = useMemo(
    () => [...(data?.items || [])].reverse(),   // BE 는 최신순 → 뒤집어 오래된 순
    [data],
  )
  const drafts = data?.drafts || []

  const hit = useCallback((n) => {
    const kw = q.trim().toLowerCase()
    if (!kw) return true
    return [n.version, n.title, n.summary, n.search_text]
      .filter(Boolean).join('\n').toLowerCase().includes(kw)
  }, [q])

  const shownPub = published.filter(hit)
  const shownDraft = drafts.filter(hit)
  const byVersion = useMemo(() => {
    const m = {}
    for (const n of [...published, ...drafts]) m[n.version] = n
    return m
  }, [published, drafts])

  const current = sel === DIAGRAM ? null : byVersion[sel]
  const doc = current ? detail[current.version] : null

  // 선택이 바뀌면 상세를 받는다. 첨부 URL 이 presigned 10분이라 오래된 캐시는 다시 받는다.
  useEffect(() => {
    if (!current) return undefined
    const cached = detail[current.version]
    if (cached && Date.now() - (cached._at || 0) < 8 * 60 * 1000) return undefined
    let alive = true
    getReleaseNote(current.id)
      .then((d) => { if (alive) setDetail((p) => ({ ...p, [current.version]: { ...d, _at: Date.now() } })) })
      .catch((e) => { if (alive) toast(e.message || '상세 조회 실패', 'error') })
    return () => { alive = false }
    // detail 을 의존성에 넣으면 매 갱신마다 재조회된다 — 선택과 목록만 본다
  }, [current, toast])   // eslint-disable-line react-hooks/exhaustive-deps

  // 상세를 서버 응답으로 갱신 — ★ 교체가 아니라 병합. 체크오프·추기 응답에는
  //   attachments/attachment_urls 가 없어서(그건 상세 조회에만 붙는다) 통째로 갈아끼우면
  //   읽고 있던 문서의 본문 이미지가 즉시 사라진다.
  const mergeDetail = (d) => {
    const v = `${d.ver_major}.${d.ver_minor}.${d.ver_patch}`
    setDetail((p) => ({ ...p, [v]: { ...p[v], ...d, _at: p[v]?._at || Date.now() } }))
    setData((p) => p && {
      ...p,
      items: (p.items || []).map((x) => (x.id === d.id ? { ...x, ...pick(d) } : x)),
      drafts: (p.drafts || []).map((x) => (x.id === d.id ? { ...x, ...pick(d) } : x)),
    })
  }

  const onPrereq = async (uid, done) => {
    try {
      mergeDetail(await setReleasePrereqDone(current.id, uid, done))
    } catch (e) {
      toast(e.message || '체크 실패', 'error')
    }
  }

  const onPostscript = async (text) => {
    try {
      mergeDetail(await addReleasePostscript(current.id, text))
      toast('추기가 기록됐습니다.')
    } catch (e) {
      toast(e.message || '추기 실패', 'error')
    }
  }

  const onPublish = async () => {
    const ok = await confirm({
      title: `${current.version} 발행`,
      message: '발행하면 본문과 버전을 더는 고칠 수 없습니다. 이후에는 선행 작업 체크와 추기만 가능합니다.',
      confirmText: '발행',
    })
    if (!ok) return
    try {
      const d = await publishReleaseNote(current.id)
      if (d.unknown_nodes?.length) {
        toast(`발행됨 — 구성도에 없는 시스템: ${d.unknown_nodes.join(', ')}`, 'warn')
      } else {
        toast(`${current.version} 발행 완료`)
      }
      setDetail({})
      await load()
    } catch (e) {
      toast(e.message || '발행 실패', 'error')
    }
  }

  const onDelete = async () => {
    const ok = await confirm({
      title: `${current.version} 삭제`,
      message: '작성 중인 문서를 삭제합니다.',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteReleaseNote(current.id)
      toast('삭제됐습니다.')
      setDetail({})
      select(DIAGRAM)
      await load()
    } catch (e) {
      toast(e.message || '삭제 실패', 'error')
    }
  }

  if (editing) {
    return (
      <ReleaseNoteEditor
        note={editing === 'new' ? null : editing}
        nodes={nodes}
        onClose={() => setEditing(null)}
        onSaved={async (saved) => {
          setEditing(null)
          setDetail({})
          await load()
          if (saved?.version) select(saved.version)
        }}
      />
    )
  }

  const pickNode = (n) => {
    select(n.version)
    setNavOpen(false)
  }

  return (
    <div className={`page-flat ${s.full}`}>
      <PageHeader
        title="배포 문서"
        subtitle="버전별 변경 내역과 시스템 구성"
        onBack={onBack}
      />

      {error && <p className={s.err}>⚠ {error}</p>}

      {/* 모바일 — 3단이 성립하지 않아 레일을 드로어로 접는다 */}
      <button type="button" className={s.navToggle} onClick={() => setNavOpen((v) => !v)}>
        {navOpen ? '목록 닫기' : `목록 열기 · ${sel === DIAGRAM ? '시스템 구성도' : sel}`}
      </button>

      <div className={s.shell}>
        {/* ── 좌: 레일 (릴리스 타임라인) ── */}
        <nav className={`${s.nav} ${navOpen ? s.navOpen : ''}`} aria-label="배포 문서 목록">
          <div className={s.navIn}>
            <input className={s.navSearch} value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="버전 · 제목 · 본문 검색" aria-label="배포 문서 검색" />

            <button type="button"
              className={`${s.railMap} ${sel === DIAGRAM ? s.railMapOn : ''}`}
              aria-current={sel === DIAGRAM}
              onClick={() => { select(DIAGRAM); setNavOpen(false) }}>
              {/* Tabler 폰트는 미로드 — 인라인 SVG (메모리 규약) */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="6" cy="6" r="3" /><circle cx="18" cy="16" r="3" /><path d="M8.5 8 15.5 14" />
              </svg>
              시스템 구성도
            </button>

            <p className={s.tlLabel}>릴리스</p>
            {loading && <p className={s.info}>불러오는 중…</p>}
            {!loading && shownPub.length === 0 && shownDraft.length === 0 && !error && (
              <p className={s.info}>{q ? '검색 결과가 없습니다.' : '아직 발행된 문서가 없습니다.'}</p>
            )}
            {/* 발행분(오래된 순)과 작성 중을 한 축에 잇는다 — 작성 중 = 역사의 다음 칸 */}
            {shownPub.map((n) => (
              <button key={n.id} type="button"
                className={`${s.tlItem} ${sel === n.version ? s.tlOn : ''}`}
                aria-current={sel === n.version}
                onClick={() => pickNode(n)}>
                <span className={s.tlVer}>{n.version}</span>
                <span className={s.tlTitle}>{n.title}</span>
                <span className={s.tlWhen}>{fmtKstDate(n.released_at)}</span>
              </button>
            ))}
            {shownDraft.map((n) => (
              <button key={n.id} type="button"
                className={`${s.tlItem} ${s.tlDraft} ${sel === n.version ? s.tlOn : ''}`}
                aria-current={sel === n.version}
                onClick={() => pickNode(n)}>
                <span className={s.tlVer}>{n.version}</span>
                <span className={s.tlTitle}>
                  {n.title}<span className={s.tlBadge}>작성 중</span>
                </span>
              </button>
            ))}

            {canManage && (
              <button type="button" className={s.navNew} onClick={() => setEditing('new')}>
                ＋ 새 문서
              </button>
            )}
          </div>
        </nav>

        {/* ── 가운데: 본문 ── */}
        <main className={s.main}>
          {sel === DIAGRAM ? (
            loading ? <p className={s.info}>불러오는 중…</p> : (
              <ReleaseDiagram
                nodes={nodes.filter((n) => n.is_active !== false)}
                edges={edges}
                notes={[...published, ...drafts]}
                onOpenNote={(n) => { setQ(''); select(n.version) }}
              />
            )
          ) : !current ? (
            <p className={s.info}>
              {loading ? '불러오는 중…' : '문서를 찾을 수 없습니다 — 왼쪽에서 골라주세요.'}
            </p>
          ) : !doc ? (
            <p className={s.info}>불러오는 중…</p>
          ) : (
            <ReleaseNoteDoc
              note={doc} nodes={nodes} canManage={canManage}
              onEdit={() => setEditing(current)}
              onDelete={onDelete}
              onPublish={onPublish}
              onPrereq={onPrereq}
              onPostscript={onPostscript}
            />
          )}
        </main>

        {/* ── 우: 다이어그램이면 설정, 문서면 목차 ── */}
        <aside className={s.side}>
          <div className={s.sideIn}>
            {sel === DIAGRAM ? (
              <>
                <div className={s.sideHead}>
                  <span className={s.sideLab}>구성 설정</span>
                  {canManage && (
                    <button type="button" className={s.linkBtn}
                      onClick={() => setEditDiagram((v) => !v)}>
                      {editDiagram ? '닫기' : '편집'}
                    </button>
                  )}
                </div>
                {editDiagram && canManage ? (
                  <ReleaseDiagramEditor nodes={nodes} edges={edges} onChanged={() => load(true)} />
                ) : (
                  <>
                    {nodes.filter((n) => n.is_active !== false).map((n) => (
                      <div key={n.key} className={s.sysRow}>
                        <span className={s.sysDot}
                          style={{ background: n.style?.color || '#4a5878' }} />
                        <span className={s.sysName}>{n.name}</span>
                        <span className={s.sysKey}>{n.key}</span>
                      </div>
                    ))}
                    <p className={s.sideTip}>
                      도형을 누르면 그 시스템을 건드린 배포만 모아 봅니다.
                      {canManage && ' 구성을 고치려면 위 편집을 누르세요.'}
                    </p>
                  </>
                )}
              </>
            ) : (
              <Toc note={doc} />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

// 목록 카드가 쓰는 요약 필드만 뽑는다 — 상세 응답으로 트리 항목을 갱신할 때
const pick = (d) => ({
  prereq_open: d.prereq_open, prereq_total: d.prereq_total,
  has_postscript: d.has_postscript, node_keys: d.node_keys,
})

// ══════════════════════════════════════════════════
// 목차 — 본문의 앵커로 점프. id 규칙은 ReleaseNoteDoc 이 export 한 것만 쓴다.
// ══════════════════════════════════════════════════
function Toc({ note }) {
  if (!note) return null
  const go = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const secs = note.sections || []
  const hasPrereq = (note.prereqs || []).length > 0
  const hasPost = (note.postscript || []).length > 0

  if (secs.length === 0 && !hasPrereq && !hasPost) return null

  return (
    <>
      <div className={s.sideHead}><span className={s.sideLab}>이 문서</span></div>
      <div className={s.toc}>
        {secs.map((sec, i) => (
          <button key={i} type="button" className={s.tocItem} onClick={() => go(secAnchor(i))}>
            <span className={`${s.tocKind} ${s['kind_' + sec.kind] || ''}`}>
              {SECTION_LABELS[sec.kind] || sec.kind}
            </span>
            <span className={s.tocText}>{sec.title}</span>
          </button>
        ))}
        {hasPrereq && (
          <button type="button" className={s.tocItem} onClick={() => go(ANCHOR_PREREQ)}>
            <span className={s.tocText}>선행 작업</span>
            {note.prereq_open > 0 && <span className={s.tocBadge}>{note.prereq_open}</span>}
          </button>
        )}
        {hasPost && (
          <button type="button" className={s.tocItem} onClick={() => go(ANCHOR_POST)}>
            <span className={s.tocText}>배포 후 기록</span>
          </button>
        )}
      </div>
    </>
  )
}
