// pages/manage/LotManagePage.jsx
// LOT 관리 — 폐기/수리 통합 되돌리기
// 호출: App.jsx → MANAGE
import { useState } from 'react'
import { traceLot, printLot } from '@/api'
import { PROCESS_LIST } from '@/constants/processConst'
import QRScanner from '@/components/QRScanner'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './LotManagePage.module.css'

const REASONS = ['불량', '파손', '오염', '기한초과', '기타']
const BASE_URL = import.meta.env.VITE_API_URL || ''

// ════════════════════════════════════════════
// API / 헬퍼
// ════════════════════════════════════════════

// 현재 공정보다 앞에 있는 공정 목록 (RM, MP 제외)
function getPrevProcesses(process) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === process)
  if (idx <= 2) return []
  return PROCESS_LIST.slice(2, idx) // RM(0), MP(1) 제외
}

// 통합 API — discard_qty, repair_qty 전송
async function repairLot(lotNo, destProcess, discardQty, repairQty, reason) {
  const res = await fetch(`${BASE_URL}/lot/repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      lot_no: lotNo,
      dest_process: destProcess || null,
      discard_qty: discardQty,
      repair_qty: repairQty,
      reason,
    }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.detail || '처리 실패')
  }
  return res.json()
}

// ════════════════════════════════════════════
// 컴포넌트
// ════════════════════════════════════════════

export default function LotManagePage({ onLogout, onBack }) {
  const [lotInfo, setLotInfo] = useState(null)
  const [discardQty, setDiscardQty] = useState('')
  const [repairQty, setRepairQty] = useState('0')
  const [repairDest, setRepairDest] = useState(null)
  const [reason, setReason] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const dq = parseInt(discardQty) || 0
  const rq = parseInt(repairQty) || 0
  const total = dq + rq
  const remaining = lotInfo ? lotInfo.quantity - total : 0

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
      setDiscardQty(String(current.quantity))
      setRepairQty('0')
      setStep('form')
    } catch (e) {
      throw new Error(e.message)
    }
  }

  const handleConfirm = async () => {
    if (!reason) {
      setError('사유를 선택하세요.')
      return
    }
    if (total <= 0) {
      setError('폐기 또는 수리 수량을 입력하세요.')
      return
    }
    if (total > lotInfo.quantity) {
      setError(`합계(${total})가 재고(${lotInfo.quantity})를 초과합니다.`)
      return
    }
    if (rq > 0 && !repairDest) {
      setError('수리 수량이 있으면 되돌아갈 공정을 선택하세요.')
      return
    }

    setProcessing(true)
    setError(null)

    try {
      const result = await repairLot(lotInfo.lot_no, repairDest, dq, rq, reason)

      if (result.new_lot_no) {
        try {
          await printLot(result.new_lot_no, 1, { selected_Process: 'REPRINT' })
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
    setDiscardQty('')
    setRepairQty('0')
    setRepairDest(null)
    setReason(null)
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
    const hasRepair = done.repair_qty > 0
    const destLabel =
      PROCESS_LIST.find((p) => p.key === done.dest_process)?.label || done.dest_process
    return (
      <div className={s.page}>
        <div className={s.card}>
          <FaradayLogo size="md" />
          <div
            className={s.doneIcon}
            style={{
              background: hasRepair ? '#e3f2fd' : '#fce4ec',
              color: hasRepair ? '#1565c0' : '#c62828',
            }}
          >
            {hasRepair ? '🔧' : '✕'}
          </div>
          <p className={s.doneTitle}>{hasRepair ? '되돌리기 완료' : '폐기 완료'}</p>
          <div className={s.doneInfo}>
            <span className={s.doneLabel}>{lotInfo.lot_no}</span>
            <span className={s.doneDetail}>
              폐기: {done.discard_qty}개{done.repair_qty > 0 ? ` / 수리: ${done.repair_qty}개` : ''}
              {done.remaining > 0 ? ` / 잔여: ${done.remaining}개` : ''}
            </span>
            {hasRepair && (
              <span className={s.doneDetail}>
                → {destLabel}({done.dest_process}) 공정으로 되돌림
              </span>
            )}
            {done.new_lot_no && <span className={s.doneReprintLot}>새 LOT: {done.new_lot_no}</span>}
          </div>
          <button className={s.primaryBtn} onClick={handleReset}>
            다른 LOT 처리
          </button>
          <button className={s.textBtn} onClick={onBack ?? onLogout}>
            {onBack ? '이전으로' : '로그아웃'}
          </button>
        </div>
      </div>
    )
  }

  // ── 메인 폼 ──
  const prevProcesses = getPrevProcesses(lotInfo.process)

  return (
    <div className={s.page}>
      <div className={s.card}>
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

        {/* 수량 입력 */}
        <div className={s.section}>
          <p className={s.sectionTitle}>수량 배분 (현재 {lotInfo.quantity}개)</p>
          <div className={s.qtyRow}>
            <span className={s.qtyLabel}>폐기</span>
            <input
              className={s.qtyInput}
              type="number"
              min={0}
              max={lotInfo.quantity}
              value={discardQty}
              onChange={(e) => setDiscardQty(e.target.value)}
            />
          </div>
          {prevProcesses.length > 0 && (
            <div className={s.qtyRow}>
              <span className={s.qtyLabel}>수리</span>
              <input
                className={s.qtyInput}
                type="number"
                min={0}
                max={lotInfo.quantity}
                value={repairQty}
                onChange={(e) => setRepairQty(e.target.value)}
              />
            </div>
          )}
          <div className={s.repairNote}>
            {total > lotInfo.quantity ? (
              <span style={{ color: '#c0392b' }}>
                합계({total})가 재고({lotInfo.quantity})를 초과합니다
              </span>
            ) : (
              <>
                폐기 {dq} + 수리 {rq} = {total}개 처리
                {remaining > 0 ? ` / 잔여 ${remaining}개` : ''}
              </>
            )}
          </div>
        </div>

        {/* 되돌아갈 공정 — 수리 수량 > 0 일때만 표시 */}
        {rq > 0 && prevProcesses.length > 0 && (
          <div className={s.section}>
            <p className={s.sectionTitle}>되돌아갈 공정</p>
            <div className={s.reasonGrid}>
              {prevProcesses.map((p) => (
                <button
                  key={p.key}
                  className={`${s.reasonBtn} ${repairDest === p.key ? s.repair : ''}`}
                  onClick={() => setRepairDest(p.key)}
                >
                  {p.label}({p.key})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 사유 */}
        <div className={s.section}>
          <p className={s.sectionTitle}>사유</p>
          <div className={s.reasonGrid}>
            {REASONS.map((r) => (
              <button
                key={r}
                className={`${s.reasonBtn} ${reason === r ? s.repair : ''}`}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {error && <div className={s.error}>{error}</div>}

        <button
          className={s.confirmBtn}
          style={{ background: rq > 0 ? '#1565c0' : '#c0392b' }}
          disabled={!reason || processing || total <= 0 || total > lotInfo.quantity}
          onClick={handleConfirm}
        >
          {processing ? '처리 중...' : rq > 0 ? '되돌리기 확인' : '폐기 확인'}
        </button>

        <button className={s.textBtn} onClick={handleReset}>
          취소
        </button>
      </div>
    </div>
  )
}
