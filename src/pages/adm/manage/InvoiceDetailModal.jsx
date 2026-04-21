// src/pages/adm/manage/InvoiceDetailModal.jsx
// 송장 상세/편집 모달 — 요구 항목 입력 + MB 할당/해제 (2026-04-21)
// 호출: InvoicePage 목록 행의 "진척률" 버튼
//
// 섹션 구성:
//   1. 메타 (invoice_no / title / notes / 생성일)
//   2. 요구 항목 (MODEL_KEYS 5개 × 수량 입력, 진행률 바 + 저장 버튼)
//   3. 할당된 MB 목록 + "+ MB 추가" 버튼 → 선택 모드 전환
//   4. (선택 모드) 할당 가능 MB 체크리스트 + 일괄 할당 버튼

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import {
  getInvoiceDetail, setInvoiceItems,
  getInvoiceAvailableMbs, assignInvoiceMbs, unassignInvoiceMbs,
  archiveInvoice, reopenInvoice,
} from '@/api'
import { MODEL_KEYS, PHI_SPECS } from '@/constants/processConst'

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

// MODEL_KEYS 기반 초기 items 맵 생성 — 기존 데이터 있으면 수량 채움
function buildItemsMap(existingItems) {
  const map = {}
  for (const m of MODEL_KEYS) {
    const found = existingItems.find((x) => x.phi === m.phi && x.motor_type === m.motor_type)
    map[m.key] = {
      quantity: found?.quantity ?? '',
      current: found?.current ?? 0,
    }
  }
  return map
}

export default function InvoiceDetailModal({ invoiceId, onClose }) {
  const [detail, setDetail] = useState(null)
  const [itemsMap, setItemsMap] = useState({})  // { '20-outer': {quantity, current}, ... }
  const [mbPickerOpen, setMbPickerOpen] = useState(false)
  const [availableMbs, setAvailableMbs] = useState([])
  const [selectedMbs, setSelectedMbs] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)

  // 상세 로드 (초기 + 저장 후 갱신)
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await getInvoiceDetail(invoiceId)
      setDetail(d)
      setItemsMap(buildItemsMap(d.items || []))
    } catch (e) {
      setError(e.message || '상세 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => { reload() }, [reload])

  // ── 요구 항목 저장 ──
  const handleItemsSave = async () => {
    // 빈값 제외 + 숫자 변환 후 payload 구성
    const items = MODEL_KEYS
      .map((m) => {
        const q = parseInt(itemsMap[m.key]?.quantity, 10)
        if (!q || q <= 0) return null
        return { phi: m.phi, motor_type: m.motor_type, quantity: q }
      })
      .filter(Boolean)

    setSaving(true)
    try {
      await setInvoiceItems(invoiceId, items)
      setMsg(`요구 항목 ${items.length}개 저장됨`)
      await reload()
    } catch (e) {
      setError(e.message || '저장 실패')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 1800)
    }
  }

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
      setTimeout(() => setMsg(null), 1800)
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

  // ── 상태 전환 (수동 종료 / 복구) ──
  const toggleArchive = async () => {
    const nowArchived = detail?.invoice_status === 'archived'
    if (!nowArchived && !window.confirm('이 인보이스를 종료하시겠습니까?\n진척률 대시보드에서 숨겨집니다. (복구 가능)')) return
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
      setTimeout(() => setMsg(null), 1800)
    }
  }

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
          </h2>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
            {/* ── 메타 ── */}
            <div className={s.metaRow}>
              <span>생성 {formatDate(detail.created_at)}</span>
              {detail.notes && <span className={s.metaNote}>📝 {detail.notes}</span>}
            </div>

            {/* ── 요구 항목 ── */}
            <section className={s.section}>
              <div className={s.sectionHead}>
                <span className={s.sectionLabel}>요구 항목</span>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={handleItemsSave}
                  disabled={saving}
                >
                  저장
                </button>
              </div>

              <div className={s.itemsList}>
                {MODEL_KEYS.map((m) => {
                  const entry = itemsMap[m.key] || { quantity: '', current: 0 }
                  const target = parseInt(entry.quantity, 10) || 0
                  const pct = pctOf(entry.current, target)
                  const color = PHI_SPECS[m.phi]?.color || '#6b7585'
                  // overflow 경고: over면 주황, exact면 초록, 미달이면 phi 색상
                  const isOver = target > 0 && entry.current > target
                  const isExact = target > 0 && entry.current === target
                  const numColor = isOver ? 'var(--color-warning, #e67e22)'
                    : isExact ? 'var(--color-success, #27ae60)'
                    : color
                  const barColor = isOver ? 'var(--color-warning, #e67e22)' : color
                  return (
                    <div key={m.key} className={s.itemRow}>
                      <span className={s.itemLabel} style={{ color }}>{m.label}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={s.qtyInput}
                        value={entry.quantity}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v !== '' && !/^\d+$/.test(v)) return
                          setItemsMap((prev) => ({
                            ...prev,
                            [m.key]: { ...prev[m.key], quantity: v },
                          }))
                        }}
                        placeholder="목표"
                      />
                      <span className={s.progressText}>
                        <b style={{ color: numColor }}>{entry.current}</b>
                        <span className={s.progressSep}>/</span>
                        <span>{target || '-'}</span>
                        {isOver && <span style={{ marginLeft: 4, color: 'var(--color-warning, #e67e22)', fontWeight: 700 }}>⚠</span>}
                      </span>
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
