// pages/cert/steps/CertSheetStep.jsx
// sheet 화면 (MB → UB → ST/RT 트리) 오케스트레이터 (CertFlow 분할, 2026-05-08)

import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { fmtDate } from '../lib/format'
import CompanyOrdersBar from '../sheet/CompanyOrdersBar'
import DownloadGroup from '../sheet/DownloadGroup'
import MBSheet from '../sheet/MBSheet'
import UBBlock from '../sheet/UBBlock'
import RecentFab from '../sheet/RecentFab'
import s from '../CertFlow.module.css'

export default function CertSheetStep({ data, error, onLogout, token, sessionToken }) {
  const navigate = useNavigate()
  // URL 의 ub / fp 직접 사용 — BE 의 focus_ub 보다 우선. 이러면 sheetData 변경 없이 URL 만 바꿔도 즉시 전환 (애니 가능)
  // fp 는 외부 QR 스캔 진입용 (사용자 정책 2026-04-29) — UB 페이지의 그 ST 카드 자동 펼침
  const { ub: urlUB, fp: urlFP } = useParams()
  if (error) {
    return (
      <motion.div className={s.sheetError} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <p>⚠ {error}</p>
        <button className={s.linkBtn} onClick={onLogout}>
          Re-enter password
        </button>
      </motion.div>
    )
  }
  if (!data) {
    return (
      <motion.div className={s.sheetLoading} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className={s.spinner} />
        <p>Loading data...</p>
      </motion.div>
    )
  }

  // v4 응답: { ob, mb: { lot_no, ub_count, st_count, models, ubs }, focus_ub }
  // URL ub 만 진실의 원천 — BE focus_ub 는 무시 (session token 의 잔존 ub 때문에 MB URL 도 UB 로 분기되던 버그 fix, 2026-04-29)
  const { ob, mb } = data
  const ubLotKey = urlUB ? decodeURIComponent(urlUB) : ''
  const focusedUB = ubLotKey ? mb?.ubs?.find((u) => u.lot_no === ubLotKey) : null

  // 페이지 전환 애니용 key (UB 마다 다른 key → AnimatePresence 가 트리거)
  const viewKey = focusedUB ? `ub:${focusedUB.lot_no}` : 'mb'

  // prev/next UB — 같은 MB 안 ubs 순서 기반 (사용자 정책 H, 2026-04-29)
  const ubIndex = focusedUB && mb?.ubs ? mb.ubs.findIndex((u) => u.lot_no === focusedUB.lot_no) : -1
  const prevUB = ubIndex > 0 ? mb.ubs[ubIndex - 1] : null
  const nextUB = ubIndex >= 0 && ubIndex < (mb?.ubs?.length || 0) - 1 ? mb.ubs[ubIndex + 1] : null

  // 뒤로가기 / UB 이동 헬퍼 — query (cert-preview) 보존
  const goBackToMB = () => {
    const search = window.location.search || ''
    navigate(`/${token}${search}`)
  }
  const goToUB = (ubLot) => {
    const search = window.location.search || ''
    navigate(`/${token}/${encodeURIComponent(ubLot)}${search}`)
  }

  return (
    <motion.div
      className={s.sheet}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* 회사 로그인 상태 + 뒤로가기 묶음 (Phase D + 2026-05-07 통합) */}
      {/* MB 뷰: My Orders 만, UB 뷰: ← MB-XXX (outlined) + ← My Orders (filled) 둘 다 노출 */}
      <CompanyOrdersBar
        mbLotNo={focusedUB ? mb?.lot_no : undefined}
        onBackToMB={focusedUB ? goBackToMB : undefined}
      />

      <header className={s.sheetHeader}>
        <img src="/FaradayDynamicsLogo.png" alt="" className={s.sheetLogo} />
        <div className={s.sheetHeaderText}>
          <div className={s.sheetTag}>Certificate of Quality</div>
          {/* 헤더는 항상 MB 번호 (UB 페이지에서도 동일) — 사용자 정책 I (2026-04-29) */}
          <div className={s.sheetOb}>{mb?.lot_no}</div>
          {ob?.shipped_at && <div className={s.sheetMeta}>Shipped: {fmtDate(ob.shipped_at)}</div>}
        </div>
        <DownloadGroup compact sessionToken={sessionToken} />
      </header>

      {/* focus_ub 있으면 UB 페이지, 없으면 MB 페이지. URL ub 변경 시 즉시 전환 + 슬라이드 애니. */}
      <AnimatePresence mode="wait">
        {focusedUB ? (
          <motion.div
            key={viewKey}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* onBack 제거 (2026-05-07) — UB 헤더의 작은 ◀ 버튼 삭제. 상단 통합 바로 일원화 */}
            <UBBlock
              ub={focusedUB}
              highlight
              mbToken={token}
              initialFP={urlFP ? decodeURIComponent(urlFP) : null}
              prevUB={prevUB}
              nextUB={nextUB}
              onNavigate={goToUB}
            />
          </motion.div>
        ) : (
          <motion.div
            key={viewKey}
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <MBSheet
              mb={mb}
              onSelectUB={(ubLot) => {
                // dev preview 토글 (?cert-preview) 진입 시 query 보존
                const search = window.location.search || ''
                navigate(`/${token}/${encodeURIComponent(ubLot)}${search}`)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <footer className={s.sheetFooter}>
        <p className={s.footerText}>
          This certificate verifies the inspection record of every product in this box.
        </p>
        <p className={s.footer}>cert.faraday-dynamics.com</p>
      </footer>

      {/* 최근 본 UB 5개 플로팅 버튼 (2026-04-29) — 같은 MB 안 UB 만 표시 */}
      <RecentFab currentToken={token} />
    </motion.div>
  )
}
