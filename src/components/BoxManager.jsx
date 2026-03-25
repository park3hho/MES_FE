// src/components/BoxManager.jsx
// ★ 박스(UB/MB) 공용 컴포넌트
// 호출: UBPage.jsx, MBPage.jsx
//
// 흐름:
//   box_scan → 첫 화면. QR스캐너 + 하단 "새 박스 생성" 버튼
//   create   → 작업자 + 수량 입력 → QR 출력 → box_scan 복귀
//   items    → QRScanner(리스트) — 전 공정 아이템 스캔 → 확인
//   confirm  → ConfirmModal — DB만 처리, 출력 없음
//
// props:
//   process       — "UB" | "MB"
//   processLabel  — "UB 소포장" | "MB 대포장"
//   scanLabel     — "OQ 제품 스캔" | "UB 박스 스캔"
//   prevProcess   — "OQ" | "UB"  (아이템 스캔 검증용)
//   onLogout, onBack

import { useState, useEffect } from 'react'
import { createBox, scanBox, scanLot, confirmBox } from '@/api'
import QRScanner from '@/components/QRScanner'
import { ConfirmModal } from '@/components/ConfirmModal'
import s from './BoxManager.module.css'

export default function BoxManager({
  process,
  processLabel,
  scanLabel,
  prevProcess,
  onLogout,
  onBack,
}) {
  // ── 상태 ──
  // 'box_scan' → 'create' → 'box_scan' (생성 후 복귀)
  // 'box_scan' → 'items' → 'confirm' → 완료 → 'box_scan'
  const [step, setStep] = useState('box_scan')

  // create 폼
  const [worker, setWorker] = useState('')
  const [printCount, setPrintCount] = useState('1')
  const [creating, setCreating] = useState(false)
  const [createDone, setCreateDone] = useState(null)

  // box scan → items
  const [boxLotNo, setBoxLotNo] = useState(null)
  const [existingItems, setExistingItems] = useState([])
  const [scanList, setScanList] = useState([])
  const [lotChain, setLotChain] = useState(null)

  // confirm
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  // ── 에러 자동 소멸 ──
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 2500)
    return () => clearTimeout(t)
  }, [error])

  // ── 확정 완료 → 자동 리셋 ──
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => handleFullReset(), 1500)
    return () => clearTimeout(t)
  }, [done])

  // ════════════════════════════════════════
  // 핸들러: 박스 생성 + QR 출력
  // ════════════════════════════════════════
  // 호출: create 화면의 "생성 + QR 출력" 버튼
  // 역할: 서버에 빈 박스 N개 생성 요청 → QR 프린터 출력 → box_scan 복귀
  const handleCreate = async () => {
    if (!worker.trim()) return setError('작업자를 입력하세요')
    const count = parseInt(printCount) || 1
    setCreating(true)
    try {
      const r = await createBox(process, worker.trim(), count)
      setCreateDone(r.lot_nums)
      // 2초 후 box_scan으로 복귀 (출력된 QR을 스캔하라는 유도)
      setTimeout(() => {
        setCreateDone(null)
        setStep('box_scan')
      }, 2000)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  // ════════════════════════════════════════
  // 핸들러: 박스 QR 스캔
  // ════════════════════════════════════════
  // 호출: box_scan 화면의 QRScanner(단건) onScan
  // 역할: UB/MB 접두사 검증 → 서버에서 박스 존재 확인 + 기존 내용물 로드 → items
  const handleBoxScan = async (val) => {
    if (!val.toUpperCase().startsWith(process + '-')) {
      throw new Error(`${process} 박스 QR만 스캔 가능합니다.`)
    }
    const r = await scanBox(val)
    setBoxLotNo(r.box_lot_no)
    setExistingItems(r.items || [])
    setStep('items')
  }

  // ════════════════════════════════════════
  // 핸들러: 아이템 스캔 (검증만, DB 변경 없음)
  // ════════════════════════════════════════
  // 호출: items 화면의 QRScanner(리스트) onScan — 매 스캔마다
  // 역할: 기존 scanLot API로 재고/검사 검증만 수행, QRScanner가 리스트에 추가
  const handleItemScan = async (val) => {
    const r = await scanLot(prevProcess, val)
    return r
  }

  // ════════════════════════════════════════
  // 핸들러: 아이템 리스트 "완료" 클릭
  // ════════════════════════════════════════
  // 호출: QRScanner(리스트)의 onScanList — "완료 → 확정" 버튼
  // 역할: 스캔된 리스트를 state에 저장 → confirm 단계로
  const handleScanListDone = (list, chain) => {
    setScanList(list)
    setLotChain(chain)
    setStep('confirm')
  }

  // ════════════════════════════════════════
  // 핸들러: 확정 (DB만, 출력 없음)
  // ════════════════════════════════════════
  // 호출: ConfirmModal의 onConfirm
  // 역할: 서버에 bulk 확정 — snbt 생성 + 재고 소비 + 박스 재고 증가
  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await confirmBox(
        boxLotNo,
        scanList.map((item) => ({ lot_no: item.lot_no, quantity: item.quantity })),
      )
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setConfirming(false)
    }
  }

  // ════════════════════════════════════════
  // 전체 리셋
  // ════════════════════════════════════════
  const handleFullReset = () => {
    setStep('box_scan')
    setBoxLotNo(null)
    setExistingItems([])
    setScanList([])
    setLotChain(null)
    setWorker('')
    setPrintCount('1')
    setCreateDone(null)
    setConfirming(false)
    setDone(false)
    setError(null)
  }

  // ════════════════════════════════════════
  // RENDER: box_scan — 첫 화면 (QR스캐너 + 하단 생성 버튼)
  // ════════════════════════════════════════
  if (step === 'box_scan') {
    return (
      <>
        <QRScanner
          key="box_scan"
          processLabel={`${processLabel} — 박스 QR 스캔`}
          showList={false}
          onScan={handleBoxScan}
          onLogout={onLogout}
          onBack={onBack}
        />
        <button className={s.floatingCreateBtn} onClick={() => setStep('create')}>
          + 새 박스 생성
        </button>
      </>
    )
  }

  // ════════════════════════════════════════
  // RENDER: create — 작업자 + 수량 입력 → QR 출력
  // ════════════════════════════════════════
  if (step === 'create') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <p className={s.title}>{processLabel} — 박스 생성</p>
          <p className={s.sub}>작업자와 출력 매수를 입력하세요</p>

          <input
            className={s.input}
            placeholder="작업자 코드 (예: A)"
            value={worker}
            onChange={(e) => setWorker(e.target.value.toUpperCase())}
            autoFocus
          />

          <input
            className={s.input}
            type="number"
            min="1"
            placeholder="출력 매수"
            value={printCount}
            onChange={(e) => setPrintCount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />

          <button className={s.createBtn} onClick={handleCreate} disabled={creating}>
            {creating ? '출력 중...' : `📦 ${printCount}개 생성 + QR 출력`}
          </button>

          {createDone && (
            <div className={s.success}>
              ✓ 생성 완료: {createDone.join(', ')}
              <br />
              QR을 스캔하세요
            </div>
          )}

          {error && <p className={s.error}>{error}</p>}

          <div className={s.navRow}>
            <button className={s.navBtn} onClick={() => setStep('box_scan')}>
              ← 뒤로
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // RENDER: items — 아이템 스캔 (리스트 모드)
  // ════════════════════════════════════════
  if (step === 'items') {
    return (
      <QRScanner
        key="item_scan"
        processLabel={`${scanLabel} → 📦 ${boxLotNo} (기존 ${existingItems.length}개)`}
        showList={true}
        nextLabel="완료 → 확정"
        onScan={handleItemScan}
        onScanList={handleScanListDone}
        onLogout={onLogout}
        onBack={() => {
          setBoxLotNo(null)
          setExistingItems([])
          setStep('box_scan')
        }}
      />
    )
  }

  // ════════════════════════════════════════
  // RENDER: confirm — 확인 모달 (DB만 처리, 출력 없음)
  // ════════════════════════════════════════
  if (step === 'confirm') {
    return (
      <ConfirmModal
        lotNo={boxLotNo}
        printCount={scanList.length}
        printing={confirming}
        done={done}
        error={error}
        onConfirm={handleConfirm}
        onCancel={() => setStep('items')}
      />
    )
  }

  return null
}
