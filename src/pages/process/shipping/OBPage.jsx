// src/pages/process/OBPage.jsx
// ★ OB 출하 페이지 — 완료 후 엑셀 다운로드 버튼 포함
// 호출: App.jsx → OBPage

import { useState, useEffect } from 'react'
import { printLot, scanLot, downloadObExcel, getCertAdminMbs, printCertUbLabel } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { TOAST_FLASH_MS } from '@/constants/etcConst'
import { useToast } from '@/contexts/ToastContext'
import s from './OBPage.module.css'

export default function OBPage({ onLogout, onBack }) {
  const toast = useToast()
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
  // 출하 후 외부 cert 라벨 인쇄 — 그 OB 에 속한 모든 UB 일괄 (2026-04-30)
  const [certUbs, setCertUbs] = useState([])
  const [printState, setPrintState] = useState(null) // null | { sent, total, error? }

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
        selected_process: 'OB',
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
      const blob = await downloadObExcel(obLotNo)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inspection_${obLotNo}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast(`엑셀 다운로드 실패: ${e.message}`, 'error')
    }
  }

  // 출하 완료 직후 그 OB 에 속한 UB 목록 조회 — 외부 cert 라벨 인쇄용 (2026-04-30)
  // FinLot.access_pw 가 process_ob 안에서 동기 생성되므로 obLotNo 확정 직후 호출 가능.
  // 실패 시 조용히 — 인쇄 버튼만 안 뜸 (CertPreviewPage 에서 사후 인쇄 가능)
  useEffect(() => {
    if (step !== 'done' || !obLotNo) return
    let cancelled = false
    getCertAdminMbs()
      .then((data) => {
        if (cancelled) return
        const matches = (data.items || []).filter((it) => it.ob_lot_no === obLotNo)
        const allUbs = matches.flatMap((it) => it.ub_lot_nos || [])
        setCertUbs(allUbs)
      })
      .catch(() => { /* 조용히 — CertPreviewPage 에서 재시도 가능 */ })
    return () => { cancelled = true }
  }, [step, obLotNo])

  // 외부 cert 라벨 일괄 인쇄 (UB 별 1장)
  const handlePrintCertLabels = async () => {
    if (certUbs.length === 0) return
    setPrintState({ sent: 0, total: certUbs.length })
    try {
      for (let i = 0; i < certUbs.length; i++) {
        await printCertUbLabel(certUbs[i])
        setPrintState({ sent: i + 1, total: certUbs.length })
      }
      setTimeout(() => setPrintState(null), TOAST_FLASH_MS)
    } catch (e) {
      setPrintState((p) => ({ ...(p || { sent: 0, total: certUbs.length }), error: e.message || '인쇄 실패' }))
    }
  }

  const handleReset = () => {
    setScanList([]); setLotChain(null); setObLotNo(null)
    setPrinting(false); setDone(false); setError(null); setStep('qr')
    setCertUbs([]); setPrintState(null)
  }

  useAutoReset(error, done, handleReset)

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
        <div className="page-flat" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <div style={{ padding: '12px var(--space-lg)' }}>
            <button onClick={handleReset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-dark)', display: 'flex', alignItems: 'center' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </div>
          <div className="process-content-inner" style={{ textAlign: 'center' }}>
            <div className={s.check}>✓</div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-dark)', marginBottom: 8 }}>출하 완료</h1>
            <p style={{ color: 'var(--color-text-sub)', fontSize: 14, marginBottom: 28 }}>{obLotNo}</p>

            <div className={s.doneActions}>
              <button className="btn-primary btn-lg btn-full" onClick={handleDownload}>
                검사 데이터 엑셀 다운로드
              </button>
              <button className="btn-secondary btn-lg btn-full" onClick={handleReset}>
                다음 출하
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

