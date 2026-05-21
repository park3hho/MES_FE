// src/pages/adm/manage/AdminFeedbackPage.jsx
// 사용자 피드백 — 어드민 처리 화면 (2026-05-07)
// 권한: Feature.ADMIN_FEEDBACK (team_rnd + general_admin)

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  listAdminFeedback, updateAdminFeedback, getFeedbackAttachmentUrl,
} from '@/api'
import { TOAST_MSG_MS } from '@/constants/etcConst'
import s from './AdminFeedbackPage.module.css'

const STATUS_TABS = [
  { key: '',             label: '전체' },
  { key: 'open',         label: '접수' },
  { key: 'in_progress',  label: '확인중' },
  { key: 'resolved',     label: '해결' },
  { key: 'dismissed',    label: '반려' },
]

const STATUS_OPTIONS = [
  { value: 'open',         label: '접수' },
  { value: 'in_progress',  label: '확인중' },
  { value: 'resolved',     label: '해결됨' },
  { value: 'dismissed',    label: '반려' },
]

const SEVERITY_OPTIONS = [
  { value: 'low',    label: '낮음' },
  { value: 'normal', label: '보통' },
  { value: 'high',   label: '높음' },
]

const CATEGORY_LABEL = {
  error:        '🐞 에러',
  improvement:  '💡 개선',
}

const STATUS_CLASS = {
  open:         s.statusOpen,
  in_progress:  s.statusProgress,
  resolved:     s.statusResolved,
  dismissed:    s.statusDismissed,
}

function fmtTime(iso) {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

export default function AdminFeedbackPage({ onBack }) {
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)   // 선택된 피드백 (모달)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listAdminFeedback({ status: statusFilter, category: categoryFilter })
      setItems(list)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, categoryFilter])

  useEffect(() => { load() }, [load])

  // msg auto-hide
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), TOAST_MSG_MS)
    return () => clearTimeout(t)
  }, [msg])

  const openEdit = (item) => {
    setEditing({
      ...item,
      // 편집용 복사본
      _status: item.status,
      _severity: item.severity,
      _admin_note: item.admin_note || '',
    })
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const patch = {
        status: editing._status,
        severity: editing._severity,
        admin_note: editing._admin_note || '',
      }
      await updateAdminFeedback(editing.id, patch)
      setMsg('저장됨')
      setEditing(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleViewAttachment = async (id) => {
    try {
      const url = await getFeedbackAttachmentUrl(id)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e.message || '첨부 조회 실패')
    }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="피드백 관리"
        subtitle="사용자 신고/제안 처리 — 상태/심각도/답변"
        onBack={onBack}
      />

      {msg && <p className={s.msgOk}>✓ {msg}</p>}
      {error && <p className={s.msgErr}>⚠ {error}</p>}

      {/* 필터 — status 탭 + category 토글 */}
      <div className={s.filterBar}>
        <div className={s.tabs}>
          {STATUS_TABS.map((t) => (
            <button
              key={t.key || 'all'}
              className={`${s.tabBtn} ${statusFilter === t.key ? s.tabBtnActive : ''}`}
              onClick={() => setStatusFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className={s.catToggle}>
          <button
            className={`${s.catBtn} ${categoryFilter === '' ? s.catBtnActive : ''}`}
            onClick={() => setCategoryFilter('')}
          >전체</button>
          <button
            className={`${s.catBtn} ${categoryFilter === 'error' ? s.catBtnActive : ''}`}
            onClick={() => setCategoryFilter('error')}
          >🐞 에러</button>
          <button
            className={`${s.catBtn} ${categoryFilter === 'improvement' ? s.catBtnActive : ''}`}
            onClick={() => setCategoryFilter('improvement')}
          >💡 개선</button>
        </div>
      </div>

      {loading && <p className={s.emptyTxt}>불러오는 중...</p>}
      {!loading && items.length === 0 && (
        <p className={s.emptyTxt}>피드백이 없어요.</p>
      )}

      {/* 카드 리스트 */}
      <div className={s.list}>
        {items.map((it) => (
          <div key={it.id} className={s.card} onClick={() => openEdit(it)}>
            <div className={s.cardTop}>
              <span className={s.category}>{CATEGORY_LABEL[it.category] || it.category}</span>
              <span className={`${s.statusBadge} ${STATUS_CLASS[it.status] || ''}`}>
                {STATUS_OPTIONS.find((o) => o.value === it.status)?.label || it.status}
              </span>
              {it.severity === 'high' && <span className={s.severityHigh}>🔥 높음</span>}
              {it.severity === 'low' && <span className={s.severityLow}>낮음</span>}
            </div>
            <div className={s.title}>{it.title}</div>
            <div className={s.body}>{it.body}</div>
            <div className={s.meta}>
              <span>#{it.id} · {fmtTime(it.created_at)}</span>
              <span>
                {it.location_text || it.page_url || '-'}
                {it.has_attachment && ' · 📎'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 편집 모달 */}
      {editing && (
        <div className={s.overlay} onClick={() => !saving && setEditing(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h2>피드백 #{editing.id}</h2>
              <button
                type="button"
                className={s.closeBtn}
                onClick={() => setEditing(null)}
                disabled={saving}
              >✕</button>
            </div>

            <div className={s.modalBody}>
              <div className={s.readOnlySection}>
                <span className={s.readOnlyLabel}>{CATEGORY_LABEL[editing.category]}</span>
                <h3 className={s.readOnlyTitle}>{editing.title}</h3>
                <p className={s.readOnlyBody}>{editing.body}</p>
                <div className={s.readOnlyMeta}>
                  <div><strong>발생 위치:</strong> {editing.location_text || '(미입력)'}</div>
                  <div><strong>페이지:</strong> {editing.page_url || '-'}</div>
                  <div><strong>제출자 ID:</strong> {editing.created_by_id ?? '(삭제됨)'}</div>
                  <div><strong>제출 시각:</strong> {fmtTime(editing.created_at)}</div>
                  {editing.has_attachment && (
                    <div>
                      <strong>첨부:</strong>{' '}
                      <button
                        type="button"
                        className={s.linkBtn}
                        onClick={() => handleViewAttachment(editing.id)}
                      >📎 새 탭에서 열기</button>
                    </div>
                  )}
                </div>
              </div>

              <div className={s.field}>
                <label className={s.label}>상태</label>
                <div className={s.toggleRow}>
                  {STATUS_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`${s.toggleBtn} ${editing._status === o.value ? s.toggleBtnOn : ''}`}
                      onClick={() => setEditing({ ...editing, _status: o.value })}
                      disabled={saving}
                    >{o.label}</button>
                  ))}
                </div>
              </div>

              <div className={s.field}>
                <label className={s.label}>심각도</label>
                <div className={s.toggleRow}>
                  {SEVERITY_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`${s.toggleBtn} ${editing._severity === o.value ? s.toggleBtnOn : ''}`}
                      onClick={() => setEditing({ ...editing, _severity: o.value })}
                      disabled={saving}
                    >{o.label}</button>
                  ))}
                </div>
              </div>

              <div className={s.field}>
                <label className={s.label}>관리자 답변 / 처리 메모</label>
                <textarea
                  className={s.textarea}
                  value={editing._admin_note}
                  onChange={(e) => setEditing({ ...editing, _admin_note: e.target.value })}
                  placeholder="사용자가 본인 이력에서 볼 수 있어요."
                  rows={5}
                  disabled={saving}
                />
              </div>
            </div>

            <div className={s.modalFooter}>
              <button
                type="button"
                className="btn-secondary btn-md"
                onClick={() => setEditing(null)}
                disabled={saving}
              >취소</button>
              <button
                type="button"
                className="btn-primary btn-md"
                onClick={handleSave}
                disabled={saving}
              >{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
