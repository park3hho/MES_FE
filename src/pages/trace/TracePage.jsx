// pages/adm/manage/TracePage.jsx
// LOT 이력 조회 — 객체화 그래프 네비게이션 (2026-04-24 리뉴얼)
// BE entities 맵 기반: 스캔 LOT → 관련 모든 객체 카드 탐색 가능
// 히스토리 스택으로 뒤로 가기, upstream/contains 클릭으로 노드 이동

import { useState, useEffect, useRef } from 'react'
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom'
import { traceLot } from '@/api'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import LifelineView from '@/components/TracePage/LifelineView'
import SkeletonLotTimeline from '@/components/SkeletonLotTimeline'
import s from './TracePage.module.css'

export default function TracePage({ onLogout, onBack }) {
  // 외부 진입점 지원 (2026-04-24) — 송장 관리 등에서 OB 번호 클릭 → 자동 스캔
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const DAY_BATCH_PROCS = ['MP', 'EA', 'HT', 'BO', 'EC', 'WI', 'SO', 'IQ', 'OQ', 'UB', 'MB', 'OB']
  const initialLot = location.state?.lotNo || searchParams.get('lot') || null
  const autoScanned = useRef(false)

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(!!initialLot)
  const [step, setStep] = useState(initialLot ? 'result' : 'qr')
  const [autoError, setAutoError] = useState(null)

  const handleScan = async (val) => {
    setLoading(true)
    try {
      const data = await traceLot(val)
      setResult(data)
      setStep('result')
    } catch (e) {
      throw new Error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (autoScanned.current) return
    if (!initialLot) return
    autoScanned.current = true
    handleScan(initialLot).catch((e) => {
      console.error('자동 스캔 실패:', e.message)
      setAutoError(`${initialLot} 이력 조회 실패 — ${e.message}`)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 교체품/원본 클릭 → 새 trace 조회로 화면 전환
  const navigateTo = async (lotNo) => {
    if (!lotNo) return
    setLoading(true)
    try {
      const data = await traceLot(lotNo)
      setResult(data)
    } catch (e) {
      console.error('재조회 실패:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setResult(null)
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

  return (
    <div className="page-flat">
      <PageHeader title="LOT 이력 조회" onBack={onBack} />

      {/* 상단: 스캔 정보 */}
      <div className={s.searchBar}>
        <div className={s.searchInfo}>
          <span className={s.searchLabel}>조회</span>
          <span className={s.searchValue}>{result?.lot_no}</span>
          {result?.scanned_process && (
            <span className={s.searchProcess}>{result.scanned_process}</span>
          )}
        </div>
        <div className={s.searchActions}>
          {result?.work_date && DAY_BATCH_PROCS.includes(result?.scanned_process) && (
            <button type="button" className={s.dayBatchBtn}
              onClick={() => navigate(
                `/admin/day-batch?process=${result.scanned_process}&date=${result.work_date}`,
              )}>
              같은 날 · {result.scanned_process} 전체 보기
            </button>
          )}
          <button type="button" className={s.resetBtn} onClick={handleReset}>
            다시 조회
          </button>
        </div>
      </div>

      {/* 자동 스캔 실패 */}
      {!loading && autoError && !result && (
        <div className={s.empty} style={{ color: 'var(--color-error)', whiteSpace: 'pre-line' }}>
          ⚠ {autoError}
          {'\n\n'}• 해당 LOT 번호가 snbt 체인에 기록되지 않았을 수 있습니다
          {'\n'}"다시 조회" 버튼으로 QR 스캐너에서 직접 재스캔해보세요
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className={s.timeline}>
          <SkeletonLotTimeline />
        </div>
      )}

      {/* 세로 생애 타임라인 (2026-06-05) */}
      {!loading && result?.entities && (
        <LifelineView
          entities={result.entities}
          scannedLot={result.lot_no}
          scannedProcess={result.scanned_process}
          repairSiblings={result.repair_siblings || []}
          chainRepairSummary={result.chain_repair_summary || []}
          inspections={result.inspections || []}
          onNavigate={navigateTo}
        />
      )}

      {/* 이력 없음 */}
      {!loading && !result?.entities && !autoError && (
        <div className={s.empty}>이력이 없습니다.</div>
      )}
    </div>
  )
}
