// pages/process/produce/ActAssemblyPage.jsx
// 액추에이터 조립 (2026-08-26) — 고정자 + 회전자 + 감속기 + PCBA 를 스캔해 ACT LOT 1건을 뽑는다.
//
// ★ 왜 별도 화면인가: 액추에이터는 '번호를 발급하는 것'이 아니라 **네 개를 합치는 작업**이다.
//   재고 화면에서 Φ·수량만으로 뽑던 방식은 무엇으로 만들었는지가 기록에 남지 않았다.
//   그래서 BE 가 ACT 의 bulk 발급 자체를 막고(422), 발급 경로를 이 화면 하나로 모았다.
// ★ 스캔 순서는 상관없다 — 번호 접두어(ST/RT/GR/PB)로 서버가 슬롯을 판별한다.
//   같은 슬롯을 두 번 찍으면 덮어쓰지 않고 물어본다(먼저 찍은 게 조용히 사라지면 잘못된 조립이 남는다).
// ★ Φ 는 고정자가 정한다 — 서버 규칙과 동일. 화면은 나머지 구성품의 Φ 가 다르면 경고만 하고
//   막지는 않는다(판단은 현장이 한다).
import { useState, useEffect, useCallback } from 'react'

import { lookupActuatorComponent, assembleActuator, getProductStockKinds } from '@/api'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { ItemPicker } from '@/components/Inventory/ProductStockSection'
import { useToast } from '@/contexts/ToastContext'

import s from './ActAssemblyPage.module.css'

// 슬롯 정의 — BE actuator_assembly_service.SLOTS 와 **키·접두어가 같아야 한다**.
//   서버가 slot 키를 그대로 내려주므로 여기 키가 다르면 스캔 결과가 어느 칸에도 안 들어간다.
const SLOTS = [
  { key: 'stator_serial', prefix: 'ST', label: '고정자', hint: '시리얼 (ST…)' },
  { key: 'rotor_lot', prefix: 'RT', label: '회전자', hint: 'LOT (RT…)' },
  { key: 'gear_lot', prefix: 'GR', label: '감속기', hint: 'LOT (GR…)' },
  { key: 'pcb_lot', prefix: 'PB', label: 'PCBA', hint: 'LOT (PB…)' },
]
// 마지막에 고른 품목 — 같은 품목을 연속 조립하는 게 보통이라 매번 검색시키지 않는다.
const LAST_ITEM_KEY = 'actAssemblyLastItem'

const readLastItem = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_ITEM_KEY))
    return raw && raw.id ? raw : null
  } catch {
    return null
  }
}

export default function ActAssemblyPage({ onLogout, onBack }) {
  const toast = useToast()
  const [slots, setSlots] = useState({})        // { [slotKey]: {code, phi, motor_type} }
  const [item, setItem] = useState(readLastItem)
  const [memo, setMemo] = useState('')
  const [categoryId, setCategoryId] = useState(null)   // ACT 품목 분류 (DB 설정값)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)    // 발급 완료 결과
  const [error, setError] = useState('')

  // ACT 의 품목 분류는 서버 설정 — 코드에 박으면 분류를 바꾸는 순간 후보가 조용히 0건이 된다.
  useEffect(() => {
    let alive = true
    getProductStockKinds()
      .then((r) => {
        if (!alive) return
        const act = (r.kinds || []).find((k) => k.kind === 'ACT')
        setCategoryId(act?.category_id ?? null)
      })
      .catch(() => { /* 분류를 못 받으면 후보를 좁히지 않을 뿐, 조립은 계속된다 */ })
    return () => { alive = false }
  }, [])

  const filled = SLOTS.filter((sl) => slots[sl.key])
  const ready = filled.length === SLOTS.length && !!item

  // Φ 는 고정자 기준. 나머지 중 Φ 가 다른 게 있으면 경고(서버는 막지 않는다).
  const statorPhi = slots.stator_serial?.phi || ''
  const phiMismatch = SLOTS
    .filter((sl) => sl.key !== 'stator_serial')
    .filter((sl) => slots[sl.key]?.phi && statorPhi && slots[sl.key].phi !== statorPhi)
    .map((sl) => sl.label)

  const handleScan = useCallback(async (raw) => {
    const code = (raw || '').trim().toUpperCase()
    if (!code || busy) return
    setError('')
    // 같은 코드 재스캔은 조용히 무시 — 카메라가 한 장을 두 번 읽는 일이 잦다
    if (Object.values(slots).some((v) => v.code === code)) return
    setBusy(true)
    try {
      // 품목을 이미 알고 있으면(직전 조립 기억) BOM 대조까지 이 시점에 받는다 —
      //   네 개를 다 찍고 발급에서 튕기는 것보다, 찍는 순간 아는 게 낫다.
      const r = await lookupActuatorComponent(code, item?.id || null)
      const label = SLOTS.find((sl) => sl.key === r.slot)?.label || r.label
      // 이미 찬 슬롯은 덮어쓰지 않는다 — 먼저 찍은 것이 사라지면 잘못된 조립 기록이 남는다.
      if (slots[r.slot]) {
        setError(`${label} 는 이미 ${slots[r.slot].code} 가 들어 있습니다. 바꾸려면 ✕ 로 비우고 다시 찍으세요.`)
        return
      }
      setSlots((p) => ({
        ...p,
        [r.slot]: {
          code: r.code, phi: r.phi || '', motor_type: r.motor_type || '',
          bomOk: r.bom_ok !== false, bomNote: r.bom_note || '',
        },
      }))
      if (r.bom_ok === false) {
        setError(r.bom_note || `${label} 가 BOM 구성이 아닙니다.`)
      } else {
        toast(`${label} ${r.code}`, 'success')
      }
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setBusy(false)
    }
  }, [slots, busy, toast, item])

  // 품목을 바꾸면 이전 스캔의 BOM 판정은 낡은 값이다 — 표시를 '미확인'으로 되돌리고
  //   최종 판정은 서버(assemble)에 맡긴다. 낡은 초록 표시를 남겨두는 게 가장 나쁘다.
  const pickItem = (next) => {
    setItem(next)
    setError('')
    setSlots((p) => Object.fromEntries(
      Object.entries(p).map(([k, v]) => [k, { ...v, bomOk: undefined, bomNote: '' }]),
    ))
  }

  const clearSlot = (key) => {
    setError('')
    setSlots((p) => {
      const next = { ...p }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      const codes = SLOTS.map((sl) => slots[sl.key].code)
      const r = await assembleActuator({ codes, itemId: item.id, memo: memo.trim() })
      setResult(r)
      try { localStorage.setItem(LAST_ITEM_KEY, JSON.stringify(item)) } catch { /* */ }
      if (r.print_error) toast('발급됐지만 라벨 인쇄에 실패했어요 — 재고 화면에서 재출력하세요.', 'warn')
      // 품목 미연결이라 BOM 대조를 건너뛴 구성품이 있으면 알려준다 (막지는 않았다)
      if (r.bom_warnings?.length) toast(`BOM 대조 생략 ${r.bom_warnings.length}건 — 품목 미연결 구성품`, 'warn')
    } catch (e) {
      setError(e.message || '발급 실패')
    } finally {
      setBusy(false)
    }
  }

  // 다음 조립 — 품목은 유지한다(같은 품목을 연달아 만드는 게 보통).
  const nextOne = () => {
    setSlots({})
    setMemo('')
    setResult(null)
    setError('')
  }

  // ── 발급 완료 ────────────────────────────────
  if (result) {
    return (
      <div className="page-flat">
        <PageHeader title="액추에이터 조립" subtitle="발급 완료" onBack={onBack} onLogout={onLogout} />
        <div className={s.doneWrap}>
          <p className={s.doneLot}>{result.lot_no}</p>
          <p className={s.doneSub}>
            Φ{result.phi} · {item?.part_no}
            {result.print_error ? ' · 라벨 인쇄 실패' : ' · 라벨 1장 출력'}
          </p>
          <div className={s.doneList}>
            {SLOTS.map((sl) => (
              <div key={sl.key} className={s.doneRow}>
                <span className={s.doneRowLab}>{sl.label}</span>
                <span className={s.doneRowVal}>{result.components?.[sl.key] || slots[sl.key]?.code || '—'}</span>
              </div>
            ))}
          </div>
          <button type="button" className="btn-primary btn-lg btn-full" onClick={nextOne}>
            다음 조립
          </button>
        </div>
      </div>
    )
  }

  // ── 스캔 배너 (카메라 위에 겹쳐 현황 표시) ────
  const banner = (
    <div className={s.banner}>
      {SLOTS.map((sl) => {
        const v = slots[sl.key]
        return (
          <div key={sl.key} className={`${s.chip} ${v ? s.chipOn : ''}`}>
            <span className={s.chipLab}>{sl.label}</span>
            <span className={s.chipVal}>{v ? v.code : '대기'}</span>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="page-flat">
      {filled.length < SLOTS.length ? (
        <QRScanner
          processLabel={`액추에이터 조립 (${filled.length}/${SLOTS.length})`}
          onScan={handleScan}
          continuousScan
          banner={
            <>
              {banner}
              {error && <p className={s.errBar}>⚠ {error}</p>}
            </>
          }
          onBack={onBack}
          onLogout={onLogout}
        />
      ) : (
        <>
          <PageHeader
            title="액추에이터 조립"
            subtitle="4종 스캔 완료 — 품목을 지정하고 발급하세요"
            onBack={onBack}
            onLogout={onLogout}
          />

          {error && <p className={s.err}>⚠ {error}</p>}
          {phiMismatch.length > 0 && (
            <p className={s.warn}>
              ⚠ 고정자는 Φ{statorPhi} 인데 {phiMismatch.join('·')} 의 Φ 가 다릅니다.
              LOT 번호는 고정자 기준(Φ{statorPhi})으로 발급됩니다.
            </p>
          )}

          <div className={s.slotList}>
            {SLOTS.map((sl) => {
              const v = slots[sl.key]
              return (
                <div key={sl.key} className={`${s.slot} ${v.bomOk === false ? s.slotBad : ''}`}>
                  <span className={s.slotLab}>{sl.label}</span>
                  <span className={s.slotCode}>{v.code}</span>
                  {v.bomOk === false && <span className={s.slotBadge}>BOM 불일치</span>}
                  {v.phi && <span className={s.slotPhi}>Φ{v.phi}</span>}
                  <button type="button" className={s.slotDel}
                    title="이 칸 비우고 다시 스캔" onClick={() => clearSlot(sl.key)}>✕</button>
                </div>
              )
            })}
          </div>

          <div className={s.field}>
            <span className={s.fLab}>품목</span>
            <ItemPicker value={item} categoryId={categoryId} onPick={pickItem} />
          </div>

          <div className={s.field}>
            <span className={s.fLab}>메모 (선택)</span>
            <input className={s.fInput} value={memo} maxLength={100}
              placeholder="특이사항이 있으면 적어주세요"
              onChange={(e) => setMemo(e.target.value)} />
          </div>

          <button type="button" className="btn-primary btn-lg btn-full"
            disabled={!ready || busy} onClick={submit}>
            {busy ? '발급 중…' : ready ? '조립 발급 · 라벨 출력' : '품목을 선택해주세요'}
          </button>
        </>
      )}
    </div>
  )
}
