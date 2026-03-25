// src/components/BoxManager.jsx
// ★ 박스(UB/MB) 공용 컴포넌트
// 호출: UBPage.jsx, MBPage.jsx
//
// 흐름:
//   home      → [박스 QR 스캔] / [박스 생성] 선택
//   create    → 작업자 + 수량 입력 → QR 출력 → home으로 복귀
//   box_scan  → QRScanner(단건) — UB or MB QR만 허용
//   items     → QRScanner(리스트) — 전 공정 아이템 스캔 → 확인 → DB 저장
//
// props:
//   process       — "UB" | "MB"
//   processLabel  — "UB 소포장" | "MB 대포장"
//   scanLabel     — "OQ 제품 스캔" | "UB 박스 스캔"
//   prevProcess   — "OQ" | "UB"  (스캔 검증용)
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
  const [step, setStep] = useState('home')

  // create 폼
  const [worker, setWorker] = useState('')
  const [printCount, setPrintCount] = useState('1')
  const [creating, setCreating] = useState(false)
  const [createDone, setCreateDone] = useState(null) // 생성된 lot_nums

  // box scan → items
  const [boxLotNo, setBoxLotNo] = useState(null)
  const [existingItems, setExistingItems] = useState([]) // 이전 세션에서 담긴 것
  const [scanList, setScanList] = useState([]) // 이번에 새로 담을 것
  const [lotChain, setLotChain] = useState(null)

  // confirm
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  // ── 에러/완료 자동 소멸 ──
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 2500)
    return () => clearTimeout(t)
  }, [error])

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => handleFullReset(), 1500)
    return () => clearTimeout(t)
  }, [done])

  // ════════════════════════════════════════
  // Step: create — 박스 생성 + QR 출력
  // ════════════════════════════════════════
  const handleCreate = async () => {
    if (!worker.trim()) return setError('작업자를 입력하세요')
    const count = parseInt(printCount) || 1
    setCreating(true)
    try {
      const r = await createBox(process, worker.trim(), count)
      setCreateDone(r.lot_nums) // 생성된 번호 보여주기
      // 2초 후 자동으로 home 복귀 (방금 출력된 QR을 스캔하라는 의미)
      setTimeout(() => {
        setCreateDone(null)
        setStep('home')
      }, 2000)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  // ════════════════════════════════════════
  // Step: box_scan — 박스 QR 스캔
  // ════════════════════════════════════════
  // 호출: QRScanner(단건모드)의 onScan
  // 역할: 스캔값이 UB/MB인지 검증 → 기존 내용물 로드 → items 단계로
  const handleBoxScan = async (val) => {
    // 프론트 검증: UB페이지면 UB-만, MB페이지면 MB-만 허용
    if (!val.toUpperCase().startsWith(process + '-')) {
      throw new Error(`${process} 박스 QR만 스캔 가능합니다.`)
    }
    const r = await scanBox(val)
    setBoxLotNo(r.box_lot_no)
    setExistingItems(r.items || [])
    setStep('items')
  }

  // ════════════════════════════════════════
  // Step: items — 아이템 스캔 + 확인
  // ════════════════════════════════════════
  // 호출: QRScanner(리스트모드)의 onScan — 각 아이템 검증
  // 역할: 기존 scanLot으로 재고/검사 검증 (DB 변경 없음)
  const handleItemScan = async (val) => {
    const r = await scanLot(prevProcess, val)
    return r // QRScanner가 리스트에 추가
  }

  // 호출: QRScanner(리스트모드)의 onScanList → "완료" 버튼
  // 역할: 확인 모달로 전환
  const handleScanListDone = (list, chain) => {
    setScanList(list)
    setLotChain(chain)
    setStep('confirm')
  }

  // 호출: ConfirmModal의 onConfirm
  // 역할: 서버에 bulk 확정 요청 (DB만, 출력 없음)
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

  // 전체 리셋
  const handleFullReset = () => {
    setStep('home')
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
  // RENDER: home
  // ════════════════════════════════════════
  if (step === 'home') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <p className={s.title}>{processLabel}</p>
          <p className={s.sub}>박스를 스캔하거나 새로 생성하세요</p>

          <button className={s.homeBtnPrimary} onClick={() => setStep('box_scan')}>
            📷 박스 QR 스캔
          </button>

          <button className={s.homeBtnSecondary} onClick={() => setStep('create')}>
            📦 새 박스 생성
          </button>

          {error && <p className={s.error}>{error}</p>}

          <div className={s.navRow}>
            <button className={s.navBtn} onClick={onBack}>
              ← 뒤로
            </button>
            <button className={s.navBtn} onClick={onLogout}>
              로그아웃
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // RENDER: create
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
            <button className={s.navBtn} onClick={() => setStep('home')}>
              ← 뒤로
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // RENDER: box_scan — 박스 QR 스캔 (단건)
  // ════════════════════════════════════════
  if (step === 'box_scan') {
    return (
      <QRScanner
        key="box_scan"
        processLabel={`${processLabel} — 박스 QR 스캔`}
        showList={false}
        onScan={handleBoxScan}
        onLogout={onLogout}
        onBack={() => setStep('home')}
      />
    )
  }

  // ════════════════════════════════════════
  // RENDER: items — 아이템 스캔 (리스트)
  // ════════════════════════════════════════
  if (step === 'items') {
    return (
      <>
        {/* 박스 헤더를 QRScanner 위에 오버레이하기 어려우므로,
            QRScanner의 processLabel에 박스 정보 포함 */}
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
            setStep('home')
          }}
        />
      </>
    )
  }

  // ════════════════════════════════════════
  // RENDER: confirm — 확인 모달
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
