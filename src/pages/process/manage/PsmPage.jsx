// pages/process/manage/PsmPage.jsx
// PSM 프로젝트 일정 관리 (2026-08-20) — 엑셀 "PSM (project schedule management)" 대체.
//
// ★ 구조: 목록(진입점) → 카드 클릭 → 상세(일정/요약/이상노트 탭). 목업 v3 확정안 이식.
// ★ 진행률·경과율·판정·공정 모드는 전부 BE(psm_service)가 계산해 내려준다 — 여기선 그리기만.
//   (엑셀 K4 수식 버그처럼 화면마다 계산이 갈라지는 사고 방지)
// ★ 편집은 인라인 — 작업 행을 누르면 그 아래 폼이 펼쳐진다. 별도 편집 화면 없음.
import { useCallback, useEffect, useState } from 'react'

import {
  getPsmProjects, getPsmProject, createPsmProject, updatePsmProject, deletePsmProject,
  createPsmGroup, updatePsmGroup, deletePsmGroup,
  createPsmTask, updatePsmTask, deletePsmTask,
  createPsmNote, deletePsmNote,
} from '@/api'
import { useToast } from '@/contexts/ToastContext'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import { fmtKstDateTime } from '@/utils/dateConvert'

import s from './PsmPage.module.css'

// 상태 5종 — BE psm_service.PSM_STATUSES 와 동기 (엑셀에서 온 고정 목록)
const STATUSES = ['대기', '진행', '완료', '보류', '취소']
const ST_DOT = { 완료: s.stDone, 진행: s.stRun, 대기: s.stWait, 보류: s.stHold, 취소: s.stCancel }
// 현황판 상태 카드의 머리 색 — 대기만 밝은 바탕/어두운 글자 (흰 글자면 대비가 안 나온다)
const ST_HEAD = { 완료: s.hDone, 진행: s.hRun, 대기: s.hWait, 보류: s.hHold, 취소: s.hCancel }
// 도넛 세그먼트 색 — SVG stroke 는 CSS 모듈 클래스로 못 주는 자리라 값이 필요하다.
//   ⚠️ PsmPage.module.css 의 .stDone/.stRun/… 과 같은 값을 유지할 것 (한쪽만 바뀌면 범례가 거짓말한다)
const ST_COLOR = {
  완료: 'var(--color-success)', 진행: 'var(--color-primary)',
  대기: '#c3c9d6', 보류: '#d68910', 취소: 'var(--color-error)',
}
const V_CLS = { ok: s.vok, late: s.vlate, plan: s.vplan, fin: s.vfin }
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']
const MS = 86400000
const MAX_TL_DAYS = 180        // 이 이상이면 날짜 입력 실수 — 그리드 대신 안내

const pd = (iso) => {           // 'YYYY-MM-DD' → 로컬 Date (TZ 어긋남 방지 — new Date(iso)는 UTC 해석)
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const fmtMD = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '')

export default function PsmPage({ onBack }) {
  const [view, setView] = useState({ mode: 'list' })   // {mode:'list'} | {mode:'detail', id}

  return view.mode === 'list'
    ? <ListView onOpen={(id) => setView({ mode: 'detail', id })} onBack={onBack} />
    : <DetailView id={view.id} onList={() => setView({ mode: 'list' })} />
}

// ══════════════════════════════════════════════════
// 목록 — 진입점. 열지 않고도 상태가 읽히게 (판정·겹침 막대·공정 위치)
// ══════════════════════════════════════════════════
function ListView({ onOpen, onBack }) {
  const [projects, setProjects] = useState(null)
  const [adding, setAdding] = useState(false)
  const toast = useToast()

  const load = useCallback(() => {
    getPsmProjects().then((r) => setProjects(r.projects || []))
      .catch((e) => toast(`조회 실패: ${e.message}`, 'error'))
  }, [toast])
  useEffect(() => { load() }, [load])

  const onCreated = (id) => { setAdding(false); onOpen(id) }

  return (
    <div className={s.page}><div className={s.container}>
      <button type="button" className={s.backBtn} onClick={onBack}>← 관리</button>
      <div className={s.head}>
        <div>
          <h1>프로젝트 일정</h1>
          <p className={s.headMeta}>
            {projects ? `${projects.length}건 · 진행 ${projects.filter((p) => p.verdict.ord <= 1).length}` : ''}
          </p>
        </div>
        <span className={s.spacer} />
        <button type="button" className="btn-primary btn-md" onClick={() => setAdding((v) => !v)}>
          {adding ? '닫기' : '＋ 새 프로젝트'}
        </button>
      </div>

      {adding && (
        <div className={s.card}>
          <h2>새 프로젝트</h2>
          <ProjectForm onSaved={onCreated} onCancel={() => setAdding(false)} />
        </div>
      )}

      {!projects && <p className={s.info}>불러오는 중…</p>}
      {projects && projects.length === 0 && !adding && (
        <div className={`${s.card} ${s.empty}`}>
          <p>프로젝트가 없습니다.<br />새 프로젝트를 만들어 일정 관리를 시작하세요.</p>
          <button type="button" className="btn-primary btn-md" onClick={() => setAdding(true)}>＋ 새 프로젝트</button>
        </div>
      )}

      <div className={s.pList}>
        {(projects || []).map((p) => (
          <button key={p.id} type="button" className={s.pCard} onClick={() => onOpen(p.id)}>
            <span className={s.pTop}>
              <span className={s.pName}>{p.name}</span>
              <span className={`${s.v} ${V_CLS[p.verdict.code]}`}>{p.verdict.label}</span>
            </span>
            <span className={s.pRight}>
              <span className={s.pPct}>{p.pct}<em>%</em></span>
              <span className={s.miniTrack}>
                <span className={s.miniTime} style={{ width: `${p.elapsed}%` }} />
                <span className={s.miniProg} style={{ width: `${p.pct}%` }} />
              </span>
            </span>
            <span className={s.pMeta}>
              {p.range_start ? `${p.range_start} ~ ${p.range_end} (${p.days}일)` : '기간 미정'}
              {p.owner && <> · <b>{p.owner}</b> {p.dept}</>}
              {' · 완료 '}{p.counts['완료']}
              {p.counts['진행'] > 0 && ` · 진행 ${p.counts['진행']}`}
              {p.counts['대기'] > 0 && ` · 대기 ${p.counts['대기']}`}
              {p.notes_count > 0 && ` · 이상 ${p.notes_count}`}
            </span>
            <span className={s.pFlowMini}>
              {p.flow.map((g) => (
                <span key={g.seq}
                  className={`${s.fm} ${g.mode === 'done' ? s.fmDone : g.mode === 'run' ? s.fmRun : ''}`}>
                  <i>{g.mode === 'done' ? '✓' : g.seq}</i>{g.name}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </div></div>
  )
}

// ══════════════════════════════════════════════════
// 프로젝트 폼 — 생성·수정 공용
// ══════════════════════════════════════════════════
function ProjectForm({ init = null, onSaved, onCancel }) {
  const [f, setF] = useState({
    name: init?.name || '', qty: init?.qty || '', owner: init?.owner || '', dept: init?.dept || '',
    start_date: init?.start_date || '', end_date: init?.end_date || '', notice: init?.notice || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    if (saving) return
    setSaving(true); setErr(null)
    try {
      if (init) { await updatePsmProject(init.id, f); onSaved(init.id) } else {
        const r = await createPsmProject(f); onSaved(r.id)
      }
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <div className={s.form}>
      <div className={s.fRow}>
        <span className={s.fLab}>이름 *</span>
        <input className={s.fInput} maxLength={120} value={f.name} onChange={set('name')}
          placeholder="예: 70파이 슈 내측 수정도면 테스트" />
      </div>
      <div className={s.fRow}>
        <span className={s.fLab}>기간</span>
        <input type="date" className={`${s.fInput} ${s.fDate}`} value={f.start_date} onChange={set('start_date')} />
        <span className={s.mut}>~</span>
        <input type="date" className={`${s.fInput} ${s.fDate}`} value={f.end_date} onChange={set('end_date')} />
        <span className={s.mut}>비우면 작업 날짜에서 자동</span>
      </div>
      <div className={s.fRow}>
        <span className={s.fLab}>책임자</span>
        <input className={s.fInput} maxLength={30} value={f.owner} onChange={set('owner')} placeholder="이름" />
        <input className={s.fInput} maxLength={40} value={f.dept} onChange={set('dept')} placeholder="부서/직위 (예: 연구소/소장)" />
      </div>
      <div className={s.fRow}>
        <span className={s.fLab}>수량</span>
        <input className={s.fInput} maxLength={60} value={f.qty} onChange={set('qty')} placeholder="예: 3EA (0.65t 규소강판)" />
      </div>
      <div className={s.fRow}>
        <span className={s.fLab}>특이사항</span>
        <input className={s.fInput} maxLength={300} value={f.notice} onChange={set('notice')} placeholder="중점 확인 사항 (선택)" />
      </div>
      {err && <p className={s.err}>⚠ {err}</p>}
      <div className={s.formBtns}>
        <button type="button" className="btn-secondary btn-md" onClick={onCancel}>취소</button>
        <button type="button" className="btn-primary btn-md" disabled={!f.name.trim() || saving} onClick={submit}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 상세 — 일정 / 요약 / 이상노트
// ══════════════════════════════════════════════════
function DetailView({ id, onList }) {
  const [p, setP] = useState(null)
  const [tab, setTab] = useState('sched')
  const toast = useToast()

  const load = useCallback(() => {
    getPsmProject(id).then((r) => setP(r.project))
      .catch((e) => { toast(`조회 실패: ${e.message}`, 'error'); onList() })
  }, [id, toast, onList])
  useEffect(() => { load() }, [load])

  if (!p) {
    return <div className={s.page}><div className={s.container}><p className={s.info}>불러오는 중…</p></div></div>
  }

  return (
    <div className={s.page}><div className={s.container}>
      <button type="button" className={s.backBtn} onClick={onList}>← 프로젝트 목록</button>
      <div className={s.head}>
        <div>
          <h1>{p.name}</h1>
          <p className={s.headMeta}>
            {p.range_start ? `${p.range_start} ~ ${p.range_end} (${p.days}일)` : '기간 미정'}
            {p.owner && <> · 책임자 <b>{p.owner}</b> {p.dept}</>}
            {p.qty && ` · ${p.qty}`}
          </p>
        </div>
        <span className={s.spacer} />
        <div>
          <span className={`${s.v} ${V_CLS[p.verdict.code]}`}>{p.verdict.label}</span>
          <p className={s.verdictSub}>진행 {p.pct}% · 기간 경과 {p.elapsed}%</p>
        </div>
      </div>

      <div className={s.tabs}>
        {[['sched', '일정'], ['sum', '요약'], ['note', '이상노트']].map(([k, label]) => (
          <button key={k} type="button" className={`${s.tab} ${tab === k ? s.tabOn : ''}`}
            onClick={() => setTab(k)}>
            {label}{k === 'note' && <span className={s.tabN}>{p.notes.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'sched' && <SchedTab p={p} reload={load} />}
      {tab === 'sum' && <SummaryTab p={p} reload={load} onDeleted={onList} />}
      {tab === 'note' && <NoteTab p={p} reload={load} />}
    </div></div>
  )
}

// ══════════════════════════════════════════════════
// 진행 현황판 — 상태 5종 카운트 + 도넛(총 작업) + 게이지 2종 (2026-08-20 개편)
//   이전엔 진행률·경과율을 한 막대에 겹쳐 그렸는데, 두 값이 가까우면 어느 쪽이 앞선 건지
//   읽히지 않았다. 막대는 분리하고 '앞섬/뒤짐' 을 숫자로 따로 말해준다.
// ══════════════════════════════════════════════════
function ProgressDash({ p }) {
  const total = STATUSES.reduce((a, st) => a + (p.counts[st] || 0), 0)
  const gapDays = p.gap_days ?? 0     // + 앞섬 / − 지연 (BE 환산값)

  return (
    <>
      <div className={s.dash}>
        <div className={s.stCards}>
          {STATUSES.map((st) => {
            const n = p.counts[st] || 0
            // 0건도 항상 보여준다 — '취소 0' 은 그 자체로 정보다 (숨기면 '없음' 과 '안 봄' 이 섞인다)
            return (
              <div key={st} className={`${s.stCard} ${n ? '' : s.stCardOff}`}>
                <span className={`${s.stHead} ${ST_HEAD[st]}`}>{st}</span>
                <b className={s.stN}>{n}</b>
              </div>
            )
          })}
        </div>

        <Donut counts={p.counts} total={total} />

        <div className={s.gauges}>
          <Gauge label="프로젝트 진행률" value={p.pct} fill={s.gProg} />
          <Gauge label="기간 경과율" value={p.elapsed} fill={s.gTime} />
          {/* 지연은 '%p' 가 아니라 '일수' 로 말한다 — 현장에서 %p 는 며칠인지로 번역이 안 된다.
              환산은 BE(psm_service._gap_days). 기간 미정이면 환산이 불가능해 문구를 감춘다. */}
          <p className={s.gapNote}>
            {total === 0 ? '작업을 추가하면 진행률이 계산됩니다.'
              : !p.days ? '기간을 정하면 지연 일수가 계산됩니다.'
                : gapDays > 0 ? <>예정보다 <b>{gapDays}일 빠름</b></>
                  : gapDays < 0 ? <>예정보다 <b className={s.gapBad}>{-gapDays}일 지연</b></>
                    : '예정대로 진행 중'}
          </p>
        </div>
      </div>
      <p className={s.dashCap}>
        진행률 — 작업 상태에서 자동 (완료 100 · 진행 입력값 · 대기 0 · 취소는 분모 제외) ·
        기간 경과율 — 오늘 기준
      </p>
    </>
  )
}

// 도넛 — 상태 구성비 + 가운데 총 작업 수. 총계만 크게 보여주던 참고 디자인에
//   구성비까지 얹었다 (같은 자리에서 "몇 건 중 뭐가 남았나" 가 한 번에 읽힌다).
function Donut({ counts, total }) {
  const R = 32
  const C = 2 * Math.PI * R
  let acc = 0
  return (
    <svg className={s.donut} width="86" height="86" viewBox="0 0 86 86"
      role="img" aria-label={`총 작업 ${total}건`}>
      <circle cx="43" cy="43" r={R} fill="none" stroke="var(--color-bg)" strokeWidth="11" />
      {total > 0 && STATUSES.map((st) => {
        const v = counts[st] || 0
        if (!v) return null
        const len = (v / total) * C
        const seg = (
          <circle key={st} cx="43" cy="43" r={R} fill="none"
            stroke={ST_COLOR[st]} strokeWidth="11"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc}
            transform="rotate(-90 43 43)" />
        )
        acc += len
        return seg
      })}
      <text x="43" y="43" textAnchor="middle" dominantBaseline="central"
        className={s.donutN}>{total}</text>
    </svg>
  )
}

function Gauge({ label, value, fill }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={s.gauge}>
      <div className={s.gaugeTop}><span>{label}</span><b>{value}%</b></div>
      <div className={s.gTrack} role="img" aria-label={`${label} ${value}%`}>
        <div className={`${s.gFill} ${fill}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 일정 탭 — 공정 스트립 + 겹침 막대 + 타임라인 (+ 인라인 편집)
// ══════════════════════════════════════════════════
function SchedTab({ p, reload }) {
  const [edit, setEdit] = useState(null)
  // edit: {type:'task', task, groupId} | {type:'newTask', groupId} | {type:'group', group} | {type:'newGroup'}

  return (
    <>
      <div className={s.card}>
        <div className={s.flow}>
          {p.groups.map((g, i) => (
            <FlowNode key={g.id} g={g} prev={p.groups[i - 1]} first={i === 0} />
          ))}
          {p.groups.length === 0 && <p className={s.mut}>공정을 추가하면 흐름이 여기 그려집니다.</p>}
        </div>
        <ProgressDash p={p} />
      </div>

      <Timeline p={p} edit={edit} setEdit={setEdit} reload={reload} />

      {edit?.type === 'newGroup' ? (
        <div className={s.card}>
          <h2>새 공정</h2>
          <GroupForm projectId={p.id} onDone={() => { setEdit(null); reload() }} onCancel={() => setEdit(null)} />
        </div>
      ) : (
        <button type="button" className={s.addGroupBtn} onClick={() => setEdit({ type: 'newGroup' })}>
          ＋ 공정 추가
        </button>
      )}
    </>
  )
}

function FlowNode({ g, prev, first }) {
  const cls = g.mode === 'done' ? s.fnodeDone : g.mode === 'run' ? s.fnodeRun : s.fnodeWait
  const done = g.tasks.filter((t) => t.status === '완료').length
  const sub = g.mode === 'done' ? `완료 ${done}/${g.tasks.length}`
    : g.mode === 'run' ? `진행 ${g.pct}%` : `대기 ${done}/${g.tasks.length}`
  return (
    <>
      {!first && <div className={`${s.fline} ${prev?.pct === 100 ? s.flineFill : ''}`} />}
      <div className={`${s.fnode} ${cls}`}>
        <div className={s.fdot}>{g.mode === 'done' ? '✓' : g.seq}</div>
        <div className={s.fname}>{g.name}</div>
        <div className={s.fsub}>{sub}</div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════
// 타임라인 — 막대가 곧 기간·상태. 행 클릭 = 인라인 편집
// ══════════════════════════════════════════════════
function Timeline({ p, edit, setEdit, reload }) {
  // ★ 그림은 chart_* (계획 밖으로 삐져나온 작업 포함), KPI 는 range_*/days (계획 기준).
  //   계획 기간으로 그리면 납기를 넘긴 작업의 막대가 width>100% 로 그리드 밖까지 뻗어
  //   스크롤 폭이 부풀고 오른쪽에 빈 공간이 생긴다 (2026-08-21 수정).
  //   BE 재시작 전에는 chart_* 가 없으므로 기존 값으로 폴백.
  const start = pd(p.chart_start || p.range_start)
  const N = p.chart_days || p.days
  if (!start || N <= 0) {
    return <div className={s.tlWrap}><p className={s.tlEmpty}>날짜가 입력된 작업이 없습니다 — 작업에 기간을 넣으면 타임라인이 그려집니다.</p></div>
  }
  if (N > MAX_TL_DAYS) {
    return <div className={s.tlWrap}><p className={s.tlEmpty}>기간이 {N}일입니다 — 날짜 입력을 확인해 주세요 (표시 상한 {MAX_TL_DAYS}일).</p></div>
  }

  const di = (iso) => Math.round((pd(iso) - start) / MS)
  const L = (i) => `${(i / N * 100).toFixed(3)}%`
  const W = (n) => `${(n / N * 100).toFixed(3)}%`
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const ti = Math.round((today - start) / MS)

  const days = []
  for (let i = 0; i < N; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i)
    days.push(d)
  }
  const closeEdit = () => setEdit(null)
  const done = () => { closeEdit(); reload() }

  return (
    <div className={s.tlWrap}>
      <div className={s.tl}>
        <div className={s.tlOver}>
          {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6)
            && <div key={`w${i}`} className={s.weBand} style={{ left: L(i), width: W(1) }} />)}
          {days.map((_, i) => i > 0
            && <div key={`l${i}`} className={s.dayLine} style={{ left: L(i) }} />)}
          {ti >= 0 && ti < N && (
            <>
              <div className={s.todayLine} style={{ left: L(ti + 0.5) }} />
              <div className={s.todayTag} style={{ left: L(ti + 0.5) }}>오늘</div>
            </>
          )}
        </div>

        <div className={`${s.tlRow} ${s.tlHead}`}>
          <div className={s.tlHeadLab}>작업 · 담당 <span className={s.mut}>(행을 누르면 수정)</span></div>
          <div className={s.dCells}>
            {days.map((d, i) => (
              <div key={i} className={`${s.dCell} ${(d.getDay() === 0 || d.getDay() === 6) ? s.dCellWe : ''} ${ti === i ? s.dCellToday : ''}`}>
                <b>{(i === 0 || d.getDate() === 1) ? `${d.getMonth() + 1}/${d.getDate()}` : d.getDate()}</b>
                {DAY_KO[d.getDay()]}
              </div>
            ))}
          </div>
        </div>

        {p.groups.map((g) => (
          <GroupRows key={g.id} g={g} di={di} L={L} W={W} N={N}
            edit={edit} setEdit={setEdit} onDone={done} onCancel={closeEdit} />
        ))}
      </div>
    </div>
  )
}

function GroupRows({ g, di, L, W, N, edit, setEdit, onDone, onCancel }) {
  return (
    <>
      <div className={`${s.tlRow} ${s.grpRow}`}>
        <div className={s.grpLab}>
          {/* 공정 머리도 1열과 같이 고정 — 스크롤해도 어느 공정 행인지 보여야 한다 */}
          <span className={s.grpLeft}>
            <span className={s.grpNo}>P{g.seq}</span>
            <span className={s.grpNm} role="button" tabIndex={0}
              onClick={() => setEdit({ type: 'group', group: g })}
              onKeyDown={(e) => e.key === 'Enter' && setEdit({ type: 'group', group: g })}>{g.name}</span>
            <span className={s.grpPl}>{[g.place, g.owner].filter(Boolean).join(' · ')}</span>
          </span>
          <span className={s.grpPc}>{g.pct}%</span>
          <button type="button" className={s.grpAdd} onClick={() => setEdit({ type: 'newTask', groupId: g.id })}>
            ＋ 작업
          </button>
        </div>
      </div>
      {edit?.type === 'group' && edit.group.id === g.id && (
        <div className={s.tlRow}><div className={s.editRow}>
          <GroupForm group={g} onDone={onDone} onCancel={onCancel} />
        </div></div>
      )}
      {edit?.type === 'newTask' && edit.groupId === g.id && (
        <div className={s.tlRow}><div className={s.editRow}>
          <TaskForm groupId={g.id} onDone={onDone} onCancel={onCancel} />
        </div></div>
      )}

      {g.tasks.map((t) => (
        <TaskRow key={t.id} t={t} g={g} di={di} L={L} W={W} N={N}
          editing={edit?.type === 'task' && edit.task.id === t.id}
          onEdit={() => setEdit({ type: 'task', task: t })}
          onDone={onDone} onCancel={onCancel} />
      ))}
    </>
  )
}

function TaskRow({ t, g, di, L, W, N, editing, onEdit, onDone, onCancel }) {
  let chart
  if (t.start_date && t.end_date) {
    const left = L(di(t.start_date)), width = W(di(t.end_date) - di(t.start_date) + 1)
    chart = t.status === '진행' ? (
      <div className={`${s.bar} ${s.barRunTrack}`} style={{ left, width }}
        title={`${fmtMD(t.start_date)} ~ ${fmtMD(t.end_date)} · 진행 ${t.progress}%`}>
        <div className={s.barInner} style={{ width: `${t.progress}%` }} />
        <span className={s.barPct}>{t.progress}%</span>
      </div>
    ) : (
      <div className={`${s.bar} ${ST_DOT[t.status]}`} style={{ left, width }}
        title={`${fmtMD(t.start_date)} ~ ${fmtMD(t.end_date)} · ${t.status}`} />
    )
  } else if (t.due_date) {
    const c = L(di(t.due_date) + 0.5)
    const flip = di(t.due_date) >= N * 0.75
    chart = (
      <>
        <div className={s.mile} style={{ left: c }} title={`납기 ${fmtMD(t.due_date)}`} />
        <span className={`${s.mileTxt} ${flip ? s.mileTxtFlip : ''}`} style={{ left: c }}>
          납기 {fmtMD(t.due_date)}
        </span>
      </>
    )
  } else {
    chart = <span className={s.tbd}>일정 미정</span>
  }

  return (
    <>
      <div className={`${s.tlRow} ${s.taskRow}`}>
        <button type="button" className={s.taskLab} onClick={onEdit}>
          <span className={s.tName}>
            <span className={`${s.tDot} ${ST_DOT[t.status]}`} />
            <span className={s.tIdx}>{t.idx}</span> {t.name}
          </span>
          <span className={s.tSub}>
            {t.worker || g.owner || '—'}
            {t.start_date && ` · ${fmtMD(t.start_date)}${t.end_date !== t.start_date ? `~${fmtMD(t.end_date)}` : ''}`}
            {!t.start_date && t.due_date && ` · 납기 ${fmtMD(t.due_date)}`}
            {` · ${t.status}`}
          </span>
          {t.memo && <span className={s.tMemo}>※ {t.memo}</span>}
        </button>
        <div className={s.chart}>{chart}</div>
      </div>
      {editing && (
        <div className={s.tlRow}><div className={s.editRow}>
          <TaskForm task={t} onDone={onDone} onCancel={onCancel} />
        </div></div>
      )}
    </>
  )
}

// ══════════════════════════════════════════════════
// 공정·작업 폼
// ══════════════════════════════════════════════════
function GroupForm({ projectId = null, group = null, onDone, onCancel }) {
  const [f, setF] = useState({ name: group?.name || '', place: group?.place || '', owner: group?.owner || '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const toast = useToast()
  const confirm = useConfirm()
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      if (group) await updatePsmGroup(group.id, f)
      else await createPsmGroup(projectId, f)
      onDone()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!await confirm({ title: '공정 삭제', message: `'${group.name}' 공정과 그 작업 ${group.tasks.length}건이 삭제됩니다.`, danger: true })) return
    try { await deletePsmGroup(group.id); onDone() } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className={s.form}>
      <div className={s.fRow}>
        <span className={s.fLab}>공정명 *</span>
        <input className={s.fInput} maxLength={60} value={f.name} onChange={set('name')} placeholder="예: 와이어 컷팅" />
      </div>
      <div className={s.fRow}>
        <span className={s.fLab}>장소·설비</span>
        <input className={s.fInput} maxLength={60} value={f.place} onChange={set('place')} placeholder="예: 2공장 / 와이어 머신" />
        <input className={s.fInput} maxLength={30} value={f.owner} onChange={set('owner')} placeholder="담당자" />
      </div>
      {err && <p className={s.err}>⚠ {err}</p>}
      <div className={s.formBtns}>
        {group && <button type="button" className={`btn-danger btn-md ${s.dangerBtn}`} onClick={remove}>삭제</button>}
        <button type="button" className="btn-secondary btn-md" onClick={onCancel}>취소</button>
        <button type="button" className="btn-primary btn-md" disabled={!f.name.trim() || saving} onClick={submit}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  )
}

function TaskForm({ groupId = null, task = null, onDone, onCancel }) {
  const [f, setF] = useState({
    name: task?.name || '', worker: task?.worker || '',
    start_date: task?.start_date || '', end_date: task?.end_date || '', due_date: task?.due_date || '',
    status: task?.status || '대기', progress: task?.progress ?? 0, memo: task?.memo || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const toast = useToast()
  const confirm = useConfirm()
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      const body = { ...f, progress: Number(f.progress) || 0 }
      if (task) await updatePsmTask(task.id, body)
      else await createPsmTask(groupId, body)
      onDone()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!await confirm({ title: '작업 삭제', message: `'${task.name}' 작업을 삭제합니다.`, danger: true })) return
    try { await deletePsmTask(task.id); onDone() } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className={s.form}>
      <div className={s.fRow}>
        <span className={s.fLab}>작업명 *</span>
        <input className={s.fInput} maxLength={120} value={f.name} onChange={set('name')} placeholder="예: 슈퍼드릴" />
        <input className={s.fInput} maxLength={30} value={f.worker} onChange={set('worker')}
          placeholder="담당 (비우면 공정 담당)" style={{ flex: '0 1 200px' }} />
      </div>
      <div className={s.fRow}>
        <span className={s.fLab}>기간</span>
        <input type="date" className={`${s.fInput} ${s.fDate}`} value={f.start_date} onChange={set('start_date')} />
        <span className={s.mut}>~</span>
        <input type="date" className={`${s.fInput} ${s.fDate}`} value={f.end_date} onChange={set('end_date')} />
        <span className={s.mut}>· 납기만</span>
        <input type="date" className={`${s.fInput} ${s.fDate}`} value={f.due_date} onChange={set('due_date')} />
      </div>
      <div className={s.fRow}>
        <span className={s.fLab}>상태</span>
        <div className={s.segRow}>
          {STATUSES.map((st) => (
            <button key={st} type="button" className={`${s.seg} ${f.status === st ? s.segOn : ''}`}
              aria-pressed={f.status === st}
              onClick={() => setF((p) => ({ ...p, status: st }))}>{st}</button>
          ))}
        </div>
        {f.status === '진행' && (
          <>
            <input type="number" inputMode="numeric" min="0" max="100"
              className={`${s.fInput} ${s.fNum}`} value={f.progress} onChange={set('progress')} />
            <span className={s.mut}>%</span>
          </>
        )}
      </div>
      <div className={s.fRow}>
        <span className={s.fLab}>메모</span>
        <input className={s.fInput} maxLength={200} value={f.memo} onChange={set('memo')}
          placeholder="예: 케미스타 입고시 완료 일정 확인 (선택)" />
      </div>
      {err && <p className={s.err}>⚠ {err}</p>}
      <div className={s.formBtns}>
        {task && <button type="button" className={`btn-danger btn-md ${s.dangerBtn}`} onClick={remove}>삭제</button>}
        <button type="button" className="btn-secondary btn-md" onClick={onCancel}>취소</button>
        <button type="button" className="btn-primary btn-md" disabled={!f.name.trim() || saving} onClick={submit}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 요약 탭 — Project Notice + 공정별 진행(자동) + 참여 인원(자동)
// ══════════════════════════════════════════════════
function SummaryTab({ p, reload, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()

  const removeProject = async () => {
    if (!await confirm({ title: '프로젝트 삭제', message: `'${p.name}' 프로젝트와 모든 공정·작업·이상노트가 삭제됩니다.`, danger: true, requireText: p.name })) return
    try { await deletePsmProject(p.id); toast('프로젝트 삭제됨'); onDeleted() } catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <div className={s.card}>
        <h2>Project Notice
          <button type="button" className="btn-text" style={{ marginLeft: 10 }} onClick={() => setEditing((v) => !v)}>
            {editing ? '닫기' : '수정'}
          </button>
        </h2>
        {editing ? (
          <ProjectForm init={p} onSaved={() => { setEditing(false); reload() }} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <dl className={s.kv}>
              <dt>제품명</dt><dd>{p.name}</dd>
              <dt>제작 수량</dt><dd>{p.qty || '—'}</dd>
              <dt>담당자</dt><dd>{p.owner || '—'} <span className={s.mut}>{p.dept}</span></dd>
              <dt>프로젝트 기간</dt>
              <dd>{p.range_start ? `${p.range_start} ~ ${p.range_end}` : '미정'} <span className={s.mut}>{p.days ? `(${p.days}일)` : ''}</span></dd>
              <dt>필요 납기</dt><dd>{p.range_end || '—'}</dd>
              {/* 최초 생성자 / 마지막 수정자 (2026-08-20) — 수정자는 공정·작업·이상노트를 고쳐도 갱신된다 */}
              <dt>등록</dt>
              <dd>{p.created_by || '—'}
                {p.created_at && <span className={s.mut}> · {fmtKstDateTime(p.created_at)}</span>}
              </dd>
              <dt>최종 수정</dt>
              <dd>{p.updated_by || '—'}
                {p.updated_at && <span className={s.mut}> · {fmtKstDateTime(p.updated_at)}</span>}
              </dd>
            </dl>
            {p.notice && (
              <>
                <div style={{ height: 16 }} />
                <h2>특이 사항 · 중점 확인 사항</h2>
                <div className={s.noteBox}>{p.notice}</div>
              </>
            )}
          </>
        )}
      </div>

      <div className={s.card}>
        <h2>공정별 진행<span className={s.autoTag}>자동</span>
          <span className={s.hint}>일정 탭의 공정·작업을 그대로 — 따로 입력하지 않습니다</span></h2>
        <div className={s.procGrid}>
          {p.groups.map((g) => (
            <div key={g.id} className={s.proc}>
              <div className={s.procHead}>
                <span className={s.procN}>P{g.seq}</span><span className={s.procNm}>{g.name}</span>
                <span className={s.procPc}>{g.pct}%</span>
              </div>
              <div className={s.procMeta}>
                {[g.place, g.owner].filter(Boolean).join(' · ') || '—'}
                {` · ${g.tasks.filter((t) => t.status === '완료').length}/${g.tasks.length} 완료`}
              </div>
              {g.tasks.map((t) => (
                <div key={t.id} className={s.procRow}>
                  <span className={`${s.tDot} ${ST_DOT[t.status]}`} />
                  <span className={s.procTask}>{t.name}</span>
                  <span className={s.procSt}>{t.status}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className={s.card}>
        <h2>참여 인원<span className={s.autoTag}>자동</span><span className={s.hint}>담당자에서 집계</span></h2>
        {p.people.length === 0 ? <p className={s.mut}>담당자가 입력된 공정·작업이 없습니다.</p> : (
          <table className={s.table}>
            {/* .colName(nowrap) + .colGrow(width:100%) 는 짝 — 한쪽만 쓰면 폭 배분이 무너진다.
                ⚠️ .tName 은 타임라인 작업 라벨용이라 여기 쓰면 안 된다 (같은 클래스로 합쳐짐) */}
            <thead><tr><th className={s.colName}>이름</th><th className={s.colGrow}>참여 공정</th></tr></thead>
            <tbody>
              {p.people.map((m) => (
                <tr key={m.name}><td className={s.colName}><b>{m.name}</b></td><td className={s.mut}>{m.procs}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={s.formBtns}>
        <button type="button" className={`btn-danger btn-md ${s.dangerBtn}`} onClick={removeProject}>
          프로젝트 삭제
        </button>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════
// 이상노트 탭 — 발생 공정·내용·조치만. 결재란 대신 작성자·시각 자동
// ══════════════════════════════════════════════════
function NoteTab({ p, reload }) {
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ process: '', content: '', action: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const toast = useToast()
  const confirm = useConfirm()
  const set = (k) => (e) => setF((p2) => ({ ...p2, [k]: e.target.value }))

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      await createPsmNote(p.id, f)
      setF({ process: '', content: '', action: '' }); setAdding(false); reload()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }
  const remove = async (n) => {
    if (!await confirm({ title: '이상 기록 삭제', message: '이 기록을 삭제합니다.', danger: true })) return
    try { await deletePsmNote(n.id); reload() } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className={s.card}>
      <h2>이상 발생 리포트
        <button type="button" className="btn-text" style={{ marginLeft: 10 }} onClick={() => setAdding((v) => !v)}>
          {adding ? '닫기' : '＋ 이상 기록'}
        </button>
      </h2>

      {adding && (
        <div className={s.form} style={{ marginBottom: 16 }}>
          <div className={s.fRow}>
            <span className={s.fLab}>공정</span>
            <input className={s.fInput} maxLength={60} list="psmProcs" value={f.process} onChange={set('process')}
              placeholder="발생 공정" style={{ flex: '0 1 220px' }} />
            <datalist id="psmProcs">
              {p.groups.map((g) => <option key={g.id} value={g.name} />)}
            </datalist>
          </div>
          <div className={s.fRow}>
            <span className={s.fLab}>내용 *</span>
            <input className={s.fInput} maxLength={300} value={f.content} onChange={set('content')}
              placeholder="발생 내용" />
          </div>
          <div className={s.fRow}>
            <span className={s.fLab}>조치</span>
            <input className={s.fInput} maxLength={300} value={f.action} onChange={set('action')}
              placeholder="조치사항 (선택)" />
          </div>
          {err && <p className={s.err}>⚠ {err}</p>}
          <div className={s.formBtns}>
            <button type="button" className="btn-secondary btn-md" onClick={() => setAdding(false)}>취소</button>
            <button type="button" className="btn-primary btn-md" disabled={!f.content.trim() || saving} onClick={submit}>
              {saving ? '등록 중…' : '등록'}
            </button>
          </div>
        </div>
      )}

      {p.notes.length === 0 && !adding && (
        <div className={s.empty}>
          <p>기록된 이상이 없습니다.<br />공정 진행 중 문제가 생기면 여기에 남겨 주세요.</p>
          <button type="button" className="btn-primary btn-md" onClick={() => setAdding(true)}>＋ 이상 기록</button>
        </div>
      )}

      {p.notes.map((n) => (
        <div key={n.id} className={s.nCard}>
          <div className={s.nTop}>
            {n.process && <span className={s.nProc}>{n.process}</span>}
            <span className={s.nAt}>{n.created_by}{n.created_by && ' · '}{fmtKstDateTime(n.created_at)}</span>
            <button type="button" className={s.nDel} onClick={() => remove(n)}>삭제</button>
          </div>
          <p className={s.nWhat}>{n.content}</p>
          {n.action && <p className={s.nAct}><b>조치</b> {n.action}</p>}
        </div>
      ))}
    </div>
  )
}
