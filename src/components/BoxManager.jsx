// src/components/BoxManager.jsx
// ★ 박스(UB/MB) 공용 컴포넌트
// 호출: UBPage.jsx, MBPage.jsx
//
// 흐름:
//   main(hasBox=false) → QRScanner 풀스크린
//   main(hasBox=true)  → CompactScanner + 리스트
//   create → 작업자 + 수량 → QR 출력 → main 복귀
//   confirm → ConfirmModal → DB 저장

import { useState, useEffect, useCallback, useRef } from 'react'
import { createBox, scanBox, scanLot, confirmBox } from '@/api'
import QRScanner from '@/components/QRScanner'
import CompactScanner from '@/components/CompactScanner'
import { ConfirmModal } from '@/components/ConfirmModal'
import PageTransition from '@/components/PageTransition'
import s from './BoxManager.module.css'

const PHI = {
  87: { max: 1, label: 'Φ87', color: '#FF69B4' },
  70: { max: 1, label: 'Φ70', color: '#FFB07C' },
  45: { max: 3, label: 'Φ45', color: '#F0D000' },
  20: { max: 5, label: 'Φ20', color: '#77DD77' },
}

export default function BoxManager({ process, processLabel, scanLabel, onLogout, onBack }) {
  const [step, setStep] = useState('main')
  const [hasBox, setHasBox] = useState(false)

  // create
  const [worker, setWorker] = useState('')
  const [printCount, setPrintCount] = useState('1')
  const [creating, setCreating] = useState(false)
  const [createDone, setCreateDone] = useState(null)

  // boxes
  const [boxes, setBoxes] = useState({})
  const [activeBoxId, setActiveBoxId] = useState(null)

  // flash
  const [flash, setFlash] = useState(null)

  // MB modal
  const [detailUb, setDetailUb] = useState(null)

  // confirm
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  const listRef = useRef(null)

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

  const triggerFlash = () => {
    setFlash('success')
    setTimeout(() => setFlash(null), 400)
  }

  const scrollToBottom = () => {
    setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    }, 100)
  }

  // ═══ 첫 박스 스캔 (QRScanner에서 호출) ═══
  const handleFirstScan = async (val) => {
    if (!val.toUpperCase().startsWith(process + '-')) {
      throw new Error(`${process} 박스 QR을 먼저 스캔하세요.`)
    }
    const r = await scanBox(val)
    setBoxes({ [r.box_lot_no]: buildBoxData(r) })
    setActiveBoxId(r.box_lot_no)
    setHasBox(true)
  }

  // ═══ 워크스페이스 스캔 (CompactScanner에서 호출) ═══
  const handleWorkspaceScan = useCallback(
    async (val) => {
      const upper = val.toUpperCase()

      if (process === 'UB') {
        if (upper.startsWith('UB-')) {
          if (boxes[val]) {
            setActiveBoxId(val)
            triggerFlash()
            return
          }
          const r = await scanBox(val)
          setBoxes((prev) => ({ ...prev, [r.box_lot_no]: buildBoxData(r) }))
          setActiveBoxId(r.box_lot_no)
          triggerFlash()
          return
        }
        if (!activeBoxId) throw new Error('먼저 박스를 선택하세요')
        const r = await scanLot('UB', val)
        addProductToBox(activeBoxId, { lot_no: val, quantity: r.quantity, spec: r.spec || '' })
        triggerFlash()
        scrollToBottom()
        return
      }

      if (process === 'MB') {
        if (upper.startsWith('UB-')) {
          const mbId = Object.keys(boxes)[0]
          if (boxes[mbId]?.ubBoxes?.find((ub) => ub.lot_no === val))
            throw new Error('이미 추가된 UB 박스입니다.')
          const r = await scanBox(val)
          addUbToMb(val, r)
          triggerFlash()
          scrollToBottom()
          return
        }
        throw new Error('UB 박스 QR만 스캔 가능합니다.')
      }
    },
    [process, boxes, activeBoxId],
  )

  // ═══ create ═══
  const handleCreate = async () => {
    if (!worker.trim()) return setError('작업자를 입력하세요')
    const count = parseInt(printCount) || 1
    setCreating(true)
    try {
      const r = await createBox(process, worker.trim(), count)
      setCreateDone(r.lot_nums)
      setTimeout(() => {
        setCreateDone(null)
        setStep('main')
      }, 2000)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  // ═══ UB 담기/빼기 ═══
  const addProductToBox = (boxId, product) => {
    setBoxes((prev) => {
      const box = prev[boxId]
      if (!box) throw new Error('박스를 찾을 수 없습니다.')
      const spec = product.spec
      const phiInfo = PHI[spec]
      if (!phiInfo) throw new Error(`알 수 없는 파이: ${spec}`)
      if (box.phi && box.phi !== spec)
        throw new Error(`이 박스는 ${PHI[box.phi].label} 전용입니다. (스캔: ${phiInfo.label})`)
      if (box.items.length >= phiInfo.max)
        throw new Error(`${phiInfo.label} 최대 ${phiInfo.max}개까지 가능합니다.`)
      if (box.items.find((i) => i.lot_no === product.lot_no))
        throw new Error('이미 담긴 제품입니다.')
      return { ...prev, [boxId]: { ...box, phi: spec, items: [...box.items, product] } }
    })
  }

  const removeProduct = (boxId, itemLotNo) => {
    setBoxes((prev) => {
      const box = prev[boxId]
      const next = box.items.filter((i) => i.lot_no !== itemLotNo)
      return { ...prev, [boxId]: { ...box, phi: next.length > 0 ? box.phi : null, items: next } }
    })
  }

  // ═══ MB UB 추가/빼기 ═══
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

  const buildBoxData = (r) => {
    if (process === 'UB') {
      const existing = (r.items || []).map((i) => ({
        lot_no: i.lot_no,
        quantity: 1,
        spec: i.spec || '',
      }))
      return { lot_no: r.box_lot_no, phi: existing[0]?.spec || null, items: existing }
    }
    return { lot_no: r.box_lot_no, ubBoxes: [] }
  }

  // ═══ 확정 ═══
  const handleConfirm = async () => {
    setConfirming(true)
    try {
      if (process === 'UB') {
        for (const [boxId, box] of Object.entries(boxes)) {
          if (box.items.length === 0) continue
          await confirmBox(
            boxId,
            box.items.map((i) => ({ lot_no: i.lot_no, quantity: i.quantity })),
          )
        }
      } else {
        const mbId = Object.keys(boxes)[0]
        const mb = boxes[mbId]
        if (mb.ubBoxes.length > 0)
          await confirmBox(
            mbId,
            mb.ubBoxes.map((ub) => ({ lot_no: ub.lot_no, quantity: ub.quantity || 1 })),
          )
      }
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setConfirming(false)
    }
  }

  const handleFullReset = () => {
    setStep('main')
    setHasBox(false)
    setBoxes({})
    setActiveBoxId(null)
    setDetailUb(null)
    setWorker('')
    setPrintCount('1')
    setCreateDone(null)
    setConfirming(false)
    setDone(false)
    setError(null)
    setFlash(null)
  }

  const activeBox = activeBoxId ? boxes[activeBoxId] : null
  const boxList = Object.values(boxes)
  const totalItems =
    process === 'UB'
      ? boxList.reduce((sum, b) => sum + b.items.length, 0)
      : boxList[0]?.ubBoxes?.length || 0

  // ═══ create ═══
  if (step === 'create') {
    return (
      <PageTransition pageKey="create">
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
            <button className={s.textBtn} onClick={() => setStep('main')}>
              ← 뒤로
            </button>
          </div>
        </div>
      </PageTransition>
    )
  }

  // ═══ confirm ═══
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
        onCancel={() => setStep('main')}
      />
    )
  }

  // ═══ main: hasBox 전 → QRScanner / hasBox 후 → CompactScanner + 리스트 ═══
  if (!hasBox) {
    return (
      <PageTransition pageKey="box-scan">
        <QRScanner
          key="box_scan"
          processLabel={`${processLabel} — 박스 QR 스캔`}
          showList={false}
          onScan={handleFirstScan}
          onLogout={onLogout}
          onBack={onBack}
        />
        <button className={s.floatingCreate} onClick={() => setStep('create')}>
          + 새 박스 생성
        </button>
      </PageTransition>
    )
  }

  // ═══ main: 워크스페이스 ═══
  return (
    <PageTransition pageKey="workspace">
      <div className={`${s.workspace} ${flash ? s.flash : ''}`}>
        {/* 상단: CompactScanner */}
        <div className={s.scannerArea}>
          <CompactScanner
            onScan={handleWorkspaceScan}
            placeholder={process === 'UB' ? 'UB 박스 or OQ 제품' : 'UB 박스 스캔'}
          />
        </div>

        {/* 중단: 리스트 */}
        <div ref={listRef} className={s.listArea}>
          {process === 'UB' && (
            <>
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
                    <p className={s.emptyMsg}>제품을 스캔하면 여기에 표시됩니다</p>
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

          {process === 'MB' && (
            <>
              <div className={s.mbHeader}>📦 {boxList[0]?.lot_no}</div>
              {(boxList[0]?.ubBoxes || []).length === 0 ? (
                <p className={s.emptyMsg}>UB 박스를 스캔하면 여기에 표시됩니다</p>
              ) : (
                (boxList[0]?.ubBoxes || []).map((ub) => (
                  <div key={ub.lot_no} className={s.ubRow}>
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

              {detailUb && (
                <div className={s.overlay} onClick={() => setDetailUb(null)}>
                  <div className={s.modal} onClick={(e) => e.stopPropagation()}>
                    <p className={s.modalTitle}>📦 {detailUb.lot_no} 내용물</p>
                    {detailUb.items?.length === 0 ? (
                      <p className={s.emptyMsg}>빈 박스</p>
                    ) : (
                      detailUb.items?.map((item, i) => (
                        <div key={item.lot_no || i} className={s.modalItem}>
                          {i + 1}. {item.lot_no}
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

        {/* 하단 */}
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
    </PageTransition>
  )
}
