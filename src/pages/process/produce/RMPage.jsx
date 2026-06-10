// pages/process/produce/RMPage.jsx
// RM 원자재 입고 — LOT 통일 + Item 연동 (2026-06-10)
//   COIL/EW/Plate: RmItemWizard — 품목 선택 → 매입처(vendor) → 속성 → 입고일 → 발급
//     LOT = {Item.lot_material_code}-{vendor.code}-{attribute}-{YYMMDD}-{NN} (BE 채번)
//   자석(Magnet): MagnetWizard — 품목 선택 + 상자별 수량 (LOT={part_no}-{YYMMDD}-{seq3})
//   재질·규격 진실의 원천 = Item. LOT 엔 material 코드만 표시(타입 구분자는 QR 전용).
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { printLot, searchWarehouseItems, magnetIncoming } from '@/api'
import {
  WizardShell, Question, BigChoice, PrimaryButton,
} from '@/components/QcWizard'
import { RM_KINDS } from '@/constants/processConst'
import s from './RMPage.module.css'


export default function RMPage({ onLogout, onBack }) {
  const [kind, setKind] = useState(null)   // null=갈래선택, 'steel', 'wire'

  if (!kind) {
    return (
      <div className="page-flat">
        <div className={s.wrap}>
          <h1 className={s.kindTitle}>원자재 입고</h1>
          <p className={s.kindSub}>어떤 원자재인가요?</p>
          <div className={s.kindGrid}>
            {RM_KINDS.map((k) => (
              <button key={k.key} type="button" className={s.kindCard} onClick={() => setKind(k.key)}>
                <span className={s.kindLabel}>{k.label}</span>
                <span className={s.kindDesc}>{k.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (kind === 'magnet') return <MagnetWizard onBack={() => setKind(null)} />
  return <RmItemWizard kind={kind} onBack={() => setKind(null)} />
}


// ════════════════════════════════════════════
// COIL / EW / Plate — Item-linked 통합 wizard (2026-06-10)
//   품목 선택 → 매입처(vendor) 선택 → 속성 → 입고일 → 발급
//   LOT = {Item.lot_material_code}-{vendor.code}-{attribute}-{YYMMDD}-{NN} (BE 채번)
//   재질·규격 진실의 원천 = Item. LOT 엔 material 코드만 표시.
// ════════════════════════════════════════════
function RmItemWizard({ kind, onBack }) {
  const meta = RM_KINDS.find((k) => k.key === kind) || {}
  const today = new Date().toISOString().slice(0, 10)
  const [stepIdx, setStepIdx] = useState(0)
  const [item, setItem] = useState(null)        // {id, part_no, name, spec, lot_material_code, vendors:[]}
  const [vendor, setVendor] = useState(null)    // {vendor_id, code, name, is_default}
  const [attribute, setAttribute] = useState('')
  const [date, setDate] = useState(today)

  const [printing, setPrinting] = useState(false)
  const [doneLot, setDoneLot] = useState(null)
  const [error, setError] = useState(null)

  const sequence = ['item', 'vendor', 'attribute', 'date', 'confirm']
  const total = sequence.length
  const key = sequence[stepIdx]

  const yymmdd = date.slice(2).replace(/-/g, '')
  const material = item?.lot_material_code || ''
  const attr = attribute.trim()
  const vendors = item?.vendors || []
  const valid = !!item && !!material && !!vendor?.code && yymmdd.length === 6
  const preview = valid
    ? [material, vendor.code, ...(attr ? [attr] : []), yymmdd, 'NN'].join('-')
    : ''

  const goNext = () => { if (stepIdx < total - 1) setStepIdx(stepIdx + 1) }
  const goBack = () => { if (stepIdx > 0) setStepIdx(stepIdx - 1); else onBack?.() }

  const pickItem = (it) => {
    setItem(it)
    const def = (it.vendors || []).find((v) => v.is_default) || (it.vendors || [])[0] || null
    setVendor(def)
    setStepIdx(1)
  }
  const pickVendor = (vid) => {
    setVendor(vendors.find((v) => v.vendor_id === vid) || null)
    setStepIdx(2)
  }

  const chips = sequence.slice(0, stepIdx)
    .map((k, i) => {
      const val = {
        item: item?.part_no || '',
        vendor: vendor?.code || '',
        attribute: attr,
        date,
      }[k]
      if (!val) return null
      return {
        key: k,
        label: { item: '품목', vendor: '매입처', attribute: meta.attrLabel || '속성', date: '입고일' }[k],
        value: String(val),
        onClick: () => setStepIdx(i),
      }
    })
    .filter(Boolean)

  const onIssue = async () => {
    if (!valid) { setError('입력을 완료하세요.'); return }
    setPrinting(true); setError(null)
    try {
      const res = await printLot(preview, 1, {
        selected_process: 'RM',
        item_id: item.id,
        vendor_code: vendor.code,
        rm_attribute: attr,
        received_date: yymmdd,
      })
      setDoneLot(res.lot_nums?.[0] || preview)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const onResetAll = () => {
    setDoneLot(null); setError(null); setPrinting(false)
    setItem(null); setVendor(null); setAttribute(''); setDate(today); setStepIdx(0)
  }

  // ── 발급 완료 ──
  if (doneLot) {
    return (
      <div className="page-flat">
        <div className={s.wrap}>
          <div className={s.doneWrap}>
            <div className={s.doneIcon}>✓</div>
            <h2 className={s.doneTitle}>라벨 발급 완료</h2>
            <div className={s.doneCode}>{doneLot}</div>
            <div className={s.actions}>
              <button className="btn-primary btn-md" onClick={onResetAll}>새 발급</button>
              <button className="btn-secondary btn-md" onClick={onBack}>원자재 종류 다시 선택</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-flat">
      <WizardShell stepIndex={stepIdx} total={total} onBack={goBack} chips={chips}>
        <AnimatePresence mode="wait">
          <motion.div key={key}
            initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.16 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </WizardShell>
    </div>
  )

  function renderStep() {
    if (key === 'item') {
      return (
        <Question title={`어떤 ${meta.label || '원자재'}인가요?`} sub="품번 또는 품목명으로 검색하세요">
          <MagnetItemCombo onPick={pickItem} selectedId={item?.id} />
        </Question>
      )
    }

    if (key === 'vendor') {
      if (vendors.length === 0) {
        return (
          <Question title="매입처가 없습니다" sub="품목 관리에서 이 품목의 매입처를 먼저 등록하세요">
            <div className={s.agNote}>
              <b>{item?.part_no}</b> 에 등록된 매입처가 없어 LOT 의 vendor 코드를 정할 수 없습니다.
            </div>
          </Question>
        )
      }
      return (
        <Question title="어느 매입처인가요?" sub="이 입고분을 구매한 곳을 선택하세요">
          <BigChoice
            value={vendor?.vendor_id}
            onPick={pickVendor}
            options={vendors.map((v) => ({
              value: v.vendor_id,
              label: `${v.name} (${v.code})`,
              desc: v.is_default ? '기본 매입처' : '',
            }))}
          />
          {!material && (
            <div className={s.agNote}>
              ⚠ 이 품목에 material 코드가 없습니다 — 품목 관리에서 등록하세요.
            </div>
          )}
        </Question>
      )
    }

    if (key === 'attribute') {
      return (
        <Question
          title={`${meta.attrLabel || '속성'}을(를) 입력하세요`}
          sub={meta.attrHint || '비우면 LOT 에서 생략됩니다'}
          footer={<PrimaryButton onClick={goNext}>다음</PrimaryButton>}
        >
          <input type="text" className={s.directInput}
            placeholder={meta.attrHint || '예: 15'} value={attribute}
            onChange={(e) => setAttribute(e.target.value.trim())} autoFocus />
        </Question>
      )
    }

    if (key === 'date') {
      return (
        <Question
          title="입고일은 언제인가요?"
          footer={<PrimaryButton onClick={goNext} disabled={yymmdd.length !== 6}>다음</PrimaryButton>}
        >
          <input type="date" className={s.directInput} value={date}
            onChange={(e) => setDate(e.target.value)} autoFocus />
          {item?.spec && (
            <div className={s.agNote}>규격 <b>{item.spec}</b></div>
          )}
        </Question>
      )
    }

    // confirm
    return (
      <Question
        title="이대로 발급할까요?"
        footer={<PrimaryButton onClick={onIssue} disabled={printing || !valid}>
          {printing ? '발급 중…' : '라벨 발급'}
        </PrimaryButton>}
      >
        <div className={s.preview}>
          <div className={s.previewLabel}>LOT 미리보기</div>
          <div className={s.previewCode}>{preview || '입력 미완료'}</div>
          <div className={s.previewNote}>
            {item?.spec ? `${item.spec} · ` : ''}NN = 발급 순번 (자동 채번)
          </div>
        </div>
        {!material && (
          <div className={s.err}>이 품목에 material 코드가 없어 발급할 수 없습니다.</div>
        )}
        {error && <div className={s.err}>{error}</div>}
      </Question>
    )
  }
}


// ════════════════════════════════════════════
// 자석 — Item 선택 + 상자별 수량 → LOT N개 + 라벨 N장 (2026-06-09)
//   LOT = {Item.part_no}-{YYMMDD}-{seq3} (같은 품번+같은 날 누적, BE 채번)
//   라벨 = LOT + spec(Item.spec). 위치는 Warehouse 화면에서 따로 지정.
// ════════════════════════════════════════════
function MagnetWizard({ onBack }) {
  const today = new Date().toISOString().slice(0, 10)
  const [stepIdx, setStepIdx] = useState(0)
  const [item, setItem] = useState(null)            // {id, part_no, name, spec, manufacturer}
  const [date, setDate] = useState(today)
  const [boxes, setBoxes] = useState([{ quantity: '' }])

  const [printing, setPrinting] = useState(false)
  const [doneItems, setDoneItems] = useState(null)  // 발급된 [{lot_no, quantity, ...}]
  const [error, setError] = useState(null)

  const sequence = ['item', 'date', 'boxes', 'confirm']
  const total = sequence.length
  const key = sequence[stepIdx]

  const yymmdd = date.slice(2).replace(/-/g, '')
  const validBoxes = boxes.filter((b) => Number(b.quantity) > 0)
  const valid = !!item && yymmdd.length === 6 && validBoxes.length > 0

  const goNext = () => { if (stepIdx < total - 1) setStepIdx(stepIdx + 1) }
  const goBack = () => { if (stepIdx > 0) setStepIdx(stepIdx - 1); else onBack?.() }

  const pickItem = (it) => { setItem(it); setStepIdx(1) }
  const setBoxQty = (i, v) => setBoxes((p) => p.map((b, idx) => (idx === i ? { quantity: v } : b)))
  const addBox = () => setBoxes((p) => [...p, { quantity: '' }])
  const removeBox = (i) => setBoxes((p) => (p.length <= 1 ? p : p.filter((_, idx) => idx !== i)))

  const chips = sequence.slice(0, stepIdx)
    .map((k, i) => {
      const val = { item: item?.part_no || '', date, boxes: validBoxes.length ? `${validBoxes.length}상자` : '' }[k]
      if (!val) return null
      return {
        key: k,
        label: { item: '품목', date: '수입일', boxes: '상자' }[k],
        value: String(val),
        onClick: () => setStepIdx(i),
      }
    })
    .filter(Boolean)

  const onIssue = async () => {
    if (!valid) { setError('입력을 완료하세요.'); return }
    setPrinting(true); setError(null)
    try {
      const res = await magnetIncoming({
        item_id: item.id,
        received_date: yymmdd,
        boxes: validBoxes.map((b) => ({ quantity: Number(b.quantity), unit: 'ea' })),
      })
      setDoneItems(res.items || [])
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const onResetAll = () => {
    setDoneItems(null); setError(null); setPrinting(false)
    setItem(null); setDate(today); setBoxes([{ quantity: '' }]); setStepIdx(0)
  }

  // ── 발급 완료 ──
  if (doneItems) {
    return (
      <div className="page-flat">
        <div className={s.wrap}>
          <div className={s.doneWrap}>
            <div className={s.doneIcon}>✓</div>
            <h2 className={s.doneTitle}>라벨 {doneItems.length}장 발급 완료</h2>
            <div className={s.doneList}>
              {doneItems.map((it) => (
                <div key={it.lot_no} className={s.doneLotRow}>
                  <span className={s.doneLotCode}>{it.lot_no}</span>
                  <span className={s.doneLotQty}>{it.quantity}개</span>
                </div>
              ))}
            </div>
            <div className={s.actions}>
              <button className="btn-primary btn-md" onClick={onResetAll}>새 발급</button>
              <button className="btn-secondary btn-md" onClick={onBack}>원자재 종류 다시 선택</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-flat">
      <WizardShell stepIndex={stepIdx} total={total} onBack={goBack} chips={chips}>
        <AnimatePresence mode="wait">
          <motion.div key={key}
            initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.16 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </WizardShell>
    </div>
  )

  function renderStep() {
    if (key === 'item') {
      return (
        <Question title="어떤 자석인가요?" sub="품번 또는 품목명으로 검색하세요">
          <MagnetItemCombo onPick={pickItem} selectedId={item?.id} />
        </Question>
      )
    }

    if (key === 'date') {
      return (
        <Question
          title="수입일자는 언제인가요?"
          footer={<PrimaryButton onClick={goNext} disabled={yymmdd.length !== 6}>다음</PrimaryButton>}
        >
          <input type="date" className={s.directInput} value={date}
            onChange={(e) => setDate(e.target.value)} autoFocus />
          {item?.spec && (
            <div className={s.agNote}>
              규격 <b>{item.spec}</b>{item.manufacturer ? ` · ${item.manufacturer}` : ''}
            </div>
          )}
        </Question>
      )
    }

    if (key === 'boxes') {
      return (
        <Question
          title="상자별 개수를 입력하세요"
          sub="상자 1개당 LOT·라벨 1개 발급"
          footer={<PrimaryButton onClick={goNext} disabled={validBoxes.length === 0}>다음</PrimaryButton>}
        >
          <div className={s.boxList}>
            {boxes.map((b, i) => (
              <div key={i} className={s.boxRow}>
                <span className={s.boxIdx}>{i + 1}</span>
                <input type="number" min="1" className={s.boxInput}
                  placeholder="개수 (예: 1280)" value={b.quantity}
                  onChange={(e) => setBoxQty(i, e.target.value)}
                  autoFocus={i === boxes.length - 1} />
                <span className={s.boxUnit}>개</span>
                <button type="button" className={s.boxDel}
                  onClick={() => removeBox(i)} disabled={boxes.length <= 1}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className={s.boxAdd} onClick={addBox}>+ 상자 추가</button>
        </Question>
      )
    }

    // confirm
    return (
      <Question
        title="이대로 발급할까요?"
        footer={<PrimaryButton onClick={onIssue} disabled={printing || !valid}>
          {printing ? '발급 중…' : `라벨 ${validBoxes.length}장 발급`}
        </PrimaryButton>}
      >
        <div className={s.preview}>
          <div className={s.previewLabel}>LOT · {validBoxes.length}상자</div>
          <div className={s.previewCode}>{item ? `${item.part_no}-${yymmdd}-NNN` : '입력 미완료'}</div>
          <div className={s.previewNote}>{item?.spec || ''} · NNN = 발급 순번 (자동 채번)</div>
        </div>
        {error && <div className={s.err}>{error}</div>}
      </Question>
    )
  }
}


// 자석 품목 콤보박스 — 로그인만 필요한 경량 검색(searchWarehouseItems) 사용
function MagnetItemCombo({ onPick, selectedId }) {
  const [q, setQ] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (!q.trim()) { setOptions([]); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try { setOptions((await searchWarehouseItems(q)).slice(0, 20)) }
      catch { setOptions([]) }
      finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(timerRef.current)
  }, [q])

  return (
    <div className={s.combo}>
      <input type="text" className={s.directInput} value={q}
        placeholder="품번 또는 품목명 검색" autoComplete="off" autoFocus
        onChange={(e) => setQ(e.target.value)} />
      {loading && <div className={s.comboMsg}>검색 중…</div>}
      {!loading && q.trim() && options.length === 0 && (
        <div className={s.comboMsg}>일치하는 품목 없음</div>
      )}
      <div className={s.comboList}>
        {options.map((it) => (
          <button key={it.id} type="button"
            className={`${s.comboOpt} ${selectedId === it.id ? s.comboOptOn : ''}`}
            onClick={() => onPick(it)}>
            <span className={s.comboPart}>{it.part_no}</span>
            <span className={s.comboName}>{it.name}</span>
            {it.spec && <span className={s.comboSpec}>{it.spec}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
