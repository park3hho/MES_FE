// src/pages/mypage/FeedbackForm.jsx
// 피드백 제출 폼 (에러 신고 / 개선 제안) — 마이페이지 sub-view (2026-05-07)
// Toss flat 스타일 — 카드 안 섹션, 토글 버튼, textarea, 첨부 (선택)

import { useState, useEffect, useRef } from 'react'
import { submitFeedback, attachFeedback, listMyFeedback } from '@/api'
import s from './FeedbackForm.module.css'
import sMy from './MyPage.module.css'

const CATEGORY_OPTIONS = [
  { key: 'error', label: '🐞 에러 신고', desc: '잘못 동작하는 부분' },
  { key: 'improvement', label: '💡 개선 제안', desc: '있었으면 하는 기능' },
]

const STATUS_LABEL = {
  open: '접수됨',
  in_progress: '확인 중',
  resolved: '해결됨',
  dismissed: '반려',
}

const STATUS_CLASS = {
  open: s.statusOpen,
  in_progress: s.statusProgress,
  resolved: s.statusResolved,
  dismissed: s.statusDismissed,
}

// ISO → "MM/DD HH:mm"
function fmtTime(iso) {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

export default function FeedbackForm({ onClose }) {
  const [tab, setTab] = useState('write')   // 'write' | 'history'

  // ── 작성 폼 ──
  const [category, setCategory] = useState('error')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [locationText, setLocationText] = useState('')
  const [file, setFile] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [doneMsg, setDoneMsg] = useState(null)
  const fileInputRef = useRef(null)

  // 허용 확장자 — BE feedback_service.ALLOWED_EXTENSIONS 와 동기화
  const ALLOWED_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf']
  const MAX_MB = 10

  // ── 본인 이력 ──
  const [history, setHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)

  useEffect(() => {
    if (tab !== 'history') return
    let alive = true
    setHistoryLoading(true)
    setHistoryError(null)
    listMyFeedback()
      .then((items) => { if (alive) setHistory(items) })
      .catch((e) => { if (alive) setHistoryError(e.message || '조회 실패') })
      .finally(() => { if (alive) setHistoryLoading(false) })
    return () => { alive = false }
  }, [tab])

  // 자동 사라짐 (성공 메시지 / 에러)
  useEffect(() => {
    if (!doneMsg) return
    const t = setTimeout(() => setDoneMsg(null), 2500)
    return () => clearTimeout(t)
  }, [doneMsg])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 3000)
    return () => clearTimeout(t)
  }, [error])

  const resetForm = () => {
    setTitle('')
    setBody('')
    setLocationText('')
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async () => {
    setError(null)
    if (!title.trim()) return setError('제목을 입력해주세요.')
    if (!body.trim()) return setError('내용을 입력해주세요.')

    setSubmitting(true)
    try {
      // 발생 위치 자동 — 직전 화면 (referrer) + 현재. 마이페이지에서 작성하니 referrer 가 더 의미 있음
      const page_url = document.referrer
        ? new URL(document.referrer).pathname
        : window.location.pathname
      const created = await submitFeedback({
        category,
        title: title.trim(),
        body: body.trim(),
        page_url,
        location_text: locationText.trim(),
      })
      // 첨부 있으면 이어서 업로드
      if (file && created?.id) {
        try {
          await attachFeedback(created.id, file)
        } catch (e) {
          // 본 제출은 성공이므로 첨부 실패는 별개 안내. BE detail 그대로 노출 — 사용자가 원인 (확장자/크기 등) 즉시 확인 가능
          setDoneMsg(`제출 성공 — 첨부 업로드 실패: ${e.message || '알 수 없는 오류'}`)
          resetForm()
          return
        }
      }
      setDoneMsg('피드백이 접수됐어요. 감사합니다 🙏')
      resetForm()
    } catch (e) {
      setError(e.message || '제출 실패')
    } finally {
      setSubmitting(false)
    }
  }

  // ────────────────────────────────────────
  // 렌더
  // ────────────────────────────────────────
  return (
    <div className="page">
      <div className={`card ${sMy.card}`}>
        <div className={sMy.settingsHeader}>
          <span className={sMy.settingsTitle}>피드백</span>
          <button className={sMy.closeBtn} onClick={onClose} aria-label="닫기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* 탭 */}
        <div className={s.tabRow}>
          <button
            className={`${s.tabBtn} ${tab === 'write' ? s.tabBtnActive : ''}`}
            onClick={() => setTab('write')}
          >
            보내기
          </button>
          <button
            className={`${s.tabBtn} ${tab === 'history' ? s.tabBtnActive : ''}`}
            onClick={() => setTab('history')}
          >
            내 이력
          </button>
        </div>

        {tab === 'write' && (
          <>
            {/* 카테고리 — 에러/개선 토글 */}
            <div className={s.categoryRow}>
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`${s.categoryBtn} ${category === opt.key ? s.categoryBtnActive : ''}`}
                  onClick={() => setCategory(opt.key)}
                  disabled={submitting}
                >
                  <span className={s.categoryLabel}>{opt.label}</span>
                  <span className={s.categoryDesc}>{opt.desc}</span>
                </button>
              ))}
            </div>

            {/* 제목 */}
            <div className={s.field}>
              <label className={s.label}>제목</label>
              <input
                type="text"
                className={s.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={category === 'error' ? '예: OQ 검사 저장 시 에러' : '예: 모델 색상 선택 더 다양하게'}
                maxLength={100}
                disabled={submitting}
              />
            </div>

            {/* 내용 */}
            <div className={s.field}>
              <label className={s.label}>내용</label>
              <textarea
                className={s.textarea}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={category === 'error'
                  ? '어떤 동작을 하다가 무슨 문제가 생겼는지 적어주세요.'
                  : '어떤 부분을 어떻게 바꾸면 좋을지 적어주세요.'}
                rows={5}
                disabled={submitting}
              />
            </div>

            {/* 발생 위치 보강 — 자유 입력 (선택) */}
            <div className={s.field}>
              <label className={s.label}>
                위치 보강 <span className={s.optional}>(선택)</span>
              </label>
              <input
                type="text"
                className={s.input}
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="예: OQ 검사 입력 화면, R 슬롯"
                maxLength={200}
                disabled={submitting}
              />
              <small className={s.hint}>현재 페이지 URL 은 자동으로 같이 전송돼요.</small>
            </div>

            {/* 첨부 (선택) — accept 명시적 + 클라이언트단 즉시 검증 (HEIC 등 모바일 자동 변환 방지) */}
            <div className={s.field}>
              <label className={s.label}>
                첨부 <span className={s.optional}>(선택, {MAX_MB}MB 이하 · {ALLOWED_EXTS.join(' / ')})</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                className={s.fileInput}
                accept={ALLOWED_EXTS.join(',')}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) { setFile(null); return }
                  // 즉시 검증 — 확장자 / 크기. 통과 못하면 input 비우고 에러
                  const ext = '.' + (f.name.split('.').pop() || '').toLowerCase()
                  if (!ALLOWED_EXTS.includes(ext)) {
                    setError(`'${f.name}' 의 확장자 ${ext} 는 첨부할 수 없어요. 가능: ${ALLOWED_EXTS.join(', ')}`)
                    setFile(null)
                    e.target.value = ''
                    return
                  }
                  if (f.size > MAX_MB * 1024 * 1024) {
                    setError(`'${f.name}' 은 ${MAX_MB}MB 를 넘어요 (${(f.size / 1024 / 1024).toFixed(1)}MB).`)
                    setFile(null)
                    e.target.value = ''
                    return
                  }
                  setFile(f)
                }}
                disabled={submitting}
              />
              {file && (
                <small className={s.hint}>
                  📎 {file.name} ({(file.size / 1024).toFixed(0)} KB)
                </small>
              )}
            </div>

            {error && <p className={s.errMsg}>⚠ {error}</p>}
            {doneMsg && <p className={s.okMsg}>✓ {doneMsg}</p>}

            <button
              type="button"
              className={s.submitBtn}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? '보내는 중...' : '보내기'}
            </button>
          </>
        )}

        {tab === 'history' && (
          <div className={s.historyWrap}>
            {historyLoading && <p className={sMy.historyEmpty}>불러오는 중...</p>}
            {historyError && <p className={sMy.historyError}>⚠ {historyError}</p>}
            {history && history.length === 0 && (
              <p className={sMy.historyEmpty}>아직 보낸 피드백이 없어요.</p>
            )}
            {history && history.length > 0 && (
              <ul className={s.historyList}>
                {history.map((it) => (
                  <li key={it.id} className={s.historyItem}>
                    <div className={s.historyTop}>
                      <span className={s.historyCategory}>
                        {it.category === 'error' ? '🐞 에러' : '💡 개선'}
                      </span>
                      <span className={`${s.statusBadge} ${STATUS_CLASS[it.status] || ''}`}>
                        {STATUS_LABEL[it.status] || it.status}
                      </span>
                    </div>
                    <div className={s.historyTitle}>{it.title}</div>
                    <div className={s.historyBody}>{it.body}</div>
                    {it.admin_note && (
                      <div className={s.adminNote}>
                        <span className={s.adminNoteLabel}>관리자 답변</span>
                        <span className={s.adminNoteText}>{it.admin_note}</span>
                      </div>
                    )}
                    <div className={s.historyMeta}>
                      <span>{fmtTime(it.created_at)}</span>
                      {it.has_attachment && <span>📎 첨부 있음</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
