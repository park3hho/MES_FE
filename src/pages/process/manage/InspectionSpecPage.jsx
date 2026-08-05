// pages/process/manage/InspectionSpecPage.jsx
// QC 검사규격(InspectionSpec) 편집 — ModelRegistry QC 병존 이관의 '신규 편집면' (Layer E, 2026-07-17).
//   docs/production-order-bom-design.md §7. ModelManagePage 와 완전 별개(기존 무수정).
//   조회 키 = (phi, motor, rt_st, stage). 4단계 대칭 공차(R/L/KT/KM × low/high × warn/fail) 편집.
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { getInspectionSpecs, upsertInspectionSpec, resolveInspectionSpec,
  listYokeIpqSpecs, updateYokeIpqSpec } from '@/api'

const MOTOR_OPTS = ['', 'inner', 'outer', 'axial']
const STAGE_OPTS = ['OQ', 'IPQ', 'IQ']   // 검사 단계 — BE INSPECTION_STAGES 와 동기

// ── 제품 종류(ProductType) 카탈로그 — 검사규격의 1급 디스크리미네이터 (2026-07-27) ──
//   docs/product-type-spec-design.md. 종류마다 검사 항목이 달라 "종류 선택 → 종류별 폼" 으로 감.
//   저장은 병존기라 rt_st 에 매핑(고정자→st, 회전자→rt) — 향후 BE product_type 컬럼으로 승격(설계 §5).
//   신규 종류 추가 = 여기 한 줄 + (필드셋/폼/판정). 액추에이터는 검사항목 미정이라 stub(선택 불가).
const PRODUCT_TYPE_CATALOG = [
  { code: 'stator',   label: '고정자',   rt_st: 'st', desc: 'R / L / K_T 전기 측정 + 4단계 공차' },
  { code: 'rotor',    label: '회전자',   rt_st: 'rt', desc: '지그 OK/NG — 극쌍수(자석수)만' },
  { code: 'actuator', label: '액추에이터', stub: true,  desc: '검사 항목 준비 중 (사양 확정 후 추가)' },
]
// rt_st → 제품 종류 표시 라벨. none/'' = 레거시 미분류 → 고정자로 표기.
// 제품 종류 선택지 — rt_st_type 원값. 'none'(미지정)도 고정자 판정에 포함되므로 라벨로 구분해 표기.
const PTYPE_OPTS = [
  { value: 'st', label: '고정자 (ST)' },
  { value: 'rt', label: '회전자 (RT)' },
  { value: 'both', label: '고정자·회전자 (both)' },
  { value: 'none', label: '미지정 (고정자로 판정)' },
]

const ptypeLabel = (rt) => (rt === 'rt' ? '회전자' : rt === 'both' ? '고정자·회전자' : '고정자')

// ── 제품 유형별 검사규격 카탈로그 (2026-07-24) — QC 하는 제품 유형이 늘면 여기에 탭·필드셋을 추가 ──
//   고정자(ST) = R/L/K_T 전기 측정 + 4단계 공차 (OqInspection).
//   회전자(RT) = 내경/외경 지그 OK/NG (rotor_oq_models — 수치 공차 스펙 없음) → 스펙은 극쌍수(자석수)만.
//   'both' 는 양쪽 성격이라 두 탭 모두 표시, 'none'(미분류 레거시)은 ST 탭에.
const TYPE_TABS = [
  { key: 'st', label: '고정자 (ST)', match: ['st', 'both', 'none'] },
  { key: 'rt', label: '회전자 (RT)', match: ['rt', 'both'] },
  { key: 'yoke', label: '요크 (IPQ)', match: [] },   // 요크 IPQ 검사 공차 — 별도 도메인(YokeSpec), 전용 패널 (2026-08-05)
]

// 요크 IPQ 검사 항목 — YokeSpec 검사 공차 필드. kind: 'dia'(공칭+공차) / 'max'(상한 ≤)
const YOKE_IPQ_MEASURES = [
  { key: 'outer_dia', label: '외경', kind: 'dia', nomKey: 'outer_dia', tolKey: 'outer_dia_tol' },
  { key: 'outer_roundness', label: '외경 진원도', kind: 'max', maxKey: 'outer_roundness_max' },
  { key: 'inner_dia', label: '내경', kind: 'dia', nomKey: 'inner_dia', tolKey: 'inner_dia_tol' },
  { key: 'inner_roundness', label: '내경 진원도', kind: 'max', maxKey: 'inner_roundness_max' },
  { key: 'concentricity', label: '동심도', kind: 'max', maxKey: 'concentricity_max' },
]
const YOKE_IPQ_FIELDS = ['outer_dia', 'outer_dia_tol', 'inner_dia', 'inner_dia_tol',
  'outer_roundness_max', 'inner_roundness_max', 'concentricity_max']
// 회전자 스펙에서 의미 있는 필드 — 나머지 스테이터 전기 필드는 RT 폼/테이블에서 숨김
const RT_FIELDS = ['pole_pairs']
const METRICS = [
  { key: 'r', label: 'R (저항)' },
  { key: 'l', label: 'L (인덕턴스)' },
  { key: 'kt', label: 'Kt (토크상수)' },
  { key: 'km', label: 'K_M (모터상수, ref 파생)' },
]
const STEPS = ['low_warn', 'low_fail', 'high_warn', 'high_fail']
const STEP_LABEL = { low_warn: '하한 경고', low_fail: '하한 FAIL', high_warn: '상한 경고', high_fail: '상한 FAIL' }

// 신규 규격 프리필 대상 QC 필드 — BE inspection_spec_service._QC_FIELDS 와 동일 집합 (2026-07-20)
const PREFILL_KEYS = [
  'pole_pairs', 'it_min_voltage', 'r_ref', 'r_offset', 'l_ref', 'l_unit', 'kt_ref',
  'dim_c_ref', 'dim_c_low_fail_pct',
  ...METRICS.flatMap((m) => STEPS.map((st) => `${m.key}_${st}_pct`)),
]

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
  const [picking, setPicking] = useState(false) // 신규 시 제품 종류 선택 스텝 (2026-07-27)
  const [msg, setMsg] = useState(null)          // {type:'ok'|'err', text}
  const [typeTab, setTypeTab] = useState('st')  // 제품 유형 탭 — 유형별 검사 항목이 달라 테이블 분리 (2026-07-24)

  const load = useCallback(async () => {
    try {
      const r = await getInspectionSpecs()   // 전체 단계(OQ/IPQ/IQ) 로드 — 단계는 컬럼으로 구분
      setSpecs(r.specs || [])
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '불러오기 실패' })
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (picking) {
    return (
      <div className="page-flat">
        <PageHeader title="새 검사규격 — 제품 종류" subtitle="검사 항목이 종류마다 달라, 먼저 제품 종류를 선택하세요" onBack={() => setPicking(false)} />
        <div className="page-content" style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
          {PRODUCT_TYPE_CATALOG.map((t) => (
            <button key={t.code} type="button"
              className={t.stub ? 'btn-ghost btn-lg' : 'btn-secondary btn-lg'}
              disabled={t.stub}
              style={{ textAlign: 'left' }}
              onClick={() => { setPicking(false); setEditing({ rt_st_type: t.rt_st, _ptype: t.code }) }}>
              {t.label}{t.stub ? ' (준비 중)' : ''} — <span style={{ color: 'var(--color-text-sub)' }}>{t.desc}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (editing) {
    return (
      <SpecEditor
        initial={editing}
        existingSpecs={specs}
        onCancel={() => setEditing(null)}
        onSaved={async () => { setEditing(null); setMsg({ type: 'ok', text: '저장되었습니다' }); await load() }}
      />
    )
  }

  return (
    <div className="page-flat">
      <PageHeader title="검사규격 (QC 기준)" subtitle="OQ 판정 기준 — ModelRegistry QC 병존 이관 (신규 편집면)" onBack={() => nav('/admin/manage')} />

      <div className="page-content">
        {/* '새 규격'은 InspectionSpec(고정자·회전자) 전용 — 요크 탭에선 숨김 (요크는 YokeSpec 자체 편집) */}
        {typeTab !== 'yoke' && (<>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button type="button" className="btn-primary btn-md" onClick={() => setPicking(true)}>＋ 새 규격</button>
        </div>
        </>)}

        {msg && (
          <p style={{ color: msg.type === 'err' ? 'var(--color-danger, #d23f3f)' : 'var(--color-primary, #2b7)', fontWeight: 600 }}>
            {msg.text}
          </p>
        )}

        {/* 제품 유형 탭 — 유형마다 검사 항목이 달라 테이블 컬럼 분리 (RT 에 스테이터 R/L/Kt 컬럼 표시 안 함) */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {TYPE_TABS.map((t) => (
            <button key={t.key} type="button"
              className={typeTab === t.key ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm'}
              onClick={() => setTypeTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        {typeTab === 'yoke' ? (
          <YokeIpqSpecPanel onMsg={setMsg} />
        ) : (() => {
          const tab = TYPE_TABS.find((t) => t.key === typeTab) || TYPE_TABS[0]
          const rows = specs.filter((s) => tab.match.includes(s.rt_st_type))
          const isRtTab = tab.key === 'rt'
          if (rows.length === 0) {
            return (
              <p style={{ color: 'var(--color-text-sub)' }}>
                {isRtTab
                  ? '등록된 회전자 검사규격이 없습니다 — “새 규격”에서 RT/ST 를 rt 로 선택해 추가하세요. (회전자 OQ 는 지그 OK/NG 라 수치 공차 없음 — 스펙은 극쌍수만)'
                  : '등록된 고정자 검사규격이 없습니다 — “＋ 새 규격”으로 추가하세요.'}
              </p>
            )
          }
          return (
            <div style={{ overflowX: 'auto' }}>
              {isRtTab && (
                <p style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 6 }}>
                  회전자 OQ 는 내경/외경 <b>지그 OK/NG</b> 검사라 수치 공차 스펙이 없습니다 — 극쌍수(자석수)는 RBO 자석 소비·K_T 산정에 사용됩니다.
                </p>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ padding: 8 }}>Φ</th><th style={{ padding: 8 }}>모터</th><th style={{ padding: 8 }}>RT/ST</th>
                    <th style={{ padding: 8 }}>단계</th>
                    <th style={{ padding: 8 }}>극쌍(자석수)</th>
                    {!isRtTab && (<>
                      <th style={{ padding: 8 }}>R_ref</th><th style={{ padding: 8 }}>L_ref</th>
                      <th style={{ padding: 8 }}>Kt_ref</th>
                    </>)}
                    <th style={{ padding: 8 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={specKey(s)} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: 8, fontWeight: 600 }}>Φ{s.phi}</td>
                      <td style={{ padding: 8 }}>{s.motor_type || '—'}</td>
                      <td style={{ padding: 8 }}>{s.rt_st_type}</td>
                      <td style={{ padding: 8 }}>{s.stage}</td>
                      <td style={{ padding: 8 }}>{s.pole_pairs}</td>
                      {!isRtTab && (<>
                        <td style={{ padding: 8 }}>{s.r_ref ?? '—'}</td>
                        <td style={{ padding: 8 }}>{s.l_ref ?? '—'} {s.l_unit}</td>
                        <td style={{ padding: 8 }}>{s.kt_ref ?? '—'}</td>
                      </>)}
                      <td style={{ padding: 8 }}>
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(s)}>편집</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}
      </div>
    </div>
  )
}


// ── 규격 편집 폼 ──
function SpecEditor({ initial, existingSpecs, onCancel, onSaved }) {
  const isNew = !initial.phi
  const [f, setF] = useState(() => ({
    phi: initial.phi ?? '',
    motor_type: initial.motor_type ?? '',
    rt_st_type: initial.rt_st_type ?? 'none',
    stage: initial.stage ?? 'OQ',
    pole_pairs: initial.pole_pairs ?? '',
    it_min_voltage: initial.it_min_voltage ?? '',
    r_ref: initial.r_ref ?? '', r_offset: initial.r_offset ?? '',
    l_ref: initial.l_ref ?? '', l_unit: initial.l_unit ?? 'mH', kt_ref: initial.kt_ref ?? '',
    // 높이(dim_c) 기준 (2026-07-28) — 상한(초과 NG) + 하한 허용%(n% 미달 NG)
    dim_c_ref: initial.dim_c_ref ?? '', dim_c_low_fail_pct: initial.dim_c_low_fail_pct ?? '',
    // 16 공차 (metric_step_pct)
    ...Object.fromEntries(
      METRICS.flatMap((m) => STEPS.map((st) => [`${m.key}_${st}_pct`, initial[`${m.key}_${st}_pct`] ?? ''])),
    ),
  }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  // 사용자가 직접 만진 필드 — 프리필이 사용자 입력을 덮지 않게 추적 (2026-07-20)
  const touched = useRef(new Set())
  const set = (k, v) => { touched.current.add(k); setF((p) => ({ ...p, [k]: v })) }
  // 회전자(RT) 스펙 — 지그 OK/NG 검사라 스테이터 전기 필드(R/L/Kt·공차) 없음, 극쌍수만 (2026-07-24)
  const isRt = f.rt_st_type === 'rt'

  // 신규 규격 프리필 (workorder C-5·H-3): 키(phi/motor) 입력 시 '판정 소스 현행값'을 아직 안 만진 필드에 '동기화'.
  //   ref 몇 개만 입력하고 저장했을 때 커스텀 공차·l_unit·r_offset 이 default 로 조용히 덮이는 사고 차단.
  //   · rt_st='st' 고정 — OQ 판정(resolve_qc(phi,motor,'st'))이 실제 읽는 행을 미러 (폼 rt_st 로 조회 시 다른 행 프리필 위험, 리뷰 반영)
  //   · '채우기'가 아니라 '동기화' — 키 변경/스펙 없음/조회 실패 시 untouched 필드를 비워 이전 키의 값 잔존(오염) 차단 (리뷰 반영)
  useEffect(() => {
    if (!isNew) return undefined
    // 프리필은 OQ 판정 소스(resolve_qc)만 대상 — IPQ/IQ 는 OQ 값이 폼에 유입되지 않게 스킵 (2026-07-25)
    if (f.stage !== 'OQ') return undefined
    const phiKey = String(f.phi).trim()
    if (!phiKey) return undefined
    let alive = true
    const syncUntouched = (spec) => {
      setF((p) => {
        const next = { ...p }
        PREFILL_KEYS.forEach((k) => {
          if (!touched.current.has(k)) next[k] = (spec && spec[k] != null) ? spec[k] : ''
        })
        return next
      })
    }
    // 유형별 프리필 (2026-07-24): RT 는 'rt' 행 기준으로 조회하고 극쌍수만 채움 —
    //   스테이터 값(R/L/Kt)이 RT 폼에 프리필되던 혼동(스크린샷 사고) 차단.
    const rtSt = f.rt_st_type === 'rt' ? 'rt' : 'st'
    const keys = f.rt_st_type === 'rt' ? RT_FIELDS : PREFILL_KEYS
    const syncTyped = (spec) => {
      setF((p) => {
        const next = { ...p }
        PREFILL_KEYS.forEach((k) => {
          if (touched.current.has(k)) return
          next[k] = (keys.includes(k) && spec && spec[k] != null) ? spec[k] : ''
        })
        return next
      })
    }
    resolveInspectionSpec(phiKey, f.motor_type || '', rtSt)
      .then((r) => { if (alive) syncTyped(r.spec) })
      .catch(() => { if (alive) syncTyped(null) })   // 실패 시에도 이전 키 잔존값 제거 — 저장 검증은 BE 몫
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, f.phi, f.motor_type, f.rt_st_type, f.stage])

  const save = async () => {
    if (!String(f.phi).trim()) { setErr('Φ(파이)를 입력하세요.'); return }
    setSaving(true); setErr('')
    try {
      // RT 는 극쌍수만 전송 — 스테이터 전기 필드는 회전자 검사(지그 OK/NG)에 무의미 (2026-07-24)
      const payload = isRt
        ? {
            ...(isNew ? {} : { id: initial.id }),
            phi: String(f.phi).trim(), motor_type: f.motor_type || '', rt_st_type: 'rt', stage: f.stage || 'OQ',
            pole_pairs: numInt(f.pole_pairs),
          }
        : {
            ...(isNew ? {} : { id: initial.id }),
            phi: String(f.phi).trim(), motor_type: f.motor_type || '', rt_st_type: f.rt_st_type || 'none', stage: f.stage || 'OQ',
            pole_pairs: numInt(f.pole_pairs), it_min_voltage: numInt(f.it_min_voltage),
            r_ref: num(f.r_ref), r_offset: num(f.r_offset),
            l_ref: num(f.l_ref), l_unit: f.l_unit || undefined, kt_ref: num(f.kt_ref),
            dim_c_ref: num(f.dim_c_ref), dim_c_low_fail_pct: num(f.dim_c_low_fail_pct),
            ...Object.fromEntries(
              METRICS.flatMap((m) => STEPS.map((st) => [`${m.key}_${st}_pct`, num(f[`${m.key}_${st}_pct`])])),
            ),
          }
      // 형제 rt_st 행 가드 (workorder M-10·H-1): 판정·kt 리포트는 'st' 행 우선 —
      //   같은 (phi,motor)에 다른 rt_st 행을 추가하면 판정과 리포트가 서로 다른 행을 읽을 수 있음.
      if (isNew) {
        const sib = (existingSpecs || []).find(
          (sp) => sp.phi === payload.phi && (sp.motor_type || '') === payload.motor_type
            && sp.stage === payload.stage && sp.rt_st_type !== payload.rt_st_type,
        )
        if (sib) {
          const ok = window.confirm(
            `같은 (Φ${payload.phi}, ${payload.motor_type || '-'}) 에 rt_st='${sib.rt_st_type}' 규격이 이미 있습니다.\n`
            + `판정과 kt 리포트는 'st' 행을 우선하므로 형제 행 추가는 기준 분기를 만들 수 있습니다.\n계속할까요?`,
          )
          if (!ok) { setSaving(false); return }
        }
        // 동일 키 가드 (리뷰 반영): '새 규격'에서 기존과 완전히 같은 키를 입력하면 upsert 가 기존 규격을 덮어씀 — 의도 확인
        const dup = (existingSpecs || []).find(
          (sp) => sp.phi === payload.phi && (sp.motor_type || '') === payload.motor_type
            && sp.stage === payload.stage && sp.rt_st_type === payload.rt_st_type,
        )
        if (dup) {
          const ok2 = window.confirm(
            `이미 같은 키(Φ${payload.phi} / ${payload.motor_type || '-'} / ${payload.rt_st_type})의 규격이 있습니다.\n`
            + `저장하면 기존 규격을 덮어씁니다(편집과 동일). 계속할까요?`,
          )
          if (!ok2) { setSaving(false); return }
        }
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
        subtitle="4단계 대칭 공차 (경고 < FAIL). 값이 0이면 그 방향/단계 비활성 · 경고(warn)는 검사 화면 표시용, 서버 판정은 FAIL 단계만 사용"
        onBack={onCancel}
      />
      <div className="page-content" style={{ maxWidth: 720 }}>
        {/* 키 — 수정 화면에서도 편집 가능 (2026-08-05). 오타(파이·모터 잘못 지정)를 고칠 수 있어야 함.
            ★ 저장 시 id 를 함께 보내 BE 가 '그 행'을 고친다 — 안 보내면 키 기준 upsert 라 원본이 남고 복제됨.
            같은 키가 이미 있으면 BE 가 409 로 막는다. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          <label>Φ 파이
            <input style={inputStyle} value={f.phi} onChange={(e) => set('phi', e.target.value)} />
          </label>
          <label>모터
            <select style={inputStyle} value={f.motor_type} onChange={(e) => set('motor_type', e.target.value)}>
              {MOTOR_OPTS.map((o) => <option key={o} value={o}>{o || '(없음)'}</option>)}
            </select>
          </label>
          <label>제품 종류
            <select style={inputStyle} value={f.rt_st_type || 'none'} onChange={(e) => set('rt_st_type', e.target.value)}>
              {PTYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label>단계
            <select style={inputStyle} value={f.stage} onChange={(e) => set('stage', e.target.value)}>
              {STAGE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>

        {/* 스칼라 + ref — RT 는 극쌍수만 (회전자 검사 = 지그 OK/NG, 수치 공차 없음. 2026-07-24) */}
        {isRt && (
          <p style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 8 }}>
            회전자 OQ 는 내경/외경 <b>지그 OK/NG</b> 검사입니다 — 수치 공차 스펙이 없어 극쌍수(자석수)만 등록합니다.
            (RBO 자석 소비·K_T 산정에 사용. 회전자 수치 검사 항목이 생기면 카탈로그에 추가)
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          <label>극쌍수(pole_pairs)
            <input style={inputStyle} type="number" step="1" min="0" value={f.pole_pairs} onChange={(e) => set('pole_pairs', e.target.value)} />
          </label>
          {!isRt && (<>
          <label>I.T. 최소전압(V)
            <input style={inputStyle} type="number" step="1" min="0" value={f.it_min_voltage} onChange={(e) => set('it_min_voltage', e.target.value)} />
          </label>
          <label>R 리드보정 (Ω, r_offset)
            <input style={inputStyle} type="number" step="any" value={f.r_offset} onChange={(e) => set('r_offset', e.target.value)} />
          </label>
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
          <label>높이 상한 (mm, 초과 시 NG)
            <input style={inputStyle} type="number" step="any" min="0" value={f.dim_c_ref} onChange={(e) => set('dim_c_ref', e.target.value)} />
          </label>
          <label>높이 하한 허용% (n% 미달 시 NG, 0=하한없음)
            <input style={inputStyle} type="number" step="any" min="0" value={f.dim_c_low_fail_pct} onChange={(e) => set('dim_c_low_fail_pct', e.target.value)} />
          </label>
          </>)}
        </div>

        {/* 4단계 공차 그리드 — 스테이터 전용 */}
        {!isRt && (
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
        )}

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


// ── 요크(IPQ) 검사규격 패널 (2026-08-05) — YokeSpec 검사 공차 편집 ──
//   InspectionSpec(item 기반 QC)과 별개 도메인이라 격리. 요크 Item(phi,motor)은 이미 셋업됨 → 검사 공차만 편집.
function YokeIpqSpecPanel({ onMsg }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editItem, setEditItem] = useState(null)   // 편집 중 요크 행

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listYokeIpqSpecs())
    } catch (e) {
      onMsg?.({ type: 'err', text: e.message || '요크 규격 불러오기 실패' })
    } finally { setLoading(false) }
  }, [onMsg])
  useEffect(() => { load() }, [load])

  if (editItem) {
    return (
      <YokeIpqSpecEditor
        item={editItem}
        onCancel={() => setEditItem(null)}
        onSaved={async () => { setEditItem(null); onMsg?.({ type: 'ok', text: '요크 규격 저장됨' }); await load() }}
      />
    )
  }
  if (loading) return <p style={{ color: 'var(--color-text-sub)' }}>불러오는 중…</p>
  if (!rows.length) {
    return (
      <p style={{ color: 'var(--color-text-sub)' }}>
        등록된 요크 Item 이 없습니다 — 요크는 품목/BOM 설정에서 먼저 등록됩니다. (여기선 검사 공차만 편집)
      </p>
    )
  }

  const fmtDia = (nom, tol) => (nom == null ? '—' : `${nom}${tol != null ? ` ±${tol}` : ''}`)
  const fmtMax = (v) => (v == null ? '—' : `≤ ${v}`)

  return (
    <div style={{ overflowX: 'auto' }}>
      <p style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 6 }}>
        요크 IPQ 검사 공차 — 외경/내경 = <b>공칭±공차</b>, 진원도(외·내)·동심도 = <b>상한(≤)</b>. 빈칸(—)은 판정 대상에서 제외됩니다.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>
            <th style={{ padding: 8 }}>Φ</th><th style={{ padding: 8 }}>모터</th><th style={{ padding: 8 }}>요크</th>
            <th style={{ padding: 8 }}>외경</th><th style={{ padding: 8 }}>외경진원도</th>
            <th style={{ padding: 8 }}>내경</th><th style={{ padding: 8 }}>내경진원도</th>
            <th style={{ padding: 8 }}>동심도</th><th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: 8, fontWeight: 600 }}>Φ{r.phi}</td>
              <td style={{ padding: 8 }}>{r.motor_type || '—'}</td>
              <td style={{ padding: 8 }}>{r.name}</td>
              <td style={{ padding: 8 }}>{fmtDia(r.outer_dia, r.outer_dia_tol)}</td>
              <td style={{ padding: 8 }}>{fmtMax(r.outer_roundness_max)}</td>
              <td style={{ padding: 8 }}>{fmtDia(r.inner_dia, r.inner_dia_tol)}</td>
              <td style={{ padding: 8 }}>{fmtMax(r.inner_roundness_max)}</td>
              <td style={{ padding: 8 }}>{fmtMax(r.concentricity_max)}</td>
              <td style={{ padding: 8 }}>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setEditItem(r)}>편집</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


// ── 요크 IPQ 규격 편집 폼 (7필드: 외경/내경 공칭·공차, 진원도·동심도 상한) ──
function YokeIpqSpecEditor({ item, onCancel, onSaved }) {
  const [f, setF] = useState(() =>
    Object.fromEntries(YOKE_IPQ_FIELDS.map((k) => [k, item[k] ?? ''])))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const inputStyle = { width: '100%', padding: 8, borderRadius: 6, border: '1.5px solid var(--color-border)' }

  const save = async () => {
    setSaving(true); setErr('')
    try {
      // 빈값 → null(판정 제외). 나머지는 숫자.
      const payload = Object.fromEntries(
        YOKE_IPQ_FIELDS.map((k) => [k, f[k] === '' || f[k] == null ? null : Number(f[k])]))
      await updateYokeIpqSpec(item.item_id, payload)
      onSaved()
    } catch (e) {
      setErr(e.message || '저장 실패')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
        요크 IPQ 규격 — Φ{item.phi} {item.motor_type} · {item.name}
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 14 }}>
        외경/내경 = 공칭·공차(±) / 진원도·동심도 = 상한(≤). 비우면 그 항목은 판정에서 제외됩니다.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
        {YOKE_IPQ_MEASURES.map((m) => (
          <div key={m.key} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{m.label}</div>
            {m.kind === 'dia' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ fontSize: 12 }}>공칭(mm)
                  <input style={inputStyle} type="number" step="any" value={f[m.nomKey]}
                    onChange={(e) => set(m.nomKey, e.target.value)} />
                </label>
                <label style={{ fontSize: 12 }}>공차 ±(mm)
                  <input style={inputStyle} type="number" step="any" min="0" value={f[m.tolKey]}
                    onChange={(e) => set(m.tolKey, e.target.value)} />
                </label>
              </div>
            ) : (
              <label style={{ fontSize: 12 }}>상한 ≤ (mm)
                <input style={inputStyle} type="number" step="any" min="0" value={f[m.maxKey]}
                  onChange={(e) => set(m.maxKey, e.target.value)} />
              </label>
            )}
          </div>
        ))}
      </div>
      {err && <p style={{ color: 'var(--color-danger, #d23f3f)', fontWeight: 600 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-primary btn-lg" disabled={saving} onClick={save}>
          {saving ? '저장 중…' : '저장'}
        </button>
        <button type="button" className="btn-secondary btn-lg" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}
