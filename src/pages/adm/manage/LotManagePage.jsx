// pages/manage/LotManagePage.jsx
// LOT 관리 — 되돌리기 (문제 공정 선택 → 이전 공정으로 재고 이동 + suffix 부여)
// 호출: App.jsx → MANAGE
import { useState } from 'react'
import { traceLot, printLot, repairLot } from '@/api'
import { PROCESS_LIST, REPAIR_PROCESSES } from '@/constants/processConst'
import QRScanner from '@/components/QRScanner'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './LotManagePage.module.css'

// ════════════════════════════════════════════
// 헬퍼
// ════════════════════════════════════════════

// 재공정 가능한 문제 공정 목록 — EC/WI/SO 중 현재 공정 이하
function getProblemProcesses(process) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === process)
  if (idx <= 0) return []
  return PROCESS_LIST.slice(0, idx + 1).filter((p) => REPAIR_PROCESSES.includes(p.key))
}

// 문제 공정 → 실제 도착 공정 (문제 공정의 바로 이전 공정)
// SO 문제 → WI, WI 문제 → EC, EC 문제 → BO
function getActualDest(problemProcess) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === problemProcess)
  return idx > 0 ? PROCESS_LIST[idx - 1].key : null
}

// ════════════════════════════════════════════
// 컴포넌트
// ════════════════════════════════════════════

export default function LotManagePage({ onLogout, onBack }) {
  const [lotInfo, setLotInfo] = useState(null)
  const [problemProcess, setProblemProcess] = useState(null)
  const [reason, setReason] = useState('')
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const actualDest = problemProcess ? getActualDest(problemProcess) : null
  const actualDestLabel = actualDest
    ? PROCESS_LIST.find((p) => p.key === actualDest)?.label
    : null

  // ────────────────────────────────────────────
  // 이벤트 핸들러
  // ────────────────────────────────────────────

  const handleScan = async (val) => {
    setError(null)
    try {
      const data = await traceLot(val)
      const current = data.timeline?.[0]
      if (!current) throw new Error('LOT 정보를 찾을 수 없습니다.')

      const STATUS_MSG = {
        consumed: '이미 다음 공정으로 진행된 LOT입니다.',
        discarded: '이미 폐기 처리된 LOT입니다.',
        repair: '이미 수리 접수된 LOT입니다.',
        shipped: '이미 출하 완료된 LOT입니다.',
      }
      if (current.status !== 'in_stock')
        throw new Error(
          STATUS_MSG[current.status] || `처리할 수 없는 상태입니다 (${current.status})`,
        )
      if (current.quantity <= 0) throw new Error('재고 수량이 0입니다.')

      setLotInfo(current)
      setStep('form')
    } catch (e) {
      throw new Error(e.message)
    }
  }

  const handleConfirm = async () => {
    if (!problemProcess || !actualDest) {
      setError('문제 공정을 선택하세요.')
      return
    }

    setProcessing(true)
    setError(null)

    try {
      const result = await repairLot(lotInfo.lot_no, actualDest, reason)

      // 새 LOT QR 출력 (이전 공정 lot + suffix)
      if (result.new_lot_no) {
        try {
          await printLot(result.new_lot_no, 1, { selected_process: 'REPRINT' })
        } catch (e) {
          console.warn('QR 출력 실패:', e.message)
        }
      }
      setDone(result)
      setStep('done')
    } catch (e) {
      setError(e.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleReset = () => {
    setLotInfo(null)
    setProblemProcess(null)
    setReason('')
    setProcessing(false)
    setDone(null)
    setError(null)
    setStep('qr')
  }

  // ────────────────────────────────────────────
  // 렌더링
  // ────────────────────────────────────────────

  if (step === 'qr') {
    return (
      <QRScanner processLabel="LOT 관리" onScan={handleScan} onLogout={onLogout} onBack={onBack} />
    )
  }

  if (step === 'done') {
    const destLabel =
      PROCESS_LIST.find((p) => p.key === done.dest_process)?.label || done.dest_process
    return (
      <div className="page">
        <div className="card">
          <FaradayLogo size="md" />
          <div className={s.doneIcon} style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
            🔧
          </div>
          <p className={s.doneTitle}>되돌리기 완료</p>
          <div className={s.doneInfo}>
            <span className={s.doneLabel}>{lotInfo.lot_no}</span>
            <span className={s.doneDetail}>
              {lotInfo.quantity}개 → {destLabel}({done.dest_process}) 공정으로 되돌림
            </span>
            {done.new_lot_no && (
              <span className={s.doneReprintLot}>새 LOT: {done.new_lot_no}</span>
            )}
          </div>
          <button className="btn-primary btn-full" onClick={handleReset}>
            다른 LOT 처리
          </button>
          {onBack && <button className={`btn-text ${s.textBtn}`} onClick={onBack}>← 이전</button>}
        </div>
      </div>
    )
  }

  // ── 메인 폼 ──
  const problemProcesses = getProblemProcesses(lotInfo.process)

  return (
    <div className="page">
      <div className="card">
        <div className={s.header}>
          <FaradayLogo size="md" />
          <p className={s.title}>LOT 관리</p>
        </div>

        <div className={s.lotCard}>
          <div className={s.lotRow}>
            <span className={s.lotProcess}>{lotInfo.process}</span>
            <span className={s.lotLabel}>{lotInfo.label}</span>
          </div>
          <div className={s.lotNo}>{lotInfo.lot_no}</div>
          <div className={s.lotQty}>현재 재고: {lotInfo.quantity}개</div>
        </div>

        {/* 문제 공정 선택 */}
        {problemProcesses.length > 0 && (
          <div className={s.section}>
            <p className={s.sectionTitle}>어느 공정이 잘못되어있나요?</p>
            <div className={s.reasonGrid}>
              {problemProcesses.map((p) => (
                <button
                  key={p.key}
                  className={`${s.reasonBtn} ${problemProcess === p.key ? s.repair : ''}`}
                  onClick={() => setProblemProcess(p.key)}
                >
                  {p.label}({p.key})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 수리 사유 */}
        {problemProcess && (
          <div className={s.section}>
            <p className={s.sectionTitle}>수리 사유</p>
            <textarea
              className="form-input"
              rows={2}
              placeholder="수리 사유를 입력하세요"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ resize: 'vertical', fontSize: 14 }}
            />
          </div>
        )}

        {error && <div className={s.error}>{error}</div>}

        <button
          className={s.confirmBtn}
          style={{ background: 'var(--color-info)' }}
          disabled={!problemProcess || processing}
          onClick={handleConfirm}
        >
          {processing ? '처리 중...' : '되돌리기 확인'}
        </button>

        <button className={`btn-text ${s.textBtn}`} onClick={handleReset}>
          취소
        </button>
      </div>
    </div>
  )
}
