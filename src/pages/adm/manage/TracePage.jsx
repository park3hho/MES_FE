// pages/adm/manage/TracePage.jsx
// LOT 이력 조회 — 객체화 그래프 네비게이션 (2026-04-24 리뉴얼)
// BE entities 맵 기반: 스캔 LOT → 관련 모든 객체 카드 탐색 가능
// 히스토리 스택으로 뒤로 가기, upstream/contains 클릭으로 노드 이동

import { useState } from 'react'
import { traceLot } from '@/api'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import TraceEntityView from '@/components/TracePage/TraceEntityView'
import SkeletonLotTimeline from '@/components/SkeletonLotTimeline'
import s from './TracePage.module.css'

export default function TracePage({ onLogout, onBack }) {
  const [result, setResult] = useState(null)          // BE 응답 전체
  const [currentLot, setCurrentLot] = useState(null)  // 현재 보고 있는 LOT
  const [history, setHistory] = useState([])          // 네비 히스토리 스택
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('qr')

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

  // 네비게이션 — entities 맵 조회 O(1)
  const navigateTo = (lotNo) => {
    if (!lotNo || !result?.entities?.[lotNo]) return
    if (lotNo === currentLot) return
    setHistory((prev) => [...prev, lotNo])
    setCurrentLot(lotNo)
  }

  const goBack = () => {
    if (history.length <= 1) return
    const next = history.slice(0, -1)
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
