// src/pages/adm/manage/ExportPage.jsx
// 검사 데이터 엑셀 내보내기 — Toss flat 리뉴얼 (2026-05-08)
//   - .card 래퍼 제거 → page-flat + PageHeader + Section 패턴
//   - 출하 시트 헤더: ship_date / invoice_date 둘 다 date picker
//     · invoice_no 는 사용자가 직접 입력하지 않음 — 선택한 날짜로 FD{YYYYMMDD} 자동 생성
//     · 기존에 FD-prefix 가 아닌 invoice 가 저장돼있으면 빈 값으로 시작 (사용자가 다시 선택)

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getObList, getObDetail, downloadObExcel, downloadPackingList, downloadAllOqExcel,
  listObExportMeta, putObExportMeta,
} from '@/api'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import { PHI_SPECS } from '@/constants/processConst'
import { TOAST_FLASH_MS } from '@/constants/etcConst'
import { useModels } from '@/hooks/useModels'
import { useToast } from '@/contexts/ToastContext'
import s from './ExportPage.module.css'

// ── 판정 색 ──
const judgmentColor = (j) => (j === 'OK' ? 'var(--color-judgment-ok)' : 'var(--color-judgment-fail)')

// ── invoice helper ──
// 인보이스는 항상 FD{YYYYMMDD} 형태로 저장 — 사용자는 날짜만 선택하면 됨.
// 기존 invoice_no 가 그 형태가 아니면 invoice_date 를 빈 값으로 시작 (사용자가 새로 선택).
const FD_INVOICE_RE = /^FD(\d{4})(\d{2})(\d{2})$/
const invoiceNoToDate = (invoiceNo) => {
  if (!invoiceNo) return ''
  const m = String(invoiceNo).match(FD_INVOICE_RE)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}
const dateToInvoiceNo = (dateStr) => {
  if (!dateStr) return ''
  return `FD${dateStr.replace(/-/g, '')}`
}

// ── 애니메이션 ──
const ease = [0.22, 1, 0.36, 1]
const detailVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto', transition: { duration: 0.32, ease } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.22, ease } },
}

export default function ExportPage({ onLogout, onBack }) {
  const toast = useToast()
  const { findModel } = useModels()
  const resolveColor = (phi, motor) =>
    findModel(phi, motor)?.color_hex ??
    findModel(phi, 'inner')?.color_hex ??
    findModel(phi, 'outer')?.color_hex ??
    PHI_SPECS[phi]?.color ??
    '#9CA3AF'

  const [obList, setObList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedOb, setExpandedOb] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [downloading, setDownloading] = useState(null)
  const [dlPacking, setDlPacking] = useState(null)
  const [dlAll, setDlAll] = useState(false)

  // OB 별 출하 시트 헤더 메타 — { [ob_lot_no]: { ship_date, invoice_no } }
  const [obMetaMap, setObMetaMap] = useState({})
  const [savingOb, setSavingOb] = useState(null)
  const [savedFlash, setSavedFlash] = useState(null)

  // OB 메타 + OB 목록 동시 로드
  useEffect(() => {
    let alive = true
    listObExportMeta()
      .then((items) => {
        if (!alive) return
        const m = {}
        for (const it of items) m[it.ob_lot_no] = it
        setObMetaMap(m)
      })
      .catch((e) => console.warn('OB 메타 로드 실패:', e))
    return () => { alive = false }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        setObList(await getObList())
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // 로컬 메타 변경 (저장 별도)
  const updateLocalMeta = (obLotNo, patch) => {
    setObMetaMap((prev) => ({
      ...prev,
      [obLotNo]: { ...(prev[obLotNo] || { ob_lot_no: obLotNo }), ...patch },
    }))
  }

  const handleSaveObMeta = async (obLotNo) => {
    const cur = obMetaMap[obLotNo] || {}
    setSavingOb(obLotNo)
    try {
      await putObExportMeta(obLotNo, {
        ship_date: cur.ship_date || null,
        invoice_no: cur.invoice_no || '',
      })
      setSavedFlash(obLotNo)
      setTimeout(() => setSavedFlash((c) => (c === obLotNo ? null : c)), TOAST_FLASH_MS)
    } catch (e) {
      // eslint-disable-next-line no-alert
      toast(`저장 실패: ${e.message}`, 'error')
    } finally {
      setSavingOb(null)
    }
  }

  // 카드 토글 + 상세 로드
  const toggleDetail = async (obLotNo) => {
    if (expandedOb === obLotNo) {
      setExpandedOb(null)
      setDetail(null)
      return
    }
    setExpandedOb(obLotNo)
    setDetailLoading(true)
    try {
      setDetail(await getObDetail(obLotNo))
    } catch (e) {
      console.error(e)
    } finally {
      setDetailLoading(false)
    }
  }

  // 다운로드 헬퍼 — Blob → 파일명으로 저장
  const triggerDownload = async (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleDownload = async (obLotNo, e) => {
    e.stopPropagation()
    setDownloading(obLotNo)
    try {
      const blob = await downloadObExcel(obLotNo)
      await triggerDownload(blob, `inspection_${obLotNo}.xlsx`)
    } catch (err) {
      toast(`다운로드 실패: ${err.message}`, 'error')
    } finally {
      setDownloading(null)
    }
  }

  const handlePackingList = async (obLotNo, e) => {
    e.stopPropagation()
    setDlPacking(obLotNo)
    try {
      const blob = await downloadPackingList(obLotNo)
      await triggerDownload(blob, `packing_${obLotNo}.xlsx`)
    } catch (err) {
      toast(`패킹리스트 실패: ${err.message}`, 'error')
    } finally {
      setDlPacking(null)
    }
  }

  const handleDownloadAll = async () => {
    setDlAll(true)
    try {
      const blob = await downloadAllOqExcel()
      await triggerDownload(blob, 'inspection_ALL.xlsx')
    } catch (err) {
      toast(`다운로드 실패: ${err.message}`, 'error')
    } finally {
      setDlAll(false)
    }
  }

  const filtered = obList.filter((ob) => ob.ob_lot_no.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="page-flat">
      <PageHeader
        title="어떤 출하 건의 검사 데이터를 내보낼까요?"
        subtitle="OB 를 선택하면 시트 헤더 입력 + 엑셀 다운로드를 할 수 있어요"
        onBack={onBack}
      />

      {/* 전체 다운로드 — 자주 안 쓰이지만 항상 보이는 진입점 */}
      <Section label="전체 데이터">
        <button
          type="button"
          className={s.allBtn}
          onClick={handleDownloadAll}
          disabled={dlAll}
        >
          <span className={s.allBtnIcon}>📥</span>
          <span className={s.allBtnText}>
            {dlAll ? '다운로드 중…' : '전체 OQ 데이터 엑셀'}
          </span>
        </button>
      </Section>

      {/* 검색 */}
      <div className={s.searchWrap}>
        <span className={s.searchIcon}>🔍</span>
        <input
          className={s.searchInput}
          type="text"
          placeholder="OB 번호로 찾기"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className={s.clearBtn} onClick={() => setSearch('')}>
            ✕
          </button>
        )}
      </div>

      {/* 목록 */}
      <Section
        label={
          loading
            ? '불러오는 중'
            : filtered.length === 0
              ? '결과 없음'
              : `출하 ${filtered.length}건`
        }
      >
        {loading ? (
          <div className={s.loadingWrap}>
            <div className={s.spinner} />
            <span>불러오는 중…</span>
          </div>
        ) : filtered.length === 0 ? (
          <p className={s.empty}>
            {search ? `"${search}" 검색 결과 없음` : '출하 이력이 없어요'}
          </p>
        ) : (
          <div className={s.list}>
            {filtered.map((ob) => {
              const isExpanded = expandedOb === ob.ob_lot_no
              return (
                <div
                  key={ob.ob_lot_no}
                  className={`${s.row} ${isExpanded ? s.rowExpanded : ''}`}
                >
                  {/* row header — 클릭으로 토글 */}
                  <div className={s.rowHeader} onClick={() => toggleDetail(ob.ob_lot_no)}>
                    <div className={s.rowMain}>
                      <span className={s.obNo}>{ob.ob_lot_no}</span>
                      <span className={s.rowMeta}>
                        {ob.created_at?.split('T')[0]} · {ob.box_count}박스 · {ob.product_count}개
                      </span>
                    </div>
                    <div className={s.rowActions}>
                      <button
                        type="button"
                        className={s.iconBtn}
                        onClick={(e) => handlePackingList(ob.ob_lot_no, e)}
                        disabled={dlPacking === ob.ob_lot_no}
                        title="패킹리스트 다운로드"
                      >
                        {dlPacking === ob.ob_lot_no ? '…' : '📋'}
                      </button>
                      <button
                        type="button"
                        className={s.iconBtnPrimary}
                        onClick={(e) => handleDownload(ob.ob_lot_no, e)}
                        disabled={downloading === ob.ob_lot_no}
                        title="검사 데이터 다운로드"
                      >
                        {downloading === ob.ob_lot_no ? '…' : '↓'}
                      </button>
                      <span
                        className={s.chevron}
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}
                      >
                        ▾
                      </span>
                    </div>
                  </div>

                  {/* 펼침 */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        className={s.detail}
                        variants={detailVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        {detailLoading ? (
                          <div className={s.detailLoading}>
                            <div className={s.spinnerSm} />
                          </div>
                        ) : detail ? (
                          <>
                            {/* 출하 시트 헤더 입력 — 두 개 다 date picker (2026-05-08) */}
                            <MetaBlock
                              ob={ob}
                              meta={obMetaMap[ob.ob_lot_no]}
                              onChange={(patch) => updateLocalMeta(ob.ob_lot_no, patch)}
                              onSave={() => handleSaveObMeta(ob.ob_lot_no)}
                              isSaving={savingOb === ob.ob_lot_no}
                              justSaved={savedFlash === ob.ob_lot_no}
                            />

                            {/* 박스 / 제품 리스트 */}
                            {detail.boxes.map((box) => (
                              <div key={box.mb_lot_no} className={s.boxSection}>
                                <div className={s.boxHeader}>
                                  <span className={s.boxNo}>📦 {box.mb_lot_no}</span>
                                  <span className={s.boxCount}>{box.products.length}개</span>
                                </div>
                                <div className={s.productList}>
                                  {box.products.map((p, pi) => (
                                    <div key={pi} className={s.productRow}>
                                      <div className={s.productLeft}>
                                        <span
                                          className={s.phiDot}
                                          style={{ background: resolveColor(p.phi) }}
                                        />
                                        <span className={s.stNo}>{p.serial_no}</span>
                                      </div>
                                      <div className={s.productRight}>
                                        <span className={s.productMeta}>Φ{p.phi}</span>
                                        {p.resistance && (
                                          <span className={s.productMeta}>R:{p.resistance}</span>
                                        )}
                                        <span
                                          className={s.judgment}
                                          style={{ color: judgmentColor(p.judgment) }}
                                        >
                                          {p.judgment}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </>
                        ) : null}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// MetaBlock — 출하 시트 헤더 (ship_date + invoice_date) 입력 (2026-05-08)
// invoice_no 는 사용자가 안 적음 — invoice_date 선택 시 FD{YYYYMMDD} 로 자동 생성
// ══════════════════════════════════════════════════════════
function MetaBlock({ ob, meta, onChange, onSave, isSaving, justSaved }) {
  const cur = meta || {}
  const invoiceDate = invoiceNoToDate(cur.invoice_no)
  const invoicePreview = cur.invoice_no || (invoiceDate ? dateToInvoiceNo(invoiceDate) : '—')

  const handleInvoiceDateChange = (newDate) => {
    onChange({ invoice_no: newDate ? dateToInvoiceNo(newDate) : '' })
  }

  return (
    <div className={s.metaBlock}>
      <div className={s.metaHead}>
        <span className={s.metaTitle}>출하 시트 헤더</span>
        {justSaved && <span className={s.metaSaved}>✓ 저장됨</span>}
      </div>
      <div className={s.metaGrid}>
        <label className={s.metaLabel} htmlFor={`ship-${ob.ob_lot_no}`}>출하일</label>
        <input
          id={`ship-${ob.ob_lot_no}`}
          type="date"
          className={s.metaInput}
          value={cur.ship_date || ''}
          onChange={(e) => onChange({ ship_date: e.target.value })}
          disabled={isSaving}
        />
        <span className={s.metaPreview}>{cur.ship_date || '—'}</span>

        <label className={s.metaLabel} htmlFor={`inv-${ob.ob_lot_no}`}>인보이스 날짜</label>
        <input
          id={`inv-${ob.ob_lot_no}`}
          type="date"
          className={s.metaInput}
          value={invoiceDate}
          onChange={(e) => handleInvoiceDateChange(e.target.value)}
          disabled={isSaving}
        />
        <span className={s.metaPreview} title="저장될 인보이스 번호">{invoicePreview}</span>
      </div>
      <button
        type="button"
        className={s.metaSaveBtn}
        onClick={onSave}
        disabled={isSaving}
      >
        {isSaving ? '저장 중…' : '저장'}
      </button>
    </div>
  )
}
