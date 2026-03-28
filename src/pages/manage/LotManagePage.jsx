// pages/manage/LotManagePage.jsx
// LOT 관리 — 폐기/수리 통합 되돌리기 (BO 경계 1:1 / 1:N 분기)
// 호출: App.jsx → MANAGE
import { useState } from 'react'
import { traceLot, printLot } from '@/api'
import { PROCESS_LIST, REPAIR_PROCESSES } from '@/constants/processConst'
import QRScanner from '@/components/QRScanner'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './LotManagePage.module.css'

const REASONS = ['불량', '파손', '오염', '기한초과', '기타']
const BASE_URL = import.meta.env.VITE_API_URL || ''

// BO 인덱스 — 이 기준으로 1:1 / 1:N 분기
const BO_IDX = PROCESS_LIST.findIndex((p) => p.key === 'BO')

// ════════════════════════════════════════════
// 헬퍼
// ════════════════════════════════════════════

// 재공정 가능한 dest 목록 — EC/WI/SO 중 현재 공정 이하
// (현재 공정 자신도 포함: 동일 공정 재도 허용)
function getPrevProcesses(process) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === process)
  if (idx <= 0) return []
  return PROCESS_LIST.slice(0, idx + 1).filter((p) => REPAIR_PROCESSES.includes(p.key))
}

// BO 경계를 넘는지 판단 — 현재가 BO 이후이고 dest가 BO 이전
function isCrossBo(currentProcess, destProcess) {
  const curIdx = PROCESS_LIST.findIndex((p) => p.key === currentProcess)
  const destIdx = PROCESS_LIST.findIndex((p) => p.key === destProcess)
  return curIdx >= BO_IDX && destIdx < BO_IDX
}

// 문제 공정의 실제 도착 공정 — 문제 공정의 바로 이전 공정
// 예: SO 문제 → WI, WI 문제 → EC, EC 문제 → BO
function getActualDest(problemProcess) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === problemProcess)
  return idx > 0 ? PROCESS_LIST[idx - 1].key : null
}

// ════════════════════════════════════════════
// API
// ════════════════════════════════════════════

async function repairLot(lotNo, destProcess, sourceQty, discardQty, repairQty, reason) {
  const res = await fetch(`${BASE_URL}/lot/repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      lot_no: lotNo,
      dest_process: destProcess || null,
      source_qty: sourceQty,
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
  const [repairDest, setRepairDest] = useState(null)
  const [sourceQty, setSourceQty] = useState('') // 모드 B: 현재 공정 처리 수량
  const [discardQty, setDiscardQty] = useState('')
  const [repairQty, setRepairQty] = useState('0')
  const [reason, setReason] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const dq = parseInt(discardQty) || 0
  const rq = parseInt(repairQty) || 0
  const sq = parseInt(sourceQty) || 0
  const actualDest = repairDest ? getActualDest(repairDest) : null
  const crossBo = lotInfo && actualDest ? isCrossBo(lotInfo.process, actualDest) : false

  // 모드 A: 잔여 = 현재수량 - (폐기+수리)
  // 모드 B: 잔여 = 현재수량 - source_qty
  const remaining = lotInfo ? (crossBo ? lotInfo.quantity - sq : lotInfo.quantity - (dq + rq)) : 0

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
      setSourceQty('')
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

    if (crossBo) {
      // 모드 B 검증
      if (sq <= 0) {
        setError('현재 공정 처리 수량을 입력하세요.')
        return
      }
      if (sq > lotInfo.quantity) {
        setError('처리 수량이 재고를 초과합니다.')
        return
      }
      if (dq + rq <= 0) {
        setError('폐기 또는 수리 수량을 입력하세요.')
        return
      }
    } else {
      // 모드 A 검증
      if (dq + rq <= 0) {
        setError('폐기 또는 수리 수량을 입력하세요.')
        return
      }
      if (dq + rq > lotInfo.quantity) {
        setError(`합계(${dq + rq})가 재고(${lotInfo.quantity})를 초과합니다.`)
        return
      }
    }

    if (rq > 0 && !actualDest) {
      setError('수리 수량이 있으면 문제 공정을 선택하세요.')
      return
    }

    setProcessing(true)
    setError(null)

    try {
      const result = await repairLot(
        lotInfo.lot_no,
        actualDest,
        crossBo ? sq : null,
        dq,
        rq,
        reason,
      )

      if (result.new_lot_no) {
        try {
          await printLot(result.new_lot_no, 1, { selected_process: 'REPRINT' })
        } catch (e) {
          console.warn('QR 출력 실패:', e.message)
        }
      }
      // 재공정 시 이전 공정 lot 라벨도 출력 (현장 재투입용)
      // EC재공정→BO lot, WI재공정→EC lot, SO재공정→WI lot
      if (result.prev_process_lot) {
        try {
          await printLot(result.prev_process_lot, 1, { selected_process: 'REPRINT' })
        } catch (e) {
          console.warn('이전 공정 QR 출력 실패:', e.message)
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
    setRepairDest(null)
    setSourceQty('')
    setDiscardQty('')
    setRepairQty('0')
    setReason(null)
    setProcessing(false)
    setDone(null)
    setError(null)
    setStep('qr')
  }

  // 문제 공정 선택 시 모드에 따라 수량 초기화
  const handleDestSelect = (key) => {
    setRepairDest(key)
    const actual = getActualDest(key)
    const cross = actual ? isCrossBo(lotInfo.process, actual) : false
    if (cross) {
      setSourceQty('')
      setDiscardQty('')
      setRepairQty('')
    } else {
      setSourceQty('')
      setDiscardQty(String(lotInfo.quantity))
      setRepairQty('0')
    }
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
      <div className="page">
        <div className="card">
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
            {done.is_cross_bo && (
              <span className={s.doneDetail}>
                처리: {done.source_qty}개 ({lotInfo.process})
              </span>
            )}
            <span className={s.doneDetail}>
              폐기: {done.discard_qty}
              {done.is_cross_bo ? '장' : '개'}
              {done.repair_qty > 0
                ? ` / 수리: ${done.repair_qty}${done.is_cross_bo ? '장' : '개'}`
                : ''}
              {done.remaining > 0 ? ` / 잔여: ${done.remaining}개` : ''}
            </span>
            {hasRepair && (
              <span className={s.doneDetail}>
                → {destLabel}({done.dest_process}) 공정으로 되돌림
              </span>
            )}
            {done.new_lot_no && <span className={s.doneReprintLot}>새 LOT: {done.new_lot_no}</span>}
            {done.prev_process_lot && (
              <span className={s.doneReprintLot}>재투입 LOT: {done.prev_process_lot}</span>
            )}
          </div>
          <button className="btn-primary btn-full" onClick={handleReset}>
            다른 LOT 처리
          </button>
          <button className={`btn-text ${s.textBtn}`} onClick={onBack ?? onLogout}>
            {onBack ? '이전으로' : '로그아웃'}
          </button>
        </div>
      </div>
    )
  }

  // ── 메인 폼 ──
  const prevProcesses = getPrevProcesses(lotInfo.process)
  const showDestUnit = crossBo ? '장' : '개'

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

        {/* 재공정 공정 선택 */}
        {prevProcesses.length > 0 && (
          <div className={s.section}>
            <p className={s.sectionTitle}>어느 공정이 잘못되어있나요? (선택 안 하면 순수 폐기)</p>
            <div className={s.reasonGrid}>
              {prevProcesses.map((p) => (
                <button
                  key={p.key}
                  className={`${s.reasonBtn} ${repairDest === p.key ? s.repair : ''}`}
                  onClick={() => handleDestSelect(p.key)}
                >
                  {p.label}({p.key})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 모드 B: BO 경계 넘는 경우 — 현재 공정 처리 수량 */}
        {crossBo && (
          <div className={s.section}>
            <p className={s.sectionTitle}>현재 공정({lotInfo.process}) 처리 수량</p>
            <div className={s.qtyRow}>
              <input
                className={s.qtyInput}
                type="number"
                min={1}
                max={lotInfo.quantity}
                placeholder="처리할 개수"
                value={sourceQty}
                onChange={(e) => setSourceQty(e.target.value)}
              />
              <span className={s.qtyMax}>/ {lotInfo.quantity}개</span>
            </div>
          </div>
        )}

        {/* 수량 입력 */}
        <div className={s.section}>
          <p className={s.sectionTitle}>
            {crossBo
              ? `되돌아갈 공정(${repairDest}) 수량 배분`
              : `수량 배분 (현재 ${lotInfo.quantity}개)`}
          </p>
          <div className={s.qtyRow}>
            <span className={s.qtyLabel}>폐기</span>
            <input
              className={s.qtyInput}
              type="number"
              min={0}
              value={discardQty}
              onChange={(e) => setDiscardQty(e.target.value)}
            />
            <span className={s.qtyUnit}>{showDestUnit}</span>
          </div>
          {(repairDest || prevProcesses.length === 0) && (
            <div className={s.qtyRow}>
              <span className={s.qtyLabel}>수리</span>
              <input
                className={s.qtyInput}
                type="number"
                min={0}
                value={repairQty}
                onChange={(e) => setRepairQty(e.target.value)}
              />
              <span className={s.qtyUnit}>{showDestUnit}</span>
            </div>
          )}
          <div className={s.repairNote}>
            {crossBo ? (
              <>
                {lotInfo.process} {sq}개 처리 → {repairDest} 폐기 {dq}장 / 수리 {rq}장
                {remaining > 0 ? ` / 잔여 ${remaining}개` : ''}
              </>
            ) : (
              <>
                {remaining < 0 ? (
                  <span style={{ color: '#c0392b' }}>
                    합계({dq + rq})가 재고({lotInfo.quantity})를 초과합니다
                  </span>
                ) : (
                  <>
                    폐기 {dq} + 수리 {rq} = {dq + rq}개 처리
                    {remaining > 0 ? ` / 잔여 ${remaining}개` : ''}
                  </>
                )}
              </>
            )}
          </div>
        </div>

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
          disabled={!reason || processing || dq + rq <= 0}
          onClick={handleConfirm}
        >
          {processing ? '처리 중...' : rq > 0 ? '되돌리기 확인' : '폐기 확인'}
        </button>

        <button className={`btn-text ${s.textBtn}`} onClick={handleReset}>
          취소
        </button>
      </div>
    </div>
  )
}
