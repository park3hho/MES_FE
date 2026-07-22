// src/pages/adm/manage/InvoiceDetailModal.jsx
// 송장 상세/편집 모달 — 요구 항목 입력 + MB 할당/해제 (2026-04-21)
// 호출: InvoicePage 목록 행의 "진척률" 버튼
//
// 섹션 구성:
//   1. 메타 (invoice_no / title / notes / 생성일)
//   2. 요구 항목 (DB 모델 × 수량 입력, 진행률 바 + 저장 버튼)
//   3. 할당된 MB 목록 + "+ MB 추가" 버튼 → 선택 모드 전환
//   4. (선택 모드) 할당 가능 MB 체크리스트 + 일괄 할당 버튼

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

import {
  getInvoiceDetail, setInvoiceItems,
  getInvoiceAvailableMbs, assignInvoiceMbs, unassignInvoiceMbs,
  archiveInvoice, reopenInvoice, updateInvoiceMeta,
  getCompanies, getItems,
} from '@/api'
// MODEL_KEYS 제거: DB ModelRegistry 로 이관 (2026-04-24 PR-7)
import { PHI_SPECS } from '@/constants/processConst'
import { TOAST_FLASH_MS } from '@/constants/etcConst'
import { useModels } from '@/hooks/useModels'

import { useConfirm } from '@/contexts/ConfirmDialogContext'
import s from './InvoiceDetailModal.module.css'

const formatDate = (iso) => {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return iso }
}

// 진행률(%) 계산 — cap 100 (overflow면 100)
const pctOf = (cur, target) => {
  if (!target) return 0
  return Math.min(100, Math.round((cur / target) * 100))
}

// 기존 항목 → 행 배열 (Item 일급, 2026-07-22 — Layer D §3).
// item_id 가 있는 행은 완제품 Item 이 정체성(라벨=Item 이름). 레거시(모델 기반) 행은
// model_registry_id/phi/motor 를 그대로 보존해 무파괴 재저장 — 표시용 라벨만 모델에서 가져옴.
function buildRows(existingItems, models, itemMaster) {
  return (existingItems || []).map((x, i) => {
    const item = x.item_id ? itemMaster.find((it) => it.id === x.item_id) : null
    const model = x.model_registry_id != null
      ? models.find((mm) => mm.id === x.model_registry_id)
      : models.find((mm) => mm.phi === x.phi && mm.motor_type === x.motor_type)
    const label = item
      ? `${item.name}${item.part_no ? ` (${item.part_no})` : ''}`
      : (model?.label || `Φ${x.phi}${x.motor_type ? ` ${x.motor_type}` : ''}`)
    // 회전자 라인 행의 진척 분자는 current_rt(RotorStock) — ST 집계(current)를 쓰면 다른 축이 보임 (리뷰 major)
    const current = (x.line === 'rotor' ? x.current_rt : x.current) ?? 0
    return {
      key: x.item_id ? `it-${x.item_id}` : `mr-${x.model_registry_id ?? `x${i}`}`,
      item_id: x.item_id ?? null,
      model_registry_id: x.model_registry_id ?? null,
      phi: x.phi || '', motor_type: x.motor_type || '',
      quantity: x.quantity ?? '', current,
      line: x.line || '', label,
      color: model?.color_hex || PHI_SPECS[x.phi]?.color || '#6b7585',
    }
  })
}

export default function InvoiceDetailModal({ invoiceId, onClose }) {
  const confirm = useConfirm()
  // color: DB ModelRegistry 로 이관 (2026-04-24 PR-6)
  // models: MODEL_KEYS 제거 (2026-04-24 PR-7) — DB 목록으로 렌더
  const { models, findModel } = useModels()
  const navigate = useNavigate()

  // 출하번호 클릭 → TracePage 로 이동하면서 자동 스캔 (2026-04-24)
  const openTrace = (lotNo) => {
    if (!lotNo) return
    onClose?.()   // 모달 먼저 닫음 (UX)
    navigate('/admin/trace', { state: { lotNo } })
  }

  const [detail, setDetail] = useState(null)
  const [rows, setRows] = useState([])                // 요구 항목 행 배열 (Item 일급, 2026-07-22)
  const [itemSearch, setItemSearch] = useState('')    // 완제품 Item 검색어
  const [stagedItem, setStagedItem] = useState(null)  // 드롭다운에서 고른(추가 대기) Item
  const [stagedQty, setStagedQty] = useState('')      // 추가 대기 수량
  const [mbPickerOpen, setMbPickerOpen] = useState(false)
  const [availableMbs, setAvailableMbs] = useState([])
  const [selectedMbs, setSelectedMbs] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  // 완제품 Item 마스터 — 요구 항목 피커의 원천 (Item 일급, 2026-07-22)
  const [itemMaster, setItemMaster] = useState([])
  // 메타 (title/customer/notes/company_id) — 항상 편집 가능 (2026-04-24 editingMeta 토글 제거)
  // company_id 추가 (2026-05-02 Phase B) — InvoicePage 의 customer role 필터 패턴 동일
  const [metaDraft, setMetaDraft] = useState({ title: '', customer: '', notes: '', company_id: '' })

  // 회사 마스터 (customer role) — 모달 마운트 시 1회 로드
  const [companies, setCompanies] = useState([])
  useEffect(() => {
    let cancelled = false
    getCompanies(true)
      .then((data) => {
        if (cancelled) return
        const customers = (data.companies || []).filter(
          (c) => Array.isArray(c.roles) && c.roles.includes('customer')
        )
        customers.sort((a, b) =>
          (a.display_order || 999) - (b.display_order || 999) ||
          (a.name || '').localeCompare(b.name || '')
        )
        setCompanies(customers)
      })
      .catch(() => { /* 조용히 — 드롭다운만 비고 텍스트는 그대로 동작 */ })
    return () => { cancelled = true }
  }, [])

  // 완제품 Item 마스터 — 모달 마운트 시 1회 (요구 항목 피커 원천, 2026-07-22)
  useEffect(() => {
    let cancelled = false
    getItems(true)
      .then((list) => { if (!cancelled) setItemMaster(list) })
      .catch(() => { /* 조용히 — 피커만 비고 나머지 무영향 */ })
    return () => { cancelled = true }
  }, [])

  // itemMaster 가 상세보다 늦게 도착하면 Item 행 라벨만 보강 (편집값 보존 — 행 재생성 안 함)
  useEffect(() => {
    if (!itemMaster.length) return
    setRows((prev) => prev.map((r) => {
      if (!r.item_id) return r
      const item = itemMaster.find((it) => it.id === r.item_id)
      if (!item) return r
      return { ...r, label: `${item.name}${item.part_no ? ` (${item.part_no})` : ''}` }
    }))
  }, [itemMaster])

  // 회사 선택 시 customer 텍스트 자동 채움
  const handleCompanyChange = (e) => {
    const cid = e.target.value
    setMetaDraft((m) => {
      if (!cid) return { ...m, company_id: '' }
      const c = companies.find((x) => String(x.id) === cid)
      return { ...m, company_id: cid, customer: c?.name || m.customer }
    })
  }

  // 상세 로드 (초기 + 저장 후 갱신)
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await getInvoiceDetail(invoiceId)
      setDetail(d)
      setRows(buildRows(d.items || [], models, itemMaster))
      // 메타 편집 토글 제거 — 항상 편집 가능. 초기값으로 detail 값 자동 주입 (2026-04-24)
      // company_id 추가 (2026-05-02 Phase B) — String 으로 통일 (select value 가 string)
      setMetaDraft({
        title: d.title || '',
        customer: d.customer || '',
        notes: d.notes || '',
        company_id: d.company_id ? String(d.company_id) : '',
      })
    } catch (e) {
      setError(e.message || '상세 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [invoiceId, models])

  useEffect(() => { reload() }, [reload])

  // ── 통합 저장: 메타 + 요구 항목 한 번에 (2026-05-08 버튼 통합) ──
  // 이전 saveMeta / handleItemsSave 둘로 나뉘어 있던 것을 saveAll 로 합침.
  // company_id 추가 (2026-05-02 Phase B) — string('' or '12') → Number/null 변환
  const saveAll = async () => {
    setSaving(true)
    let ok = false
    try {
      // 1) 메타 (title / customer / notes / company_id)
      const metaPayload = {
        title: metaDraft.title,
        customer: metaDraft.customer,
        notes: metaDraft.notes,
        company_id: metaDraft.company_id ? Number(metaDraft.company_id) : null,
      }
      await updateInvoiceMeta(invoiceId, metaPayload)

      // 2) 요구 항목 — 수량>0 행만 (Item 일급, 2026-07-22)
      //    item_id 행: 서버가 Stator/RotorSpec 브리지로 phi/motor 권위 채움 + line 자동판별.
      //    레거시(모델) 행: model_registry_id/phi/motor 그대로 재전송 — 기존 경로 무파괴.
      const items = rows
        .map((r) => {
          const q = parseInt(r.quantity, 10)
          if (!q || q <= 0) return null
          return {
            item_id: r.item_id ?? null,
            model_registry_id: r.model_registry_id ?? null,
            phi: r.phi || '', motor_type: r.motor_type || '',
            quantity: q, line: r.line || '',
          }
        })
        .filter(Boolean)
      await setInvoiceItems(invoiceId, items)

      await reload()
      setMsg('저장됨')
      ok = true
    } catch (e) {
      setError(e.message || '저장 실패')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), TOAST_FLASH_MS)
    }
    return ok
  }

  // (생산오더 생성은 생산오더 페이지로 이관 — 2026-07-22. 송장은 '수요 기록'까지만, 도메인 분리)

  // ── MB 선택 모드 ──
  const openMbPicker = async () => {
    setMbPickerOpen(true)
    setSelectedMbs(new Set())
    try {
      const d = await getInvoiceAvailableMbs(invoiceId)
      // 이미 이 인보이스 소속은 체크 상태 기본 ON, 미할당은 선택 대상
      const assigned = new Set((d.items || []).filter((x) => x.assigned_here).map((x) => x.mb_lot_no))
      setAvailableMbs(d.items || [])
      setSelectedMbs(assigned)
    } catch (e) {
      setError(e.message || 'MB 목록 조회 실패')
    }
  }

  const toggleMb = (lotNo) => {
    setSelectedMbs((prev) => {
      const n = new Set(prev)
      if (n.has(lotNo)) n.delete(lotNo)
      else n.add(lotNo)
      return n
    })
  }

  const applyMbSelection = async () => {
    const currentAssigned = new Set((detail?.mbs || []).map((m) => m.mb_lot_no))
    const toAssign = [...selectedMbs].filter((x) => !currentAssigned.has(x))
    const toUnassign = [...currentAssigned].filter((x) => !selectedMbs.has(x))

    setSaving(true)
    try {
      if (toAssign.length) await assignInvoiceMbs(invoiceId, toAssign)
      if (toUnassign.length) await unassignInvoiceMbs(invoiceId, toUnassign)
      setMbPickerOpen(false)
      await reload()
      setMsg(`할당 +${toAssign.length} / 해제 ${toUnassign.length}`)
    } catch (e) {
      setError(e.message || '할당 실패')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), TOAST_FLASH_MS)
    }
  }

  // ── 한 MB 해제 (할당된 목록 우측 X 버튼) ──
  const removeOneMb = async (mbLotNo) => {
    setSaving(true)
    try {
      await unassignInvoiceMbs(invoiceId, [mbLotNo])
      await reload()
    } catch (e) {
      setError(e.message || '해제 실패')
    } finally {
      setSaving(false)
    }
  }

  // (saveMeta / handleItemsSave 는 saveAll 로 통합됨 — 2026-05-08)

  // ── 상태 전환 (수동 종료 / 복구) ──
  const toggleArchive = async () => {
    const nowArchived = detail?.invoice_status === 'archived'
    if (!nowArchived && !(await confirm({
      title: '인보이스 종료',
      message: '이 인보이스를 종료할까요?\n진척률 대시보드에서 숨겨집니다. (복구 가능)',
      confirmText: '종료',
    }))) return
    setSaving(true)
    try {
      if (nowArchived) await reopenInvoice(invoiceId)
      else await archiveInvoice(invoiceId)
      await reload()
      setMsg(nowArchived ? '복구됨' : '종료됨 (archived)')
    } catch (e) {
      setError(e.message || '상태 변경 실패')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), TOAST_FLASH_MS)
    }
  }

  // 검색 결과 — 검색어 매치 + 아직 미추가 완제품 Item (최대 8개). 드롭다운 노출. (Item 일급, 2026-07-22)
  const _isq = itemSearch.trim().toLowerCase()
  const searchResults = !_isq ? [] : itemMaster.filter((it) => {
    if (rows.some((r) => r.item_id === it.id)) return false
    return (it.name || '').toLowerCase().includes(_isq)
      || (it.part_no || '').toLowerCase().includes(_isq)
  }).slice(0, 8)

  // 드롭다운에서 Item 고름 → 추가 대기(staged). '추가하기' 눌러야 실제 추가.
  const stageItem = (it) => { setStagedItem(it); setItemSearch(''); setStagedQty('') }
  const cancelStage = () => { setStagedItem(null); setStagedQty('') }
  const addStaged = () => {
    if (!stagedItem) return
    const q = parseInt(stagedQty, 10)
    setRows((prev) => prev.some((r) => r.item_id === stagedItem.id) ? prev : [...prev, {
      key: `it-${stagedItem.id}`,
      item_id: stagedItem.id, model_registry_id: null,
      phi: '', motor_type: '',   // 저장 시 서버가 스펙 브리지로 채움 → reload 후 표시
      quantity: q > 0 ? String(q) : '', current: 0, line: '',
      label: `${stagedItem.name}${stagedItem.part_no ? ` (${stagedItem.part_no})` : ''}`,
      color: '#6b7585',
    }])
    setStagedItem(null); setStagedQty('')
  }
  const updateRow = (key, patch) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const removeRow = (key) => setRows((prev) => prev.filter((r) => r.key !== key))

  // ── 렌더 ──
  return (
    <div className={s.overlay} onClick={onClose}>
      <motion.div
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={s.header}>
          <h2 className={s.title}>
            {detail?.invoice_no || '로딩 중...'}
            {detail?.title && <span className={s.subTitle}> · {detail.title}</span>}
            {detail?.invoice_status === 'archived' && (
              <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', background: 'var(--color-gray-light, #c0c8d8)', color: 'var(--color-white)', borderRadius: 'var(--radius-sm)', fontWeight: 700 }}>
                종료됨
              </span>
            )}
            {detail?.invoice_status === 'done' && (
              <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', background: 'var(--color-success, #16a34a)', color: 'var(--color-white)', borderRadius: 'var(--radius-sm)', fontWeight: 700 }}>
                출하완료{detail.ob_lot_no ? ` · ${detail.ob_lot_no}` : ''}
              </span>
            )}
          </h2>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* 편집 버튼 제거 — 메타 섹션이 처음부터 편집 가능 상태 (2026-04-24) */}
            {detail && (
              <button
                type="button"
                className="btn-text"
                onClick={toggleArchive}
                disabled={saving}
                style={{ fontSize: 12 }}
              >
                {detail.invoice_status === 'archived' ? '복구' : '종료'}
              </button>
            )}
            <button type="button" className={s.closeBtn} onClick={onClose} aria-label="닫기">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {loading && <p className={s.info}>로딩 중...</p>}
        {error && <p className={s.errorMsg}>⚠ {error}</p>}
        {msg && <p className={s.okMsg}>{msg}</p>}

        {detail && !loading && (
          <div className={s.body}>
            {/* ── 메타 — 상시 편집 (2026-04-24 토글 제거) ── */}
            <section className={s.section}>
              <div className={s.sectionHead}>
                <span className={s.sectionLabel}>기본 정보</span>
                {/* 통합 저장 — 메타 + 요구 항목 한 번에 (2026-05-08) */}
                <button type="button" className="btn-primary btn-sm" onClick={saveAll} disabled={saving}>
                  저장
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text"
                  placeholder="제목"
                  value={metaDraft.title}
                  onChange={(e) => setMetaDraft((m) => ({ ...m, title: e.target.value }))}
                  style={{ padding: '8px 10px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                />
                {/* 고객사 — 회사 마스터에서 선택 (2026-05-02 Phase B).
                    customer 텍스트 입력 필드 제거 — 회사 선택만으로 BE 가 _resolve_company 로 동기화 */}
                <select
                  value={metaDraft.company_id}
                  onChange={handleCompanyChange}
                  disabled={companies.length === 0}
                  style={{ padding: '8px 10px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-white, #fff)' }}
                >
                  <option value="">— 고객사 선택 —</option>
                  {/* value 를 String 으로 — metaDraft.company_id 가 String 이라 strict 비교 통과시키기 위해 (2026-05-08 fix) */}
                  {companies.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}{c.name_ko ? ` (${c.name_ko})` : ''}{c.code ? ` · ${c.code}` : ''}
                    </option>
                  ))}
                </select>
                <textarea
                  placeholder="비고 (최대 500자)"
                  value={metaDraft.notes}
                  onChange={(e) => setMetaDraft((m) => ({ ...m, notes: e.target.value }))}
                  maxLength={500}
                  rows={2}
                  style={{ padding: '8px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', resize: 'vertical' }}
                />
                <span className={s.metaNote} style={{ fontSize: 11, color: 'var(--color-text-sub, var(--color-gray))' }}>
                  생성 {formatDate(detail.created_at)}
                </span>
              </div>
            </section>

            {/* ── 요구 항목 ── 완제품 Item 검색→선택→추가하기 (Item 일급, 2026-07-22). 저장은 '기본 정보' 통합 버튼 */}
            <section className={s.section}>
              <div className={s.sectionHead}>
                <span className={s.sectionLabel}>요구 항목</span>
                <span className={s.sectionHint}>완제품 Item 추가 · 생산오더는 생산오더 페이지에서 생성</span>
              </div>

              {/* 완제품 Item 검색 + 드롭다운 + 추가 (2026-07-22 — 모델 검색에서 전환) */}
              <div className={s.modelPicker}>
                {!stagedItem ? (
                  <>
                    <input
                      type="text"
                      className={s.modelSearchInput}
                      placeholder="완제품 Item 검색 (이름 / 품번)"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                    />
                    {itemSearch.trim() && (
                      <ul className={s.modelDropdown}>
                        {searchResults.length === 0 ? (
                          <li className={s.modelDropEmpty}>일치하는 완제품 Item 없음 (이미 추가됐을 수 있음)</li>
                        ) : searchResults.map((it) => (
                          <li key={it.id}>
                            <button type="button" className={s.modelDropItem} onClick={() => stageItem(it)}>
                              <span className={s.modelDropLabel}>{it.name}</span>
                              {it.part_no && <span className={s.modelDropCode}>{it.part_no}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <div className={s.stageRow}>
                    <span className={s.stageLabel}>
                      선택: <b>{stagedItem.name}</b>{stagedItem.part_no ? ` · ${stagedItem.part_no}` : ''}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={s.qtyInput}
                      placeholder="수량"
                      value={stagedQty}
                      autoFocus
                      onChange={(e) => { const v = e.target.value; if (v !== '' && !/^\d+$/.test(v)) return; setStagedQty(v) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') addStaged() }}
                    />
                    <button type="button" className="btn-primary btn-sm" onClick={addStaged}>추가하기</button>
                    <button type="button" className="btn-text" onClick={cancelStage}>취소</button>
                  </div>
                )}
              </div>

              <div className={s.itemsList}>
                {rows.length === 0 ? (
                  <p className={s.empty}>추가된 완제품 Item 이 없습니다 · 위에서 검색해 추가하세요</p>
                ) : rows.map((r) => {
                  const target = parseInt(r.quantity, 10) || 0
                  const pct = pctOf(r.current, target)
                  const color = r.phi
                    ? (findModel(r.phi, r.motor_type)?.color_hex || PHI_SPECS[r.phi]?.color || r.color)
                    : r.color
                  // overflow 경고: over면 주황, exact면 초록, 미달이면 phi 색상
                  const isOver = target > 0 && r.current > target
                  const isExact = target > 0 && r.current === target
                  const numColor = isOver ? 'var(--color-warning, #e67e22)'
                    : isExact ? 'var(--color-success, #27ae60)'
                    : color
                  const barColor = isOver ? 'var(--color-warning, #e67e22)' : color
                  return (
                    <div key={r.key} className={s.itemRow}>
                      <span className={s.itemLabel} style={{ color }}>
                        {r.label}
                        {r.phi && (
                          <span className={s.sectionHint}>
                            {' '}Φ{r.phi}{r.motor_type ? ` · ${r.motor_type}` : ''}
                            {r.line ? ` · ${r.line === 'rotor' ? '회전자' : '고정자'}` : ''}
                          </span>
                        )}
                        {!r.item_id && <span className={s.sectionHint}> · 모델 기반(레거시)</span>}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={s.qtyInput}
                        value={r.quantity}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v !== '' && !/^\d+$/.test(v)) return
                          updateRow(r.key, { quantity: v })
                        }}
                        placeholder="목표"
                      />
                      <span className={s.progressText}>
                        <b style={{ color: numColor }}>{r.current}</b>
                        <span className={s.progressSep}>/</span>
                        <span>{target || '-'}</span>
                        {isOver && <span style={{ marginLeft: 4, color: 'var(--color-warning, #e67e22)', fontWeight: 700 }}>⚠</span>}
                      </span>
                      <button type="button" className={s.mbRemove} onClick={() => removeRow(r.key)} aria-label="제외">✕</button>
                      {/* 라인 선택: 기본 '자동' = 서버가 Item 스펙(고정자/회전자)으로 판별.
                          레거시(모델) 행은 Item 연결 셀렉터로 점진 전환 (2026-07-22) */}
                      <div className={s.itemMapRow}>
                        {!r.item_id && (
                          <select
                            className={s.itemMapSelect}
                            value=""
                            onChange={(e) => {
                              const v = e.target.value ? Number(e.target.value) : null
                              if (v) updateRow(r.key, { item_id: v })
                            }}
                          >
                            <option value="">— 완제품 Item 연결(전환) —</option>
                            {itemMaster.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name}{it.part_no ? ` (${it.part_no})` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                        <select
                          className={s.itemMapLine}
                          value={r.line || ''}
                          onChange={(e) => updateRow(r.key, { line: e.target.value })}
                        >
                          <option value="">라인 자동</option>
                          <option value="stator">고정자</option>
                          <option value="rotor">회전자</option>
                        </select>
                      </div>
                      <div className={s.progressBar}>
                        <motion.div
                          className={s.progressFill}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                          style={{ background: barColor }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* ── 담긴 MB ── */}
            <section className={s.section}>
              <div className={s.sectionHead}>
                <span className={s.sectionLabel}>
                  담긴 MB ({detail.mbs?.length || 0})
                </span>
                <button type="button" className="btn-secondary btn-sm" onClick={openMbPicker}>
                  + MB 추가/변경
                </button>
              </div>

              {(!detail.mbs || detail.mbs.length === 0) ? (
                <p className={s.empty}>할당된 MB 없음</p>
              ) : (
                <ul className={s.mbList}>
                  {detail.mbs.map((m) => (
                    <li key={m.mb_lot_no} className={s.mbRow}>
                      <span className={s.mbLotNo}>{m.mb_lot_no}</span>
                      <span className={s.mbMeta}>{m.item_count}개</span>
                      <span className={s.mbMeta}>{formatDate(m.created_at)}</span>
                      <button
                        type="button"
                        className={s.mbRemove}
                        onClick={() => removeOneMb(m.mb_lot_no)}
                        disabled={saving}
                        aria-label="해제"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── 출하 내역 (2026-04-24) — MB → OB 매핑, OB 클릭 시 TracePage 로 이동 ── */}
            {detail.shipped_mbs && detail.shipped_mbs.length > 0 && (
              <section className={s.section}>
                <div className={s.sectionHead}>
                  <span className={s.sectionLabel}>
                    출하 내역 ({detail.shipped_mbs.length})
                  </span>
                  <span className={s.sectionHint}>출하번호 클릭 → 이력 조회</span>
                </div>
                <ul className={s.mbList}>
                  {detail.shipped_mbs.map((m) => (
                    <li key={m.mb_lot_no} className={s.mbRow}>
                      <span className={s.mbLotNo}>{m.mb_lot_no}</span>
                      <span className={s.mbMeta}>{m.item_count}개</span>
                      {m.ob_lot_no ? (
                        <button
                          type="button"
                          className={s.obLink}
                          onClick={() => openTrace(m.ob_lot_no)}
                          title={`${m.ob_lot_no} 이력 조회`}
                        >
                          → {m.ob_lot_no}
                        </button>
                      ) : (
                        <span className={s.mbMeta}>출하번호 미매핑</span>
                      )}
                      <span className={s.mbMeta}>{formatDate(m.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── MB 선택 서브 섹션 ── */}
            <AnimatePresence initial={false}>
              {mbPickerOpen && (
                <motion.section
                  className={s.pickerSection}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className={s.pickerInner}>
                    <div className={s.sectionHead}>
                      <span className={s.sectionLabel}>MB 선택 — 체크박스로 고르고 적용</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn-text" onClick={() => setMbPickerOpen(false)}>취소</button>
                        <button type="button" className="btn-primary btn-sm" onClick={applyMbSelection} disabled={saving}>적용</button>
                      </div>
                    </div>

                    {availableMbs.length === 0 ? (
                      <p className={s.empty}>할당 가능한 MB가 없습니다.</p>
                    ) : (
                      <ul className={s.pickerList}>
                        {availableMbs.map((m) => {
                          const checked = selectedMbs.has(m.mb_lot_no)
                          return (
                            <li key={m.mb_lot_no} className={s.pickerRow}>
                              <label className={s.pickerLabel}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleMb(m.mb_lot_no)}
                                />
                                <span className={s.mbLotNo}>{m.mb_lot_no}</span>
                                <span className={s.mbMeta}>{m.item_count}개</span>
                                {m.assigned_here && <span className={s.hereBadge}>현재 소속</span>}
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  )
}
