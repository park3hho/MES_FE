// src/pages/ExportPage.jsx
// ★ 검사 데이터 엑셀 내보내기 — OB 목록 + 검색 + 상세 + 다운로드
// 호출: App.jsx → ADM 메뉴에서 EXPORT 선택

import { useState, useEffect } from 'react'
import { getObList, getObDetail, downloadObExcel, downloadPackingList, downloadAllOqExcel,
  getExportConfig, updateExportConfig } from '@/api'
import { motion, AnimatePresence } from 'framer-motion'
import { FaradayLogo } from '@/components/FaradayLogo'
import { PHI_SPECS } from '@/constants/processConst'
import { useModels } from '@/hooks/useModels'
import s from './ExportPage.module.css'

// ── 판정 배지 색상 ──
const judgmentColor = (j) => (j === 'OK' ? 'var(--color-judgment-ok)' : 'var(--color-judgment-fail)')

// color: DB ModelRegistry 로 이관 (2026-04-24 PR-6) — 기존 phiColor 객체 제거, 컴포넌트 내 resolver 로 교체

// ── 스프링 트랜지션 (토스 스타일) ──
const spring = { type: 'spring', stiffness: 400, damping: 30 }
const stagger = { staggerChildren: 0.06 }

// ── 카드 애니메이션 variants ──
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, y: -10, scale: 0.97, transition: { duration: 0.15 } },
}

// ── 상세 펼침 variants ──
const detailVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto', transition: { ...spring, stiffness: 300 } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.2 } },
}

// ── 제품 행 variants ──
const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: spring },
}

export default function ExportPage({ onLogout, onBack }) {
  // color: DB ModelRegistry 로 이관 (2026-04-24 PR-6)
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

  // 출하 시트 헤더 설정 (D3 날짜 / D4 인보이스 번호) — DB 단일 행 (2026-05-08)
  // 이전엔 매번 date.today() 라 다운로드 시점마다 값이 달라져 추적 어려움 → DB 저장값 사용
  const [shipDate, setShipDate] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [cfgSaving, setCfgSaving] = useState(false)
  const [cfgMsg, setCfgMsg] = useState(null)

  useEffect(() => {
    let alive = true
    getExportConfig()
      .then((cfg) => {
        if (!alive || !cfg) return
        setShipDate(cfg.ship_date || '')
        setInvoiceNo(cfg.invoice_no || '')
      })
      .catch((e) => console.warn('export config 로드 실패:', e))
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!cfgMsg) return
    const t = setTimeout(() => setCfgMsg(null), 2200)
    return () => clearTimeout(t)
  }, [cfgMsg])

  const handleSaveConfig = async () => {
    setCfgSaving(true)
    try {
      await updateExportConfig({
        ship_date: shipDate || null,    // 빈 문자열 → null (today fallback)
        invoice_no: invoiceNo || '',
      })
      setCfgMsg('저장됨 — 다음 다운로드부터 적용')
    } catch (e) {
      setCfgMsg(`저장 실패: ${e.message}`)
    } finally {
      setCfgSaving(false)
    }
  }

  // ── 초기 로딩: OB 목록 ──
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

  // ── OB 카드 클릭 → 상세 토글 ──
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

  // ── 엑셀 다운로드 ──
  const handleDownload = async (obLotNo, e) => {
    e.stopPropagation()
    setDownloading(obLotNo)
    try {
      const blob = await downloadObExcel(obLotNo)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inspection_${obLotNo}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`다운로드 실패: ${err.message}`)
    } finally {
      setDownloading(null)
    }
  }

  // ── 패킹리스트 다운로드 ──
  const handlePackingList = async (obLotNo, e) => {
    e.stopPropagation()
    setDlPacking(obLotNo)
    try {
      const blob = await downloadPackingList(obLotNo)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `packing_${obLotNo}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`패킹리스트 실패: ${err.message}`)
    } finally {
      setDlPacking(null)
    }
  }

  // ── 전체 OQ 엑셀 다운로드 ──
  const handleDownloadAll = async () => {
    setDlAll(true)
    try {
      const blob = await downloadAllOqExcel()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inspection_ALL.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`다운로드 실패: ${err.message}`)
    } finally {
      setDlAll(false)
    }
  }

  // ── 검색 필터 ──
  const filtered = obList.filter((ob) => ob.ob_lot_no.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className={s.page}>
      <div className={s.container}>
        {/* 헤더 */}
        <motion.div
          className={s.header}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
        >
          <FaradayLogo size="md" />
          <p className={s.title}>검사 데이터 내보내기</p>
          <p className={s.sub}>
            출하 번호를 선택하면 포함된 제품을 확인하고 엑셀로 다운로드할 수 있습니다.
          </p>
          <motion.button
            className="btn-secondary btn-md"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDownloadAll}
            disabled={dlAll}
            style={{ marginTop: 12 }}
          >
            {dlAll ? '다운로드 중...' : '📥 전체 OQ 데이터 다운로드'}
          </motion.button>

          {/* 출하 시트 헤더 설정 (D3 / D4) — DB 단일 행 (2026-05-08).
              비어있으면 다운로드 시 today / FD{YYYYMMDD} 자동 fallback. */}
          <div style={{
            marginTop: 16, padding: '12px 16px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'left', maxWidth: 520, marginLeft: 'auto', marginRight: 'auto',
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: 'var(--color-gray)',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
            }}>
              출하 시트 헤더 (D3 / D4)
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '110px 1fr 130px 1fr auto',
              gap: 8, alignItems: 'center', fontSize: 13,
            }}>
              <label style={{ color: 'var(--color-gray)' }}>출하일 (D3)</label>
              <input
                type="date"
                value={shipDate}
                onChange={(e) => setShipDate(e.target.value)}
                disabled={cfgSaving}
                style={{
                  padding: '6px 10px', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'inherit',
                }}
              />
              <label style={{ color: 'var(--color-gray)' }}>인보이스 (D4)</label>
              <input
                type="text"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="비우면 FD{YYYYMMDD} 자동"
                disabled={cfgSaving}
                maxLength={30}
                style={{
                  padding: '6px 10px', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'inherit',
                }}
              />
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={handleSaveConfig}
                disabled={cfgSaving}
              >
                {cfgSaving ? '저장 중...' : '저장'}
              </button>
            </div>
            {cfgMsg && (
              <small style={{
                display: 'block', marginTop: 6, fontSize: 12,
                color: cfgMsg.startsWith('저장 실패') ? 'var(--color-error)' : '#1a9e75',
              }}>
                {cfgMsg.startsWith('저장 실패') ? '⚠ ' : '✓ '}{cfgMsg}
              </small>
            )}
          </div>
        </motion.div>

        {/* 검색바 */}
        <motion.div
          className={s.searchWrap}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: 0.1 }}
        >
          <span className={s.searchIcon}>🔍</span>
          <input
            className={s.searchInput}
            type="text"
            placeholder="OB 번호 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <motion.button
              className={s.clearBtn}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={spring}
              onClick={() => setSearch('')}
            >
              ✕
            </motion.button>
          )}
        </motion.div>

        {/* 목록 */}
        {loading ? (
          <motion.div className={s.loadingWrap} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className={s.spinner} />
            <span>불러오는 중...</span>
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.p className={s.empty} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {search ? `"${search}" 검색 결과 없음` : '출하 이력이 없습니다'}
          </motion.p>
        ) : (
          <div className={s.list}>
            {filtered.map((ob, idx) => (
              <motion.div
                key={ob.ob_lot_no}
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...spring, delay: idx * 0.06 }}
                className={`${s.card} ${expandedOb === ob.ob_lot_no ? s.cardExpanded : ''}`}
              >
                {/* 카드 헤더 — 클릭으로 토글 */}
                <div className={s.cardHeader} onClick={() => toggleDetail(ob.ob_lot_no)}>
                  <div className={s.cardLeft}>
                    <span className={s.obNo}>{ob.ob_lot_no}</span>
                    <span className={s.cardDate}>{ob.created_at?.split('T')[0]}</span>
                  </div>
                  <div className={s.cardRight}>
                    <span className={s.badge}>{ob.box_count}박스</span>
                    <span className={s.badge}>{ob.product_count}개</span>
                    <motion.button
                      className={s.dlBtn}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={(e) => handlePackingList(ob.ob_lot_no, e)}
                      disabled={dlPacking === ob.ob_lot_no}
                      title="패킹리스트"
                    >
                      {dlPacking === ob.ob_lot_no ? '...' : '📋'}
                    </motion.button>
                    <motion.button
                      className={s.dlBtn}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={(e) => handleDownload(ob.ob_lot_no, e)}
                      disabled={downloading === ob.ob_lot_no}
                      title="검사 데이터"
                    >
                      {downloading === ob.ob_lot_no ? '...' : '↓'}
                    </motion.button>
                    <motion.span
                      className={s.arrow}
                      animate={{ rotate: expandedOb === ob.ob_lot_no ? 180 : 0 }}
                      transition={spring}
                    >
                      ▾
                    </motion.span>
                  </div>
                </div>

                {/* 상세 펼침 */}
                <AnimatePresence>
                  {expandedOb === ob.ob_lot_no && (
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
                        <motion.div
                          variants={{ visible: stagger }}
                          initial="hidden"
                          animate="visible"
                        >
                          {detail.boxes.map((box) => (
                            <motion.div
                              key={box.mb_lot_no}
                              className={s.boxSection}
                              variants={rowVariants}
                            >
                              <div className={s.boxHeader}>
                                <span className={s.boxNo}>📦 {box.mb_lot_no}</span>
                                <span className={s.boxCount}>{box.products.length}개</span>
                              </div>
                              <div className={s.productList}>
                                {box.products.map((p, pi) => (
                                  <motion.div
                                    key={pi}
                                    className={s.productRow}
                                    variants={rowVariants}
                                  >
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
                                        className={s.judgmentBadge}
                                        style={{ color: judgmentColor(p.judgment) }}
                                      >
                                        {p.judgment}
                                      </span>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            </motion.div>
                          ))}
                        </motion.div>
                      ) : null}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}

        {/* 하단 버튼 */}
        <motion.button
          className={s.backBtn}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          onClick={onBack}
        >
          ← 이전
        </motion.button>
      </div>
    </div>
  )
}
