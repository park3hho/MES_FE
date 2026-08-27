// pages/process/manage/ReleaseNoteDoc.jsx
// 배포 문서 본문 — 3단 레이아웃의 가운데 (2026-08-27 문서형 전환).
//
// ★ 아코디언(카드 펼침)에서 '한 문서를 통째로 읽는' 방식으로 바뀌었다. 문서 하나가
//   섹션 여러 개 + 이미지 + 선행 작업 + 추기를 담으므로 펼침 목록으로는 읽히지 않는다.
// ★ 각 블록에 id 를 단다 — 우측 목차가 이 id 로 점프한다. id 규칙을 바꾸면 목차가 조용히 죽는다.
import { useState } from 'react'

import { SECTION_LABELS, PREREQ_LABELS, ENV_LABELS } from '@/constants/releaseConst'
import { fmtKstDateTime } from '@/utils/dateConvert'

import s from './ReleaseNotePage.module.css'

// 목차와 본문이 같은 규칙을 쓰도록 여기 한 곳에서만 만든다
export const secAnchor = (i) => `rn-sec-${i}`
export const ANCHOR_PREREQ = 'rn-prereq'
export const ANCHOR_POST = 'rn-post'

// 첨부 id → 파일명 (이미지 alt). 못 찾으면 빈 문자열 — 장식 이미지로 읽힌다
const attName = (note, id) =>
  (note.attachments || []).find((a) => a.id === id)?.filename || ''

export default function ReleaseNoteDoc({
  note, canManage, onEdit, onDelete, onPublish, onPrereq, onPostscript,
}) {
  const [ps, setPs] = useState('')
  const isDraft = note.is_draft

  return (
    <article className={s.doc}>
      <header className={s.docHead}>
        <div className={s.docTitleRow}>
          <span className={s.docVer}>{note.version}</span>
          {isDraft && <span className={s.draftTag}>작성 중</span>}
        </div>
        <h1 className={s.docTitle}>{note.title}</h1>
        {note.summary && <p className={s.docSummary}>{note.summary}</p>}
        <p className={s.docMeta}>
          {isDraft ? '아직 배포되지 않았습니다' : `배포 ${fmtKstDateTime(note.released_at)}`}
          {note.author ? ` · 작성 ${note.author}` : ''}
        </p>
        {isDraft && canManage && (
          <div className={s.docActions}>
            <button type="button" className="btn-secondary btn-sm" onClick={onEdit}>수정</button>
            <button type="button" className="btn-primary btn-sm" onClick={onPublish}>발행</button>
            <button type="button" className={s.linkDanger} onClick={onDelete}>삭제</button>
          </div>
        )}
      </header>

      {(note.sections || []).length > 0 && (
        <section className={s.sections}>
          {note.sections.map((sec, i) => (
            <div key={i} id={secAnchor(i)} className={s.section}>
              <span className={`${s.kind} ${s['kind_' + sec.kind] || ''}`}>
                {SECTION_LABELS[sec.kind] || sec.kind}
              </span>
              <div className={s.secBody}>
                <p className={s.secTitle}>{sec.title}</p>
                {sec.body && <p className={s.secText}>{sec.body}</p>}
                {/* 본문은 첨부 id 만 들고 있다 — URL 은 상세 응답의 attachment_urls 에서 온다.
                    URL 이 없으면(삭제됨·발급 실패) 건너뛴다: 깨진 이미지 아이콘보다 낫다 */}
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
        </section>
      )}

      {(note.prereqs || []).length > 0 && (
        <section id={ANCHOR_PREREQ} className={s.prereqs}>
          <h2 className={s.blockLab}>
            선행 작업 <span className={s.muted}>· 위에서부터 순서대로</span>
          </h2>
          {note.prereqs.map((p, i) => (
            <div key={p.uid || i} className={`${s.prereq} ${p.done ? s.prereqDone : ''}`}>
              <label className={s.check}>
                {/* 대상은 인덱스가 아니라 uid — 편집으로 순서가 바뀌어도 같은 항목을 가리킨다 */}
                <input type="checkbox" checked={!!p.done} disabled={!canManage || !p.uid}
                  onChange={(e) => onPrereq(p.uid, e.target.checked)} />
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
        </section>
      )}

      {((note.postscript || []).length > 0 || (!isDraft && canManage)) && (
        <section id={ANCHOR_POST} className={s.psList}>
          <h2 className={s.blockLab}>배포 후 기록</h2>
          {(note.postscript || []).map((p, i) => (
            <div key={i} className={s.ps}>
              <span className={s.psMeta}>{fmtKstDateTime(p.at)}{p.author ? ` · ${p.author}` : ''}</span>
              <p className={s.psText}>{p.text}</p>
            </div>
          ))}
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
        </section>
      )}

      <footer className={s.foot}>
        작성 {note.author || '—'} · {fmtKstDateTime(note.created_at)}
        {note.released_at ? ` · 발행 ${fmtKstDateTime(note.released_at)}` : ''}
      </footer>
    </article>
  )
}
