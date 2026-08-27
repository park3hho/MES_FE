// pages/process/manage/ReleaseNoteEditor.jsx
// 배포 문서 작성·수정 (2026-08-27) — draft 전용. 발행되면 BE 가 409 로 막는다.
//
// ★ 선행 작업의 done 3필드는 그대로 왕복시킨다 — 편집 저장이 이미 실행한 체크를 지우면 안 된다.
//   BE 도 'done 키가 없으면 기존 값 유지' 로 방어하지만, 화면이 값을 들고 있으면 그게 더 명확하다.
// ★ 섹션의 node 는 다이어그램 노드 key — 발행 시 이 값들이 정션(노드 클릭 필터)으로 파생된다.
//   그래서 자유 입력이 아니라 등록된 노드 중에서 고르게 한다(오타 하나면 필터에서 조용히 빠진다).
import { useState, useEffect } from 'react'

import {
  createReleaseNote, updateReleaseNote, getReleaseNote,
  uploadReleaseAttachment, deleteReleaseAttachment,
} from '@/api'
import PageHeader from '@/components/common/PageHeader'
import {
  RELEASE_SECTION_KINDS, RELEASE_PREREQ_KINDS, RELEASE_PREREQ_ENVS, RELEASE_TARGETS,
  SECTION_LABELS, PREREQ_LABELS, ENV_LABELS, TARGET_LABELS,
} from '@/constants/releaseConst'
import { useToast } from '@/contexts/ToastContext'
// 현장 폰 사진 원본이 그대로 올라가지 않게 — 품목 첨부와 같은 유틸을 쓴다
import { downscaleImageIfNeeded, parseUploadError, isImageFile } from '@/utils/imageCompress'

import s from './ReleaseNotePage.module.css'

const emptySection = () => ({ kind: 'feature', node: '', title: '', body: '', images: [] })
const emptyPrereq = () => ({
  kind: 'sql', env: 'prod', text: '', sql: '', migration_no: '',
  done: false, done_at: '', done_by: '',
})
// 기본 target 을 비워 둔다 — 'BE' 를 기본값으로 두면 '＋ 대상 추가' 두 번에 같은 키가 생겨
//   접는 과정에서 앞 행이 조용히 사라진다(아래 중복 검사와 짝).
const emptyRef = () => ({ target: '', ver: '', commit: '', branch: '' })

// 클라이언트 업로드 한도 — BE RELEASE_ATTACH_MAX_MB(기본 10MB)보다 살짝 작게 잡아
//   nginx·네트워크 마진을 둔다 (ItemManagePage 의 20MB→18MB 관례와 같은 규칙).
const ATTACH_MAX_BYTES = 9 * 1024 * 1024
const fmtSize = (b) => `${(b / 1024 / 1024).toFixed(1)}MB`

// target_refs 는 저장 형태가 {BE: {...}} 객체 — 화면은 순서 있는 배열로 다루고 저장 때 접는다
const refsToRows = (obj) =>
  Object.entries(obj || {}).map(([target, r]) => ({
    target, ver: r?.ver || '', commit: r?.commit || '', branch: r?.branch || '',
  }))
const rowsToRefs = (rows) => {
  const out = {}
  for (const r of rows) {
    // 알맹이 없는 행은 저장하지 않는다 — sections/prereqs 의 빈 항목 필터와 같은 규칙.
    //   안 그러면 모든 문서 상세에 값 없는 대상 칩이 하나씩 붙는다.
    if (!r.target || !(r.ver.trim() || r.commit.trim() || r.branch.trim())) continue
    out[r.target] = { ver: r.ver.trim(), commit: r.commit.trim(), branch: r.branch.trim() }
  }
  return out
}
// 같은 대상이 두 줄이면 접을 때 뒤엣것이 앞엣것을 덮어쓴다 — 저장 전에 잡아 알린다
const dupTargets = (rows) => {
  const seen = new Set()
  const dup = new Set()
  for (const r of rows) {
    if (!r.target) continue
    if (seen.has(r.target)) dup.add(r.target)
    seen.add(r.target)
  }
  return [...dup]
}

export default function ReleaseNoteEditor({ note, nodes, onClose, onSaved }) {
  const toast = useToast()
  const isNew = !note
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // 목록 카드에는 본문이 없다 — 수정 진입 시 상세를 한 번 받아 채운다
  const [loaded, setLoaded] = useState(isNew)
  // ★ 로드에 실패한 채 저장하면 빈 폼이 기존 본문·선행작업·체크오프를 통째로 덮어쓴다.
  //   (PATCH 는 보낸 필드를 그대로 반영하므로 '빈 배열'도 유효한 값이다) → 저장을 잠근다.
  const [loadFailed, setLoadFailed] = useState(false)
  // 첨부 — 이미 저장된 draft 에만 붙일 수 있다(문서 id 가 있어야 S3 키가 정해진다)
  const [atts, setAtts] = useState([])          // [{id, filename, kind}]
  const [attUrls, setAttUrls] = useState({})    // {id: presigned URL}
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState(() => ({
    ver_major: 1, ver_minor: 0, ver_patch: 0,
    title: '', summary: '',
    refs: [emptyRef()],
    sections: [emptySection()],
    prereqs: [],
  }))

  // 수정 모드 — 상세 1건 로드 (draft 라 sql 원문도 그대로 온다: 관리 권한 화면)
  const noteId = note?.id
  useEffect(() => {
    if (!noteId) return undefined
    let alive = true
    getReleaseNote(noteId)
      .then((d) => {
        if (!alive) return
        const rows = refsToRows(d.target_refs)
        setForm({
          ver_major: d.ver_major, ver_minor: d.ver_minor, ver_patch: d.ver_patch,
          title: d.title || '', summary: d.summary || '',
          refs: rows.length ? rows : [emptyRef()],
          sections: (d.sections || []).length ? d.sections : [emptySection()],
          prereqs: d.prereqs || [],
        })
        setAtts(d.attachments || [])
        setAttUrls(d.attachment_urls || {})
        setLoaded(true)
      })
      .catch((e) => {
        if (!alive) return
        setError(`${e.message || '조회 실패'} — 내용을 불러오지 못해 저장할 수 없습니다.`)
        setLoadFailed(true)
        setLoaded(true)
      })
    return () => { alive = false }
  }, [noteId])

  const set = (patch) => setForm((p) => ({ ...p, ...patch }))
  const setAt = (key, i, patch) => setForm((p) => ({
    ...p, [key]: p[key].map((x, j) => (j === i ? { ...x, ...patch } : x)),
  }))
  const addAt = (key, make) => setForm((p) => ({ ...p, [key]: [...p[key], make()] }))
  const delAt = (key, i) => setForm((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) }))
  const moveAt = (key, i, dir) => setForm((p) => {
    const arr = [...p[key]]
    const j = i + dir
    if (j < 0 || j >= arr.length) return p
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    return { ...p, [key]: arr }
  })

  // 첨부 업로드 — 이미지는 올리기 전에 줄인다(현장 폰 원본은 수 MB)
  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''            // 같은 파일을 다시 고를 수 있게
    if (!file || !noteId) return
    setUploading(true)
    setError('')
    try {
      // ★ downscaleImageIfNeeded 는 maxBytes 가 **필수**이고 File 이 아니라 {file, compressed,…} 를 준다.
      //   (인자를 빼면 파일 크기와 무관하게 즉시 throw — 이미지 업로드가 전부 실패한다)
      let body = file
      if (isImageFile(file)) {
        const r = await downscaleImageIfNeeded(file, { maxBytes: ATTACH_MAX_BYTES })
        body = r.file
        if (r.compressed) {
          toast(`자동 압축: ${fmtSize(r.originalSize)} → ${fmtSize(r.compressedSize)}`, 'info')
        }
      } else if (file.size > ATTACH_MAX_BYTES) {
        setError(`파일이 너무 큽니다 (${fmtSize(file.size)}) — 직접 줄여서 올려주세요.`)
        return
      }
      const a = await uploadReleaseAttachment(noteId, body)
      // 서버 재조회 없이 로컬 미리보기 — 저장 후 다시 열면 서버 presigned URL 로 대체된다
      setAtts((p) => [...p, a])
      setAttUrls((p) => ({ ...p, [a.id]: URL.createObjectURL(body) }))
    } catch (err) {
      setError(parseUploadError(err) || err.message || '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  const removeAtt = async (a) => {
    try {
      await deleteReleaseAttachment(a.id)
      setAtts((p) => p.filter((x) => x.id !== a.id))
      // 본문에서 이 이미지를 참조하던 섹션도 정리 — 지워진 id 가 남으면 빈 칸이 뜬다
      setForm((p) => ({
        ...p,
        sections: p.sections.map((sec) => ({
          ...sec, images: (sec.images || []).filter((i) => i !== a.id),
        })),
      }))
    } catch (err) {
      setError(err.message || '첨부 삭제 실패')
    }
  }

  // 섹션에 이미지 붙이기/떼기 — 본문은 attachment id 만 들고 있는다
  const toggleImage = (i, attId) => setForm((p) => ({
    ...p,
    sections: p.sections.map((sec, j) => {
      if (j !== i) return sec
      const cur = sec.images || []
      return { ...sec, images: cur.includes(attId) ? cur.filter((x) => x !== attId) : [...cur, attId] }
    }),
  }))

  const save = async () => {
    if (loadFailed) return
    if (!form.title.trim()) { setError('제목을 입력해주세요.'); return }
    const dup = dupTargets(form.refs)
    if (dup.length) {
      setError(`배포 대상이 중복됩니다 (${dup.join(', ')}) — 같은 대상은 한 줄로 적어주세요.`)
      return
    }
    setBusy(true)
    setError('')
    const body = {
      title: form.title.trim(),
      summary: form.summary.trim(),
      target_refs: rowsToRefs(form.refs),
      // 빈 섹션(제목 없음)은 저장하지 않는다 — 기본 1행이 늘 따라붙는 걸 막는다
      sections: form.sections.filter((x) => x.title.trim() || x.body.trim()),
      prereqs: form.prereqs.filter((x) => x.text.trim() || x.sql.trim()),
    }
    try {
      if (isNew) {
        // 정수만 — BE ver_* 는 int 라 '1.5' 를 보내면 영문 Pydantic 메시지로 422 가 뜬다
        const int0 = (v) => Math.trunc(Number(v)) || 0
        await createReleaseNote({
          ver_major: int0(form.ver_major),
          ver_minor: int0(form.ver_minor),
          ver_patch: int0(form.ver_patch),
          ...body,
        })
        toast('작성됐습니다. 확인 후 발행하세요.')
      } else {
        await updateReleaseNote(note.id, body)
        toast('저장됐습니다.')
      }
      await onSaved()
    } catch (e) {
      setError(e.message || '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) {
    return (
      <div className="page-flat">
        <PageHeader title="배포 문서" subtitle="불러오는 중…" onBack={onClose} />
      </div>
    )
  }

  return (
    <div className="page-flat">
      <PageHeader
        title={isNew ? '배포 문서 작성' : `배포 문서 수정 · ${note.version}`}
        subtitle="작성 후 발행하면 본문은 고칠 수 없습니다"
        onBack={onClose}
      />

      {error && <p className={s.err}>⚠ {error}</p>}

      {isNew && (
        <div className={s.field}>
          <span className={s.fLab}>버전</span>
          <div className={s.verRow}>
            {['ver_major', 'ver_minor', 'ver_patch'].map((k, i) => (
              <span key={k} className={s.verCell}>
                {i > 0 && <span className={s.dot}>.</span>}
                <input className={s.verInput} type="number" min={0} step={1} value={form[k]}
                  onChange={(e) => set({ [k]: e.target.value })} />
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={s.field}>
        <span className={s.fLab}>제목</span>
        <input className={s.input} value={form.title} maxLength={100}
          placeholder="이번 배포를 한 줄로"
          onChange={(e) => set({ title: e.target.value })} />
      </div>

      <div className={s.field}>
        <span className={s.fLab}>요약</span>
        <textarea className={s.textarea} value={form.summary} rows={2}
          placeholder="목록에 보일 짧은 설명"
          onChange={(e) => set({ summary: e.target.value })} />
      </div>

      {/* 배포된 코드 식별자 — "무엇이 나갔는지" 를 박제한다 (FE 만 배포된 사고를 기록하려면 필수) */}
      <div className={s.block}>
        <p className={s.blockLab}>배포 대상 <span className={s.muted}>· 나간 버전·커밋</span></p>
        {form.refs.map((r, i) => (
          <div key={i} className={s.row}>
            <select className={s.sel} value={r.target}
              onChange={(e) => setAt('refs', i, { target: e.target.value })}>
              <option value="">대상 선택</option>
              {RELEASE_TARGETS.map((k) => (
                <option key={k} value={k}>{TARGET_LABELS[k] || k}</option>
              ))}
            </select>
            <input className={s.input} value={r.ver} placeholder="버전 (1.0.0)"
              onChange={(e) => setAt('refs', i, { ver: e.target.value })} />
            <input className={s.input} value={r.commit} placeholder="커밋 (d6f5a97)"
              onChange={(e) => setAt('refs', i, { commit: e.target.value })} />
            <input className={s.input} value={r.branch} placeholder="브랜치 (main)"
              onChange={(e) => setAt('refs', i, { branch: e.target.value })} />
            <button type="button" className={s.rowDel} onClick={() => delAt('refs', i)}>✕</button>
          </div>
        ))}
        <button type="button" className={s.addRow} onClick={() => addAt('refs', emptyRef)}>＋ 대상 추가</button>
      </div>

      {/* 본문 — 섹션의 node 가 다이어그램 필터의 근거가 된다 */}
      <div className={s.block}>
        <p className={s.blockLab}>변경 내역</p>
        {form.sections.map((sec, i) => (
          <div key={i} className={s.secEdit}>
            <div className={s.row}>
              <select className={s.sel} value={sec.kind}
                onChange={(e) => setAt('sections', i, { kind: e.target.value })}>
                {RELEASE_SECTION_KINDS.map((k) => (
                  <option key={k} value={k}>{SECTION_LABELS[k] || k}</option>
                ))}
              </select>
              <select className={s.sel} value={sec.node}
                onChange={(e) => setAt('sections', i, { node: e.target.value })}>
                <option value="">시스템 선택 안 함</option>
                {/* 저장된 값이 목록에 없으면(은퇴·미등록 노드, 또는 다이어그램 조회 실패)
                    option 이 없어 '선택 안 함' 처럼 보인다 — 값이 살아 있음을 보여준다 */}
                {sec.node && !nodes.some((n) => n.key === sec.node) && (
                  <option value={sec.node}>{sec.node} (미등록·은퇴)</option>
                )}
                {nodes.map((n) => <option key={n.key} value={n.key}>{n.name}</option>)}
              </select>
              <input className={s.input} value={sec.title} maxLength={100} placeholder="무엇이 바뀌었나"
                onChange={(e) => setAt('sections', i, { title: e.target.value })} />
              <button type="button" className={s.rowDel} title="위로"
                onClick={() => moveAt('sections', i, -1)}>↑</button>
              <button type="button" className={s.rowDel} title="아래로"
                onClick={() => moveAt('sections', i, 1)}>↓</button>
              <button type="button" className={s.rowDel} onClick={() => delAt('sections', i)}>✕</button>
            </div>
            <textarea className={s.textarea} value={sec.body} rows={3}
              placeholder="자세한 설명 — 왜 바꿨는지, 무엇이 달라지는지"
              onChange={(e) => setAt('sections', i, { body: e.target.value })} />
            {/* 올려둔 첨부 중에서 이 항목에 붙일 것을 고른다 (본문은 id 만 들고 있는다) */}
            {atts.length > 0 && (
              <div className={s.imgPick}>
                {atts.map((a) => {
                  const on = (sec.images || []).includes(a.id)
                  return (
                    <button key={a.id} type="button"
                      className={`${s.imgChip} ${on ? s.imgChipOn : ''}`}
                      aria-pressed={on} onClick={() => toggleImage(i, a.id)}>
                      {a.kind === 'photo' && attUrls[a.id]
                        ? <img className={s.imgThumb} src={attUrls[a.id]} alt="" />
                        : <span className={s.fileMark}>파일</span>}
                      <span className={s.imgName}>{a.filename}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
        <button type="button" className={s.addRow}
          onClick={() => addAt('sections', emptySection)}>＋ 항목 추가</button>
      </div>

      {/* 첨부 — 문서가 저장된 뒤에만 붙일 수 있다(파일 경로에 문서 id 가 들어간다) */}
      <div className={s.block}>
        <p className={s.blockLab}>
          이미지·첨부 <span className={s.muted}>· 올린 뒤 위 변경 내역 항목에 붙이세요</span>
        </p>
        {isNew ? (
          <p className={s.muted}>먼저 문서를 <b>작성</b>한 뒤 다시 열어 이미지를 올릴 수 있습니다.</p>
        ) : (
          <>
            <div className={s.attList}>
              {atts.length === 0 && <p className={s.muted}>올린 파일이 없습니다.</p>}
              {atts.map((a) => (
                <div key={a.id} className={s.attItem}>
                  {a.kind === 'photo' && attUrls[a.id]
                    ? <img className={s.attThumb} src={attUrls[a.id]} alt={a.filename} />
                    : <span className={s.fileMark}>파일</span>}
                  <span className={s.imgName}>{a.filename}</span>
                  <button type="button" className={s.rowDel} title="삭제"
                    onClick={() => removeAtt(a)}>✕</button>
                </div>
              ))}
            </div>
            <label className={s.upload}>
              <input type="file" accept="image/*,.pdf" hidden disabled={uploading}
                onChange={onPickFile} />
              {uploading ? '올리는 중…' : '＋ 파일 올리기'}
            </label>
          </>
        )}
      </div>

      {/* 선행 작업 — 이 프로젝트가 반복해서 넘어졌던 지점(마이그·권한 시드 미실행)의 방지책 */}
      <div className={s.block}>
        <p className={s.blockLab}>
          선행 작업 <span className={s.muted}>· 배포 전에 실행할 것. 순서대로 적으세요</span>
        </p>
        {form.prereqs.map((p, i) => (
          <div key={i} className={s.secEdit}>
            <div className={s.row}>
              <span className={s.no}>{i + 1}</span>
              <select className={s.sel} value={p.kind}
                onChange={(e) => setAt('prereqs', i, { kind: e.target.value })}>
                {RELEASE_PREREQ_KINDS.map((k) => (
                  <option key={k} value={k}>{PREREQ_LABELS[k] || k}</option>
                ))}
              </select>
              <select className={s.sel} value={p.env}
                onChange={(e) => setAt('prereqs', i, { env: e.target.value })}>
                {RELEASE_PREREQ_ENVS.map((k) => (
                  <option key={k} value={k}>{ENV_LABELS[k] || k}</option>
                ))}
              </select>
              <input className={s.input} value={p.text} maxLength={300} placeholder="할 일"
                onChange={(e) => setAt('prereqs', i, { text: e.target.value })} />
              <input className={s.inputNarrow} value={p.migration_no} placeholder="마이그 번호"
                onChange={(e) => setAt('prereqs', i, { migration_no: e.target.value })} />
              <button type="button" className={s.rowDel} title="위로"
                onClick={() => moveAt('prereqs', i, -1)}>↑</button>
              <button type="button" className={s.rowDel} title="아래로"
                onClick={() => moveAt('prereqs', i, 1)}>↓</button>
              <button type="button" className={s.rowDel} onClick={() => delAt('prereqs', i)}>✕</button>
            </div>
            <textarea className={`${s.textarea} ${s.mono}`} value={p.sql} rows={2}
              placeholder="실행할 SQL / 명령 (선택) — 관리 권한자에게만 보입니다"
              onChange={(e) => setAt('prereqs', i, { sql: e.target.value })} />
            {p.done && (
              <p className={s.doneMark}>✓ 이미 실행 처리된 항목입니다 (체크는 목록 화면에서)</p>
            )}
          </div>
        ))}
        <button type="button" className={s.addRow}
          onClick={() => addAt('prereqs', emptyPrereq)}>＋ 선행 작업 추가</button>
      </div>

      <div className={s.saveBar}>
        <button type="button" className="btn-secondary" onClick={onClose}>취소</button>
        <button type="button" className="btn-primary" disabled={busy || loadFailed} onClick={save}
          title={loadFailed ? '내용을 불러오지 못해 저장할 수 없습니다' : ''}>
          {busy ? '저장 중…' : isNew ? '작성' : '저장'}
        </button>
      </div>
    </div>
  )
}
