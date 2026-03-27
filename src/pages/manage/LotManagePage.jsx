// pages/manage/LotManagePage.jsx
// LOT 관리 — 폐기 + 되돌리기(수리) 통합
// 호출: App.jsx → MANAGE
import { useState } from 'react'
import { traceLot, discardLot, printLot } from '@/api'
import { PROCESS_LIST } from '@/constants/processConst'
import QRScanner from '@/components/QRScanner'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './LotManagePage.module.css'

const REASONS = ['불량', '파손', '오염', '기한초과', '기타']
const BASE_URL = import.meta.env.VITE_API_URL || ''

// ════════════════════════════════════════════
// API
// ════════════════════════════════════════════

// 현재 공정보다 앞에 있는 공정 목록 반환 (RM 제외)
function getPrevProcesses(process) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === process)
  if (idx <= 1) return []
  return PROCESS_LIST.slice(1, idx)
}

// 되돌리기 API — discard_qty, repair_qty를 함께 전송
async function repairLot(lotNo, destProcess, discardQty, repairQty, reason) {
  const res = await fetch(`${BASE_URL}/lot/repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      lot_no: lotNo,
      dest_process: destProcess,
      discard_qty: discardQty,
      repair_qty: repairQty,
      reason,
    }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.detail || '되돌리기 실패')
  }
  return res.json()
}

// ════════════════════════════════════════════
// 컴포넌트
// ════════════════════════════════════════════

export default function LotManagePage({ onLogout, onBack }) {
  const [lotInfo, setLotInfo] = useState(null)
  const [action, setAction] = useState(null)

  // 폐기 전용
  const [discardQty, setDiscardQty] = useState('')
  const [isPartial, setIsPartial] = useState(false)

  // 되돌리기 전용
  const [repairDest, setRepairDest] = useState(null)
  const [rDiscardQty, setRDiscardQty] = useState('0')
  const [rRepairQty, setRRepairQty] = useState('')

  const [reason, setReason] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  // 되돌리기 수량 합계 & 잔여 계산
  const rTotal = (parseInt(rDiscardQty) || 0) + (parseInt(rRepairQty) || 0)
  const rRemaining = lotInfo ? lotInfo.quantity - rTotal : 0

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
      setStep('choose')
    } catch (e) {
      throw new Error(e.message)
    }
  }

  const handleConfirm = async () => {
    if (!reason) {
      setError('사유를 선택하세요.')
      return
    }
    setProcessing(true)
    setError(null)

    try {
      if (action === 'discard') {
        const qty = isPartial ? parseInt(discardQty) : null
        if (isPartial && (!qty || qty <= 0)) {
          setError('폐기 수량을 입력하세요.')
          setProcessing(false)
          return
        }
        if (isPartial && qty > lotInfo.quantity) {
          setError('재고보다 많이 폐기할 수 없습니다.')
          setProcessing(false)
          return
        }
        const result = await discardLot(lotInfo.lot_no, qty, reason)
        setDone({ type: 'discard', ...result })
      } else {
        if (!repairDest) {
          setError('되돌아갈 공정을 선택하세요.')
          setProcessing(false)
          return
        }
        const dq = parseInt(rDiscardQty) || 0
        const rq = parseInt(rRepairQty) || 0
        if (dq + rq <= 0) {
          setError('폐기 또는 수리 수량을 입력하세요.')
          setProcessing(false)
          return
        }
        if (dq + rq > lotInfo.quantity) {
          setError(`합계(${dq + rq})가 재고(${lotInfo.quantity})를 초과합니다.`)
          setProcessing(false)
          return
        }

        const result = await repairLot(lotInfo.lot_no, repairDest, dq, rq, reason)

        // 새 LOT QR 출력
        if (result.new_lot_no) {
          try {
            await printLot(result.new_lot_no, 1, { selected_Process: 'REPRINT' })
          } catch (e) {
            console.warn('QR 출력 실패:', e.message)
          }
        }
        setDone({ type: 'repair', ...result })
      }
      setStep('done')
    } catch (e) {
      setError(e.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleReset = () => {
    setLotInfo(null)
    setAction(null)
    setDiscardQty('')
    setIsPartial(false)
    setRepairDest(null)
    setRDiscardQty('0')
    setRRepairQty('')
    setReason(null)
    setProcessing(false)
    setDone(null)
    setError(null)
    setStep('qr')
  }

  // ────────────────────────────────────────────
  // 렌더링
  // ────────────────────────────────────────────

  // ── QR 스캔 ──
  if (step === 'qr') {
    return (
      <QRScanner processLabel="LOT 관리" onScan={handleScan} onLogout={onLogout} onBack={onBack} />
    )
  }

  // ── 완료 ──
  if (step === 'done') {
    const isRepair = done.type === 'repair'
    const destLabel =
      PROCESS_LIST.find((p) => p.key === done.dest_process)?.label || done.dest_process
    return (
      <div className={s.page}>
        <div className={s.card}>
          <FaradayLogo size="md" />
          <div
            className={s.doneIcon}
            style={{
              background: isRepair ? '#e3f2fd' : '#fce4ec',
              color: isRepair ? '#1565c0' : '#c62828',
            }}
          >
            {isRepair ? '🔧' : '✕'}
          </div>
          <p className={s.doneTitle}>{isRepair ? '되돌리기 완료' : '폐기 완료'}</p>
          <div className={s.doneInfo}>
            <span className={s.doneLabel}>{lotInfo.lot_no}</span>
            {isRepair ? (
              <>
                <span className={s.doneDetail}>
                  → {destLabel}({done.dest_process}) 공정으로 되돌림
                </span>
                <span className={s.doneDetail}>
                  폐기: {done.discard_qty}개 / 수리: {done.repair_qty}개
                  {done.remaining > 0 ? ` / 잔여: ${done.remaining}개` : ''}
                </span>
                {done.new_lot_no && (
                  <span className={s.doneReprintLot}>새 LOT: {done.new_lot_no}</span>
                )}
              </>
            ) : (
              <span className={s.doneDetail}>
                폐기: {done.discarded}개 / 잔여: {done.remaining}개
              </span>
            )}
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

  // ── 액션 선택 + 상세 ──
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

        {/* 처리 방법 선택 */}
        <div className={s.section}>
          <p className={s.sectionTitle}>처리 방법</p>
          <div className={s.actionRow}>
            <button
              className={`${s.actionBtn} ${action === 'discard' ? s.discard : ''}`}
              onClick={() => {
                setAction('discard')
                setReason(null)
                setIsPartial(false)
                setDiscardQty(String(lotInfo.quantity))
              }}
            >
              <span className={s.actionIcon}>✕</span>
              <span className={s.actionLabel}>폐기</span>
              <span className={s.actionDesc}>재고에서 제거</span>
            </button>
            {getPrevProcesses(lotInfo.process).length > 0 && (
              <button
                className={`${s.actionBtn} ${action === 'repair' ? s.repair : ''}`}
                onClick={() => {
                  setAction('repair')
                  setRepairDest(null)
                  setRDiscardQty('0')
                  setRRepairQty('')
                  setReason(null)
                }}
              >
                <span className={s.actionIcon}>🔧</span>
                <span className={s.actionLabel}>되돌리기</span>
                <span className={s.actionDesc}>이전 공정으로 되돌림</span>
              </button>
            )}
          </div>
        </div>

        {/* ── 폐기 범위 ── */}
        {action === 'discard' && (
          <div className={s.section}>
            <p className={s.sectionTitle}>폐기 범위</p>
            <div className={s.toggleRow}>
              <button
                className={`${s.toggleBtn} ${!isPartial ? s.active : ''}`}
                onClick={() => {
                  setIsPartial(false)
                  setDiscardQty(String(lotInfo.quantity))
                }}
              >
                전체 ({lotInfo.quantity}개)
              </button>
              <button
                className={`${s.toggleBtn} ${isPartial ? s.active : ''}`}
                onClick={() => {
                  setIsPartial(true)
                  setDiscardQty('')
                }}
              >
                부분 폐기
              </button>
            </div>
            {isPartial && (
              <div className={s.qtyRow}>
                <input
                  className={s.qtyInput}
                  type="number"
                  min={1}
                  max={lotInfo.quantity}
                  placeholder="폐기 수량"
                  value={discardQty}
                  onChange={(e) => setDiscardQty(e.target.value)}
                />
                <span className={s.qtyMax}>/ {lotInfo.quantity}</span>
              </div>
            )}
          </div>
        )}

        {/* ── 되돌리기: 공정 선택 ── */}
        {action === 'repair' && (
          <div className={s.section}>
            <p className={s.sectionTitle}>되돌아갈 공정</p>
            <div className={s.reasonGrid}>
              {getPrevProcesses(lotInfo.process).map((p) => (
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

        {/* ── 되돌리기: 수량 입력 ── */}
        {action === 'repair' && repairDest && (
          <div className={s.section}>
            <p className={s.sectionTitle}>수량 배분 (현재 {lotInfo.quantity}개)</p>
            <div className={s.qtyRow}>
              <span className={s.qtyLabel}>폐기</span>
              <input
                className={s.qtyInput}
                type="number"
                min={0}
                max={lotInfo.quantity}
                value={rDiscardQty}
                onChange={(e) => setRDiscardQty(e.target.value)}
              />
            </div>
            <div className={s.qtyRow}>
              <span className={s.qtyLabel}>수리</span>
              <input
                className={s.qtyInput}
                type="number"
                min={0}
                max={lotInfo.quantity}
                value={rRepairQty}
                onChange={(e) => setRRepairQty(e.target.value)}
              />
            </div>
            <div className={s.repairNote}>
              {rTotal > lotInfo.quantity ? (
                <span style={{ color: '#c0392b' }}>
                  합계({rTotal})가 재고({lotInfo.quantity})를 초과합니다
                </span>
              ) : (
                <>
                  폐기 {parseInt(rDiscardQty) || 0} + 수리 {parseInt(rRepairQty) || 0} = {rTotal}개
                  처리 / 잔여 {rRemaining}개
                </>
              )}
            </div>
          </div>
        )}

        {/* 사유 선택 */}
        {action && (
          <div className={s.section}>
            <p className={s.sectionTitle}>사유</p>
            <div className={s.reasonGrid}>
              {REASONS.map((r) => (
                <button
                  key={r}
                  className={`${s.reasonBtn} ${reason === r ? (action === 'discard' ? s.discard : s.repair) : ''}`}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <div className={s.error}>{error}</div>}

        {action && (
          <button
            className={s.confirmBtn}
            style={{ background: action === 'discard' ? '#c0392b' : '#1565c0' }}
            disabled={!reason || processing}
            onClick={handleConfirm}
          >
            {processing ? '처리 중...' : action === 'discard' ? '폐기 확인' : '되돌리기 확인'}
          </button>
        )}

        <button className={s.textBtn} onClick={handleReset}>
          취소
        </button>
      </div>
    </div>
  )
}
