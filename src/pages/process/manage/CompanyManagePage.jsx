// pages/adm/manage/CompanyManagePage.jsx
// 업체 관리 — 공급사/구매사/외주/협력사/사내/운송사 통합 마스터 (2026-05-02, team_rnd 전용)
//
// 흐름:
//   GET /companies              → 목록 (active_only 토글)
//   GET /companies/meta         → roles / categories enum
//   POST /companies/suggest-code → 영문명 → 추천 코드 (자동 호출)
//   POST /companies              → 등록
//   PUT /companies/{id}          → 수정
//   DELETE /companies/{id}       → 비활성화 (소프트)
//   DELETE /companies/{id}/hard  → 완전 삭제 + S3 정리
//   POST /companies/{id}/cert    → 사업자등록증 업로드 (multipart)
//   GET /companies/{id}/cert     → presigned URL (10분)
//   DELETE /companies/{id}/cert  → 등록증 제거

import { useState, useEffect, useMemo, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  getCompanies, getCompanyMeta, suggestCompanyCode,
  createCompany, updateCompany, deleteCompany, hardDeleteCompany,
  uploadCompanyCert, getCompanyCertUrl, deleteCompanyCert,
} from '@/api'
import { useToast } from '@/contexts/ToastContext'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import s from './CompanyManagePage.module.css'

const EMPTY_FORM = {
  name: '', name_ko: '', code: '', business_no: '',
  roles: [], category: '', country: 'KR',
  ceo_name: '', location: '', address: '', postal_code: '',
  phone: '', fax: '', email: '', website: '',
  contact_person: '', contact_phone: '', contact_email: '',
  bank_name: '', bank_account: '', account_holder: '', payment_terms: '', currency: 'USD',
  is_active: true, display_order: 0, memo: '',
  // Cert 회사 로그인 (선택) — 영문/숫자/_ 4~64, 비밀번호 4자 이상
  login_id: '', password: '',
}

export default function CompanyManagePage({ onBack }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [items, setItems] = useState([])
  const [meta, setMeta] = useState({ roles: {}, categories: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // 편집 상태 — null = 폼 닫힘, {} = 신규, {id, ...} = 수정
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [autoCodeBusy, setAutoCodeBusy] = useState(false)

  // ── 초기 로드 (목록 + 메타) ──
  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [list, m] = await Promise.all([
        getCompanies(showInactive ? false : true),
        getCompanyMeta(),
      ])
      setItems(list.companies || [])
      setMeta({ roles: m.roles || {}, categories: m.categories || {} })
    } catch (e) {
      setError(e.message || '목록 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [showInactive])

  useEffect(() => { reload() }, [reload])

  // ── 필터 ──
  const filtered = useMemo(() => {
    if (!filter) return items
    const q = filter.toLowerCase()
    return items.filter((c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.name_ko || '').toLowerCase().includes(q) ||
      (c.code || '').toLowerCase().includes(q) ||
      (c.business_no || '').includes(q)
    )
  }, [items, filter])

  // ── 폼 핸들러 ──
  const openNew = () => { setEditing({ ...EMPTY_FORM }); setFormError('') }
  const openEdit = (c) => {
    // password 는 서버에서 안 내려옴 — 빈값으로 시작 (변경 안 함 의미)
    setEditing({ ...EMPTY_FORM, ...c, password: '' })
    setFormError('')
  }
  const closeForm = () => { setEditing(null); setFormError('') }

  const setField = (key, val) => setEditing((e) => ({ ...e, [key]: val }))
  const toggleRole = (role) => setEditing((e) => {
    const cur = new Set(e.roles || [])
    if (cur.has(role)) cur.delete(role); else cur.add(role)
    return { ...e, roles: Array.from(cur) }
  })

  const handleSuggestCode = async () => {
    if (!editing.name?.trim()) {
      setFormError('영문 회사명을 먼저 입력해 주세요.')
      return
    }
    setAutoCodeBusy(true)
    try {
      const r = await suggestCompanyCode(editing.name.trim())
      setField('code', r.code)
    } catch (e) {
      setFormError(e.message || '코드 추천 실패')
    } finally {
      setAutoCodeBusy(false)
    }
  }

  const handleSave = async () => {
    setFormError('')
    if (!editing.name?.trim()) {
      setFormError('영문 회사명은 필수입니다.')
      return
    }
    // login_id 입력 시 형식 사전 검증 (BE 와 동일 규칙)
    const lid = (editing.login_id || '').trim()
    if (lid && !/^[A-Za-z0-9_]{4,64}$/.test(lid)) {
      setFormError('Cert 로그인 ID 는 영문/숫자/밑줄 4~64자만 허용됩니다.')
      return
    }
    // 신규 등록인데 login_id 만 있고 password 없으면 차단 (BE 도 거부함)
    if (!editing.id && lid && !editing.password) {
      setFormError('Cert 로그인 ID 발급 시 비밀번호도 함께 입력해 주세요.')
      return
    }
    if (editing.password && editing.password.length < 4) {
      setFormError('비밀번호는 4자 이상이어야 합니다.')
      return
    }
    setSaving(true)
    try {
      const payload = { ...editing, login_id: lid }
      // 수정인데 password 빈값 — 변경 안 함 (BE 가 None 으로 인식)
      if (editing.id && !payload.password) {
        delete payload.password
      }
      if (editing.id) {
        await updateCompany(editing.id, payload)
      } else {
        await createCompany(payload)
      }
      await reload()
      toast(editing.id ? '저장되었습니다' : '업체가 등록되었습니다', 'success')
      closeForm()
    } catch (e) {
      setFormError(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  // 무작위 PW 생성 헬퍼 — 헷갈리는 글자 (0/O/1/I/l/L) 제외, 8자
  const generateRandomPw = () => {
    const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let pw = ''
    const arr = new Uint32Array(8)
    crypto.getRandomValues(arr)
    for (let i = 0; i < 8; i++) pw += ALPHABET[arr[i] % ALPHABET.length]
    setField('password', pw)
  }

  const handleSoftDelete = async (c) => {
    if (!(await confirm({
      title: '업체 비활성화',
      message: `${c.name} 을(를) 비활성화할까요?\n기존 LOT 데이터는 보존됩니다.`,
      confirmText: '비활성화',
    }))) return
    try {
      await deleteCompany(c.id)
      await reload()
      toast('비활성화되었습니다', 'success')
    } catch (e) {
      toast(e.message || '비활성화 실패', 'error')
    }
  }

  const handleHardDelete = async (c) => {
    if (!(await confirm({
      title: '업체 완전 삭제',
      message: `${c.name} 을(를) 완전 삭제합니다.\n사업자등록증도 함께 삭제되며 복구할 수 없습니다.`,
      confirmText: '완전 삭제',
      danger: true,
      requireText: c.name,
    }))) return
    try {
      await hardDeleteCompany(c.id)
      await reload()
      toast('완전 삭제되었습니다', 'success')
    } catch (e) {
      toast(e.message || '완전 삭제 실패', 'error')
    }
  }

  // ── 사업자등록증 ──
  const handleUploadCert = async (c, file) => {
    if (!file) return
    try {
      await uploadCompanyCert(c.id, file)
      await reload()
      toast('사업자등록증이 업로드되었습니다', 'success')
    } catch (e) {
      toast(e.message || '업로드 실패', 'error')
    }
  }

  const handleViewCert = async (c) => {
    try {
      const r = await getCompanyCertUrl(c.id, true)
      window.open(r.url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast(e.message || '미리보기 실패', 'error')
    }
  }

  const handleRemoveCert = async (c) => {
    if (!(await confirm({
      title: '등록증 제거',
      message: `${c.name} 의 사업자등록증을 제거할까요?`,
      confirmText: '제거',
      danger: true,
    }))) return
    try {
      await deleteCompanyCert(c.id)
      await reload()
      toast('사업자등록증이 제거되었습니다', 'success')
    } catch (e) {
      toast(e.message || '제거 실패', 'error')
    }
  }

  // ════════════════════════════════════════════
  // 렌더
  // ════════════════════════════════════════════

  return (
    <div className="page-flat">
      <PageHeader title="업체 관리" onBack={onBack} />

      <div className={s.toolbar}>
        <input
          className={s.search}
          placeholder="회사명 / 한국어 / 코드 / 사업자번호 검색"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className={s.toggle}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          비활성 포함
        </label>
        <button className={s.btnPrimary} onClick={openNew}>+ 새 업체</button>
      </div>

      {error && <div className={s.error}>⚠ {error}</div>}

      <div className={s.count}>
        {loading ? '로딩 중...' : `${filtered.length} / ${items.length}건`}
      </div>

      {!loading && filtered.length === 0 && (
        <div className={s.empty}>
          {filter ? '검색 결과가 없습니다.' : '등록된 업체가 없습니다. "+ 새 업체"로 추가하세요.'}
        </div>
      )}

      <div className={s.list}>
        {filtered.map((c) => (
          <CompanyRow
            key={c.id}
            company={c}
            roleMap={meta.roles}
            categoryMap={meta.categories}
            onEdit={() => openEdit(c)}
            onSoftDelete={() => handleSoftDelete(c)}
            onHardDelete={() => handleHardDelete(c)}
            onUploadCert={(file) => handleUploadCert(c, file)}
            onViewCert={() => handleViewCert(c)}
            onRemoveCert={() => handleRemoveCert(c)}
          />
        ))}
      </div>

      {editing && (
        <CompanyForm
          form={editing}
          meta={meta}
          saving={saving}
          formError={formError}
          autoCodeBusy={autoCodeBusy}
          onSetField={setField}
          onToggleRole={toggleRole}
          onSuggestCode={handleSuggestCode}
          onGenPw={generateRandomPw}
          onSave={handleSave}
          onCancel={closeForm}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════
// 행 (목록)
// ════════════════════════════════════════════

function CompanyRow({
  company: c, roleMap, categoryMap,
  onEdit, onSoftDelete, onHardDelete,
  onUploadCert, onViewCert, onRemoveCert,
}) {
  const fileInputId = `cert-upload-${c.id}`
  return (
    <div className={`${s.row} ${!c.is_active ? s.rowInactive : ''}`}>
      <div className={s.rowMain}>
        <div className={s.rowTitle}>
          <span className={s.name}>{c.name}</span>
          {c.name_ko && <span className={s.nameKo}>{c.name_ko}</span>}
          {c.code && <span className={s.code}>{c.code}</span>}
          {c.has_login && (
            <span
              className={s.code}
              title={`Cert 로그인 ID: ${c.login_id}`}
              style={{ background: '#e8f3ff', color: '#1763d6' }}
            >
              🔐 {c.login_id}
            </span>
          )}
          {!c.is_active && <span className={s.inactiveBadge}>비활성</span>}
        </div>
        <div className={s.rowMeta}>
          {(c.roles || []).map((r) => (
            <span key={r} className={s.roleChip}>{roleMap[r] || r}</span>
          ))}
          {c.category && (
            <span className={s.categoryChip}>{categoryMap[c.category] || c.category}</span>
          )}
          {c.country && <span className={s.country}>{c.country}</span>}
          {c.location && <span className={s.location}>· {c.location}</span>}
          {c.business_no && <span className={s.businessNo}>· {c.business_no}</span>}
        </div>
        {(c.contact_person || c.phone || c.email) && (
          <div className={s.rowContact}>
            {c.contact_person && <span>👤 {c.contact_person}</span>}
            {c.phone && <span>☎ {c.phone}</span>}
            {c.email && <span>✉ {c.email}</span>}
          </div>
        )}
      </div>

      <div className={s.rowActions}>
        {/* 사업자등록증 */}
        {c.has_cert ? (
          <>
            <button className={s.btnGhost} onClick={onViewCert} title="사업자등록증 미리보기">
              📄 보기
            </button>
            <button className={s.btnGhost} onClick={onRemoveCert} title="사업자등록증 제거">
              ✕
            </button>
          </>
        ) : (
          <>
            <input
              id={fileInputId}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              style={{ display: 'none' }}
              onChange={(e) => onUploadCert(e.target.files?.[0])}
            />
            <label htmlFor={fileInputId} className={s.btnGhost} title="사업자등록증 업로드">
              📄 등록
            </label>
          </>
        )}
        <button className={s.btnGhost} onClick={onEdit}>수정</button>
        {c.is_active ? (
          <button className={s.btnDanger} onClick={onSoftDelete}>비활성화</button>
        ) : (
          <button className={s.btnDanger} onClick={onHardDelete}>완전 삭제</button>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
// 등록/수정 폼 (모달)
// ════════════════════════════════════════════

function CompanyForm({
  form, meta, saving, formError, autoCodeBusy,
  onSetField, onToggleRole, onSuggestCode, onGenPw, onSave, onCancel,
}) {
  return (
    <div className={s.modalOverlay} onClick={onCancel}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <h2>{form.id ? '업체 수정' : '새 업체 등록'}</h2>
          <button className={s.modalClose} onClick={onCancel}>×</button>
        </div>

        <div className={s.modalBody}>
          {/* ─ 식별 ─ */}
          <Section title="식별 정보">
            <Field label="영문명 *" required>
              <input
                value={form.name}
                onChange={(e) => onSetField('name', e.target.value)}
                placeholder="POSCO"
              />
            </Field>
            <Field label="한국어">
              <input
                value={form.name_ko}
                onChange={(e) => onSetField('name_ko', e.target.value)}
                placeholder="포스코"
              />
            </Field>
            <Field label="코드 (LOT prefix용)">
              <div className={s.codeRow}>
                <input
                  value={form.code}
                  onChange={(e) => onSetField('code', e.target.value.toUpperCase())}
                  placeholder="자동 추천 또는 직접 입력"
                  maxLength={10}
                />
                <button
                  type="button"
                  className={s.btnGhost}
                  onClick={onSuggestCode}
                  disabled={autoCodeBusy}
                >
                  {autoCodeBusy ? '...' : '↻ 자동'}
                </button>
              </div>
            </Field>
            <Field label="사업자등록번호">
              <input
                value={form.business_no}
                onChange={(e) => onSetField('business_no', e.target.value)}
                placeholder="123-45-67890"
              />
            </Field>
          </Section>

          {/* ─ 분류 ─ */}
          <Section title="분류">
            <Field label="역할 (다중 선택)" full>
              <div className={s.chipRow}>
                {Object.entries(meta.roles || {}).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`${s.chip} ${(form.roles || []).includes(key) ? s.chipOn : ''}`}
                    onClick={() => onToggleRole(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="카테고리">
              <select
                value={form.category}
                onChange={(e) => onSetField('category', e.target.value)}
              >
                <option value="">— 선택 —</option>
                {Object.entries(meta.categories || {}).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="국가">
              <input
                value={form.country}
                onChange={(e) => onSetField('country', e.target.value.toUpperCase())}
                placeholder="KR / CN / DE / JP / US"
                maxLength={20}
              />
            </Field>
          </Section>

          {/* ─ 회사 정보 ─ */}
          <Section title="회사 정보">
            <Field label="대표자">
              <input
                value={form.ceo_name}
                onChange={(e) => onSetField('ceo_name', e.target.value)}
              />
            </Field>
            <Field label="지역 (도시)">
              <input
                value={form.location}
                onChange={(e) => onSetField('location', e.target.value)}
                placeholder="Seoul"
              />
            </Field>
            <Field label="주소" full>
              <input
                value={form.address}
                onChange={(e) => onSetField('address', e.target.value)}
              />
            </Field>
            <Field label="우편번호">
              <input
                value={form.postal_code}
                onChange={(e) => onSetField('postal_code', e.target.value)}
              />
            </Field>
          </Section>

          {/* ─ 연락처 ─ */}
          <Section title="연락처 (대표)">
            <Field label="전화"><input value={form.phone} onChange={(e) => onSetField('phone', e.target.value)} /></Field>
            <Field label="팩스"><input value={form.fax} onChange={(e) => onSetField('fax', e.target.value)} /></Field>
            <Field label="이메일"><input type="email" value={form.email} onChange={(e) => onSetField('email', e.target.value)} /></Field>
            <Field label="웹사이트"><input value={form.website} onChange={(e) => onSetField('website', e.target.value)} placeholder="https://..." /></Field>
          </Section>

          {/* ─ 담당자 ─ */}
          <Section title="담당자 (실무)">
            <Field label="담당자명"><input value={form.contact_person} onChange={(e) => onSetField('contact_person', e.target.value)} /></Field>
            <Field label="담당자 전화"><input value={form.contact_phone} onChange={(e) => onSetField('contact_phone', e.target.value)} /></Field>
            <Field label="담당자 이메일"><input type="email" value={form.contact_email} onChange={(e) => onSetField('contact_email', e.target.value)} /></Field>
          </Section>

          {/* ─ 거래 ─ */}
          <Section title="거래 정보">
            <Field label="은행"><input value={form.bank_name} onChange={(e) => onSetField('bank_name', e.target.value)} /></Field>
            <Field label="계좌번호"><input value={form.bank_account} onChange={(e) => onSetField('bank_account', e.target.value)} /></Field>
            <Field label="예금주"><input value={form.account_holder} onChange={(e) => onSetField('account_holder', e.target.value)} /></Field>
            <Field label="결제 조건"><input value={form.payment_terms} onChange={(e) => onSetField('payment_terms', e.target.value)} placeholder="월말 30일 후" /></Field>
            <Field label="통화">
              <select value={form.currency} onChange={(e) => onSetField('currency', e.target.value)}>
                <option value="USD">USD</option>
                <option value="KRW">KRW</option>
                <option value="EUR">EUR</option>
                <option value="JPY">JPY</option>
                <option value="CNY">CNY</option>
              </select>
            </Field>
          </Section>

          {/* ─ Cert 회사 로그인 (선택) ─ */}
          <Section title="Cert 회사 로그인 (선택)">
            <Field label="로그인 ID" full>
              <input
                value={form.login_id || ''}
                onChange={(e) => onSetField('login_id', e.target.value.trim())}
                placeholder="영문/숫자/_ 4~64자 (예: posco_kr) — 비우면 cert 로그인 미사용"
                maxLength={64}
                autoComplete="off"
              />
            </Field>
            <Field label={form.id ? '비밀번호 (변경 시에만 입력)' : '비밀번호'} full>
              <div className={s.codeRow}>
                <input
                  type="text"
                  value={form.password || ''}
                  onChange={(e) => onSetField('password', e.target.value)}
                  placeholder={form.id ? '빈 값 = 변경 안 함' : '4자 이상'}
                  maxLength={128}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={s.btnGhost}
                  onClick={onGenPw}
                  title="무작위 비밀번호 생성 (헷갈리는 글자 제외)"
                >
                  ↻ 자동
                </button>
              </div>
            </Field>
            {form.password && (
              <Field label="" full>
                <div style={{ fontSize: 12, color: 'var(--color-text-sub, #5f6b7a)' }}>
                  ⚠ 저장 후에는 다시 볼 수 없습니다 — 회사에 안전하게 전달해 주세요.
                </div>
              </Field>
            )}
          </Section>

          {/* ─ 운영 ─ */}
          <Section title="운영">
            <Field label="활성 상태">
              <label className={s.toggleInline}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => onSetField('is_active', e.target.checked)}
                />
                활성 (LOT 입력에서 선택 가능)
              </label>
            </Field>
            <Field label="표시 순서">
              <input
                type="number"
                value={form.display_order}
                onChange={(e) => onSetField('display_order', Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="메모" full>
              <textarea
                value={form.memo}
                onChange={(e) => onSetField('memo', e.target.value)}
                rows={3}
                placeholder="자유 메모"
              />
            </Field>
          </Section>

          {formError && <div className={s.error}>⚠ {formError}</div>}
        </div>

        <div className={s.modalFooter}>
          <button type="button" className={s.btnGhost} onClick={onCancel}>취소</button>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? '저장 중...' : (form.id ? '수정' : '등록')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─ 폼 헬퍼 컴포넌트 ─
function Section({ title, children }) {
  return (
    <fieldset className={s.section}>
      <legend>{title}</legend>
      <div className={s.sectionGrid}>{children}</div>
    </fieldset>
  )
}

function Field({ label, full, required, children }) {
  return (
    <label className={`${s.field} ${full ? s.fieldFull : ''}`}>
      <span className={s.fieldLabel}>{label}{required && ' *'}</span>
      {children}
    </label>
  )
}
