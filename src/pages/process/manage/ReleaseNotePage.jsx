// pages/process/manage/ReleaseNotePage.jsx
// 배포 문서 — 배포 순 보기 (2026-08-27). 1.0.0 부터, 배포 1건 = 문서 1건.
//
// ★ 목록은 한 번만 받아 검색·필터를 전부 클라이언트에서 한다 — 배포당 1행이라 수년치도 수백 행.
//   서버에 질의를 왕복시키면 끊길 고리만 늘어난다.
// ★ draft('다음 배포 예정')는 관리 권한자에게만 온다 — BE 가 drafts 키 자체를 안 내린다.
//   그래서 화면은 "있으면 그린다" 로 충분하고, 권한 분기를 두 번 쓰지 않는다.
// ★ 정렬은 BE 가 published(released_at DESC) / drafts 를 나눠 준 순서 그대로 쓴다 —
//   NULL 정렬 동작에 기대지 않으려고 애초에 두 배열로 갈라 받는다.
import { useState, useEffect, useCallback, useMemo } from 'react'

import {
  getReleaseNotes, getReleaseNote, getArchDiagram,
  setReleasePrereqDone, addReleasePostscript, deleteReleaseNote, publishReleaseNote,
} from '@/api'
import PageHeader from '@/components/common/PageHeader'
import { canAccess, Feature } from '@/constants/permissions'
import {
  SECTION_LABELS, PREREQ_LABELS, ENV_LABELS, NODE_KIND_LABELS, ARCH_NODE_KINDS,
} from '@/constants/releaseConst'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import { useToast } from '@/contexts/ToastContext'
import { fmtKstDateTime } from '@/utils/dateConvert'

import ReleaseDiagram from './ReleaseDiagram'
import ReleaseDiagramEditor from './ReleaseDiagramEditor'
import ReleaseNoteEditor from './ReleaseNoteEditor'
import s from './ReleaseNotePage.module.css'

// 보기 2종 — 사용자가 요구한 그대로: 배포 순 목록 ↔ 공용 다이어그램 1장
const VIEWS = [
  { key: 'list', label: '배포 순' },
  { key: 'diagram', label: '다이어그램' },
]

export default function ReleaseNotePage({ user, onBack, onLogout }) {
  const toast = useToast()
  const confirm = useConfirm()
  const canManage = canAccess(user, Feature.RELEASE_MANAGE)

  const [view, setView] = useState('list')     // 'list' | 'diagram'
  const [editDiagram, setEditDiagram] = useState(false)
  const [data, setData] = useState(null)       // { items, drafts? }
  const [nodes, setNodes] = useState([])       // 노드 이름·분류 룩업 (칩 라벨)
  const [edges, setEdges] = useState([])       // 다이어그램 화살표
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [fKind, setFKind] = useState('')       // 노드 분류 필터 (BE/FE/DB/MW/ETC)
  const [openId, setOpenId] = useState(null)   // 펼친 문서
  const [detail, setDetail] = useState({})     // { [id]: 상세 } — 펼칠 때 1건씩 받아 캐시
  const [editing, setEditing] = useState(null) // null | 'new' | {id, ...}

  // silent=true — 스피너를 띄우지 않는 재조회. ★ 다이어그램 편집 중에는 반드시 이걸 써야 한다:
  //   setLoading(true) 가 편집기를 언마운트시켜 입력 중이던 값·포커스가 매 저장마다 날아간다.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      // 노드는 칩 라벨용이라 실패해도 목록은 보여준다 (raw key 로 폴백)
      const [list, diagram] = await Promise.all([
        getReleaseNotes(),
        // all=true — 은퇴 노드도 이름 룩업에 필요하다(과거 문서의 칩이 raw key 로 보이지 않게).
        //   BE 가 관리 권한자에게만 은퇴분을 주므로 열람자는 자동으로 활성만 받는다.
        getArchDiagram(true).catch(() => ({ nodes: [] })),
      ])
      setData(list)
      setNodes(diagram.nodes || [])
      setEdges(diagram.edges || [])
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // key → {name, kind}. 삭제·개명된 노드는 룩업이 실패하므로 raw key 를 그대로 보여준다(역사 기록 폴백)
  const nodeMap = useMemo(() => {
    const m = {}
    for (const n of nodes) m[n.key] = n
    return m
  }, [nodes])

  // 필터 칩 — 실제 등록된 노드가 가진 분류만. 노드가 없으면 칩 줄 자체가 사라진다.
  const kindOptions = useMemo(() => {
    const used = new Set(nodes.map((n) => n.kind).filter(Boolean))
    return ARCH_NODE_KINDS.filter((k) => used.has(k))
  }, [nodes])

  const match = useCallback((n) => {
    if (fKind) {
      const hit = (n.node_keys || []).some((k) => nodeMap[k]?.kind === fKind)
      if (!hit) return false
    }
    const kw = q.trim().toLowerCase()
    if (!kw) return true
    // search_text 는 발행 시 박제된 사본 (제목+요약+본문+선행작업) — draft 는 비어 있어 제목·요약으로 찾는다
    return [n.version, n.title, n.summary, n.search_text]
      .filter(Boolean).join('\n').toLowerCase().includes(kw)
  }, [q, fKind, nodeMap])

  const items = (data?.items || []).filter(match)
  const drafts = (data?.drafts || []).filter(match)

  // 열기 전용 — 다이어그램에서 넘어올 때 '이미 펼쳐져 있으면 닫힌다' 를 막으려면 토글이 아니어야 한다
  const openNote = async (n) => {
    setOpenId(n.id)
    // 첨부 URL 은 presigned 10분짜리다 — 오래 캐시하면 지연 로딩 이미지·원본 링크가 만료로 깨진다
    const cached = detail[n.id]
    if (cached && Date.now() - (cached._at || 0) < 8 * 60 * 1000) return
    try {
      // ★ await 를 setDetail 업데이터 안에 두면 안 된다 — 비-async 화살표 안의 await 는
      //   SyntaxError 이고, 파싱돼도 실패가 바깥 catch 로 전파되지 않는다.
      const d = await getReleaseNote(n.id)
      setDetail((p) => ({ ...p, [n.id]: { ...d, _at: Date.now() } }))
    } catch (e) {
      toast(e.message || '상세 조회 실패', 'error')
      setOpenId(null)
    }
  }

  const toggle = (n) => (openId === n.id ? setOpenId(null) : openNote(n))

  const refreshOne = (d) => {
    setDetail((p) => ({ ...p, [d.id]: d }))
    // 목록 카드의 배지(미완 선행작업·추기)도 같이 갱신돼야 한다
    setData((p) => p && {
      ...p,
      items: (p.items || []).map((x) => (x.id === d.id ? { ...x, ...pick(d) } : x)),
      drafts: (p.drafts || []).map((x) => (x.id === d.id ? { ...x, ...pick(d) } : x)),
    })
  }

  const onPrereq = async (id, index, done) => {
    try {
      refreshOne(await setReleasePrereqDone(id, index, done))
    } catch (e) {
      toast(e.message || '체크 실패', 'error')
    }
  }

  const onPostscript = async (id, text) => {
    try {
      refreshOne(await addReleasePostscript(id, text))
      toast('추기가 기록됐습니다.')
    } catch (e) {
      toast(e.message || '추기 실패', 'error')
    }
  }

  const onPublish = async (n) => {
    const ok = await confirm({
      title: `${n.version} 발행`,
      message: '발행하면 본문과 버전을 더는 고칠 수 없습니다. 이후에는 선행 작업 체크와 추기만 가능합니다.',
      confirmText: '발행',
    })
    if (!ok) return
    try {
      const d = await publishReleaseNote(n.id)
      if (d.unknown_nodes?.length) {
        toast(`발행됨 — 다이어그램에 없는 노드: ${d.unknown_nodes.join(', ')}`, 'warn')
      } else {
        toast(`${n.version} 발행 완료`)
      }
      await load()
      setOpenId(null)
      setDetail({})
    } catch (e) {
      toast(e.message || '발행 실패', 'error')
    }
  }

  const onDelete = async (n) => {
    const ok = await confirm({
      title: `${n.version} 삭제`,
      message: '작성 중인 문서를 삭제합니다.',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteReleaseNote(n.id)
      toast('삭제됐습니다.')
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
        // ★ 캐시를 비우면 열려 있던 카드가 '불러오는 중…' 에서 멈춘다(재조회는 toggle 에서만 일어난다).
        //   그래서 펼침도 함께 닫는다 — 발행 경로와 같은 처리.
        onSaved={async () => { setEditing(null); setOpenId(null); setDetail({}); await load() }}
      />
    )
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="배포 문서"
        subtitle="버전별 변경 내역과 배포 절차를 남깁니다"
        onBack={onBack}
      />

      {error && <p className={s.err}>⚠ {error}</p>}

      <div className={s.views} role="tablist">
        {VIEWS.map((v) => (
          <button key={v.key} type="button" role="tab" aria-selected={view === v.key}
            className={`${s.viewTab} ${view === v.key ? s.viewTabOn : ''}`}
            onClick={() => setView(v.key)}>{v.label}</button>
        ))}
      </div>

      {view === 'diagram' && (
        <>
          {canManage && (
            <div className={s.diagBar}>
              <button type="button" className="btn-secondary btn-sm"
                onClick={() => setEditDiagram((v) => !v)}>
                {editDiagram ? '편집 끝내기' : '구성 편집'}
              </button>
            </div>
          )}
          {loading ? <p className={s.info}>불러오는 중…</p> : editDiagram ? (
            <ReleaseDiagramEditor nodes={nodes} edges={edges}
              onChanged={() => load(true)} />
          ) : (
            <ReleaseDiagram
              nodes={nodes.filter((n) => n.is_active !== false)}
              edges={edges} notes={[...(data?.drafts || []), ...(data?.items || [])]}
              // 다이어그램에서 문서를 고르면 목록 보기로 건너가 그 카드를 펼친다
              //   (토글이 아니라 openNote — 이미 펼쳐져 있던 카드면 토글은 도로 닫아버린다)
              onOpenNote={(n) => { setView('list'); openNote(n) }}
            />
          )}
        </>
      )}

      {view === 'list' && (
      <>
      <div className={s.ctl}>
        <input className={s.search} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="버전·제목·본문 검색" aria-label="배포 문서 검색" />
        {kindOptions.length > 0 && (
          <div className={s.chips}>
            <button type="button" className={`${s.chip} ${!fKind ? s.chipOn : ''}`}
              onClick={() => setFKind('')}>전체</button>
            {kindOptions.map((k) => (
              <button key={k} type="button" className={`${s.chip} ${fKind === k ? s.chipOn : ''}`}
                aria-pressed={fKind === k} onClick={() => setFKind(fKind === k ? '' : k)}>
                {NODE_KIND_LABELS[k] || k}
              </button>
            ))}
          </div>
        )}
        {canManage && (
          <button type="button" className={`btn-primary btn-sm ${s.newBtn}`}
            onClick={() => setEditing('new')}>＋ 새 문서</button>
        )}
      </div>

      {loading && <p className={s.info}>불러오는 중…</p>}

      {!loading && drafts.length > 0 && (
        <>
          <p className={s.stripLabel}>다음 배포 예정</p>
          <div className={s.list}>
            {drafts.map((n) => (
              <NoteCard key={n.id} note={n} isDraft nodeMap={nodeMap} canManage={canManage}
                open={openId === n.id} detail={detail[n.id]} onToggle={() => toggle(n)}
                onEdit={() => setEditing(n)} onDelete={() => onDelete(n)}
                onPublish={() => onPublish(n)} onPrereq={onPrereq} onPostscript={onPostscript} />
            ))}
          </div>
        </>
      )}

      {!loading && (
        <>
          {drafts.length > 0 && <p className={s.stripLabel}>배포 이력</p>}
          <div className={s.list}>
            {/* 조회가 실패했으면 '없다' 고 단언하지 않는다 — 배너만 남기고 침묵 */}
            {items.length === 0 && !error && (
              <p className={s.info}>
                {q || fKind ? '조건에 맞는 문서가 없습니다.' : '아직 발행된 배포 문서가 없습니다.'}
              </p>
            )}
            {items.map((n) => (
              <NoteCard key={n.id} note={n} nodeMap={nodeMap} canManage={canManage}
                open={openId === n.id} detail={detail[n.id]} onToggle={() => toggle(n)}
                onPrereq={onPrereq} onPostscript={onPostscript} />
            ))}
          </div>
        </>
      )}
      </>
      )}
    </div>
  )
}

// 첨부 id → 파일명 (이미지 alt). 못 찾으면 빈 문자열 — 장식 이미지로 읽힌다
const attName = (note, id) =>
  (note.attachments || []).find((a) => a.id === id)?.filename || ''

// 목록 카드가 쓰는 요약 필드만 뽑는다 — 상세 응답으로 카드 배지를 갱신할 때
const pick = (d) => ({
  prereq_open: d.prereq_open, prereq_total: d.prereq_total,
  has_postscript: d.has_postscript, node_keys: d.node_keys,
})

// ══════════════════════════════════════════════════
// 목록 카드 + 상세 펼침
//   펼침 애니메이션은 재고 화면과 같은 grid 0fr→1fr (높이를 몰라도 부드럽게 열린다)
// ══════════════════════════════════════════════════
function NoteCard({
  note, detail, open, isDraft, nodeMap, canManage,
  onToggle, onEdit, onDelete, onPublish, onPrereq, onPostscript,
}) {
  return (
    <div className={`${s.card} ${isDraft ? s.cardDraft : ''}`}>
      {/* 키보드로도 펼칠 수 있어야 한다 — div+onClick 은 탭 이동·Enter 가 안 먹는다 */}
      <div className={s.cardHead} onClick={onToggle}
        role="button" tabIndex={0} aria-expanded={!!open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
        }}>
        <span className={s.ver}>{note.version}</span>
        <span className={s.headMain}>
          <span className={s.title}>{note.title}</span>
          {note.summary && <span className={s.summary}>{note.summary}</span>}
        </span>
        <span className={s.badges}>
          {note.prereq_open > 0 && (
            <span className={s.badgeWarn} title="아직 실행하지 않은 선행 작업">
              선행 {note.prereq_open}건
            </span>
          )}
          {note.has_postscript && <span className={s.badgeNote}>추기</span>}
          {(note.node_keys || []).map((k) => (
            <span key={k} className={s.nodeChip}>{nodeMap[k]?.name || k}</span>
          ))}
        </span>
        <span className={s.when}>
          {isDraft ? '작성 중' : fmtKstDateTime(note.released_at)}
        </span>
        <span className={s.arrow} style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
      </div>

      <div className={`${s.expand} ${open ? s.expandOpen : ''}`}>
        <div className={s.expandInner}>
          {!detail ? (
            <p className={s.info}>불러오는 중…</p>
          ) : (
            <NoteDetail note={detail} isDraft={isDraft} canManage={canManage}
              onEdit={onEdit} onDelete={onDelete} onPublish={onPublish}
              onPrereq={(i, done) => onPrereq(note.id, i, done)}
              onPostscript={(t) => onPostscript(note.id, t)} />
          )}
        </div>
      </div>
    </div>
  )
}

function NoteDetail({ note, isDraft, canManage, onEdit, onDelete, onPublish, onPrereq, onPostscript }) {
  const [ps, setPs] = useState('')
  const refs = Object.entries(note.target_refs || {})

  return (
    <div className={s.detail}>
      {isDraft && canManage && (
        <div className={s.draftBar}>
          <button type="button" className="btn-secondary btn-sm" onClick={onEdit}>수정</button>
          <button type="button" className="btn-primary btn-sm" onClick={onPublish}>발행</button>
          <button type="button" className={s.linkDanger} onClick={onDelete}>삭제</button>
        </div>
      )}

      {refs.length > 0 && (
        <div className={s.refs}>
          {refs.map(([target, r]) => (
            <span key={target} className={s.ref}>
              <b>{target}</b>
              {r?.ver ? ` ${r.ver}` : ''}
              {r?.commit ? <code className={s.commit}>{r.commit}</code> : null}
              {r?.branch ? <span className={s.muted}> · {r.branch}</span> : null}
            </span>
          ))}
        </div>
      )}

      {(note.sections || []).length > 0 && (
        <div className={s.sections}>
          {note.sections.map((sec, i) => (
            <div key={i} className={s.section}>
              <span className={`${s.kind} ${s['kind_' + sec.kind] || ''}`}>
                {SECTION_LABELS[sec.kind] || sec.kind}
              </span>
              <div className={s.secBody}>
                <p className={s.secTitle}>{sec.title}</p>
                {sec.body && <p className={s.secText}>{sec.body}</p>}
                {/* 본문은 첨부 id 만 들고 있다 — URL 은 상세 응답의 attachment_urls 에서 온다.
                    URL 이 없으면(삭제됨·발급 실패) 그냥 건너뛴다: 깨진 이미지 아이콘보다 낫다 */}
                {(sec.images || []).length > 0 && (
                  <div className={s.secImgs}>
                    {sec.images.map((id) => (note.attachment_urls?.[id] ? (
                      <a key={id} href={note.attachment_urls[id]} target="_blank" rel="noreferrer">
                        <img className={s.secImg} src={note.attachment_urls[id]}
                          alt={attName(note, id)} loading="lazy" />
                      </a>
                    ) : null))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(note.prereqs || []).length > 0 && (
        <div className={s.prereqs}>
          <p className={s.blockLab}>
            선행 작업 <span className={s.muted}>· 위에서부터 순서대로</span>
          </p>
          {note.prereqs.map((p, i) => (
            <div key={i} className={`${s.prereq} ${p.done ? s.prereqDone : ''}`}>
              <label className={s.check}>
                <input type="checkbox" checked={!!p.done} disabled={!canManage}
                  onChange={(e) => onPrereq(i, e.target.checked)} />
                <span className={s.no}>{i + 1}</span>
              </label>
              <div className={s.prereqBody}>
                <p className={s.prereqTop}>
                  <span className={s.prereqKind}>{PREREQ_LABELS[p.kind] || p.kind}</span>
                  <span className={s.prereqEnv}>{ENV_LABELS[p.env] || p.env}</span>
                  {p.migration_no && <span className={s.muted}>마이그 {p.migration_no}</span>}
                  {p.done && p.done_at && (
                    <span className={s.doneMark}>
                      ✓ {fmtKstDateTime(p.done_at)}{p.done_by ? ` · ${p.done_by}` : ''}
                    </span>
                  )}
                </p>
                <p className={s.prereqText}>{p.text}</p>
                {/* sql 원문은 관리 권한자에게만 온다 — 열람자에겐 has_sql 만 (BE 가 마스킹) */}
                {p.sql ? <pre className={s.sql}>{p.sql}</pre>
                  : p.has_sql ? <p className={s.muted}>실행 SQL 있음 (관리 권한 필요)</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {(note.postscript || []).length > 0 && (
        <div className={s.psList}>
          <p className={s.blockLab}>배포 후 기록</p>
          {note.postscript.map((p, i) => (
            <div key={i} className={s.ps}>
              <span className={s.psMeta}>{fmtKstDateTime(p.at)}{p.author ? ` · ${p.author}` : ''}</span>
              <p className={s.psText}>{p.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* 추기는 발행분에만 — draft 는 본문을 직접 고치면 된다 */}
      {!isDraft && canManage && (
        <div className={s.psAdd}>
          <input className={s.psInput} value={ps} maxLength={1000}
            placeholder="배포 후 발견한 문제나 후속 조치를 남겨두세요"
            onChange={(e) => setPs(e.target.value)} />
          <button type="button" className="btn-secondary btn-sm" disabled={!ps.trim()}
            onClick={() => { onPostscript(ps.trim()); setPs('') }}>추기</button>
        </div>
      )}

      <p className={s.foot}>
        작성 {note.author || '—'} · {fmtKstDateTime(note.created_at)}
        {note.released_at ? ` · 발행 ${fmtKstDateTime(note.released_at)}` : ''}
      </p>
    </div>
  )
}
