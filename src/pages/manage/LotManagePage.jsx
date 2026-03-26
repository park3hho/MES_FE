// 수정 코드 ↓
import { useState } from 'react'
import { traceLot, discardLot, printLot } from '@/api'
import { PROCESS_LIST } from '@/constants/processConst'
import QRScanner from '@/components/QRScanner'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './LotManagePage.module.css'

const REASONS = ['불량', '파손', '오염', '기한초과', '기타']

const BASE_URL = import.meta.env.VITE_API_URL || ''

// 현재 공정보다 앞에 있는 공정 목록 반환 (RM 제외)
function getPrevProcesses(process) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === process)
  if (idx <= 0) return []
  return PROCESS_LIST.slice(1, idx) // RM(0번) 제외, 현재 공정 미포함
}

// lot_no, dest_process, reason → POST /lot/repair
async function repairLot(lotNo, destProcess, reason) {
  const res = await fetch(`${BASE_URL}/lot/repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ lot_no: lotNo, dest_process: destProcess, reason }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.detail || '수리 처리 실패')
  }
  return res.json()
}

export default function LotManagePage({ onLogout, onBack }) {
  const [lotInfo, setLotInfo] = useState(null)
  const [action, setAction] = useState(null)
  const [repairDest, setRepairDest] = useState(null) // 되돌아갈 공정 key
  const [reason, setReason] = useState(null)
  const [discardQty, setDiscardQty] = useState('')
  const [isPartial, setIsPartial] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

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
      if (current.quantity <= 0) throw new Error('재고 수량이 0입니다. 처리할 수 없습니다.')

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
        const result = await repairLot(lotInfo.lot_no, repairDest, reason)
        if (result.reprint_lot_no) {
          try {
            await printLot(result.reprint_lot_no, 1, { selected_Process: 'REPRINT' })
          } catch (e) {
            console.warn('QR 재출력 실패:', e.message)
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
    setRepairDest(null)
    setReason(null)
    setDiscardQty('')
    setIsPartial(false)
    setProcessing(false)
    setDone(null)
    setError(null)
    setStep('qr')
  }

  // ── QR 스캔 ──
  if (step === 'qr') {
    return (
      <QRScanner processLabel="LOT 관리" onScan={handleScan} onLogout={onLogout} onBack={onBack} />
    )
  }

  // ── 완료 ──
  if (step === 'done') {
    const isRepair = done.type === 'repair'
    return (
      <div className={s.page}>
        <div className={s.card}>
          <FaradayLogo size="md" />
          {/* background/color — isRepair 조건 동적값 */}
          <div
            className={s.doneIcon}
            style={{
              background: isRepair ? '#e3f2fd' : '#fce4ec',
              color: isRepair ? '#1565c0' : '#c62828',
            }}
          >
            {isRepair ? '🔧' : '✕'}
          </div>
          <p className={s.doneTitle}>{isRepair ? '수리 접수 완료' : '폐기 완료'}</p>
          <div className={s.doneInfo}>
            <span className={s.doneLabel}>{lotInfo.lot_no}</span>
            {isRepair ? (
              <>
                <span className={s.doneDetail}>
                  사유: {reason} →{' '}
                  {PROCESS_LIST.find((p) => p.key === done.dest_process)?.label ||
                    done.dest_process}
                  ({done.dest_process}) 공정으로 재작업
                </span>
                {done.reprint_lot_no && (
                  <span className={s.doneReprintLot}>QR 출력됨: {done.reprint_lot_no}</span>
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

        {/* 처리 방법 선택 — 클래스 조합으로 선택 상태 표현 */}
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
            {lotInfo.process !== 'RM' && getPrevProcesses(lotInfo.process).length > 0 && (
              <button
                className={`${s.actionBtn} ${action === 'repair' ? s.repair : ''}`}
                onClick={() => {
                  setAction('repair')
                  setRepairDest(null)
                  setReason(null)
                  setIsPartial(false)
                }}
              >
                <span className={s.actionIcon}>🔧</span>
                <span className={s.actionLabel}>수리</span>
                <span className={s.actionDesc}>이전 공정으로 재투입</span>
              </button>
            )}
          </div>
        </div>

        {/* 폐기 범위 선택 */}
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

        {/* 수리 안내 */}
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

        {/* 확인 버튼 — background는 action별 동적값 */}
        {action && (
          <button
            className={s.confirmBtn}
            style={{ background: action === 'discard' ? '#c0392b' : '#1565c0' }}
            disabled={!reason || processing}
            onClick={handleConfirm}
          >
            {processing ? '처리 중...' : action === 'discard' ? '폐기 확인' : '수리 접수'}
          </button>
        )}

        <button className={s.textBtn} onClick={handleReset}>
          취소
        </button>
      </div>
    </div>
  )
}
