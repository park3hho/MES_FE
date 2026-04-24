// src/pages/inventory/ProgressPage.jsx
// 인보이스 진척률 — 재고 탭 3번째 뷰 (/inventory/progress)
// BottomNav long-press 팝오버, SideNav 서브메뉴에서 진입
// 활성 인보이스 전체 요약 — phi/motor별 진행률 바 + 게이지
//
// 규약:
//   - PHI_SPECS / DB ModelRegistry 사용 (하드코딩 금지)
//   - 카드형(모바일) + 테이블형(PC) 반응형
//   - framer-motion으로 카드 페이드+스태거, 프로그레스 바 fill

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

import { getInvoiceProgress } from '@/api'
// MODEL_KEYS / findModel 제거: DB ModelRegistry 로 이관 (2026-04-24 PR-7)
import { PHI_SPECS, canAccessInvoice } from '@/constants/processConst'
import { useModels } from '@/hooks/useModels'

import s from './ProgressPage.module.css'

const formatDate = (iso) => {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  } catch { return iso }
}

const pctOf = (cur, target) => {
  if (!target) return 0
  return Math.min(100, Math.round((cur / target) * 100))
}

// 스태거 variants
const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: -8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
}

// 인보이스 한 건 카드
function InvoiceProgressCard({ invoice }) {
  // color / 모델 순서: DB ModelRegistry 로 이관 (2026-04-24 PR-6, PR-7)
  const { models, findModel: findDbModel } = useModels()
  const phiColor = (phi, motor) =>
    findDbModel(phi, motor)?.color_hex ??
    findDbModel(phi, 'inner')?.color_hex ??
    findDbModel(phi, 'outer')?.color_hex ??
    PHI_SPECS[phi]?.color ??
    '#6b7585'

  const pct = invoice.total_target
    ? Math.round((invoice.total_current / invoice.total_target) * 100)
    : 0
  const isComplete = pct >= 100

  // MODEL_KEYS 제거: DB ModelRegistry 로 이관 (2026-04-24 PR-7)
  // models 는 display_order 로 이미 정렬됨. API 응답에 없는 모델은 표시 안 함.
  const itemsInOrder = models
    .map((m) => {
      const found = invoice.items.find(
        (it) => it.phi === m.phi && it.motor_type === m.motor_type,
      )
      return found ? { ...found, model: m } : null
    })
    .filter(Boolean)

  return (
    <motion.div className={s.card} variants={cardVariants}>
      <div className={s.cardHeader}>
        <div className={s.cardHeaderLeft}>
          <span className={s.invoiceNo}>{invoice.invoice_no}</span>
          {invoice.title && <span className={s.invoiceTitle}>{invoice.title}</span>}
        </div>
        <div className={s.cardHeaderRight}>
          <span className={s.dateText}>{formatDate(invoice.created_at)}</span>
          <span className={s.mbBadge}>MB {invoice.mb_count}</span>
        </div>
      </div>

      {/* 총 진행률 게이지 */}
      <div className={s.totalRow}>
        <span className={s.totalLabel}>전체</span>
        <span className={s.totalText}>
          <b className={isComplete ? s.completeBadge : ''}>
            {invoice.total_current}
          </b>
          <span className={s.sepDim}> / </span>
          <span>{invoice.total_target}</span>
        </span>
        <div className={s.totalBar}>
          <motion.div
            className={s.totalFill}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ background: isComplete ? 'var(--color-success, #27ae60)' : 'var(--color-primary)' }}
          />
        </div>
        <span className={s.pctText}>{pct}%</span>
      </div>

      {/* 요구 항목 리스트 */}
      {itemsInOrder.length === 0 ? (
        <p className={s.empty}>요구 항목 미설정 — InvoicePage에서 설정</p>
      ) : (
        <ul className={s.itemsList}>
          {itemsInOrder.map((it) => {
            // color: DB ModelRegistry 로 이관 (2026-04-24 PR-6)
            const color = phiColor(it.phi, it.motor_type)
            const itemPct = pctOf(it.current, it.quantity)
            const isOver = it.quantity > 0 && it.current > it.quantity
            const isExact = it.quantity > 0 && it.current === it.quantity
            // over: 주황 경고, exact: 초록 완료, 미달: phi 색상
            const numColor = isOver ? 'var(--color-warning, #e67e22)'
              : isExact ? 'var(--color-success, #27ae60)'
              : color
            const barColor = isOver ? 'var(--color-warning, #e67e22)' : color
            return (
              <li key={it.model.id} className={s.itemRow}>
                <span className={s.itemLabel} style={{ color }}>{it.model.label}</span>
                <span className={s.itemText}>
                  <b style={{ color: numColor }}>{it.current}</b>
                  <span className={s.sepDim}> / </span>
                  <span>{it.quantity}</span>
                  {isOver && <span className={s.overMark}>⚠</span>}
                  {isExact && <span className={s.checkMark}>✓</span>}
                </span>
                <div className={s.itemBar}>
                  <motion.div
                    className={s.itemFill}
                    initial={{ width: 0 }}
                    animate={{ width: `${itemPct}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 }}
                    style={{ background: barColor }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </motion.div>
  )
}

export default function ProgressPage({ user }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // admin_rnd만 송장 관리 진입 허용
  const showInvoiceBtn = canAccessInvoice(user?.login_id)

  // silent=true 면 loading 토글 없이 조용히 데이터만 업데이트 — 폴링 시 애니메이션 재생 방지
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const d = await getInvoiceProgress()
      setData(d)
    } catch (e) {
      setError(e.message || '진척률 조회 실패')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // 폴링 — 10초마다, 탭이 hidden일 때는 쉬기 (불필요 트래픽/BE 로그 절약)
  // 최초 load만 loading 토글 → 스켈레톤 1회 + 애니메이션 1회
  // 폴링은 silent=true → 리스트 unmount 없이 숫자/바만 부드럽게 업데이트
  useEffect(() => {
    load()  // 최초 1회는 loading 토글
    let id = null
    const start = () => {
      if (id != null) return
      id = setInterval(() => load(true), 10000)
    }
    const stop = () => {
      if (id == null) return
      clearInterval(id); id = null
    }
    start()
    const onVisible = () => {
      if (document.visibilityState === 'visible') { load(true); start() } else stop()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const invoices = data?.invoices || []

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.title}>진척률 상황</h1>
          <p className={s.subtitle}>
            활성 인보이스 {invoices.length}건 · MB 안 ST 기준 (출하 전)
          </p>
        </div>
        {showInvoiceBtn && (
          <button
            type="button"
            className={s.invoiceBtn}
            onClick={() => navigate('/admin/invoice')}
            title="송장 관리로 이동"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>송장 관리</span>
          </button>
        )}
      </div>

      {loading && <p className={s.info}>로딩 중...</p>}
      {error && <p className={s.errorMsg}>⚠ {error}</p>}

      {!loading && !error && invoices.length === 0 && (
        <div className={s.empty}>
          활성 인보이스가 없습니다.<br />
          송장 관리 페이지에서 인보이스를 업로드하고 요구 항목을 설정하세요.
        </div>
      )}

      {!loading && invoices.length > 0 && (
        <motion.div
          className={s.list}
          variants={listVariants}
          initial="hidden"
          animate="show"
        >
          {invoices.map((inv) => (
            <InvoiceProgressCard key={inv.id} invoice={inv} />
          ))}
        </motion.div>
      )}
    </div>
  )
}
