// pages/process/manage/PrintPage.jsx
// 라벨 출력 — 2가지 모드 (2026-06-12 통합):
//   · LOT 입력  : LOT 번호 → 공정 체인 조회 → 풀 LOT 라벨 (CountModal + ConfirmModal)
//   · 직접 입력 : 입력값을 그대로 QR 라벨로 (영어 전용, 공정·체인·재고 무관)

import { useState, useEffect } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { CountModal } from '@/components/CountModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { usePrint } from '@/hooks/usePrint'
import { printQrSimple } from '@/api'
import { useToast } from '@/contexts/ToastContext'
import { RESET_SUCCESS_DELAY } from '@/constants/etcConst'
import s from './PrintPage.module.css'

const MODES = [
  { key: 'lot', label: 'LOT 입력' },
  { key: 'direct', label: '직접 입력' },
]

export function PrintPage({ onBack }) {
  const [mode, setMode] = useState('lot')

  return (
    <div className="page-flat">
      <PageHeader
        title="라벨 출력"
        subtitle="LOT 번호로 출력하거나, 원하는 값을 직접 QR 로 출력하세요"
        onBack={onBack}
      />

      <div className={s.modeToggle}>
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`${s.modeBtn} ${mode === m.key ? s.modeBtnActive : ''}`}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'lot' ? <LotMode /> : <DirectMode />}
    </div>
  )
}

// ── LOT 입력 모드 — 공정 체인 조회 후 풀 LOT 라벨 ──
function LotMode() {
  const [lotNo, setLotNo] = useState('')
  const [printCount, setPrintCount] = useState(null)
  const [step, setStep] = useState(null) // 'count' | 'confirm'
  const { printing, done, error, print, reset } = usePrint()

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => {
      setStep(null); setLotNo(''); setPrintCount(null); reset()
    }, RESET_SUCCESS_DELAY)
    return () => clearTimeout(t)
  }, [done])

  const handlePrintClick = () => {
    if (!lotNo.trim()) return
    reset()
    setStep('count')
  }
  const handleCountSelect = (count) => { setPrintCount(count); setStep('confirm') }
  const handleConfirm = () => print(lotNo, printCount)
  const handleCancel = () => {
    if (printing) return
    setStep(null); setPrintCount(null); reset()
  }

  return (
    <div className={s.wrap}>
      <label className={s.label} htmlFor="lot-value">LOT 번호</label>
      <input
        id="lot-value"
        className={s.input}
        type="text"
        value={lotNo}
        onChange={(e) => setLotNo(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handlePrintClick()}
        placeholder="LOT No 를 입력하세요"
        autoFocus
      />
      <button
        className="btn-primary btn-lg btn-full"
        onClick={handlePrintClick}
        disabled={!lotNo.trim()}
      >
        인쇄
      </button>

      {step === 'count' && (
        <CountModal lotNo={lotNo} onSelect={handleCountSelect} onCancel={handleCancel} />
      )}
      {step === 'confirm' && (
        <ConfirmModal
          lotNo={lotNo}
          printCount={printCount}
          printing={printing}
          done={done}
          error={error}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          unit="개"
        />
      )}
    </div>
  )
}

// ── 직접 입력 모드 — 입력값 그대로 QR (영어 전용) ──
function DirectMode() {
  const toast = useToast()
  const [value, setValue] = useState('')
  const [count, setCount] = useState(1)
  const [printing, setPrinting] = useState(false)

  // 영어 전용 — Zebra 한글 미지원. 입력 단계에서 비ASCII 제거.
  const onChange = (e) => setValue(e.target.value.replace(/[^\x20-\x7E]/g, ''))

  const trimmed = value.trim()
  const canPrint = !!trimmed && !printing

  const handlePrint = async () => {
    if (!canPrint) return
    setPrinting(true)
    try {
      const n = Math.max(1, Math.min(50, Number(count) || 1))
      await printQrSimple(trimmed, n)
      toast(`QR ${n}장 출력 요청됨`, 'success')
      setValue('')
      setCount(1)
    } catch (e) {
      toast(e.message || 'QR 출력 실패', 'error')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className={s.wrap}>
      <label className={s.label} htmlFor="qr-value">QR 에 담을 값</label>
      <input
        id="qr-value"
        className={s.input}
        type="text"
        value={value}
        onChange={onChange}
        onKeyDown={(e) => { if (e.key === 'Enter' && count) handlePrint() }}
        placeholder="영문/숫자/기호 입력 (LOT, 메모, URL 등)"
        autoFocus
        maxLength={200}
      />
      <p className={s.hint}>※ 영문·숫자·기호만 가능 (프린터가 한글을 지원하지 않아요)</p>

      <div className={s.countRow}>
        <label className={s.label} htmlFor="qr-count">출력 매수</label>
        <input
          id="qr-count"
          className={s.countInput}
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>

      <button
        type="button"
        className="btn-primary btn-lg btn-full"
        onClick={handlePrint}
        disabled={!canPrint}
      >
        {printing ? '출력 중…' : 'QR 출력'}
      </button>

      {trimmed && (
        <div className={s.preview}>
          <span className={s.previewLabel}>미리보기</span>
          <code className={s.previewVal}>{trimmed}</code>
        </div>
      )}
    </div>
  )
}
