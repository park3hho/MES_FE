// pages/process/produce/RMPage.jsx
// RM 원자재 입고 — LOT 통일 + Item 연동 (2026-06-10)
//   COIL/EW/Plate: RmItemWizard — 품목 선택 → 공급사 → 속성 → 입고일 → 발급
//     LOT = {Item.lot_material_code}-{vendor.code}-{attribute}-{YYMMDD}-{NN} (BE 채번)
//   자석(Magnet): MagnetWizard — 품목 선택 + 상자별 수량 (LOT={part_no}-{YYMMDD}-{seq3})
//   재질·규격 진실의 원천 = Item. LOT 엔 material 코드만 표시(타입 구분자는 QR 전용).
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { printLot, searchWarehouseItems, magnetIncoming, getRmKinds } from '@/api'
import {
  WizardShell, Question, BigChoice, PrimaryButton,
} from '@/components/QcWizard'
import s from './RMPage.module.css'

// 자석 — 입고 플로우가 달라(상자별 수량) 카테고리 동적 목록과 별개로 고정 (2026-06-11).
//   나머지(코일/EW/Plate 등)는 원자재 Item 카테고리에서 getRmKinds 로 동적 생성.
const RM_MAGNET = { key: 'magnet', label: '자석 (Magnet)', desc: '로터(RT) 부품 · 품목 선택 후 상자별 입고' }


export default function RMPage({ onLogout, onBack }) {
  const [kind, setKind] = useState(null)   // 선택된 종류 객체 {key,label,materials?} | null
  const [kinds, setKinds] = useState([])    // 동적 종류 (원자재 Item 카테고리)

  useEffect(() => {
    getRmKinds().then(setKinds).catch(() => setKinds([]))
  }, [])

  if (!kind) {
    const all = [...kinds, RM_MAGNET]   // 동적 종류 + 자석(고정) 합성
    return (
      <div className="page-flat">
        <div className={s.wrap}>
          <h1 className={s.kindTitle}>원자재 입고</h1>
          <p className={s.kindSub}>어떤 원자재인가요?</p>
          <div className={s.kindGrid}>
            {all.map((k) => (
              <button key={k.key} type="button" className={s.kindCard} onClick={() => setKind(k)}>
                <span className={s.kindLabel}>{k.label}</span>
                <span className={s.kindDesc}>{k.desc || ''}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (kind.key === 'magnet') return <MagnetWizard onBack={() => setKind(null)} />
  return <RmItemWizard meta={kind} onBack={() => setKind(null)} />
}


// ════════════════════════════════════════════
// COIL / EW / Plate — Item-linked 통합 wizard (2026-06-10)
//   품목 선택 → 공급사 선택 → 속성 → 입고일 → 발급
//   LOT = {Item.lot_material_code}-{vendor.code}-{attribute}-{YYMMDD}-{NN} (BE 채번)
//   재질·규격 진실의 원천 = Item. LOT 엔 material 코드만 표시.
// ════════════════════════════════════════════
function RmItemWizard({ meta, onBack }) {
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
  // 제조사/공급사 행 중 공급사가 지정된 것만 (LOT 공급사 토큰 = vendor_code)
  const sources = (item?.sourcing || []).filter((sp) => sp.vendor_id && sp.vendor_code)
  const valid = !!item && !!material && !!vendor?.vendor_code && yymmdd.length === 6
  const preview = valid
    ? [material, vendor.vendor_code, ...(attr ? [attr] : []), yymmdd, 'NN'].join('-')
    : ''

  const goNext = () => { if (stepIdx < total - 1) setStepIdx(stepIdx + 1) }
  const goBack = () => { if (stepIdx > 0) setStepIdx(stepIdx - 1); else onBack?.() }

  const pickItem = (it) => {
    setItem(it)
    const srcs = (it.sourcing || []).filter((sp) => sp.vendor_id && sp.vendor_code)
    setVendor(srcs.find((sp) => sp.is_default) || srcs[0] || null)
    setStepIdx(1)
  }
  const pickVendor = (idx) => {
    setVendor(sources[idx] || null)
    setStepIdx(2)
  }

  const chips = sequence.slice(0, stepIdx)
    .map((k, i) => {
      const val = {
        item: item?.part_no || '',
        vendor: vendor?.manufacturer_name || vendor?.vendor_code || '',
        attribute: attr,
        date,
      }[k]
      if (!val) return null
      return {
        key: k,
        label: { item: '품목', vendor: '제조사', attribute: meta.attrLabel || '속성', date: '입고일' }[k],
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
        vendor_code: vendor.vendor_code,
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
        <Question title={`어떤 ${meta.label || '원자재'}인가요?`} sub="관련 품목이 미리 나와요 · 품번·품목명으로 더 좁힐 수 있어요">
          <MagnetItemCombo onPick={pickItem} selectedId={item?.id} materials={meta.materials} />
        </Question>
      )
    }

    if (key === 'vendor') {
      if (sources.length === 0) {
        return (
          <Question title="등록된 제조사가 없습니다" sub="품목 관리에서 이 품목의 제조사·공급사를 먼저 등록하세요">
            <div className={s.agNote}>
              <b>{item?.part_no}</b> 에 제조사·공급사가 없어 LOT 코드를 정할 수 없습니다.
            </div>
          </Question>
        )
      }
      return (
        <Question title="어느 제조사인가요?" sub="이 입고분을 만든 제조사를 선택하세요">
          <BigChoice
            value={vendor ? sources.indexOf(vendor) : -1}
            onPick={pickVendor}
            options={sources.map((sp, idx) => ({
              value: idx,
              label: `${sp.manufacturer_name || '제조사?'} → ${sp.vendor_name} (${sp.vendor_code})`,
              desc: sp.is_default ? '기본' : '',
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
// materials 주면 키워드 없이도 해당 RM 품목 미리 조회 (입고 진입 시 바로 보임). 자석은 미전달 → 검색만.
function MagnetItemCombo({ onPick, selectedId, materials }) {
  const [q, setQ] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)
  const hasMaterials = Array.isArray(materials) && materials.length > 0

  useEffect(() => {
    clearTimeout(timerRef.current)
    const kw = q.trim()
    const mats = materials || []
    if (!kw && mats.length === 0) { setOptions([]); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try { setOptions((await searchWarehouseItems(kw, mats)).slice(0, 20)) }
      catch { setOptions([]) }
      finally { setLoading(false) }
    }, kw ? 300 : 0)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, materials])

  return (
    <div className={s.combo}>
      <input type="text" className={s.directInput} value={q}
        placeholder="품번 또는 품목명으로 좁히기" autoComplete="off" autoFocus
        onChange={(e) => setQ(e.target.value)} />
      {loading && <div className={s.comboMsg}>불러오는 중…</div>}
      {!loading && (q.trim() || hasMaterials) && options.length === 0 && (
        <div className={s.comboMsg}>
          {hasMaterials && !q.trim()
            ? '등록된 품목이 없습니다 · 품목 관리에서 RM LOT 코드를 먼저 지정하세요'
            : '일치하는 품목 없음'}
        </div>
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
