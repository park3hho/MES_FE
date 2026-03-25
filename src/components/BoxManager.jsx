// src/components/BoxManager.jsx
// ★ 박스(UB/MB) "컨테이너 우선" 공용 컴포넌트
// 호출: UBPage.jsx, MBPage.jsx에서 props만 달리해서 사용
// 역할: Step1 작업자→박스생성 / Step2 스캔→아이템 담기·빼기
//
// props:
//   process      — "UB" | "MB"
//   processLabel — 화면 타이틀 (예: "UB 소포장")
//   scanLabel    — QR 스캐너 안내문 (예: "OQ 제품 스캔")
//   itemLabel    — 리스트 제목 (예: "담긴 아이템")
//   onLogout, onBack — 네비게이션

import { useState, useEffect } from 'react'
import { createBox, addBoxItem, removeBoxItem } from '@/api'
import QRScanner from '@/components/QRScanner'
import s from './BoxManager.module.css'

export default function BoxManager({
  process,
  processLabel,
  scanLabel,
  itemLabel,
  onLogout,
  onBack,
}) {
  const [worker, setWorker] = useState('')
  const [boxLotNo, setBoxLotNo] = useState(null)
  const [items, setItems] = useState([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('worker') // 'worker' → 'scan'

  // ── 에러 자동 소멸 ──
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 2000)
    return () => clearTimeout(t)
  }, [error])

  // ════════════════════════════════════════
  // 핸들러
  // ════════════════════════════════════════

  // 호출: Step1 "박스 생성" 버튼 or Enter
  // 역할: 서버에 빈 박스 요청 → QR 출력
  const handleCreateBox = async () => {
    if (!worker.trim()) return setError('작업자를 입력하세요')
    setCreating(true)
    try {
      const r = await createBox(process, worker.trim())
      setBoxLotNo(r.lot_num)
      setStep('scan')
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  // 호출: Step2 QRScanner의 onScan
  // 역할: 스캔한 전 공정 LOT를 박스에 추가 + ST 라벨 출력(UB만)
  const handleScan = async (val) => {
    try {
      const r = await addBoxItem(boxLotNo, val)
      setItems((prev) => [
        ...prev,
        {
          lot_no: r.item_lot_no,
          quantity: r.quantity,
          st_serial: r.st_serial_no || null,
        },
      ])
    } catch (e) {
      setError(e.message)
    }
  }

  // 호출: 아이템 행의 ✕ 버튼
  // 역할: snbt 삭제 + 재고 복원
  const handleRemove = async (itemLotNo) => {
    try {
      await removeBoxItem(boxLotNo, itemLotNo)
      setItems((prev) => prev.filter((i) => i.lot_no !== itemLotNo))
    } catch (e) {
      setError(e.message)
    }
  }

  // 호출: "새 박스 시작" 버튼
  const handleReset = () => {
    setBoxLotNo(null)
    setItems([])
    setWorker('')
    setError(null)
    setStep('worker')
  }

  // ════════════════════════════════════════
  // Step 1: 작업자 입력 → 박스 생성
  // ════════════════════════════════════════
  if (step === 'worker') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <p className={s.title}>{processLabel}</p>
          <p className={s.sub}>작업자 입력 후 박스를 생성합니다</p>

          <input
            className={s.input}
            placeholder="작업자 코드 (예: A)"
            value={worker}
            onChange={(e) => setWorker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateBox()}
            autoFocus
          />

          <button className={s.createBtn} onClick={handleCreateBox} disabled={creating}>
            {creating ? '생성 중...' : '📦 박스 생성 + QR 출력'}
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
  // Step 2: 전 공정 QR 스캔 → 박스에 담기
  // ════════════════════════════════════════
  return (
    <div className={s.page}>
      <div className={s.card}>
        {/* 박스 정보 헤더 */}
        <div className={s.boxHeader}>
          <span className={s.boxBadge}>📦 {boxLotNo}</span>
          <span className={s.countBadge}>{items.length}개</span>
        </div>

        {/* QR 스캐너 — 기존 QRScanner 재사용 */}
        <QRScanner
          processLabel={scanLabel}
          showList={false}
          onScan={async (val) => {
            await handleScan(val)
            // QRScanner 내부에서 에러 안 던지면 성공 처리
            return { prev_lot_no: val, quantity: 1 }
          }}
          onLogout={onLogout}
          onBack={handleReset}
        />

        {/* 담긴 아이템 리스트 */}
        {items.length > 0 ? (
          <div className={s.list}>
            <p className={s.listTitle}>{itemLabel}</p>
            {items.map((item, i) => (
              <div key={item.lot_no} className={s.listItem}>
                <div>
                  <span className={s.itemNo}>
                    {i + 1}. {item.lot_no}
                  </span>
                  {item.st_serial && <span className={s.stTag}>ST: {item.st_serial}</span>}
                </div>
                <button className={s.removeBtn} onClick={() => handleRemove(item.lot_no)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className={s.empty}>아이템을 스캔하세요</p>
        )}

        {error && <p className={s.error}>{error}</p>}

        <button className={s.resetBtn} onClick={handleReset}>
          새 박스 시작
        </button>
      </div>
    </div>
  )
}
