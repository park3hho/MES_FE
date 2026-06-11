// pages/process/produce/RRTPage.jsx
// 로터 완성 (2026-06-12, Phase 2) — RBO(본딩) 스캔 → RT 완성 발급.
//   BE 가 RT{phi}-{YYYYMMDD}-{seq3} 채번 + RotorStock 입고 + 체인(rotor_snbt_rt) + RT 라벨.
import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAutoReset } from '@/hooks/useAutoReset'
import { printLot } from '@/api'
import QRScanner from '@/components/QRScanner'
import { ConfirmModal } from '@/components/ConfirmModal'

export default function RRTPage({ onLogout, onBack }) {
  const [boLotNo, setBoLotNo] = useState(null)   // RBO(본딩) LOT
  const [rtLotNo, setRtLotNo] = useState(null)   // 발급된 RT LOT (완료 표시)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  const handleReset = () => {
    setBoLotNo(null); setRtLotNo(null)
    setPrinting(false); setDone(false); setError(null)
    setStep('qr')
  }
  useAutoReset(error, done, handleReset)

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      const res = await printLot(boLotNo, 1, {
        selected_process: 'RT',
        line: 'rotor',
        prev_lot_no: boLotNo,
      })
      setRtLotNo(res.lot_nums?.[0] || res.lot_rt_no || '')
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  return (
    <AnimatePresence mode="wait">
      {step === 'qr' && (
        <QRScanner
          processLabel="RRT, 로터 완성 — 본딩 LOT 스캔"
          onScan={(val) => { setBoLotNo(val); setStep('confirm') }}
          onLogout={onLogout}
          onBack={onBack}
        />
      )}

      {step === 'confirm' && (
        <ConfirmModal
          lotNo={rtLotNo || boLotNo}
          printCount={1}
          extraInfo={done && rtLotNo
            ? `RT 완성: ${rtLotNo}`
            : `본딩 ${boLotNo} → RT 완성 (시리얼 자동 채번 + RT 재고 입고)`}
          printing={printing}
          done={done}
          error={error}
          onConfirm={handleConfirm}
          onCancel={handleReset}
        />
      )}
    </AnimatePresence>
  )
}
