// pages/manage/LotManagePage.jsx
// LOT 관리 — 되돌리기(공정 재진행) + 폐기 통합 (2026-04-22 확장)
// 호출: App.jsx → /admin/manage
//   - location.state.mode: 'repair' | 'discard' (기본: repair)
//   - location.state.lotNo: 초기 LOT 자동 스캔 (OQPage FAIL 진입 시)
import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { traceLot, printLot, repairLot, discardLot } from '@/api'
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
function getActualDest(problemProcess) {
  const idx = PROCESS_LIST.findIndex((p) => p.key === problemProcess)
  return idx > 0 ? PROCESS_LIST[idx - 1].key : null
}

// ════════════════════════════════════════════
// 컴포넌트
// ════════════════════════════════════════════

export default function LotManagePage({ onLogout, onBack }) {
  const location = useLocation()
  const initialMode = location.state?.mode === 'discard' ? 'discard' : 'repair'
  const initialLot = location.state?.lotNo || null

  const [mode, setMode] = useState(initialMode)  // 'repair' | 'discard'
  const [lotInfo, setLotInfo] = useState(null)
  const [problemProcess, setProblemProcess] = useState(null)
  const [reason, setReason] = useState('')
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const actualDest = problemProcess ? getActualDest(problemProcess) : null

  // ────────────────────────────────────────────
  // 이벤트 핸들러
  // ────────────────────────────────────────────

  const handleScan = async (val) => {
    setError(null)
    try {
      const data = await traceLot(val)
      // ★ 스캔한 LOT의 실제 공정 노드를 찾음 (2026-04-22 수정)
      //   trace_lot은 snbt 역순(OB→FP→SO) 탐색이라, SM이 과거 FP/UB/MB/OB 체인에 있으면
      //   timeline[0]이 SO가 아닌 상위 공정 노드가 됨 → consumed/shipped로 오판
      //   scanned_process 필드로 실제 스캔 LOT의 공정 노드를 찾아 상태 체크해야 정확함
      const scannedProc = data.scanned_process
      const current =
        (scannedProc && data.timeline?.find((n) => n.process === scannedProc))
        || data.timeline?.[0]
      if (!current) throw new Error('LOT 정보를 찾을 수 없습니다.')

      const STATUS_MSG = {
        consumed: '이미 다음 공정으로 진행된 LOT입니다.',
        discarded: '이미 폐기 처리된 LOT입니다.',
        repair: '이미 수리 접수된 LOT입니다.',
        shipped: '이미 출하 완료된 LOT입니다.',
      }
      // in_inspection(OQ 검사 중)도 허용 — FAIL 판정 시 재공정/폐기 선택지 제공 (2026-04-22)
      const ALLOWED_STATUSES = ['in_stock', 'in_inspection']
      if (!ALLOWED_STATUSES.includes(current.status))
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

  // 초기 진입 시 LOT 자동 스캔 (OQPage FAIL 결과 화면에서 이동)
  useEffect(() => {
    if (!initialLot) return
    handleScan(initialLot).catch((e) => setError(e.message || '스캔 실패'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConfirm = async () => {
    setError(null)
    if (mode === 'repair') {
      if (!problemProcess || !actualDest) {
        setError('문제 공정을 선택하세요.')
        return
      }
      setProcessing(true)
      try {
        const result = await repairLot(lotInfo.lot_no, actualDest, reason)
        if (result.new_lot_no) {
          try {
            await printLot(result.new_lot_no, 1, { selected_process: 'REPRINT' })
          } catch (e) {
            console.warn('QR 출력 실패:', e.message)
          }
        }
        setDone({ kind: 'repair', ...result })
        setStep('done')
      } catch (e) {
        setError(e.message)
      } finally {
        setProcessing(false)
      }
    } else {
      // discard 모드
      if (!reason.trim()) {
        setError('폐기 사유를 입력하세요.')
        return
      }
      setProcessing(true)
      try {
        const result = await discardLot(lotInfo.lot_no, { reason })
        setDone({ kind: 'discard', ...result })
        setStep('done')
      } catch (e) {
        setError(e.message)
      } finally {
        setProcessing(false)
      }
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
    // mode는 유지 — 사용자가 연속 처리하고 싶을 수 있음
  }

  // ────────────────────────────────────────────
  // 렌더링
  // ────────────────────────────────────────────

  // 자동 스캔 실패 시 에러 카드 표시 (2026-04-22) — QR 화면에 에러가 안 보여서 사용자가 원인 모르는 문제 해결
  // step='qr' + error 있음 = 자동 스캔 실패 (OQPage FAIL 버튼으로 진입했으나 traceLot/상태 체크에서 throw)
  if (step === 'qr' && error && initialLot) {
    return (
      <div className="page">
        <div className="card">
          <FaradayLogo size="md" />
          <div
            className={s.doneIcon}
            style={{ background: '#fef6f4', color: 'var(--color-error)' }}
          >
            ⚠
          </div>
          <p className={s.doneTitle}>{mode === 'discard' ? '폐기' : '되돌리기'} 불가</p>
          <div className={s.doneInfo}>
            <span className={s.doneLabel}>{initialLot}</span>
            <span className={s.doneDetail}>{error}</span>
          </div>
          <button
            className="btn-primary btn-full"
            onClick={() => { setError(null); setStep('qr') }}
          >
            직접 스캔하기
          </button>
          {onBack && (
            <button className={`btn-text ${s.textBtn}`} onClick={onBack}>
              ← 이전
            </button>
          )}
        </div>
      </div>
    )
  }

  if (step === 'qr') {
    return (
      <QRScanner
        processLabel={mode === 'discard' ? 'LOT 폐기' : 'LOT 되돌리기'}
        onScan={handleScan}
        onLogout={onLogout}
        onBack={onBack}
      />
    )
  }

  if (step === 'done') {
    // 폐기 완료 화면
    if (done.kind === 'discard') {
      return (
        <div className="page">
          <div className="card">
            <FaradayLogo size="md" />
            <div
              className={s.doneIcon}
              style={{ background: '#fef6f4', color: 'var(--color-error)' }}
            >
              🗑
            </div>
            <p className={s.doneTitle}>폐기 완료</p>
            <div className={s.doneInfo}>
              <span className={s.doneLabel}>{lotInfo.lot_no}</span>
              <span className={s.doneDetail}>{done.discarded}개 폐기 처리됨</span>
            </div>
            <button className="btn-primary btn-full" onClick={handleReset}>
              다른 LOT 처리
            </button>
            {onBack && (
              <button className={`btn-text ${s.textBtn}`} onClick={onBack}>
                ← 이전
              </button>
            )}
          </div>
        </div>
      )
    }
    // 되돌리기 완료 화면 (repair)
    const destLabel =
      PROCESS_LIST.find((p) => p.key === done.dest_process)?.label || done.dest_process
    return (
      <div className="page">
        <div className="card">
          <FaradayLogo size="md" />
          <div
            className={s.doneIcon}
            style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}
          >
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
          {onBack && (
            <button className={`btn-text ${s.textBtn}`} onClick={onBack}>
              ← 이전
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── form ──
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

        {/* 모드 토글 — 되돌리기 / 폐기 */}
        <div className={s.section}>
          <div className={s.toggleRow}>
            <button
              className={`${s.toggleBtn} ${mode === 'repair' ? s.active : ''}`}
              onClick={() => {
                setMode('repair')
                setError(null)
              }}
            >
              🔧 되돌리기
            </button>
            <button
              className={`${s.toggleBtn} ${mode === 'discard' ? s.active : ''}`}
              onClick={() => {
                setMode('discard')
                setError(null)
                setProblemProcess(null)
              }}
            >
              🗑 폐기
            </button>
          </div>
        </div>

        {mode === 'repair' ? (
          <>
            {/* 문제 공정 선택 */}
            {problemProcesses.length > 0 && (
              <div className={s.section}>
                <p className={s.sectionTitle}>어느 공정을 다시 해야 하나요?</p>
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
          </>
        ) : (
          <>
            {/* 폐기 사유 */}
            <div className={s.section}>
              <p className={s.sectionTitle}>폐기 사유</p>
              <textarea
                className="form-input"
                rows={3}
                placeholder="폐기 사유를 입력하세요 (필수)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ resize: 'vertical', fontSize: 14 }}
              />
            </div>

            {error && <div className={s.error}>{error}</div>}

            <button
              className={s.confirmBtn}
              style={{ background: 'var(--color-error)' }}
              disabled={!reason.trim() || processing}
              onClick={handleConfirm}
            >
              {processing ? '처리 중...' : `폐기 확인 (${lotInfo.quantity}개 전량)`}
            </button>
          </>
        )}

        <button className={`btn-text ${s.textBtn}`} onClick={handleReset}>
          취소
        </button>
      </div>
    </div>
  )
}
