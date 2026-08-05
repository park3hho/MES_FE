// pages/process/manage/YokeIpqPage.jsx
// 요크 IPQ 검사 (2026-08-05) — 요크 LOT 스캔 → 식별정보·규격 자동표시 → 실측 입력 → 자동판정 → 저장.
//   회전자 IPQ 의 '요크 검사' 분기(IPQInspectPage)에서 진입. BE: /yoke-ipq/* (고정자/회전자 OQ 와 분리).
//   판정: 외경/내경 = 공칭±공차 / 진원도(외·내)·동심도 = 상한(≤). 규격 등록 항목만 검사. 최종은 서버 산출.
import { useState } from 'react'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { getYokeIpqData, submitYokeIpq, discardYokeIpq } from '@/api'
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
  const [step, setStep] = useState('scan')   // 'scan' | 'form'
  const [data, setData] = useState(null)      // 스캔 결과 (식별+규격)
  const [meas, setMeas] = useState({})        // 측정 입력 {key: string}
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)      // 검사 저장 결과 {judgment, qc_no} → 처분 화면으로
  const [disposed, setDisposed] = useState(null)  // 최종 처분 'pass'(QC통과) | 'discard'(폐기)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const reset = () => {
    setStep('scan'); setData(null); setMeas({}); setRemark(''); setError(null)
    setDone(null); setDisposed(null); setConfirmDiscard(false)
  }

  const onScan = async (val) => {
    const lot = (val || '').trim()
    if (!lot) return
    const r = await getYokeIpqData(lot)   // 실패(요크 아님/이력 없음) 시 QRScanner 가 에러 표시
    setData(r)
    const ex = r.inspection
    if (ex) {   // 기존 검사(임시저장/수정) 프리필
      const m = {}
      MEASURES.forEach(({ key }) => { if (ex[key] != null) m[key] = String(ex[key]) })
      setMeas(m)
      setRemark(ex.remark || '')
    } else {
      setMeas({}); setRemark('')
    }
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

  // 전체 판정 미리보기 (BE 규칙 동기) — 서버가 최종 결정
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

  const save = async () => {
    if (saving) return
    setSaving(true); setError(null)
    try {
      const body = { lot_ea_no: data.lot_ea_no, worker: autoWorkerCode(user) || '', remark: remark.trim() }
      MEASURES.forEach(({ key }) => {
        const v = parseFloat(meas[key])
        body[key] = isNaN(v) ? null : v
      })
      const r = await submitYokeIpq(body)
      setDone({ judgment: r.judgment, qc_no: r.qc_no })  // ★ 자동리셋 X → 처분(폐기/통과) 결정 화면
    } catch (e) {
      setError(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  // 검사 후 처분 — QC 통과(그대로 다음 공정) / 폐기(요크 단순 폐기, 본딩 전이라 자석 없음)
  const passQc = () => { setDisposed('pass'); setTimeout(reset, 1400) }
  const doDiscard = async () => {
    if (saving) return
    setSaving(true); setError(null)
    try {
      await discardYokeIpq(data.lot_ea_no, remark.trim())
      setDisposed('discard'); setTimeout(reset, 1600)
    } catch (e) {
      setError(e.message || '폐기 실패'); setConfirmDiscard(false)
    } finally {
      setSaving(false)
    }
  }

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

      {disposed ? (
        <div className={s.doneBox}>
          <p className={s.doneJudge} data-j={disposed === 'discard' ? 'FAIL' : 'OK'}>
            {disposed === 'discard' ? '폐기 완료' : 'QC 통과'}
          </p>
          <p className={s.doneSub}>{data.lot_ea_no}</p>
        </div>
      ) : done ? (
        // ★ 검사 저장됨 → 판정 확인 후 처분 결정 (폐기 vs QC통과) — 분기 아닌 '검사 후 결정'
        <div className={s.doneBox}>
          <p className={s.doneJudge} data-j={done.judgment}>{J_LABEL[done.judgment]}</p>
          <p className={s.doneSub}>{done.qc_no} · {data.lot_ea_no}</p>
          {error && <p className={s.err}>⚠ {error}</p>}
          {confirmDiscard ? (
            <div className={s.dispRow}>
              <p className={s.confirmMsg}>이 요크를 폐기합니다. 되돌릴 수 없습니다.</p>
              <div className={s.dispBtns}>
                <button className="btn-secondary btn-md" onClick={() => setConfirmDiscard(false)} disabled={saving}>취소</button>
                <button className="btn-danger btn-md" onClick={doDiscard} disabled={saving}>
                  {saving ? '폐기 중…' : '폐기 확인'}
                </button>
              </div>
            </div>
          ) : (
            <div className={s.dispRow}>
              <p className={s.dispHint}>
                {done.judgment === 'FAIL'
                  ? '불량입니다. 폐기하거나, 재검토 후 통과 처리하세요.'
                  : done.judgment === 'OK'
                    ? '양호입니다. QC 통과하거나, 필요 시 폐기하세요.'
                    : '규격 미등록/미측정 항목이 있어 판정 보류입니다.'}
              </p>
              <div className={s.dispBtns}>
                <button
                  className={done.judgment === 'FAIL' ? 'btn-secondary btn-lg' : 'btn-primary btn-lg'}
                  onClick={passQc}
                >QC 통과</button>
                <button
                  className={done.judgment === 'FAIL' ? 'btn-danger btn-lg' : 'btn-secondary btn-lg'}
                  onClick={() => setConfirmDiscard(true)}
                >폐기</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={s.lotLine}>{data.lot_ea_no}</div>

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

          <div className="sticky-cta">
            <div className="sticky-cta-inner">
              <span className={s.judgePreview}>예상 판정 <b data-j={judgment}>{J_LABEL[judgment]}</b></span>
              <button className={s.submit} onClick={save} disabled={saving}>
                {saving ? '저장 중…' : '검사 저장'}
              </button>
            </div>
          </div>
          <p className={s.hint}>※ 최종 판정은 서버가 규격 기준으로 결정합니다.</p>
        </>
      )}
    </div>
  )
}
