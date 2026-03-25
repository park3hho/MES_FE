// src/components/BoxManager.jsx
// ★ 박스(UB/MB) 공용 컴포넌트
// 호출: UBPage.jsx (process="UB"), MBPage.jsx (process="MB")
//
// 흐름:
//   box_scan  → QRScanner 풀스크린 — 박스 QR 첫 스캔
//   create    → 작업자 + 수량 → QR 출력 → box_scan 복귀
//   workspace → CompactScanner + 박스 관리 UI
//     UB: 멀티박스 탭 + 파이별 제품 담기
//     MB: UB 리스트 + 탭하면 내용물 보기 (읽기전용)
//   confirm   → ConfirmModal → DB 저장

import { useState, useEffect, useCallback } from 'react'
import { createBox, scanBox, scanLot, confirmBox } from '@/api'
import QRScanner from '@/components/QRScanner'
import CompactScanner from '@/components/CompactScanner'
import { ConfirmModal } from '@/components/ConfirmModal'
import s from './BoxManager.module.css'

// ────────────────────────────────────────
// 파이 스펙: 박스당 최대 수량 + 라벨 + 색상
// ────────────────────────────────────────
const PHI = {
  87: { max: 1, label: 'Φ87', color: '#FF69B4' },
  70: { max: 1, label: 'Φ70', color: '#FFB07C' },
  45: { max: 3, label: 'Φ45', color: '#F0D000' },
  20: { max: 5, label: 'Φ20', color: '#77DD77' },
}

export default function BoxManager({
  process, // "UB" | "MB"
  processLabel, // "UB 소포장" | "MB 대포장"
  scanLabel, // "OQ 제품 스캔" | "UB 박스 담기"
  onLogout,
  onBack,
}) {
  // ── step 관리 ──
  const [step, setStep] = useState('box_scan')

  // ── create 폼 ──
  const [worker, setWorker] = useState('')
  const [printCount, setPrintCount] = useState('1')
  const [creating, setCreating] = useState(false)
  const [createDone, setCreateDone] = useState(null)

  // ── workspace 공통 ──
  // boxes: { [lot_no]: BoxData }
  //   UB BoxData: { lot_no, phi, items: [{lot_no, quantity, spec}] }
  //   MB BoxData: { lot_no, ubBoxes: [{lot_no, items, quantity}] }
  const [boxes, setBoxes] = useState({})
  const [activeBoxId, setActiveBoxId] = useState(null)

  // ── MB 전용: UB 상세보기 ──
  const [detailUb, setDetailUb] = useState(null)

  // ── confirm ──
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  // ── 에러 자동 소멸 ──
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 2500)
    return () => clearTimeout(t)
  }, [error])

  // ── 확정 완료 → 리셋 ──
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => handleFullReset(), 1500)
    return () => clearTimeout(t)
  }, [done])

  // ════════════════════════════════════════
  // 박스 생성 (create 단계)
  // ════════════════════════════════════════
  const handleCreate = async () => {
    if (!worker.trim()) return setError('작업자를 입력하세요')
    const count = parseInt(printCount) || 1
    setCreating(true)
    try {
      const r = await createBox(process, worker.trim(), count)
      setCreateDone(r.lot_nums)
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
  // 첫 박스 스캔 (box_scan 단계 → workspace 진입)
  // ════════════════════════════════════════
  const handleFirstBoxScan = async (val) => {
    if (!val.toUpperCase().startsWith(process + '-')) {
      throw new Error(`${process} 박스 QR만 스캔 가능합니다.`)
    }
    const r = await scanBox(val)
    const boxData = buildBoxData(r)
    setBoxes({ [r.box_lot_no]: boxData })
    setActiveBoxId(r.box_lot_no)
    setStep('workspace')
  }

  // ════════════════════════════════════════
  // 워크스페이스 스캔 라우터
  // ════════════════════════════════════════
  // CompactScanner의 onScan — 스캔값의 접두사로 분기
  //   UB모드: UB- → 박스 추가/선택, 그 외 → 제품 담기
  //   MB모드: UB- → UB박스 추가, 그 외 → 에러
  const handleWorkspaceScan = useCallback(
    async (val) => {
      const upper = val.toUpperCase()

      // ── UB 모드 ──
      if (process === 'UB') {
        if (upper.startsWith('UB-')) {
          // 이미 스캔한 박스 → 선택만
          if (boxes[val]) {
            setActiveBoxId(val)
            return
          }
          // 새 박스 추가
          const r = await scanBox(val)
          const boxData = buildBoxData(r)
          setBoxes((prev) => ({ ...prev, [r.box_lot_no]: boxData }))
          setActiveBoxId(r.box_lot_no)
          return
        }

        // 제품 스캔 → 활성 박스에 담기
        if (!activeBoxId) throw new Error('먼저 박스를 선택하세요')
        const r = await scanLot('UB', val)
        const spec = r.spec || ''
        addProductToBox(activeBoxId, { lot_no: val, quantity: r.quantity, spec })
        return
      }

      // ── MB 모드 ──
      if (process === 'MB') {
        if (upper.startsWith('UB-')) {
          // UB 박스를 MB에 추가
          if (boxes[Object.keys(boxes)[0]]?.ubBoxes?.find((ub) => ub.lot_no === val)) {
            throw new Error('이미 추가된 UB 박스입니다.')
          }
          const r = await scanBox(val)
          addUbToMb(val, r)
          return
        }
        throw new Error('UB 박스 QR만 스캔 가능합니다.')
      }
    },
    [process, boxes, activeBoxId],
  )

  // ════════════════════════════════════════
  // UB: 제품 담기 (파이 검증 포함)
  // ════════════════════════════════════════
  const addProductToBox = (boxId, product) => {
    setBoxes((prev) => {
      const box = prev[boxId]
      if (!box) throw new Error('박스를 찾을 수 없습니다.')

      const spec = product.spec
      const phiInfo = PHI[spec]
      if (!phiInfo) throw new Error(`알 수 없는 파이: ${spec}`)

      // 한 종류만 담을 수 있음
      if (box.phi && box.phi !== spec) {
        throw new Error(`이 박스는 ${PHI[box.phi].label} 전용입니다. (스캔: ${phiInfo.label})`)
      }

      // 최대 수량 검증
      if (box.items.length >= phiInfo.max) {
        throw new Error(`${phiInfo.label} 최대 ${phiInfo.max}개까지 가능합니다.`)
      }

      // 중복 검증
      if (box.items.find((i) => i.lot_no === product.lot_no)) {
        throw new Error('이미 담긴 제품입니다.')
      }

      return {
        ...prev,
        [boxId]: { ...box, phi: spec, items: [...box.items, product] },
      }
    })
  }

  // ════════════════════════════════════════
  // UB: 제품 제거
  // ════════════════════════════════════════
  const removeProduct = (boxId, itemLotNo) => {
    setBoxes((prev) => {
      const box = prev[boxId]
      const newItems = box.items.filter((i) => i.lot_no !== itemLotNo)
      return {
        ...prev,
        [boxId]: { ...box, phi: newItems.length > 0 ? box.phi : null, items: newItems },
      }
    })
  }

  // ════════════════════════════════════════
  // MB: UB 박스 추가
  // ════════════════════════════════════════
  const addUbToMb = (ubLotNo, scanResult) => {
    setBoxes((prev) => {
      const mbId = Object.keys(prev)[0]
      const mb = prev[mbId]
      return {
        ...prev,
        [mbId]: {
          ...mb,
          ubBoxes: [
            ...mb.ubBoxes,
            {
              lot_no: ubLotNo,
              items: scanResult.items || [],
              quantity: scanResult.quantity || 0,
            },
          ],
        },
      }
    })
  }

  // ════════════════════════════════════════
  // MB: UB 박스 제거
  // ════════════════════════════════════════
  const removeUbFromMb = (ubLotNo) => {
    setBoxes((prev) => {
      const mbId = Object.keys(prev)[0]
      const mb = prev[mbId]
      return {
        ...prev,
        [mbId]: { ...mb, ubBoxes: mb.ubBoxes.filter((ub) => ub.lot_no !== ubLotNo) },
      }
    })
  }

  // ════════════════════════════════════════
  // 서버 응답 → BoxData 변환
  // ════════════════════════════════════════
  const buildBoxData = (scanResult) => {
    if (process === 'UB') {
      // 기존 아이템이 있으면 복원
      const existing = (scanResult.items || []).map((i) => ({
        lot_no: i.lot_no,
        quantity: 1,
        spec: i.spec || '', // TODO: 백엔드에서 spec 반환하도록 수정 필요
      }))
      const phi = existing.length > 0 ? existing[0].spec || null : null
      return { lot_no: scanResult.box_lot_no, phi, items: existing }
    }
    // MB
    return { lot_no: scanResult.box_lot_no, ubBoxes: [] }
  }

  // ════════════════════════════════════════
  // 확정
  // ════════════════════════════════════════
  const handleConfirm = async () => {
    setConfirming(true)
    try {
      if (process === 'UB') {
        // 각 박스별로 confirmBox 호출
        for (const [boxId, box] of Object.entries(boxes)) {
          if (box.items.length === 0) continue
          await confirmBox(
            boxId,
            box.items.map((i) => ({ lot_no: i.lot_no, quantity: i.quantity })),
          )
        }
      } else {
        // MB: MB 박스에 UB 리스트 확정
        const mbId = Object.keys(boxes)[0]
        const mb = boxes[mbId]
        if (mb.ubBoxes.length > 0) {
          await confirmBox(
            mbId,
            mb.ubBoxes.map((ub) => ({ lot_no: ub.lot_no, quantity: ub.quantity || 1 })),
          )
        }
      }
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
    setBoxes({})
    setActiveBoxId(null)
    setDetailUb(null)
    setWorker('')
    setPrintCount('1')
    setCreateDone(null)
    setConfirming(false)
    setDone(false)
    setError(null)
  }

  // ════════════════════════════════════════
  // 편의: 활성 박스 데이터
  // ════════════════════════════════════════
  const activeBox = activeBoxId ? boxes[activeBoxId] : null
  const boxList = Object.values(boxes)
  const totalItems =
    process === 'UB'
      ? boxList.reduce((sum, b) => sum + b.items.length, 0)
      : boxList[0]?.ubBoxes?.length || 0

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════

  // ── box_scan: 풀스크린 QR + 하단 생성 버튼 ──
  if (step === 'box_scan') {
    return (
      <>
        <QRScanner
          key="box_scan"
          processLabel={`${processLabel} — 박스 QR 스캔`}
          showList={false}
          onScan={handleFirstBoxScan}
          onLogout={onLogout}
          onBack={onBack}
        />
        <button className={s.floatingBtn} onClick={() => setStep('create')}>
          + 새 박스 생성
        </button>
      </>
    )
  }

  // ── create: 작업자 + 수량 ──
  if (step === 'create') {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <p className={s.title}>{processLabel} — 박스 생성</p>
          <p className={s.sub}>작업자와 출력 매수를 입력하세요</p>
          <input
            className={s.formInput}
            placeholder="작업자 코드 (예: A)"
            value={worker}
            onChange={(e) => setWorker(e.target.value.toUpperCase())}
            autoFocus
          />
          <input
            className={s.formInput}
            type="number"
            min="1"
            placeholder="출력 매수"
            value={printCount}
            onChange={(e) => setPrintCount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button className={s.primaryBtn} onClick={handleCreate} disabled={creating}>
            {creating ? '출력 중...' : `📦 ${printCount}개 생성 + QR 출력`}
          </button>
          {createDone && (
            <div className={s.success}>
              ✓ {createDone.join(', ')}
              <br />
              QR을 스캔하세요
            </div>
          )}
          {error && <p className={s.error}>{error}</p>}
          <button className={s.textBtn} onClick={() => setStep('box_scan')}>
            ← 뒤로
          </button>
        </div>
      </div>
    )
  }

  // ── workspace: CompactScanner + 박스 관리 ──
  if (step === 'workspace') {
    return (
      <div className={s.workspace}>
        {/* 상단: 소형 스캐너 */}
        <div className={s.scannerArea}>
          <CompactScanner
            onScan={handleWorkspaceScan}
            placeholder={process === 'UB' ? 'UB 박스 or OQ 제품' : 'UB 박스 스캔'}
          />
        </div>

        {/* 중단: 박스 관리 영역 */}
        <div className={s.contentArea}>
          {/* ═══ UB 모드 ═══ */}
          {process === 'UB' && (
            <>
              {/* 박스 탭 (가로 스크롤) */}
              <div className={s.tabScroll}>
                {boxList.map((box) => {
                  const isActive = box.lot_no === activeBoxId
                  const phi = PHI[box.phi]
                  return (
                    <button
                      key={box.lot_no}
                      className={`${s.tab} ${isActive ? s.tabActive : ''}`}
                      style={phi ? { borderColor: phi.color } : {}}
                      onClick={() => setActiveBoxId(box.lot_no)}
                    >
                      <span className={s.tabLot}>{box.lot_no.split('-').slice(1).join('-')}</span>
                      {phi ? (
                        <span className={s.tabPhi} style={{ color: phi.color }}>
                          {phi.label} {box.items.length}/{phi.max}
                        </span>
                      ) : (
                        <span className={s.tabEmpty}>빈 박스</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* 선택된 박스 내용물 */}
              {activeBox && (
                <div className={s.boxContent}>
                  <div className={s.boxHeader}>
                    <span>📦 {activeBoxId}</span>
                    {activeBox.phi && (
                      <span
                        className={s.phiBadge}
                        style={{ background: PHI[activeBox.phi]?.color }}
                      >
                        {PHI[activeBox.phi]?.label} {activeBox.items.length}/
                        {PHI[activeBox.phi]?.max}
                      </span>
                    )}
                  </div>

                  {activeBox.items.length === 0 ? (
                    <p className={s.emptyMsg}>제품을 스캔하세요</p>
                  ) : (
                    activeBox.items.map((item, i) => (
                      <div key={item.lot_no} className={s.itemRow}>
                        <span className={s.itemIdx}>{i + 1}</span>
                        <span className={s.itemLot}>{item.lot_no}</span>
                        <span className={s.itemSpec} style={{ color: PHI[item.spec]?.color }}>
                          {PHI[item.spec]?.label}
                        </span>
                        <button
                          className={s.removeBtn}
                          onClick={() => removeProduct(activeBoxId, item.lot_no)}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}

          {/* ═══ MB 모드 ═══ */}
          {process === 'MB' && (
            <>
              <div className={s.mbHeader}>📦 {boxList[0]?.lot_no}</div>

              {(boxList[0]?.ubBoxes || []).length === 0 ? (
                <p className={s.emptyMsg}>UB 박스를 스캔하세요</p>
              ) : (
                (boxList[0]?.ubBoxes || []).map((ub) => (
                  <div key={ub.lot_no} className={s.ubRow}>
                    {/* 탭하면 상세 보기 */}
                    <button className={s.ubInfo} onClick={() => setDetailUb(ub)}>
                      <span className={s.ubLot}>{ub.lot_no}</span>
                      <span className={s.ubCount}>{ub.items?.length || 0}개 제품</span>
                      <span className={s.ubArrow}>›</span>
                    </button>
                    <button className={s.removeBtn} onClick={() => removeUbFromMb(ub.lot_no)}>
                      ✕
                    </button>
                  </div>
                ))
              )}

              {/* UB 상세 모달 (읽기전용) */}
              {detailUb && (
                <div className={s.modalOverlay} onClick={() => setDetailUb(null)}>
                  <div className={s.modal} onClick={(e) => e.stopPropagation()}>
                    <p className={s.modalTitle}>📦 {detailUb.lot_no} 내용물</p>
                    {detailUb.items?.length === 0 ? (
                      <p className={s.emptyMsg}>빈 박스</p>
                    ) : (
                      detailUb.items?.map((item, i) => (
                        <div key={item.lot_no || i} className={s.modalItem}>
                          <span>
                            {i + 1}. {item.lot_no}
                          </span>
                        </div>
                      ))
                    )}
                    <button className={s.modalClose} onClick={() => setDetailUb(null)}>
                      닫기
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className={s.error}>{error}</p>}
        </div>

        {/* 하단: 확정 + 네비 */}
        <div className={s.bottomBar}>
          <button
            className={s.confirmBtn}
            onClick={() => setStep('confirm')}
            disabled={totalItems === 0}
          >
            전체 확정 ({totalItems}건)
          </button>
          <button className={s.textBtn} onClick={handleFullReset}>
            처음으로
          </button>
        </div>
      </div>
    )
  }

  // ── confirm ──
  if (step === 'confirm') {
    return (
      <ConfirmModal
        lotNo={
          process === 'UB'
            ? `UB ${boxList.length}박스 / ${totalItems}건`
            : `${boxList[0]?.lot_no} / UB ${totalItems}건`
        }
        printCount={totalItems}
        printing={confirming}
        done={done}
        error={error}
        onConfirm={handleConfirm}
        onCancel={() => setStep('workspace')}
      />
    )
  }

  return null
}
