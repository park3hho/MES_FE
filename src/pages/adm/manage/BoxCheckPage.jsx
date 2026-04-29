// src/pages/adm/manage/BoxCheckPage.jsx
// 박스 확인 — MB 목록에서 선택 → 트리 뷰 (MB → UBs → STs) + 엑셀 추출
// QR 스캔 단계 제거 (2026-04-23) — 현장에서 일일이 스캔이 불편하다는 피드백 반영
// RT 컬럼은 엑셀에서 현장 수기 입력용 빈칸. Phase 1에서는 RT 자동 채번 없음.

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { getBoxMbFull, downloadBoxMbExcel, getBoxSummary, printCertUbLabel } from '@/api'
import PageHeader from '@/components/common/PageHeader'
import { PHI_SPECS } from '@/constants/processConst'
import { useModels } from '@/hooks/useModels'

import s from './BoxCheckPage.module.css'

// color: DB ModelRegistry 로 이관 (2026-04-24 PR-6) — 모듈 레벨 phiColor 제거, 컴포넌트 내부 resolver 사용
const phiLabel = (phi) => (phi ? `Φ${phi}` : '—')

const formatDate = (iso) => {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

// UB 리스트 스태거 variants
const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: -6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
}

// 한 UB 카드 — 헤더(lot_no, phi, count) + ST 시리얼 리스트
function UbCard({ ub }) {
  // color: DB ModelRegistry 로 이관 (2026-04-24 PR-6) — motor_type 미상이라 3단 fallback
  const { findModel } = useModels()
  const [open, setOpen] = useState(false)  // 기본 접힘

  // cert 라벨 출력 상태 (2026-04-29)
  const [certPrinting, setCertPrinting] = useState(false)
  const [certMsg, setCertMsg] = useState(null)   // { kind: 'success'|'error', text }

  const handleCertPrint = async (e) => {
    e.stopPropagation()
    if (certPrinting) return
    setCertPrinting(true)
    setCertMsg(null)
    try {
      await printCertUbLabel(ub.ub_lot_no)
      setCertMsg({ kind: 'success', text: '✓ Cert 라벨 출력 완료' })
    } catch (err) {
      setCertMsg({ kind: 'error', text: err.message || 'Cert 라벨 출력 실패' })
    } finally {
      setCertPrinting(false)
      // 3초 후 메시지 자동 제거
      setTimeout(() => setCertMsg(null), 3000)
    }
  }

  const color =
    findModel(ub.phi, 'inner')?.color_hex ??
    findModel(ub.phi, 'outer')?.color_hex ??
    PHI_SPECS[ub.phi]?.color ??
    '#c0c8d8'

  return (
    <motion.div
      className={`${s.ubCard} ${open ? s.ubCardOpen : ''}`}
      variants={itemVariants}
    >
      <button type="button" className={s.ubHeader} onClick={() => setOpen(!open)}>
        <span className={s.ubDot} style={{ background: color }} />
        <span className={s.ubLotNo}>{ub.ub_lot_no}</span>
        <span className={s.ubPhi} style={{ color }}>{phiLabel(ub.phi)}</span>
        <span className={s.ubCount}>
          ST {ub.item_count}{(ub.rt_count || 0) > 0 ? ` · RT ${ub.rt_count}` : ''}
        </span>
        <span className={`${s.ubArrow} ${open ? s.ubArrowOpen : ''}`}>▾</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          // 이너 래퍼 패턴: 바깥 motion.div는 height/opacity만, 내부 div가 실제 padding/border 소유
          // → framer-motion의 height auto 측정이 padding 재계산에 영향 안 받아 부드러움
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className={s.stList}>
              {/* cert 라벨 출력 영역 (2026-04-29) — 출하된 MB 의 UB 만 가능 (BE 검증) */}
              <div style={{
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
                gap: 8, padding: '8px 12px', borderBottom: '1px dashed #e5e8ee',
              }}>
                {certMsg && (
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: certMsg.kind === 'error' ? '#e74c3c' : '#27ae60',
                  }}>
                    {certMsg.text}
                  </span>
                )}
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={handleCertPrint}
                  disabled={certPrinting}
                  title="QR 스캔 시 cert 페이지로 이동하는 라벨 출력"
                >
                  {certPrinting ? '출력 중…' : '📦 Cert 라벨'}
                </button>
              </div>

              {ub.items.length === 0 ? (
                <div className={s.stEmpty}>ST 없음 — 현장 수기 입력 대상</div>
              ) : (
                ub.items.map((item, idx) => (
                  <div key={item.st_serial} className={s.stRow}>
                    <span className={s.stIndex}>{String(idx + 1).padStart(2, '0')}</span>
                    <span className={s.stSerial}>{item.st_serial}</span>
                  </div>
                ))
              )}
              {(ub.rts || []).length > 0 && (
                <>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: '#5f6b7a',
                    padding: '8px 12px 4px', borderTop: '1px dashed #e5e8ee', marginTop: 4,
                  }}>
                    RT ({ub.rt_count})
                  </div>
                  {ub.rts.map((rt, idx) => (
                    <div key={rt.rt_serial} className={s.stRow}>
                      <span className={s.stIndex} style={{ color: '#8a93a8' }}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className={s.stSerial} style={{ color: '#5f6b7a', fontStyle: 'italic' }}>
                        ⚙ {rt.rt_serial}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function BoxCheckPage({ onLogout, onBack }) {
  // color: DB ModelRegistry 로 이관 (2026-04-24 PR-6) — motor_type 미상이라 3단 fallback
  const { findModel } = useModels()
  const phiColor = (phi) =>
    findModel(phi, 'inner')?.color_hex ??
    findModel(phi, 'outer')?.color_hex ??
    PHI_SPECS[phi]?.color ??
    '#c0c8d8'

  const [step, setStep] = useState('list')  // 'list' | 'tree'
  const [mbList, setMbList] = useState(null)    // MB 요약 목록
  const [listLoading, setListLoading] = useState(false)
  const [tree, setTree] = useState(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)

  // MB 목록 로드 — 최초 진입 & 트리에서 뒤로 돌아올 때
  useEffect(() => {
    if (step !== 'list') return
    let alive = true
    setListLoading(true)
    setError(null)
    getBoxSummary('MB')
      .then((d) => {
        if (!alive) return
        setMbList(d.boxes || [])
      })
      .catch((e) => { if (alive) setError(e.message || 'MB 목록 조회 실패') })
      .finally(() => { if (alive) setListLoading(false) })
    return () => { alive = false }
  }, [step])

  const handleSelect = async (mbLotNo) => {
    setTreeLoading(true)
    setError(null)
    try {
      const data = await getBoxMbFull(mbLotNo)
      setTree(data)
      setStep('tree')
    } catch (e) {
      setError(e.message || '박스 조회 실패')
    } finally {
      setTreeLoading(false)
    }
  }

  const handleBackToList = () => {
    setTree(null)
    setError(null)
    setStep('list')
  }

  const handleDownloadExcel = async () => {
    if (!tree) return
    setDownloading(true)
    try {
      const blob = await downloadBoxMbExcel(tree.mb_lot_no)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `box_check_${tree.mb_lot_no}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message || '엑셀 다운로드 실패')
    } finally {
      setDownloading(false)
    }
  }

  // ── 렌더링 ──

  if (step === 'list') {
    const filledBoxes = (mbList || []).filter((b) => !b.empty)
    const emptyBoxes = (mbList || []).filter((b) => b.empty)
    return (
      <div className="page-flat">
        <PageHeader
          title="박스 확인"
          subtitle="확인할 MB 박스를 선택해 주세요"
          onBack={onBack}
        />

        {error && <p className={s.error}>{error}</p>}

        {listLoading ? (
          <div className={s.empty}>불러오는 중…</div>
        ) : filledBoxes.length === 0 && emptyBoxes.length === 0 ? (
          <div className={s.empty}>등록된 MB 박스가 없습니다.</div>
        ) : (
          <motion.div className={s.mbList} variants={listVariants} initial="hidden" animate="show">
            {filledBoxes.length > 0 && (
              <div className={s.mbGroupLabel}>사용 중 · {filledBoxes.length}박스</div>
            )}
            {filledBoxes.map((mb) => {
              const phiEntries = Object.entries(mb.phi_counts || {}).filter(([, c]) => c > 0)
              const totalSt = phiEntries.reduce((sum, [, c]) => sum + c, 0)
              return (
                <motion.button
                  key={mb.lot_no}
                  type="button"
                  className={s.mbListItem}
                  onClick={() => handleSelect(mb.lot_no)}
                  disabled={treeLoading}
                  variants={itemVariants}
                >
                  <span className={s.mbBadgeSm}>MB</span>
                  <div className={s.mbListBody}>
                    <div className={s.mbListTop}>
                      <span className={s.mbListLot}>{mb.lot_no}</span>
                      <span className={s.mbListDate}>{formatDate(mb.created_at)}</span>
                    </div>
                    <div className={s.mbListMeta}>
                      <span className={s.mbListCount}>UB {mb.item_count}개</span>
                      {totalSt > 0 && <span className={s.mbListCount}>· ST {totalSt}개</span>}
                      {phiEntries.length > 0 && (
                        <span className={s.mbListPhis}>
                          {phiEntries.map(([phi, cnt]) => (
                            <span key={phi} className={s.mbListPhi} style={{ color: phiColor(phi) }}>
                              Φ{phi} {cnt}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={s.mbArrow}>›</span>
                </motion.button>
              )
            })}

            {emptyBoxes.length > 0 && (
              <>
                <div className={s.mbGroupLabel}>빈 박스 · {emptyBoxes.length}박스</div>
                {emptyBoxes.map((mb) => (
                  <motion.button
                    key={mb.lot_no}
                    type="button"
                    className={`${s.mbListItem} ${s.mbListItemEmpty}`}
                    onClick={() => handleSelect(mb.lot_no)}
                    disabled={treeLoading}
                    variants={itemVariants}
                  >
                    <span className={s.mbBadgeSm}>MB</span>
                    <div className={s.mbListBody}>
                      <div className={s.mbListTop}>
                        <span className={s.mbListLot}>{mb.lot_no}</span>
                        <span className={s.mbListDate}>{formatDate(mb.created_at)}</span>
                      </div>
                      <div className={s.mbListMeta}>
                        <span className={s.mbListEmpty}>비어 있음</span>
                      </div>
                    </div>
                    <span className={s.mbArrow}>›</span>
                  </motion.button>
                ))}
              </>
            )}
          </motion.div>
        )}
      </div>
    )
  }

  // tree step
  return (
    <div className="page-flat">
      <div className={s.header}>
        <button className="btn-ghost btn-sm" onClick={handleBackToList}>
          ← 이전으로
        </button>
      </div>

      {/* 상단 MB 요약 — 진입 시 페이드/슬라이드 */}
      <motion.div
        className={s.summary}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        <div className={s.summaryLeft}>
          <span className={s.mbBadge}>MB</span>
          <div className={s.summaryText}>
            <h2 className={s.mbLotNo}>{tree.mb_lot_no}</h2>
            <p className={s.summaryMeta}>
              생성 {formatDate(tree.created_at)} · UB {tree.total_ub}개 · ST {tree.total_st}개{(tree.total_rt || 0) > 0 ? ` · RT ${tree.total_rt}개` : ''}
            </p>
          </div>
        </div>
        <button
          className="btn-primary btn-md"
          onClick={handleDownloadExcel}
          disabled={downloading || tree.total_ub === 0}
        >
          {downloading ? '생성 중...' : '📥 엑셀 다운로드'}
        </button>
      </motion.div>

      {error && <p className={s.error}>{error}</p>}

      {/* UB 리스트 — 스태거 페이드인 */}
      {tree.ubs.length === 0 ? (
        <div className={s.empty}>이 MB 박스에 담긴 UB가 없습니다.</div>
      ) : (
        <motion.div
          className={s.ubList}
          variants={listVariants}
          initial="hidden"
          animate="show"
        >
          {tree.ubs.map((ub) => (
            <UbCard key={ub.ub_lot_no} ub={ub} />
          ))}
        </motion.div>
      )}
    </div>
  )
}
