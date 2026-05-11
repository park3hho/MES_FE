// pages/adm/manage/TracePage.jsx
// LOT 이력 조회 — 객체화 그래프 네비게이션 (2026-04-24 리뉴얼)
// BE entities 맵 기반: 스캔 LOT → 관련 모든 객체 카드 탐색 가능
// 히스토리 스택으로 뒤로 가기, upstream/contains 클릭으로 노드 이동

import { useState, useEffect, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { traceLot } from '@/api'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import TraceEntityView from '@/components/TracePage/TraceEntityView'
import Breadcrumbs from '@/components/TracePage/Breadcrumbs'
import SkeletonLotTimeline from '@/components/SkeletonLotTimeline'
import s from './TracePage.module.css'

export default function TracePage({ onLogout, onBack }) {
  // 외부 진입점 지원 (2026-04-24) — 송장 관리 등에서 OB 번호 클릭 → 자동 스캔
  //   ① location.state.lotNo  (LotManagePage 패턴)
  //   ② URL ?lot=...          (공유 가능 링크)
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const initialLot = location.state?.lotNo || searchParams.get('lot') || null
  const autoScanned = useRef(false)

  // 외부 진입이면 mount 순간부터 result 페이지 + 스켈레톤 로딩 표시 (QR 스캐너 깜빡임 방지)
  const [result, setResult] = useState(null)          // BE 응답 전체
  const [currentLot, setCurrentLot] = useState(null)  // 현재 보고 있는 LOT
  const [history, setHistory] = useState([])          // 네비 히스토리 스택
  const [loading, setLoading] = useState(!!initialLot)
  const [step, setStep] = useState(initialLot ? 'result' : 'qr')
  const [autoError, setAutoError] = useState(null)    // 자동 스캔 실패 메시지 (2026-04-25)

  const handleScan = async (val) => {
    setLoading(true)
    try {
      const data = await traceLot(val)
      setResult(data)
      setCurrentLot(data.lot_no)
      setHistory([data.lot_no])
      setStep('result')
    } catch (e) {
      throw new Error(e.message)
    } finally {
      setLoading(false)
    }
  }

  // 외부에서 lotNo 받고 들어왔으면 mount 시 1회 자동 스캔
  useEffect(() => {
    if (autoScanned.current) return
    if (!initialLot) return
    autoScanned.current = true
    handleScan(initialLot).catch((e) => {
      // 자동 스캔 실패 — QR 로 돌리지 않고 result 화면에 에러 메시지 표시 (2026-04-25)
      // 원인 분석 용이: 어떤 LOT 로 어떤 에러인지 유저가 바로 확인
      console.error('자동 스캔 실패:', e.message)
      setAutoError(`${initialLot} 이력 조회 실패 — ${e.message}`)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 네비게이션 — entities 맵에 있으면 O(1), 없으면 재스캔 (원본/교체품 간 이동)
  const navigateTo = async (lotNo) => {
    if (!lotNo) return
    if (lotNo === currentLot) return

    // entities 안에 있으면 기존 탐색 연속 (히스토리 push)
    if (result?.entities?.[lotNo]) {
      setHistory((prev) => [...prev, lotNo])
      setCurrentLot(lotNo)
      return
    }

    // 없으면 새로 조회 — 원본 ↔ 교체품은 서로 다른 snbt chain 이라 entities 에 없음
    setLoading(true)
    try {
      const data = await traceLot(lotNo)
      setResult(data)
      setCurrentLot(data.lot_no)
      setHistory([data.lot_no])
    } catch (e) {
      console.error('재조회 실패:', e)
    } finally {
      setLoading(false)
    }
  }

  const goBack = () => {
    if (history.length <= 1) return
    const next = history.slice(0, -1)
    setHistory(next)
    setCurrentLot(next[next.length - 1])
  }

  // Breadcrumbs 에서 특정 단계로 점프 — 그 뒤 히스토리는 버림
  const jumpTo = (idx) => {
    if (idx < 0 || idx >= history.length) return
    const next = history.slice(0, idx + 1)
    setHistory(next)
    setCurrentLot(next[next.length - 1])
  }

  const handleReset = () => {
    setResult(null)
    setCurrentLot(null)
    setHistory([])
    setStep('qr')
  }

  if (step === 'qr') {
    return (
      <QRScanner
        processLabel="LOT 이력 조회"
        onScan={handleScan}
        onLogout={onLogout}
        onBack={onBack}
      />
    )
  }

  const currentEntity = currentLot ? result?.entities?.[currentLot] : null

  return (
    <div className="page-flat">
      <PageHeader title="LOT 이력 조회" onBack={onBack} />

      {/* 상단: 스캔 정보 + 히스토리 제어 */}
      <div className={s.searchBar}>
        <div className={s.searchInfo}>
          <span className={s.searchLabel}>조회</span>
          <span className={s.searchValue}>{result?.lot_no}</span>
          {result?.scanned_process && (
            <span className={s.searchProcess}>{result.scanned_process}</span>
          )}
          {history.length > 1 && (
            <span className={s.historyDepth}>
              {history.length}단계 탐색
            </span>
          )}
        </div>
        <div className={s.searchActions}>
          {history.length > 1 && (
            <button type="button" className={s.backBtn} onClick={goBack}>
              ← 뒤로
            </button>
          )}
          <button type="button" className={s.resetBtn} onClick={handleReset}>
            다시 조회
          </button>
        </div>
      </div>

      {/* 히스토리 breadcrumbs — 2단계 이상 탐색 시 표시 */}
      {!loading && history.length > 1 && result?.entities && (
        <Breadcrumbs
          history={history}
          entities={result.entities}
          currentLot={currentLot}
          onJump={jumpTo}
        />
      )}

      {/* 자동 스캔 실패 — 에러 명시 + 다시 조회 유도 (2026-04-25) */}
      {!loading && autoError && !result && (
        <div className={s.empty} style={{ color: 'var(--color-error)', whiteSpace: 'pre-line' }}>
          ⚠ {autoError}
          {'\n\n'}• 해당 LOT 번호가 snbt 체인에 기록되지 않았을 수 있습니다
          {'\n'}• 또는 출하(OB) 처리가 완료되지 않아 snbt_ob 에 반영 안 됨
          {'\n'}"다시 조회" 버튼으로 QR 스캐너에서 직접 재스캔해보세요
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className={s.timeline}>
          <SkeletonLotTimeline />
        </div>
      )}

      {/* 엔티티 카드 */}
      {!loading && currentEntity && (
        <TraceEntityView
          entity={currentEntity}
          entities={result.entities || {}}
          upstreamChain={result.upstream_chain || []}
          downstreamChain={result.downstream_chain || []}
          scannedLot={result.lot_no}
          onNavigate={navigateTo}
        />
      )}

      {/* entities 없음 — 구버전 BE 호환 fallback */}
      {!loading && !currentEntity && result?.timeline?.length > 0 && (
        <div className={s.empty}>
          새 엔티티 그래프가 제공되지 않았습니다. BE 재배포 후 다시 시도해주세요.
        </div>
      )}

      {/* 이력 없음 */}
      {!loading && !result?.timeline?.length && !currentEntity && (
        <div className={s.empty}>이력이 없습니다.</div>
      )}
    </div>
  )
}
