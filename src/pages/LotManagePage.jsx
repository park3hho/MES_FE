import { useState } from 'react'
import { traceLot, discardLot, printLot } from '../api'
import QRScanner from '../components/QRScanner'
import { FaradayLogo } from '../components/FaradayLogo'

const REASONS = ['불량', '파손', '오염', '기한초과', '기타']

// 수리 가능 공정 → 돌아갈 공정
const REPAIR_DEST = {
  'SO': { process: 'WI', label: '권선' },
  'OQ': { process: 'WI', label: '권선' },
}

const BASE_URL = import.meta.env.VITE_API_URL || ''

async function repairLot(lotNo, reason) {
  const res = await fetch(`${BASE_URL}/lot/repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ lot_no: lotNo, reason }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.detail || '수리 처리 실패')
  }
  return res.json()
}

export default function LotManagePage({ onLogout, onBack }) {
  const [lotInfo, setLotInfo] = useState(null)
  const [action, setAction] = useState(null)    // 'discard' | 'repair'
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
      if (current.status !== 'in_stock') {
        throw new Error(STATUS_MSG[current.status] || `처리할 수 없는 상태입니다 (${current.status})`)
      }
      if (current.quantity <= 0) {
        throw new Error('재고 수량이 0입니다. 처리할 수 없습니다.')
      }

      setLotInfo(current)
      setDiscardQty(String(current.quantity))
      setStep('choose')
    } catch (e) {
      throw new Error(e.message)
    }
  }

  const handleConfirm = async () => {
    if (!reason) { setError('사유를 선택하세요.'); return }
    setProcessing(true)
    setError(null)

    try {
      if (action === 'discard') {
        const qty = isPartial ? parseInt(discardQty) : null
        if (isPartial && (!qty || qty <= 0)) { setError('폐기 수량을 입력하세요.'); setProcessing(false); return }
        if (isPartial && qty > lotInfo.quantity) { setError('재고보다 많이 폐기할 수 없습니다.'); setProcessing(false); return }
        const result = await discardLot(lotInfo.lot_no, qty, reason)
        setDone({ type: 'discard', ...result })
      } else {
        const result = await repairLot(lotInfo.lot_no, reason)
        // 수리: 돌아갈 공정의 이전 LOT QR 자동 출력
        if (result.reprint_lot_no) {
          try { await printLot(result.reprint_lot_no, 1, { selected_Process: 'REPRINT' }) }
          catch (e) { console.warn('QR 재출력 실패:', e.message) }
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
    setLotInfo(null); setAction(null); setReason(null)
    setDiscardQty(''); setIsPartial(false)
    setProcessing(false); setDone(null); setError(null); setStep('qr')
  }

  // ── QR 스캔 ──
  if (step === 'qr') {
    return (
      <QRScanner
        processLabel="LOT 관리"
        onScan={handleScan}
        onLogout={onLogout}
        onBack={onBack}
      />
    )
  }

  // ── 완료 ──
  if (step === 'done') {
    const isRepair = done.type === 'repair'
    return (
      <div style={s.page}>
        <div style={s.card}>
          <FaradayLogo size="md" />
          <div style={{ ...s.doneIcon, background: isRepair ? '#e3f2fd' : '#fce4ec', color: isRepair ? '#1565c0' : '#c62828' }}>
            {isRepair ? '🔧' : '✕'}
          </div>
          <p style={s.doneTitle}>{isRepair ? '수리 접수 완료' : '폐기 완료'}</p>
          <div style={s.doneInfo}>
            <span style={s.doneLabel}>{lotInfo.lot_no}</span>
            {isRepair ? (
              <>
                <span style={s.doneDetail}>사유: {reason} → {REPAIR_DEST[lotInfo.process]?.label}({REPAIR_DEST[lotInfo.process]?.process}) 공정으로 재작업</span>
                {done.reprint_lot_no && (
                  <span style={{ ...s.doneDetail, fontWeight: 600, color: '#1565c0', marginTop: 4 }}>
                    QR 출력됨: {done.reprint_lot_no}
                  </span>
                )}
              </>
            ) : (
              <span style={s.doneDetail}>폐기: {done.discarded}개 / 잔여: {done.remaining}개</span>
            )}
          </div>
          <button style={s.primaryBtn} onClick={handleReset}>다른 LOT 처리</button>
          <button style={s.textBtn} onClick={onBack ?? onLogout}>
            {onBack ? '이전으로' : '로그아웃'}
          </button>
        </div>
      </div>
    )
  }

  // ── 액션 선택 + 상세 ──
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <FaradayLogo size="md" />
          <p style={s.title}>LOT 관리</p>
        </div>

        {/* LOT 정보 */}
        <div style={s.lotCard}>
          <div style={s.lotRow}>
            <span style={s.lotProcess}>{lotInfo.process}</span>
            <span style={s.lotLabel}>{lotInfo.label}</span>
          </div>
          <div style={s.lotNo}>{lotInfo.lot_no}</div>
          <div style={s.lotQty}>현재 재고: {lotInfo.quantity}개</div>
        </div>

        {/* 폐기 / 수리 선택 */}
        <div style={s.section}>
          <p style={s.sectionTitle}>처리 방법</p>
          <div style={s.actionRow}>
            <button
              style={{ ...s.actionBtn, ...(action === 'discard' ? s.actionDiscard : {}) }}
              onClick={() => { setAction('discard'); setReason(null); setIsPartial(false); setDiscardQty(String(lotInfo.quantity)) }}
            >
              <span style={s.actionIcon}>✕</span>
              <span style={s.actionLabel}>폐기</span>
              <span style={s.actionDesc}>재고에서 제거</span>
            </button>
            {REPAIR_DEST[lotInfo.process] && (
              <button
                style={{ ...s.actionBtn, ...(action === 'repair' ? s.actionRepair : {}) }}
                onClick={() => { setAction('repair'); setReason(null); setIsPartial(false) }}
              >
                <span style={s.actionIcon}>🔧</span>
                <span style={s.actionLabel}>수리</span>
                <span style={s.actionDesc}>{REPAIR_DEST[lotInfo.process].label}로 재투입</span>
              </button>
            )}
          </div>
        </div>

        {/* 폐기: 전체/부분 */}
        {action === 'discard' && (
          <div style={s.section}>
            <p style={s.sectionTitle}>폐기 범위</p>
            <div style={s.toggleRow}>
              <button
                style={{ ...s.toggleBtn, ...(!isPartial ? s.toggleActive : {}) }}
                onClick={() => { setIsPartial(false); setDiscardQty(String(lotInfo.quantity)) }}
              >
                전체 ({lotInfo.quantity}개)
              </button>
              <button
                style={{ ...s.toggleBtn, ...(isPartial ? s.toggleActive : {}) }}
                onClick={() => { setIsPartial(true); setDiscardQty('') }}
              >
                부분 폐기
              </button>
            </div>
            {isPartial && (
              <div style={s.qtyRow}>
                <input
                  style={s.qtyInput}
                  type="number" min={1} max={lotInfo.quantity}
                  placeholder="폐기 수량"
                  value={discardQty}
                  onChange={e => setDiscardQty(e.target.value)}
                />
                <span style={s.qtyMax}>/ {lotInfo.quantity}</span>
              </div>
            )}
          </div>
        )}

        {/* 수리: 안내 */}
        {action === 'repair' && REPAIR_DEST[lotInfo.process] && (
          <div style={s.repairNote}>
            수리 접수 후, <b>{REPAIR_DEST[lotInfo.process].label}({REPAIR_DEST[lotInfo.process].process})</b> 공정의 QR을 스캔하여 재작업을 진행하세요.
          </div>
        )}

        {/* 사유 선택 */}
        {action && (
          <div style={s.section}>
            <p style={s.sectionTitle}>사유</p>
            <div style={s.reasonGrid}>
              {REASONS.map(r => (
                <button
                  key={r}
                  style={{
                    ...s.reasonBtn,
                    ...(reason === r
                      ? (action === 'discard' ? s.reasonDiscard : s.reasonRepair)
                      : {}
                    ),
                  }}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <div style={s.error}>{error}</div>}

        {/* 확인 버튼 */}
        {action && (
          <button
            style={{
              ...s.confirmBtn,
              background: action === 'discard' ? '#c0392b' : '#1565c0',
              opacity: reason ? 1 : 0.4,
            }}
            disabled={!reason || processing}
            onClick={handleConfirm}
          >
            {processing ? '처리 중...' : action === 'discard' ? '폐기 확인' : '수리 접수'}
          </button>
        )}

        <button style={s.textBtn} onClick={handleReset}>취소</button>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f4f6fb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' },
  card: { background: '#fff', borderRadius: 14, padding: '28px 32px 24px', width: '100%', maxWidth: 480, boxShadow: '0 4px 24px rgba(26,47,110,0.09)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16, gap: 6 },
  title: { fontSize: 15, fontWeight: 700, color: '#1a2540', margin: 0 },

  lotCard: { width: '100%', padding: '14px 16px', background: '#f8f9fc', border: '1px solid #e0e4ef', borderRadius: 10, marginBottom: 16 },
  lotRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  lotProcess: { fontSize: 12, fontWeight: 700, color: '#fff', background: '#1a2f6e', padding: '1px 6px', borderRadius: 4 },
  lotLabel: { fontSize: 12, fontWeight: 600, color: '#6b7585' },
  lotNo: { fontSize: 15, fontWeight: 700, color: '#1a2540', marginBottom: 2 },
  lotQty: { fontSize: 12, color: '#8a93a8' },

  section: { width: '100%', marginBottom: 14 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#6b7585', marginBottom: 8, marginTop: 0 },

  actionRow: { display: 'flex', gap: 10 },
  actionBtn: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '16px 8px', background: '#f4f6fb', border: '2px solid #e0e4ef', borderRadius: 10, cursor: 'pointer' },
  actionDiscard: { borderColor: '#c0392b', background: '#fef6f4' },
  actionRepair: { borderColor: '#1565c0', background: '#f0f7ff' },
  actionIcon: { fontSize: 20 },
  actionLabel: { fontSize: 14, fontWeight: 700, color: '#1a2540' },
  actionDesc: { fontSize: 11, color: '#8a93a8' },

  toggleRow: { display: 'flex', gap: 8 },
  toggleBtn: { flex: 1, padding: '10px', background: '#f4f6fb', color: '#6b7585', border: '1.5px solid #e0e4ef', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  toggleActive: { background: '#1a2f6e', color: '#fff', borderColor: '#1a2f6e' },

  qtyRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 },
  qtyInput: { flex: 1, padding: '10px 12px', border: '1.5px solid #d8dce8', borderRadius: 8, fontSize: 14, fontWeight: 600, textAlign: 'center', outline: 'none' },
  qtyMax: { fontSize: 13, color: '#8a93a8', fontWeight: 600 },

  repairNote: { width: '100%', padding: '12px 14px', background: '#f0f7ff', border: '1px solid #bbdefb', borderRadius: 8, fontSize: 12, color: '#1565c0', fontWeight: 500, marginBottom: 14, lineHeight: 1.5 },

  reasonGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  reasonBtn: { padding: '8px 16px', background: '#f4f6fb', color: '#6b7585', border: '1.5px solid #e0e4ef', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  reasonDiscard: { background: '#c0392b', color: '#fff', borderColor: '#c0392b' },
  reasonRepair: { background: '#1565c0', color: '#fff', borderColor: '#1565c0' },

  error: { color: '#c0392b', fontSize: 12, textAlign: 'center', marginBottom: 8, width: '100%' },

  confirmBtn: { width: '100%', padding: '14px', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
  textBtn: { background: 'none', border: 'none', fontSize: 13, color: '#8a93a8', cursor: 'pointer', textDecoration: 'underline', marginTop: 10 },

  doneIcon: { width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginTop: 16, marginBottom: 12 },
  doneTitle: { fontSize: 16, fontWeight: 700, color: '#1a2540', margin: '0 0 12px' },
  doneInfo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginBottom: 20, textAlign: 'center' },
  doneLabel: { fontSize: 14, fontWeight: 700, color: '#1a2f6e' },
  doneDetail: { fontSize: 12, color: '#8a93a8', lineHeight: 1.5 },
  primaryBtn: { width: '100%', padding: '12px', background: '#1a2f6e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
}