// pages/process/produce/RMPage.jsx
// RM 원자재 입고 — LOT 통일 + Item 연동 (2026-06-10)
//   COIL/EW/Plate: RmItemWizard — 품목 선택 → 공급사 → 속성 → 입고일 → 발급
//     LOT = {Item.lot_material_code}-{vendor.code}-{attribute}-{YYMMDD}-{NN} (BE 채번)
//   자석/권선(Warehouse 전용 부품)도 RmItemWizard 로 동적 통합 (2026-06-15) — 별도 wizard 없음.
//     LOT = {lot_material_code}-{제조사}-{YYMMDD}-{NN} (자석 NE-YSM-...). BE process_rm 이 StatorInventory 스킵 + Warehouse 만.
//   재질·규격 진실의 원천 = Item. LOT 엔 material 코드만 표시(타입 구분자는 QR 전용).
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { printLot, searchWarehouseItems, getRmKinds, listWarehouseRack } from '@/api'
import {
  WizardShell, Question, BigChoice, PrimaryButton,
} from '@/components/QcWizard'
import s from './RMPage.module.css'

// 자석/권선 등 Warehouse 전용 부품도 동적 목록(getRmKinds)에 포함 — 입고 분기는 BE process_rm 이
//   lot_material_code(WAREHOUSE_ONLY_MATERIAL_CODES)로 처리 (2026-06-15 동적 통합 — 하드코딩 RM_MAGNET 제거).


export default function RMPage({ onLogout, onBack }) {
  const [kind, setKind] = useState(null)   // 선택된 종류 객체 {key,label,materials?} | null
  const [kinds, setKinds] = useState([])    // 동적 종류 (원자재 Item 카테고리)

  useEffect(() => {
    getRmKinds().then(setKinds).catch(() => setKinds([]))
  }, [])

  if (!kind) {
    const all = kinds   // 동적 종류만 — 자석 등 부품도 포함(getRmKinds). 입고 분기는 BE process_rm
    return (
      <div className="page-flat">
        <WizardShell stepIndex={0} total={1} onBack={onBack}>
          <Question title="원자재 입고" sub="어떤 원자재인가요?">
            <div className={s.kindGrid}>
              {all.map((k) => (
                <button key={k.key} type="button" className={s.kindCard} onClick={() => setKind(k)}>
                  <span className={s.kindLabel}>{k.label}</span>
                  <span className={s.kindDesc}>{k.desc || '품목 선택 입고'}</span>
                </button>
              ))}
            </div>
          </Question>
        </WizardShell>
      </div>
    )
  }

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
  // 상자별 수량 + 적재 위치(랙/단/칸, 선택) → Warehouse. 위치는 모달로 선택 (2026-06-15).
  const [boxes, setBoxes] = useState([{ quantity: '', rackId: '', shelf: null, bin: null }])
  const [racks, setRacks] = useState([])   // 적재 위치 선택지 (WarehouseRack 목록, 2026-06-15)
  const [locModalIdx, setLocModalIdx] = useState(null)   // 위치 모달 띄운 상자 index | null
  useEffect(() => {
    listWarehouseRack().then((r) => setRacks(r?.items || r || [])).catch(() => setRacks([]))
  }, [])

  const [printing, setPrinting] = useState(false)
  const [doneItems, setDoneItems] = useState(null)   // 발급된 [{lot_no, quantity}]
  const [error, setError] = useState(null)

  const sequence = ['item', 'vendor', 'attribute', 'date', 'boxes', 'confirm']
  const total = sequence.length
  const key = sequence[stepIdx]

  const yymmdd = date.slice(2).replace(/-/g, '')
  const material = item?.lot_material_code || ''
  const attr = attribute.trim()
  const validBoxes = boxes.filter((b) => Number(b.quantity) > 0)
  // LOT 토큰 = 제조사 코드 (2026-06-11). 제조사에 코드(Company.code)가 있는 행만 선택 가능.
  const sources = (item?.sourcing || []).filter((sp) => sp.manufacturer_id && sp.manufacturer_code)
  const baseValid = !!item && !!material && !!vendor?.manufacturer_code && yymmdd.length === 6
  const valid = baseValid && validBoxes.length > 0
  const preview = baseValid
    ? [material, vendor.manufacturer_code, ...(attr ? [attr] : []), yymmdd, 'NN'].join('-')
    : ''

  const goNext = () => { if (stepIdx < total - 1) setStepIdx(stepIdx + 1) }
  const goBack = () => { if (stepIdx > 0) setStepIdx(stepIdx - 1); else onBack?.() }

  const pickItem = (it) => {
    setItem(it)
    const srcs = (it.sourcing || []).filter((sp) => sp.manufacturer_id && sp.manufacturer_code)
    setVendor(srcs.find((sp) => sp.is_default) || srcs[0] || null)
    setStepIdx(1)
  }
  const pickVendor = (idx) => {
    setVendor(sources[idx] || null)
    setStepIdx(2)
  }
  const setBoxQty = (i, v) => setBoxes((p) => p.map((b, idx) => (idx === i ? { ...b, quantity: v } : b)))
  // 위치 패치 — 랙 변경 시 단/칸 초기화, 단 변경 시 칸 초기화 (상위 변경이 하위 무효화)
  const patchBoxLoc = (i, patch) => setBoxes((p) => p.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  const addBox = () => setBoxes((p) => [...p, { quantity: '', rackId: '', shelf: null, bin: null }])
  const removeBox = (i) => setBoxes((p) => (p.length <= 1 ? p : p.filter((_, idx) => idx !== i)))

  // 상자 위치 → 표시 문자열 (랙명 · N단 · M칸)
  const boxLocText = (b) => {
    const rk = racks.find((r) => String(r.id) === String(b.rackId))
    if (!rk) return ''
    return [rk.name || rk.coord || `#${rk.id}`,
      b.shelf != null ? `${b.shelf}단` : null,
      b.bin != null ? `${b.bin}칸` : null].filter(Boolean).join(' · ')
  }

  const chips = sequence.slice(0, stepIdx)
    .map((k, i) => {
      const val = {
        item: item?.part_no || '',
        vendor: vendor?.manufacturer_name || vendor?.manufacturer_code || '',
        attribute: attr,
        date,
        boxes: validBoxes.length ? `${validBoxes.length}상자` : '',
      }[k]
      if (!val) return null
      return {
        key: k,
        label: { item: '품목', vendor: '제조사', attribute: meta.attrLabel || '속성', date: '입고일', boxes: '상자' }[k],
        value: String(val),
        onClick: () => setStepIdx(i),
      }
    })
    .filter(Boolean)

  const onIssue = async () => {
    if (!valid) { setError('입력을 완료하세요.'); return }
    setPrinting(true); setError(null)
    try {
      // 상자별 1콜씩 — 박스당 RM LOT 1개(공정 Inventory) + Warehouse 재고 행 1개 + 라벨 1장.
      const created = []
      for (const b of validBoxes) {
        const res = await printLot(preview, 1, {
          selected_process: 'RM',
          item_id: item.id,
          vendor_code: vendor.manufacturer_code,   // LOT 토큰 = 제조사 코드 (2026-06-11)
          rm_attribute: attr,
          received_date: yymmdd,
          rm_quantity: Number(b.quantity),         // Warehouse 재고 등록 수량 (단위는 BE 가 품목 마스터에서)
          rm_rack_id: b.rackId ? Number(b.rackId) : null,  // 적재 랙 (선택 — 비우면 미할당) 2026-06-15
          rm_shelf: b.shelf ?? null,               // 적재 단(층)
          rm_bin: b.bin ?? null,                   // 적재 칸
        })
        created.push({ lot_no: res.lot_nums?.[0] || preview, quantity: Number(b.quantity) })
      }
      setDoneItems(created)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const onResetAll = () => {
    setDoneItems(null); setError(null); setPrinting(false)
    setItem(null); setVendor(null); setAttribute(''); setDate(today)
    setBoxes([{ quantity: '', rackId: '', shelf: null, bin: null }]); setStepIdx(0)
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
                  <span className={s.doneLotQty}>{it.quantity}{item?.unit || ''}</span>
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
        <Question title={`어떤 ${meta.label || '원자재'}인가요?`} sub="관련 품목이 미리 나와요 · 품번·품목명으로 더 좁힐 수 있어요">
          <RmItemCombo onPick={pickItem} selectedId={item?.id} materials={meta.materials} />
        </Question>
      )
    }

    if (key === 'vendor') {
      if (sources.length === 0) {
        return (
          <Question title="등록된 제조사가 없습니다" sub="품목 관리에서 제조사·공급사를, 회사 관리에서 제조사 코드를 먼저 등록하세요">
            <div className={s.agNote}>
              <b>{item?.part_no}</b> 에 <b>코드가 있는 제조사</b>가 없어 LOT 을 만들 수 없습니다. (LOT 토큰 = 제조사 코드)
            </div>
          </Question>
        )
      }
      return (
        <Question title="어느 제조사·공급사인가요?" sub="제조사-공급사를 선택하세요">
          <BigChoice
            value={vendor ? sources.indexOf(vendor) : -1}
            onPick={pickVendor}
            options={sources.map((sp, idx) => ({
              value: idx,
              label: `${sp.manufacturer_name || '제조사 없음'} (${sp.manufacturer_code}) - ${sp.vendor_name || '공급사 없음'}`,
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

    if (key === 'boxes') {
      return (
        <Question
          title="상자별 입고 수량을 입력하세요"
          sub={`상자 1개당 LOT·라벨 1개 + 재고 등록 · 단위 ${item?.unit || 'EA'} (품목 마스터)`}
          footer={<PrimaryButton onClick={goNext} disabled={validBoxes.length === 0}>다음</PrimaryButton>}
        >
          <div className={s.boxList}>
            {boxes.map((b, i) => (
              <div key={i} className={s.boxRow}>
                <span className={s.boxIdx}>{i + 1}</span>
                <input type="number" min="0" step="any" className={s.boxInput}
                  placeholder={`수량 (${item?.unit || 'EA'})`} value={b.quantity}
                  onChange={(e) => setBoxQty(i, e.target.value)}
                  autoFocus={i === boxes.length - 1} />
                <span className={s.boxUnit}>{item?.unit || 'EA'}</span>
                <button type="button" className={s.boxLocBtn}
                  onClick={() => racks.length && setLocModalIdx(i)} disabled={!racks.length}>
                  {boxLocText(b) || (racks.length ? '위치 선택' : '랙 없음')}
                </button>
                <button type="button" className={s.boxDel}
                  onClick={() => removeBox(i)} disabled={boxes.length <= 1}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className={s.boxAdd} onClick={addBox}>+ 상자 추가</button>

          {locModalIdx != null && (
            <RmLocationModal
              racks={racks}
              box={boxes[locModalIdx]}
              onPatch={(patch) => patchBoxLoc(locModalIdx, patch)}
              onClose={() => setLocModalIdx(null)}
            />
          )}
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
          <div className={s.previewLabel}>LOT 미리보기 · {validBoxes.length}상자</div>
          <div className={s.previewCode}>{preview || '입력 미완료'}</div>
          <div className={s.previewNote}>
            {item?.spec ? `${item.spec} · ` : ''}NN = 발급 순번 (자동 채번) · 박스당 LOT 1개
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




// RM 품목 콤보박스 — 로그인만 필요한 경량 검색(searchWarehouseItems) 사용
// materials 주면 키워드 없이도 해당 RM 품목 미리 조회 (입고 진입 시 바로 보임). 자석은 미전달 → 검색만.
function RmItemCombo({ onPick, selectedId, materials }) {
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
            {/* 재질 · 규격 — 같은 이름(코일) 구분용 (2026-06-11) */}
            {(it.material || it.spec) && (
              <span className={s.comboSpec}>{[it.material, it.spec].filter(Boolean).join(' · ')}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}


// ════════════════════════════════════════════
// 적재 위치 선택 모달 (랙 → 단 → 칸 드롭다운) — 좁은 상자 행 대신 모달로 (2026-06-15)
//   랙 변경 시 단/칸 초기화, 단 변경 시 칸 초기화. 칸 미선택 = 1칸 취급(BE null).
// ════════════════════════════════════════════
function RmLocationModal({ racks, box, onPatch, onClose }) {
  const seq = (n) => Array.from({ length: Math.max(0, Number(n) || 0) }, (_, i) => i + 1)
  const selected = racks.find((r) => String(r.id) === String(box.rackId)) || null

  return (
    <div className={s.locOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.locModal}>
        <h3 className={s.locModalTitle}>적재 위치 선택</h3>

        <div className={s.locField}>
          <label className={s.locLabel}>랙</label>
          <select className={s.locSelect} value={selected ? String(selected.id) : ''}
            onChange={(e) => onPatch({ rackId: e.target.value, shelf: null, bin: null })}>
            <option value="">랙 선택…</option>
            {racks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || r.coord || `#${r.id}`} ({r.shelf_count}단)
              </option>
            ))}
          </select>
        </div>

        <div className={s.locField}>
          <label className={s.locLabel}>단 (층)</label>
          <select className={s.locSelect} value={box.shelf ?? ''} disabled={!selected}
            onChange={(e) => onPatch({ shelf: e.target.value ? Number(e.target.value) : null, bin: null })}>
            <option value="">단 선택…</option>
            {seq(selected?.shelf_count).map((n) => <option key={n} value={n}>{n}단</option>)}
          </select>
        </div>

        <div className={s.locField}>
          <label className={s.locLabel}>칸</label>
          <select className={s.locSelect} value={box.bin ?? ''}
            disabled={!selected || box.shelf == null}
            onChange={(e) => onPatch({ bin: e.target.value ? Number(e.target.value) : null })}>
            <option value="">칸 선택… (미선택 시 1칸)</option>
            {seq(selected?.bin_count).map((n) => <option key={n} value={n}>{n}칸</option>)}
          </select>
        </div>

        <div className={s.locFoot}>
          <button type="button" className="btn-secondary btn-md"
            onClick={() => { onPatch({ rackId: '', shelf: null, bin: null }); onClose() }}>위치 해제</button>
          <button type="button" className="btn-primary btn-md" onClick={onClose}>완료</button>
        </div>
      </div>
    </div>
  )
}
