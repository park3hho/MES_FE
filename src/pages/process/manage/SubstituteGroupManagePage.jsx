// pages/process/manage/SubstituteGroupManagePage.jsx
// 대체품 그룹 (Substitute Group) 관리 — team_rnd 전용 (2026-05-22)
//
// 서로 대체 가능한 부품 묶음의 재사용 마스터. BomItem.substitute_group 이 참조 —
// 그룹을 고치면 그 그룹을 쓰는 모든 BOM 에 즉시 반영(live).
// view: list | editor (BomManagePage 와 동일한 페이지 내 뷰 전환 패턴)

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  getSubstituteGroups, getSubstituteGroup,
  createSubstituteGroup, updateSubstituteGroup, deleteSubstituteGroup,
  getItems,
} from '@/api'
import { useViewHistorySync } from '@/hooks/useViewHistorySync'
import { useToast } from '@/contexts/ToastContext'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import s from './SubstituteGroupManagePage.module.css'

const EMPTY_GROUP = { name: '', code: '', notes: '', is_active: true, display_order: 999 }
const EMPTY_MEMBER = { part_id: null, seq: 0, reason: '' }

export default function SubstituteGroupManagePage({ onBack }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [groups, setGroups] = useState([])
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [view, setView] = useState({ mode: 'list' })

  // 브라우저 뒤로가기 ↔ view.mode 동기화 (BomManagePage 와 동일)
  useViewHistorySync(view.mode, setView, 'substitute-group-modal')

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try { setGroups(await getSubstituteGroups(!showInactive, filter.trim())) }
    catch (e) { setError(e.message || '대체품 그룹 목록 로드 실패') }
    finally { setLoading(false) }
  }, [showInactive, filter])

  const loadParts = useCallback(
    () => getItems(true).then(setParts).catch(() => setParts([])),
    [],
  )
  useEffect(() => { reload() }, [reload])
  useEffect(() => { loadParts() }, [loadParts])

  const backToList = () => { setView({ mode: 'list' }); reload() }

  const openNew = () => {
    loadParts()
    setView({ mode: 'editor', data: { ...EMPTY_GROUP, _members: [] } })
  }
  const openEdit = async (id) => {
    try {
      loadParts()
      const g = await getSubstituteGroup(id)
      setView({
        mode: 'editor',
        data: {
          ...g,
          _members: (g.members || []).map((m) => ({
            part_id: m.part_id, seq: m.seq || 0, reason: m.reason || '',
          })),
        },
      })
    } catch (e) { toast(e.message, 'error') }
  }

  const handleDelete = async (g) => {
    if (!await confirm({
      title: '대체품 그룹 삭제',
      message: `'${g.name}' 그룹을 삭제할까요? 되돌릴 수 없습니다.`,
      confirmText: '삭제',
      danger: true,
    })) return
    try { await deleteSubstituteGroup(g.id); reload(); toast('삭제되었습니다', 'success') }
    catch (e) { toast(e.message, 'error') }
  }

  if (view.mode === 'editor') {
    return (
      <div className="page-flat">
        <PageHeader
          title={view.data.id ? `대체품 그룹 편집 — ${view.data.name}` : '새 대체품 그룹'}
          subtitle="서로 대체 가능한 부품 묶음 · 여러 BOM 에서 재사용"
          onBack={backToList}
        />
        <GroupEditor editing={view.data} allParts={parts}
          onCancel={backToList} onSaved={backToList} />
      </div>
    )
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="대체품 그룹"
        subtitle="서로 대체 가능한 부품 묶음 · BOM 라인에서 재사용하는 마스터"
        onBack={onBack}
      />

      <div className={s.toolbar}>
        <input className={s.search} placeholder="그룹명 / 코드 검색"
          value={filter} onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && reload()} />
        <label className={s.chk}>
          <input type="checkbox" checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)} /> 비활성 포함
        </label>
        <button type="button" className="btn-secondary btn-md" onClick={() => reload()}
          title="목록 새로고침">↻ 새로고침</button>
        <button type="button" className="btn-primary btn-md" onClick={openNew}>+ 새 그룹</button>
      </div>

      {loading && <p className={s.info}>로딩 중...</p>}
      {error && <p className={s.err}>{error}</p>}

      {!loading && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>그룹명</th><th>코드</th><th>대체품 수</th>
                <th>사용 BOM</th><th>비고</th><th></th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr><td colSpan={6} className={s.empty}>등록된 대체품 그룹이 없어요.</td></tr>
              ) : groups.map((g) => (
                <tr key={g.id} className={g.is_active ? '' : s.inactiveRow}>
                  <td className={s.nameCell}>{g.name}</td>
                  <td className={s.mono}>{g.code || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{g.member_count}</td>
                  <td style={{ textAlign: 'center' }}>{g.used_count}</td>
                  <td className={s.ro}>{g.notes || '-'}</td>
                  <td>
                    <div className={s.actions}>
                      <button type="button" className={s.act}
                        onClick={() => openEdit(g.id)}>편집</button>
                      <button type="button" className={s.actDanger}
                        onClick={() => handleDelete(g)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════
// 편집 (인라인) — 그룹 헤더 + 멤버(부품 + 대체 사유)
// ════════════════════════════════════════════
function GroupEditor({ editing, allParts = [], onCancel, onSaved }) {
  const toast = useToast()
  const isNew = !editing.id
  const [h, setH] = useState(editing)
  const [members, setMembers] = useState(editing._members || [])
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  const set = (k, v) => setH((p) => ({ ...p, [k]: v }))
  const setMember = (i, k, v) =>
    setMembers((p) => p.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)))
  const addMember = () => setMembers((p) => [...p, { ...EMPTY_MEMBER, seq: p.length }])
  const delMember = (i) => setMembers((p) => p.filter((_, idx) => idx !== i))

  const partById = (id) => allParts.find((x) => String(x.id) === String(id))

  const save = async () => {
    if (!h.name.trim()) { setFormErr('그룹 이름을 입력하세요.'); return }
    if (members.some((m) => !m.part_id)) {
      setFormErr('모든 대체품 라인에 부품을 선택하세요.'); return
    }
    setSaving(true); setFormErr('')
    const payload = {
      name: h.name.trim(),
      code: h.code || '',
      notes: h.notes || '',
      is_active: !!h.is_active,
      display_order: Number(h.display_order) || 999,
      members: members.map((m, i) => ({
        part_id: Number(m.part_id),
        seq: i,
        reason: (m.reason || '').slice(0, 200),
      })),
    }
    try {
      if (isNew) await createSubstituteGroup(payload)
      else await updateSubstituteGroup(editing.id, payload)
      toast(isNew ? '대체품 그룹이 생성되었습니다' : '저장되었습니다', 'success')
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
        <Field label="그룹명 *">
          <input value={h.name} placeholder="예: M5 볼트 대체군"
            onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="코드">
          <input value={h.code} placeholder="(선택) 사내 분류 코드"
            onChange={(e) => set('code', e.target.value)} />
        </Field>
        <Field label="활성">
          <label className={s.chkInline}>
            <input type="checkbox" checked={!!h.is_active}
              onChange={(e) => set('is_active', e.target.checked)} />
            활성 상태
          </label>
        </Field>
        <Field label="정렬">
          <input type="number" value={h.display_order}
            onChange={(e) => set('display_order', e.target.value)} />
        </Field>
      </div>
      <Field label="비고">
        <textarea rows={2} value={h.notes}
          onChange={(e) => set('notes', e.target.value)} />
      </Field>

      <div className={s.sectTitle}>대체품 ({members.length})
        <button type="button" className={s.addBtn} onClick={addMember}>+ 부품 추가</button>
      </div>
      <div className={s.itemsWrap}>
        <table className={s.itemsTable}>
          <thead>
            <tr>
              <th>#</th><th>부품 (Item) *</th><th>품목번호</th>
              <th>규격</th><th>대체 사유</th><th></th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr><td colSpan={6} className={s.ro}>
                + 부품 추가 로 대체 가능한 부품을 등록하세요.
              </td></tr>
            ) : members.map((m, i) => {
              const p = partById(m.part_id)
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <select value={m.part_id ?? ''}
                      onChange={(e) => setMember(i, 'part_id', e.target.value || null)}>
                      <option value="">(선택)</option>
                      {allParts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.part_no}{c.name ? ` · ${c.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={s.ro}>{p?.part_no || '-'}</td>
                  <td className={s.ro}>{p?.spec || '-'}</td>
                  <td>
                    <input value={m.reason}
                      placeholder="대체 사유 (예: 단종 대응, 비용 절감)"
                      onChange={(e) => setMember(i, 'reason', e.target.value)} />
                  </td>
                  <td>
                    <button type="button" className={s.delRow}
                      onClick={() => delMember(i)}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {formErr && <p className={s.err}>{formErr}</p>}
      <div className={s.footRow}>
        <button type="button" className="btn-secondary btn-md" onClick={onCancel}>취소</button>
        <button type="button" className="btn-primary btn-md"
          onClick={save} disabled={saving}>
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
