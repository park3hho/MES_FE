// pages/process/manage/YokeIpqPage.jsx
// 요크 IPQ 검사 — 측정 전용 (2026-08-05). 요크 LOT 스캔 → 식별·규격 자동표시 → 개체별 실측(LOT당 N차) → 자동판정.
//   ★ 측정과 폐기는 진입점 분리 (한 배치에 여러 개 측정하고 일부만 폐기 — YokeDiscardPage 가 별도).
//   판정: 외경/내경=공칭±공차, 진원도(외·내)·동심도=상한(≤). 규격 등록 항목만 검사. 최종은 서버 산출.
import { useState } from 'react'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { getYokeIpqData, submitYokeIpq } from '@/api'
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

export default function YokeIpqPage({ user, onLogout, onBack }) {
  const [step, setStep] = useState('scan')      // 'scan' | 'form'
  const [data, setData] = useState(null)         // 스캔 결과 (식별+규격+배치수량+개체목록)
  const [samples, setSamples] = useState([])     // 측정된 개체 목록 (서버 반영본)
  const [meas, setMeas] = useState({})           // 현재 입력 중 측정값 {key: string}
  const [remark, setRemark] = useState('')
  const [editSample, setEditSample] = useState(null)  // 수정 중 sample_no (null=새 개체)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)       // 저장 완료 순간 표시 (개체 #n 저장됨)

  const onScan = async (val) => {
    const lot = (val || '').trim()
    if (!lot) return
    const r = await getYokeIpqData(lot)   // 실패(요크 아님/이력 없음) 시 QRScanner 가 에러 표시
    setData(r)
    setSamples(r.inspections || [])
    setMeas({}); setRemark(''); setEditSample(null); setError(null); setToast(null)
    setStep('form')
  }

  const spec = data?.spec || {}

  // 개별 셀 합불 (색) — null = 판정 대상 아님/미입력
  const measPass = (m) => {
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

  // 현재 개체 판정 미리보기 (BE 규칙 동기) — 서버가 최종 결정
  const previewJudgment = () => {
    const checks = []
    for (const m of MEASURES) {
      const hasSpec = m.kind === 'dia'
        ? (spec[m.nomKey] != null && spec[m.tolKey] != null)
        : (spec[m.maxKey] != null)
      if (!hasSpec) continue
      const raw = meas[m.key]
      const v = parseFloat(raw)
      if (raw == null || raw === '' || isNaN(v)) return 'PENDING'
      checks.push(measPass(m))
    }
    if (!checks.length) return 'PENDING'
    return checks.every(Boolean) ? 'OK' : 'FAIL'
  }
  const judgment = data ? previewJudgment() : 'PENDING'

  const specText = (m) => {
    if (m.kind === 'dia') {
      const nom = spec[m.nomKey]; const tol = spec[m.tolKey]
      return nom != null ? `규격 ${nom}${tol != null ? ` ±${tol}` : ''}` : '규격 미등록'
    }
    const mx = spec[m.maxKey]
    return mx != null ? `≤ ${mx}` : '규격 미등록'
  }

  // 저장 후 재조회 — 개체목록·배치수량·다음번호 최신화
  const refresh = async () => {
    const r = await getYokeIpqData(data.lot_ea_no)
    setData(r); setSamples(r.inspections || [])
  }

  // 현재 개체 저장 (새 개체 or 수정)
  const save = async () => {
    if (saving) return
    setSaving(true); setError(null)
    try {
      const body = { lot_ea_no: data.lot_ea_no, worker: autoWorkerCode(user) || '', remark: remark.trim() }
      if (editSample != null) body.sample_no = editSample
      MEASURES.forEach(({ key }) => {
        const v = parseFloat(meas[key])
        body[key] = isNaN(v) ? null : v
      })
      const r = await submitYokeIpq(body)
      await refresh()
      setMeas({}); setRemark(''); setEditSample(null)   // 다음 개체 준비
      setToast(`개체 #${r.sample_no} 저장됨 (${J_LABEL[r.judgment]})`)
      setTimeout(() => setToast(null), 1600)
    } catch (e) {
      setError(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  // 기존 개체 클릭 → 값 불러와 수정 모드
  const editRow = (row) => {
    const m = {}
    MEASURES.forEach(({ key }) => { if (row[key] != null) m[key] = String(row[key]) })
    setMeas(m); setRemark(row.remark || ''); setEditSample(row.sample_no); setError(null)
  }
  const newSample = () => { setMeas({}); setRemark(''); setEditSample(null); setError(null) }

  const okCount = samples.filter((sp) => sp.judgment === 'OK').length
  const failCount = samples.filter((sp) => sp.judgment === 'FAIL').length
  const batchQty = data?.quantity ?? 0
  const curNo = editSample != null ? editSample : (data?.next_sample_no ?? (samples.length + 1))

  if (step === 'scan') {
    return (
      <QRScanner processLabel="요크 IPQ · 요크(EA) LOT 스캔" onScan={onScan} onLogout={onLogout} onBack={onBack} />
    )
  }

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
        <span className={s.batchInfo}>배치 {batchQty}개 · 측정 {samples.length}개 (양호 {okCount} / 불량 {failCount})</span>
      </div>

      {samples.length > 0 && (
        <div className={s.sampleList}>
          {samples.map((sp) => (
            <button
              key={sp.sample_no} type="button"
              className={`${s.sampleChip} ${editSample === sp.sample_no ? s.sampleActive : ''}`}
              onClick={() => editRow(sp)}
            >
              <span className={s.chipNo}>#{sp.sample_no}</span>
              <span className={s.chipJ} data-j={sp.judgment}>{J_LABEL[sp.judgment]}</span>
            </button>
          ))}
          <button type="button" className={s.sampleNew} onClick={newSample}>＋ 새 개체</button>
        </div>
      )}

      <div className={s.curHead}>
        개체 #{curNo}
        {editSample != null && <span className={s.editTag}>수정 중</span>}
      </div>

      {MEASURES.map((m) => {
        const pass = measPass(m)
        return (
          <div key={m.key} className={s.mRow}>
            <div className={s.mHead}>
              <span className={s.mLabel}>{m.label}</span>
              <span className={s.mSpec}>{specText(m)}</span>
            </div>
            <input
              type="number" inputMode="decimal" step="0.001"
              className={`${s.mInput} ${pass === true ? s.ok : pass === false ? s.ng : ''}`}
              value={meas[m.key] ?? ''}
              onChange={(e) => setMeas((p) => ({ ...p, [m.key]: e.target.value }))}
              placeholder="측정값 입력"
            />
          </div>
        )
      })}

      <div className={s.remarkBox}>
        <label className={s.remarkLabel}>비고 (선택)</label>
        <textarea
          className={s.remarkInput} rows={2} maxLength={200}
          value={remark} onChange={(e) => setRemark(e.target.value)}
          placeholder="특이사항이 있으면 입력 (최대 200자)"
        />
      </div>

      {error && <p className={s.err}>⚠ {error}</p>}
      {toast && <p className={s.toast}>✓ {toast}</p>}

      <div className="sticky-cta">
        <div className="sticky-cta-inner">
          <div className={s.ctaRow}>
            <span className={s.judgePreview}>예상 판정 <b data-j={judgment}>{J_LABEL[judgment]}</b></span>
            <button className={s.submit} onClick={save} disabled={saving}>
              {saving ? '저장 중…' : (editSample != null ? '수정 저장' : '검사 저장')}
            </button>
          </div>
        </div>
      </div>
      <p className={s.hint}>※ 폐기는 별도 “요크 폐기”에서 — 측정 후 불량 개수만 부분 폐기합니다.</p>
    </div>
  )
}
