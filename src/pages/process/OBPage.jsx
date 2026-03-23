// src/pages/process/OBPage.jsx
// ★ OB 출하 페이지 — 완료 후 엑셀 다운로드 버튼 포함
// 호출: App.jsx → OBPage

import { useState, useEffect } from 'react'
import { printLot, scanLot } from '@/api'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'

const BASE_URL = import.meta.env.VITE_API_URL || ''

export default function OBPage({ onLogout, onBack }) {
  const date = useDate()
  const lotNo = `OB-${date}`
  const [lotChain, setLotChain] = useState(null)
  const [scanList, setScanList] = useState([])
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  // ★ OB 완료 후 다운로드용 상태
  const [obLotNo, setObLotNo] = useState(null)
  const [step, setStep] = useState('qr')

  useEffect(() => { if (!error) return; const t = setTimeout(() => handleReset(), 1500); return () => clearTimeout(t) }, [error])

  // ★ done 시 자동 리셋 대신 다운로드 화면 유지
  const handleConfirm = async () => {
    const overItem = scanList.find(item => item.quantity > item.maxQty)
    if (overItem) {
      setError(`재고 초과: ${overItem.lot_no} (요청 ${overItem.quantity}개 / 재고 ${overItem.maxQty}개)`)
      return
    }
    setPrinting(true)
    try {
      const result = await printLot(lotNo, 1, {
        selected_Process: 'OB',
        lot_chain: lotChain,
        quantity: 1,
        consumed_list: scanList.map(item => ({ lot_no: item.lot_no, quantity: item.quantity })),
      })
      // ★ 실제 채번된 OB LOT 번호 저장 (다운로드에 사용)
      const actualOb = result.lot_nums?.[0] || lotNo
      setObLotNo(actualOb)
      setDone(true)
      setStep('done')
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  // ★ 엑셀 다운로드 핸들러
  const handleDownload = async () => {
    if (!obLotNo) return
    try {
      const res = await fetch(`${BASE_URL}/lot/ob/${obLotNo}/export`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || '다운로드 실패')
      }
      // Blob으로 변환 → 브라우저 다운로드 트리거
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inspection_${obLotNo}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`엑셀 다운로드 실패: ${e.message}`)
    }
  }

  const handleReset = () => {
    setScanList([]); setLotChain(null); setObLotNo(null)
    setPrinting(false); setDone(false); setError(null); setStep('qr')
  }

  return (
    <>
      {/* 1) BX QR 스캔 */}
      {step === 'qr' && (
        <QRScanner
          key={step}
          processLabel="OB, 출하"
          showList={true}
          nextLabel="완료 → 출하"
          onScan={async (val) => {
            const r = await scanLot('OB', val)
            return r
          }}
          onScanList={(list, chain) => {
            setScanList(list)
            setLotChain(chain)
            setStep('confirm')
          }}
          onLogout={onLogout} onBack={onBack}
        />
      )}

      {/* 2) 확인 → 출하 */}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={1}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}

      {/* 3) ★ 출하 완료 → 다운로드 화면 */}
      {step === 'done' && (
        <div style={styles.page}>
          <div style={styles.card}>
            <div style={styles.check}>✓</div>
            <p style={styles.title}>출하 완료</p>
            <p style={styles.sub}>{obLotNo}</p>

            <button style={styles.downloadBtn} onClick={handleDownload}>
              검사 데이터 엑셀 다운로드
            </button>

            <button style={styles.nextBtn} onClick={handleReset}>
              다음 출하
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── 스타일 ──
const styles = {
  page: {
    minHeight: '100vh', background: '#f4f6fb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '24px 16px',
  },
  card: {
    background: '#fff', borderRadius: 14, padding: '40px 32px',
    width: '100%', maxWidth: 420,
    boxShadow: '0 4px 24px rgba(26,47,110,0.09)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  check: {
    width: 56, height: 56, borderRadius: '50%',
    background: '#eafaf1', color: '#27ae60',
    fontSize: 28, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20, fontWeight: 700, color: '#1a2540', margin: 0,
  },
  sub: {
    fontSize: 14, color: '#6b7585', marginTop: 4, marginBottom: 24,
  },
  downloadBtn: {
    width: '100%', padding: 16, borderRadius: 10,
    background: '#1a2f6e', color: '#fff',
    border: 'none', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', marginBottom: 10,
  },
  nextBtn: {
    width: '100%', padding: 14, borderRadius: 10,
    background: '#fff', color: '#6b7585',
    border: '1.5px solid #d0d5e8', fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
  },
}