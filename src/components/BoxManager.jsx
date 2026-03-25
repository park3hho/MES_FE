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
import { createBox, scanBox, scanLot, addBoxItem, removeBoxItem } from '@/api'
import QRScanner from '@/components/QRScanner'
import CompactScanner from '@/components/CompactScanner'
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
  const [error, setError] = useState(null)

  const listRef = useRef(null)

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 2500)
    return () => clearTimeout(t)
  }, [error])

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
    const boxData = buildBoxData(r)

    // ★ MB: 기존에 담긴 UB들의 상세 내용물 조회
    if (process === 'MB' && boxData.ubBoxes.length > 0) {
      const detailed = await Promise.all(
        boxData.ubBoxes.map(async (ub) => {
          try {
            const ubDetail = await scanBox(ub.lot_no)
            return {
              lot_no: ub.lot_no,
              items: ubDetail.items || [],
              quantity: ubDetail.quantity || 0,
            }
          } catch {
            return ub // 조회 실패 시 빈 상태 유지
          }
        }),
      )
      boxData.ubBoxes = detailed
    }

    setBoxes({ [r.box_lot_no]: boxData })
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
        // OQ 제품 → 프론트 검증 먼저, 서버 저장 후 로컬 반영
        if (!activeBoxId) throw new Error('먼저 박스를 선택하세요')
        const box = boxes[activeBoxId]
        // 프론트 사전 검증 (서버 호출 전에 빠르게 차단)
        const scanR = await scanLot('UB', val)
        const spec = scanR.spec || ''
        const phiInfo = PHI[spec]
        if (!phiInfo) throw new Error(`알 수 없는 파이: ${spec}`)
        if (box.phi && box.phi !== spec)
          throw new Error(`이 박스는 ${PHI[box.phi].label} 전용입니다. (스캔: ${phiInfo.label})`)
        if (box.items.length >= phiInfo.max)
          throw new Error(`${phiInfo.label} 최대 ${phiInfo.max}개까지 가능합니다.`)
        if (box.items.find((i) => i.lot_no === val)) throw new Error('이미 담긴 제품입니다.')

        // 서버 저장
        const r = await addBoxItem(activeBoxId, val)
        // 로컬 반영
        setBoxes((prev) => ({
          ...prev,
          [activeBoxId]: {
            ...prev[activeBoxId],
            phi: spec,
            items: [
              ...prev[activeBoxId].items,
              { lot_no: r.item_lot_no, quantity: r.quantity, spec: r.spec || spec },
            ],
          },
        }))
        triggerFlash()
        scrollToBottom()
        return
      }

      if (process === 'MB') {
        if (upper.startsWith('UB-')) {
          const mbId = Object.keys(boxes)[0]
          if (boxes[mbId]?.ubBoxes?.find((ub) => ub.lot_no === val))
            throw new Error('이미 추가된 UB 박스입니다.')
          // 서버 저장
          await addBoxItem(mbId, val)
          // UB 내용물 조회
          const ubDetail = await scanBox(val)
          // 로컬 반영
          setBoxes((prev) => {
            const mb = prev[mbId]
            return {
              ...prev,
              [mbId]: {
                ...mb,
                ubBoxes: [
                  ...mb.ubBoxes,
                  {
                    lot_no: val,
                    items: ubDetail.items || [],
                    quantity: ubDetail.quantity || 0,
                  },
                ],
              },
            }
          })
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

  const handleRemoveProduct = async (boxId, itemLotNo) => {
    try {
      await removeBoxItem(boxId, itemLotNo)
      setBoxes((prev) => {
        const box = prev[boxId]
        const next = box.items.filter((i) => i.lot_no !== itemLotNo)
        return { ...prev, [boxId]: { ...box, phi: next.length > 0 ? box.phi : null, items: next } }
      })
    } catch (e) {
      setError(e.message)
    }
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

  // 변경 후:
  const handleRemoveUb = async (ubLotNo) => {
    try {
      const mbId = Object.keys(boxes)[0]
      await removeBoxItem(mbId, ubLotNo)
      setBoxes((prev) => {
        const mb = prev[mbId]
        return {
          ...prev,
          [mbId]: { ...mb, ubBoxes: mb.ubBoxes.filter((ub) => ub.lot_no !== ubLotNo) },
        }
      })
    } catch (e) {
      setError(e.message)
    }
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
    // ★ MB: 기존 UB 내용물을 빈 상태로 먼저 세팅 (상세는 아래서 채움)
    const ubStubs = (r.items || []).map((i) => ({
      lot_no: i.lot_no,
      items: [],
      quantity: 0,
    }))
    return { lot_no: r.box_lot_no, ubBoxes: ubStubs }
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
    setError(null)
    setFlash(null)
  }

  const activeBox = activeBoxId ? boxes[activeBoxId] : null
  const boxList = Object.values(boxes)

  // ═══ create ═══
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
          <button className={s.textBtn} onClick={() => setStep('main')}>
            ← 뒤로
          </button>
        </div>
      </div>
    )
  }

  // ═══ main: hasBox 전 → QRScanner / hasBox 후 → CompactScanner + 리스트 ═══
  if (!hasBox) {
    return (
      <div className="page-transition-wrap" key="box-scan">
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
      </div>
    )
  }

  // ═══ main: 워크스페이스 ═══
  return (
    <div className={`${s.workspace} ${flash ? s.flash : ''} page-transition-wrap`} key="workspace">
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
                    <span className={s.phiBadge} style={{ background: PHI[activeBox.phi]?.color }}>
                      {PHI[activeBox.phi]?.label} {activeBox.items.length}/{PHI[activeBox.phi]?.max}
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
                        onClick={() => handleRemoveProduct(activeBoxId, item.lot_no)}
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
                  <button className={s.removeBtn} onClick={() => handleRemoveUb(ub.lot_no)}>
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
        <p className={s.savedMsg}>✓ 변경사항은 자동 저장됩니다</p>
        <button className={s.textBtn} onClick={handleFullReset}>
          처음으로
        </button>
      </div>
    </div>
  )
}
