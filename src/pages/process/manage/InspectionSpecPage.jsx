// pages/process/manage/InspectionSpecPage.jsx
// QC 검사규격(InspectionSpec) 편집 — ModelRegistry QC 병존 이관의 '신규 편집면' (Layer E, 2026-07-17).
//   docs/production-order-bom-design.md §7. ModelManagePage 와 완전 별개(기존 무수정).
//   조회 키 = (phi, motor, rt_st, stage). 4단계 대칭 공차(R/L/KT/KM × low/high × warn/fail) 편집.
//   백필: ModelRegistry QC → InspectionSpec 1회 복사(멱등).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { getInspectionSpecs, upsertInspectionSpec, backfillInspectionSpecs } from '@/api'

const MOTOR_OPTS = ['', 'inner', 'outer', 'axial']
const RTST_OPTS = ['none', 'st', 'rt', 'both']
const METRICS = [
  { key: 'r', label: 'R (저항)' },
  { key: 'l', label: 'L (인덕턴스)' },
  { key: 'kt', label: 'Kt (토크상수)' },
  { key: 'km', label: 'K_M (모터상수, ref 파생)' },
]
const STEPS = ['low_warn', 'low_fail', 'high_warn', 'high_fail']
const STEP_LABEL = { low_warn: '하한 경고', low_fail: '하한 FAIL', high_warn: '상한 경고', high_fail: '상한 FAIL' }

const num = (v) => (v === '' || v == null ? undefined : Number(v))
// 정수 전용 필드(pole_pairs·it_min_voltage) — 소수 입력 시 BE Optional[int] 422 방지 (2026-07-17 검토 반영)
const numInt = (v) => {
  if (v === '' || v == null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}
const specKey = (s) => `${s.phi}|${s.motor_type}|${s.rt_st_type}|${s.stage}`

export default function InspectionSpecPage() {
  const nav = useNavigate()
  const [specs, setSpecs] = useState([])
  const [editing, setEditing] = useState(null)  // 편집 중 spec dict (신규는 {} 기반)
  const [msg, setMsg] = useState(null)          // {type:'ok'|'err', text}
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await getInspectionSpecs('OQ')
      setSpecs(r.specs || [])
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '불러오기 실패' })
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onBackfill = async () => {
    setBusy(true)
    try {
      const r = await backfillInspectionSpecs('OQ')
      setMsg({ type: 'ok', text: `백필 완료 — 생성 ${r.created} / 건너뜀 ${r.skipped}` })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '백필 실패' })
    } finally { setBusy(false) }
  }

  if (editing) {
    return (
      <SpecEditor
        initial={editing}
        onCancel={() => setEditing(null)}
        onSaved={async () => { setEditing(null); setMsg({ type: 'ok', text: '저장되었습니다' }); await load() }}
      />
    )
  }

  return (
    <div className="page-flat">
      <PageHeader title="검사규격 (QC 기준)" subtitle="OQ 판정 기준 — ModelRegistry QC 병존 이관 (신규 편집면)" onBack={() => nav('/admin/manage')} />

      <div className="process-content-inner">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button type="button" className="btn-primary btn-md" onClick={() => setEditing({})}>＋ 새 규격</button>
          <button type="button" className="btn-secondary btn-md" disabled={busy} onClick={onBackfill}>
            {busy ? '백필 중…' : 'ModelRegistry에서 백필'}
          </button>
        </div>

        {msg && (
          <p style={{ color: msg.type === 'err' ? 'var(--color-danger, #d23f3f)' : 'var(--color-primary, #2b7)', fontWeight: 600 }}>
            {msg.text}
          </p>
        )}

        {specs.length === 0 ? (
          <p style={{ color: 'var(--color-text-sub)' }}>
            등록된 검사규격이 없습니다 — “ModelRegistry에서 백필”로 기존 QC 기준을 복사하거나 “새 규격”으로 추가하세요.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: 8 }}>Φ</th><th style={{ padding: 8 }}>모터</th><th style={{ padding: 8 }}>RT/ST</th>
                  <th style={{ padding: 8 }}>극쌍</th><th style={{ padding: 8 }}>R_ref</th><th style={{ padding: 8 }}>L_ref</th>
                  <th style={{ padding: 8 }}>Kt_ref</th><th style={{ padding: 8 }}></th>
                </tr>
              </thead>
              <tbody>
                {specs.map((s) => (
                  <tr key={specKey(s)} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>Φ{s.phi}</td>
                    <td style={{ padding: 8 }}>{s.motor_type || '—'}</td>
                    <td style={{ padding: 8 }}>{s.rt_st_type}</td>
                    <td style={{ padding: 8 }}>{s.pole_pairs}</td>
                    <td style={{ padding: 8 }}>{s.r_ref ?? '—'}</td>
                    <td style={{ padding: 8 }}>{s.l_ref ?? '—'} {s.l_unit}</td>
                    <td style={{ padding: 8 }}>{s.kt_ref ?? '—'}</td>
                    <td style={{ padding: 8 }}>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(s)}>편집</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}


// ── 규격 편집 폼 ──
function SpecEditor({ initial, onCancel, onSaved }) {
  const isNew = !initial.phi
  const [f, setF] = useState(() => ({
    phi: initial.phi ?? '',
    motor_type: initial.motor_type ?? '',
    rt_st_type: initial.rt_st_type ?? 'none',
    stage: initial.stage ?? 'OQ',
    pole_pairs: initial.pole_pairs ?? '',
    it_min_voltage: initial.it_min_voltage ?? '',
    r_ref: initial.r_ref ?? '', l_ref: initial.l_ref ?? '', l_unit: initial.l_unit ?? 'mH', kt_ref: initial.kt_ref ?? '',
    // 16 공차 (metric_step_pct)
    ...Object.fromEntries(
      METRICS.flatMap((m) => STEPS.map((st) => [`${m.key}_${st}_pct`, initial[`${m.key}_${st}_pct`] ?? ''])),
    ),
  }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const save = async () => {
    if (!String(f.phi).trim()) { setErr('Φ(파이)를 입력하세요.'); return }
    setSaving(true); setErr('')
    try {
      const payload = {
        phi: String(f.phi).trim(), motor_type: f.motor_type || '', rt_st_type: f.rt_st_type || 'none', stage: f.stage || 'OQ',
        pole_pairs: numInt(f.pole_pairs), it_min_voltage: numInt(f.it_min_voltage),
        r_ref: num(f.r_ref), l_ref: num(f.l_ref), l_unit: f.l_unit || undefined, kt_ref: num(f.kt_ref),
        ...Object.fromEntries(
          METRICS.flatMap((m) => STEPS.map((st) => [`${m.key}_${st}_pct`, num(f[`${m.key}_${st}_pct`])])),
        ),
      }
      await upsertInspectionSpec(payload)
      onSaved()
    } catch (e) {
      setErr(e.message || '저장 실패')
    } finally { setSaving(false) }
  }

  const inputStyle = { width: '100%', padding: 8, borderRadius: 6, border: '1.5px solid var(--color-border)' }

  return (
    <div className="page-flat">
      <PageHeader
        title={isNew ? '새 검사규격' : `검사규격 편집 — Φ${initial.phi} ${initial.motor_type || ''}`}
        subtitle="4단계 대칭 공차 (경고 < FAIL). 값이 0이면 그 방향/단계 비활성"
        onBack={onCancel}
      />
      <div className="process-content-inner" style={{ maxWidth: 720 }}>
        {/* 키 (신규만 편집) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          <label>Φ 파이
            <input style={inputStyle} value={f.phi} disabled={!isNew} onChange={(e) => set('phi', e.target.value)} />
          </label>
          <label>모터
            <select style={inputStyle} value={f.motor_type} disabled={!isNew} onChange={(e) => set('motor_type', e.target.value)}>
              {MOTOR_OPTS.map((o) => <option key={o} value={o}>{o || '(없음)'}</option>)}
            </select>
          </label>
          <label>RT/ST
            <select style={inputStyle} value={f.rt_st_type} disabled={!isNew} onChange={(e) => set('rt_st_type', e.target.value)}>
              {RTST_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label>단계
            <input style={inputStyle} value={f.stage} disabled onChange={() => {}} />
          </label>
        </div>

        {/* 스칼라 + ref */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          <label>극쌍수(pole_pairs)
            <input style={inputStyle} type="number" step="1" min="0" value={f.pole_pairs} onChange={(e) => set('pole_pairs', e.target.value)} />
          </label>
          <label>I.T. 최소전압(V)
            <input style={inputStyle} type="number" step="1" min="0" value={f.it_min_voltage} onChange={(e) => set('it_min_voltage', e.target.value)} />
          </label>
          <span />
          <label>R_ref (Ω)
            <input style={inputStyle} type="number" value={f.r_ref} onChange={(e) => set('r_ref', e.target.value)} />
          </label>
          <label>L_ref
            <input style={inputStyle} type="number" value={f.l_ref} onChange={(e) => set('l_ref', e.target.value)} />
          </label>
          <label>L 단위
            <select style={inputStyle} value={f.l_unit} onChange={(e) => set('l_unit', e.target.value)}>
              <option value="mH">mH</option><option value="µH">µH</option>
            </select>
          </label>
          <label>Kt_ref
            <input style={inputStyle} type="number" value={f.kt_ref} onChange={(e) => set('kt_ref', e.target.value)} />
          </label>
        </div>

        {/* 4단계 공차 그리드 */}
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: 6, textAlign: 'left' }}>항목 / 공차%</th>
                {STEPS.map((st) => <th key={st} style={{ padding: 6 }}>{STEP_LABEL[st]}</th>)}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.key}>
                  <td style={{ padding: 6, fontWeight: 600 }}>{m.label}</td>
                  {STEPS.map((st) => {
                    const key = `${m.key}_${st}_pct`
                    return (
                      <td key={st} style={{ padding: 6 }}>
                        <input style={{ ...inputStyle, textAlign: 'center' }} type="number" value={f[key]}
                          onChange={(e) => set(key, e.target.value)} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {err && <p style={{ color: 'var(--color-danger, #d23f3f)', fontWeight: 600 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-primary btn-lg" disabled={saving} onClick={save}>
            {saving ? '저장 중…' : '저장'}
          </button>
          <button type="button" className="btn-secondary btn-lg" onClick={onCancel}>취소</button>
        </div>
      </div>
    </div>
  )
}
