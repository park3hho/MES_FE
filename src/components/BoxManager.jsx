// src/components/BoxManager.jsx
// ★ 박스(UB/MB) "컨테이너 우선" 공용 컴포넌트
// 호출: UBPage.jsx, MBPage.jsx
// 흐름: Step1 박스 생성(QR출력) → Step2 박스 QR 스캔 → Step3 아이템 담기
//
// props:
//   process      — "UB" | "MB"
//   processLabel — 타이틀 (예: "UB 소포장")
//   scanLabel    — 아이템 스캐너 안내문 (예: "OQ 제품 스캔")
//   itemLabel    — 리스트 제목 (예: "담긴 아이템")
//   onLogout, onBack

import { useState, useEffect } from 'react'
import { createBox, scanBox, addBoxItem, removeBoxItem } from '@/api'
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
  // 'create'    → 새 박스 생성 or 기존 박스 스캔 선택
  // 'box_scan'  → 박스 QR 스캔 (어떤 박스에 담을지)
  // 'item_scan' → 아이템 스캔 (박스에 물건 담기)
  const [step, setStep] = useState('create')

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 2500)
    return () => clearTimeout(t)
  }, [error])

  // ════════════════════════════════════════
  // Step 1 핸들러: 박스 생성
  // ════════════════════════════════════════

  // 호출: "박스 생성 + QR 출력" 버튼
  // 역할: 서버에 빈 박스 생성 요청 → QR 프린터 출력 → 박스 스캔 단계로
  const handleCreateBox = async () => {
    if (!worker.trim()) return setError('작업자를 입력하세요')
    setCreating(true)
    try {
      await createBox(process, worker.trim())
      // QR이 프린터에서 나옴 → 다음은 그 QR을 스캔
      setStep('box_scan')
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  // ════════════════════════════════════════
  // Step 2 핸들러: 박스 QR 스캔
  // ════════════════════════════════════════

  // 호출: QRScanner의 onScan (박스 QR을 스캔했을 때)
  // 역할: 서버에서 박스 존재 확인 + 기존 내용물 로드 → 아이템 스캔 단계로
  const handleBoxScan = async (val) => {
    try {
      const r = await scanBox(val)
      setBoxLotNo(r.box_lot_no)
      // 기존에 담긴 아이템이 있으면 복원 (이어서 담기)
      setItems(
        r.items.map((i) => ({
          lot_no: i.lot_no,
          quantity: i.quantity || 0,
          st_serial: i.st_serial_no || null,
        })),
      )
      setStep('item_scan')
    } catch (e) {
      setError(e.message)
    }
  }

  // ════════════════════════════════════════
  // Step 3 핸들러: 아이템 담기 / 빼기
  // ════════════════════════════════════════

  // 호출: QRScanner의 onScan (아이템 QR을 스캔했을 때)
  // 역할: 전 공정 LOT를 박스에 추가 + UB면 ST 라벨 출력
  const handleItemScan = async (val) => {
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

  // 전체 리셋 (처음으로)
  const handleFullReset = () => {
    setBoxLotNo(null)
    setItems([])
    setWorker('')
    setError(null)
    setStep('create')
  }

  // ════════════════════════════════════════
  // Step 1: 새 박스 생성 / 기존 박스 스캔 선택
  // ════════════════════════════════════════
  if (step === 'create') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <p className={s.title}>{processLabel}</p>
          <p className={s.sub}>새 박스를 만들거나, 기존 박스를 스캔하세요</p>

          {/* 새 박스 생성 영역 */}
          <input
            className={s.input}
            placeholder="작업자 코드 (예: A)"
            value={worker}
            onChange={(e) => setWorker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateBox()}
            autoFocus
          />

          <button className={s.createBtn} onClick={handleCreateBox} disabled={creating}>
            {creating ? '생성 중...' : '📦 새 박스 생성 + QR 출력'}
          </button>

          {/* 구분선 */}
          <div className={s.divider}>
            <span className={s.dividerText}>또는</span>
          </div>

          {/* 기존 박스 스캔 버튼 */}
          <button className={s.scanBoxBtn} onClick={() => setStep('box_scan')}>
            기존 박스 QR 스캔 →
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
  // Step 2: 박스 QR 스캔
  // ════════════════════════════════════════
  if (step === 'box_scan') {
    return (
      <QRScanner
        key="box_scan"
        processLabel={`${processLabel} — 박스 QR 스캔`}
        showList={false}
        onScan={async (val) => {
          await handleBoxScan(val)
          return { prev_lot_no: val, quantity: 0 }
        }}
        onLogout={onLogout}
        onBack={() => setStep('create')}
      />
    )
  }

  // ════════════════════════════════════════
  // Step 3: 아이템 스캔 → 박스에 담기
  // ════════════════════════════════════════
  return (
    <div className={s.page}>
      <div className={s.card}>
        {/* 박스 정보 헤더 */}
        <div className={s.boxHeader}>
          <span className={s.boxBadge}>📦 {boxLotNo}</span>
          <span className={s.countBadge}>{items.length}개</span>
        </div>

        {/* 아이템 QR 스캐너 */}
        <QRScanner
          key="item_scan"
          processLabel={scanLabel}
          showList={false}
          onScan={async (val) => {
            await handleItemScan(val)
            return { prev_lot_no: val, quantity: 1 }
          }}
          onLogout={onLogout}
          onBack={() => {
            // 박스 선택 해제 → 처음으로
            setBoxLotNo(null)
            setItems([])
            setStep('create')
          }}
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

        {/* 다른 박스로 전환 or 새 박스 */}
        <button className={s.resetBtn} onClick={handleFullReset}>
          다른 박스 선택 / 새 박스
        </button>
      </div>
    </div>
  )
}
