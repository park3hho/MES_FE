// pages/process/manage/YokeIpqPage.jsx
// 요크 IPQ 검사 — 측정 전용 (2026-08-05). 요크 LOT 스캔 → 식별·규격 자동표시 → 개체별 실측(LOT당 N차) → 자동판정.
//   ★ 측정과 폐기는 진입점 분리 (한 배치에 여러 개 측정하고 일부만 폐기 — YokeDiscardPage 가 별도).
//   판정: 외경/내경=공칭±공차, 진원도(외·내)·동심도=상한(≤). 규격 등록 항목만 검사. 최종은 서버 산출.
//   ★ 2026-08-12 일괄 저장으로 전환 — 개체를 여러 개 추가해 값을 다 채운 뒤 한 번에 저장한다.
//     예전엔 개체마다 즉시 API 를 때려서, 추가만 하고 값을 안 넣으면 미검사(PENDING) 행이 그대로 쌓였다.
//     저장 전 개체는 삭제 가능(로컬 초안이라 서버에 없음). 저장된 개체는 여기서 지울 수 없다.
import { useState } from 'react'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { getYokeIpqData, submitYokeIpqBulk } from '@/api'
import { autoWorkerCode } from '@/constants/processConst'
import s from './YokeIpqPage.module.css'

const MOTOR_LABEL = { inner: '내전', outer: '외전', axial: '축' }
const J_LABEL = { OK: '양호', FAIL: '불량', PENDING: '미검사' }

// 측정 항목 — kind 'dia'(공칭±공차) / 'max'(상한 ≤)
const MEASURES = [
  { key: 'outer_dia', label: '외경', kind: 'dia', nomKey: 'outer_dia', tolKey: 'outer_dia_tol' },
  { key: 'outer_roundness', label: '외경 진원도', kind: 'max', maxKey: 'outer_roundness_max' },
  { key: 'inner_dia', label: '내경', kind: 'dia', nomKey: 'inner_dia', tolKey: 'inner_dia_tol' },
  { key: 'inner_roundness', label: '내경 진원도', kind: 'max', maxKey: 'inner_roundness_max' },
  { key: 'concentricity', label: '동심도', kind: 'max', maxKey: 'concentricity_max' },
]

let seq = 0
const newKey = () => `d${(seq += 1)}`

// 서버 개체 → 편집 행. sample_no 가 있으면 저장된 개체, null 이면 아직 서버에 없는 초안.
const rowFromServer = (sp) => {
  const meas = {}
  MEASURES.forEach(({ key }) => { if (sp[key] != null) meas[key] = String(sp[key]) })
  return { key: `s${sp.sample_no}`, sample_no: sp.sample_no, meas, remark: sp.remark || '', dirty: false }
}
const draftRow = () => ({ key: newKey(), sample_no: null, meas: {}, remark: '', dirty: false })
const hasInput = (r) => MEASURES.some(({ key }) => (r.meas[key] ?? '') !== '') || !!r.remark.trim()
// 저장 대상 — 기존 개체는 '고쳤을 때', 새 개체는 '값이 있을 때'.
//   빈 초안까지 보내면 예전처럼 미검사 행만 쌓인다.
const needsSave = (r) => (r.sample_no != null ? r.dirty : hasInput(r))

export default function YokeIpqPage({ user, onLogout, onBack }) {
  const [step, setStep] = useState('scan')      // 'scan' | 'form'
  const [data, setData] = useState(null)         // 스캔 결과 (식별+규격+배치수량+개체목록)
  const [rows, setRows] = useState([])           // 편집 중인 개체 목록 (서버 개체 + 로컬 초안)
  const [active, setActive] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  const loadRows = (r) => {
    const list = (r.inspections || []).map(rowFromServer)
    setRows(list.length ? list : [draftRow()])
    setActive(0)
  }

  const onScan = async (val) => {
    const lot = (val || '').trim()
    if (!lot) return
    const r = await getYokeIpqData(lot)   // 실패(요크 아님/이력 없음) 시 QRScanner 가 에러 표시
    setData(r)
    loadRows(r)
    setError(null); setToast(null)
    setStep('form')
  }

  const spec = data?.spec || {}
  const cur = rows[active] || draftRow()

  // 개별 셀 합불 (색) — null = 판정 대상 아님/미입력
  const measPass = (m, meas) => {
    const raw = meas[m.key]
    if (raw == null || raw === '') return null
    const v = parseFloat(raw)
    if (isNaN(v)) return null
    if (m.kind === 'dia') {
      const nom = spec[m.nomKey]; const tol = spec[m.tolKey]
      if (nom == null || tol == null) return null
      return Math.abs(v - nom) <= tol
    }
    const mx = spec[m.maxKey]
    if (mx == null) return null
    return v <= mx
  }

  // 개체 판정 미리보기 (BE 규칙 동기) — 서버가 최종 결정
  const previewJudgment = (meas) => {
    const checks = []
    for (const m of MEASURES) {
      const hasSpec = m.kind === 'dia'
        ? (spec[m.nomKey] != null && spec[m.tolKey] != null)
        : (spec[m.maxKey] != null)
      if (!hasSpec) continue
      const raw = meas[m.key]
      const v = parseFloat(raw)
      if (raw == null || raw === '' || isNaN(v)) return 'PENDING'
      checks.push(measPass(m, meas))
    }
    if (!checks.length) return 'PENDING'
    return checks.every(Boolean) ? 'OK' : 'FAIL'
  }

  const specText = (m) => {
    if (m.kind === 'dia') {
      const nom = spec[m.nomKey]; const tol = spec[m.tolKey]
      return nom != null ? `규격 ${nom}${tol != null ? ` ±${tol}` : ''}` : '규격 미등록'
    }
    const mx = spec[m.maxKey]
    return mx != null ? `≤ ${mx}` : '규격 미등록'
  }

  const patchCur = (patch) =>
    setRows((p) => p.map((r, i) => (i === active ? { ...r, ...patch, dirty: true } : r)))

  const addRow = () => {
    setRows((p) => [...p, draftRow()])
    setActive(rows.length)
    setError(null)
  }

  // 저장 전 초안만 삭제 — 서버에 없는 행이라 로컬에서 빼면 끝
  const removeRow = (i) => {
    setRows((p) => {
      const next = p.filter((_, idx) => idx !== i)
      return next.length ? next : [draftRow()]
    })
    setActive((a) => (a > i ? a - 1 : Math.min(a, Math.max(0, rows.length - 2))))
    setError(null)
  }

  const saveAll = async () => {
    const targets = rows.filter(needsSave)
    if (!targets.length || saving) return
    setSaving(true); setError(null)
    try {
      const samples = targets.map((r) => {
        const sp = { remark: r.remark.trim() }
        if (r.sample_no != null) sp.sample_no = r.sample_no
        MEASURES.forEach(({ key }) => {
          const v = parseFloat(r.meas[key])
          sp[key] = isNaN(v) ? null : v
        })
        return sp
      })
      const res = await submitYokeIpqBulk({
        lot_ea_no: data.lot_ea_no, worker: autoWorkerCode(user) || '', samples,
      })
      const fresh = await getYokeIpqData(data.lot_ea_no)
      setData(fresh); loadRows(fresh)
      setToast(`${res.saved}건 저장됨`)
      setTimeout(() => setToast(null), 1600)
    } catch (e) {
      setError(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  if (step === 'scan') {
    return (
      <QRScanner processLabel="요크 IPQ · 요크(EA) LOT 스캔" onScan={onScan} onLogout={onLogout} onBack={onBack} />
    )
  }

  // 개체 번호 — 저장된 건 그대로, 초안은 서버가 매길 번호를 미리 보여준다
  const maxNo = rows.reduce((m, r) => Math.max(m, r.sample_no || 0), 0)
  let ahead = 0
  const numbered = rows.map((r) => {
    if (r.sample_no != null) return { row: r, no: r.sample_no }
    ahead += 1
    return { row: r, no: maxNo + ahead }
  })

  const savedRows = rows.filter((r) => r.sample_no != null)
  const okCount = savedRows.filter((r) => previewJudgment(r.meas) === 'OK').length
  const failCount = savedRows.filter((r) => previewJudgment(r.meas) === 'FAIL').length
  const pendingCount = rows.filter(needsSave).length
  const judgment = previewJudgment(cur.meas)

  const subtitle = [
    `Φ${data.phi}`,
    MOTOR_LABEL[data.motor_type] || data.motor_type,
    data.model_name || null,
    data.vendor ? `${data.vendor}호기` : null,
    data.work_date ? `작업일 ${data.work_date}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="page-flat">
      <PageHeader title="요크 IPQ 검사" subtitle={subtitle} onBack={() => setStep('scan')} />

      <div className={s.batchLine}>
        <span className={s.lotLine}>{data.lot_ea_no}</span>
        <span className={s.batchInfo}>
          배치 {data.quantity ?? 0}개 · 저장 {savedRows.length}개 (양호 {okCount} / 불량 {failCount})
        </span>
      </div>

      <div className={s.sampleList}>
        {numbered.map(({ row, no }, i) => (
          <button
            key={row.key} type="button"
            className={`${s.sampleChip} ${i === active ? s.sampleActive : ''}`}
            onClick={() => setActive(i)}
          >
            <span className={s.chipNo}>#{no}</span>
            <span className={s.chipJ} data-j={previewJudgment(row.meas)}>{J_LABEL[previewJudgment(row.meas)]}</span>
            {needsSave(row) && <span className={s.chipDot} title="미저장" />}
          </button>
        ))}
        <button type="button" className={s.sampleNew} onClick={addRow}>＋ 개체 추가</button>
      </div>

      <div className={s.curHead}>
        개체 #{numbered[active]?.no ?? 1}
        {cur.sample_no == null
          ? <span className={s.newTag}>새 개체</span>
          : cur.dirty && <span className={s.editTag}>수정됨</span>}
        {cur.sample_no == null && (
          <button type="button" className={s.rowDel} onClick={() => removeRow(active)}>삭제</button>
        )}
      </div>

      {MEASURES.map((m) => {
        const pass = measPass(m, cur.meas)
        return (
          <div key={m.key} className={s.mRow}>
            <div className={s.mHead}>
              <span className={s.mLabel}>{m.label}</span>
              <span className={s.mSpec}>{specText(m)}</span>
            </div>
            <input
              type="number" inputMode="decimal" step="0.001"
              className={`${s.mInput} ${pass === true ? s.ok : pass === false ? s.ng : ''}`}
              value={cur.meas[m.key] ?? ''}
              onChange={(e) => patchCur({ meas: { ...cur.meas, [m.key]: e.target.value } })}
              placeholder="측정값 입력"
            />
          </div>
        )
      })}

      <div className={s.remarkBox}>
        <label className={s.remarkLabel}>비고 (선택)</label>
        <textarea
          className={s.remarkInput} rows={2} maxLength={200}
          value={cur.remark} onChange={(e) => patchCur({ remark: e.target.value })}
          placeholder="특이사항이 있으면 입력 (최대 200자)"
        />
      </div>

      {error && <p className={s.err}>⚠ {error}</p>}
      {toast && <p className={s.toast}>✓ {toast}</p>}

      <div className="sticky-cta">
        <div className="sticky-cta-inner">
          <div className={s.ctaRow}>
            <span className={s.judgePreview}>
              예상 판정 <b data-j={judgment}>{J_LABEL[judgment]}</b>
              {pendingCount > 0 && <em className={s.pendMark}>미저장 {pendingCount}건</em>}
            </span>
            <button className={s.submit} onClick={saveAll} disabled={saving || pendingCount === 0}>
              {saving ? '저장 중…' : `전체 저장${pendingCount ? ` (${pendingCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>
      <p className={s.hint}>
        값을 비워둔 개체는 저장되지 않습니다 · 저장 전 개체는 삭제할 수 있습니다<br />
        ※ 폐기는 별도 “요크 폐기”에서 — 측정 후 불량 개수만 부분 폐기합니다.
      </p>
    </div>
  )
}
