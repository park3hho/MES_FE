// pages/adm/manage/TracePage.jsx
// LOT 이력 조회 — 객체화 그래프 네비게이션 (2026-04-24 리뉴얼)
// BE entities 맵 기반: 스캔 LOT → 관련 모든 객체 카드 탐색 가능
// 히스토리 스택으로 뒤로 가기, upstream/contains 클릭으로 노드 이동
// Core 번호 체계 (배포4, 2026-09-12) — 조회 LOT 이 Core 에 매달려 있으면 검색 줄 아래에 Core 요약 칸 (CoreSection)

import { useState, useEffect, useRef, Fragment } from 'react'
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom'
import { traceLot } from '@/api'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import LifelineView from '@/components/TracePage/LifelineView'
import SkeletonLotTimeline from '@/components/SkeletonLotTimeline'
import { PROCESS_LIST, MOTOR_LABEL } from '@/constants/processConst'
import { fmtKstDateTime } from '@/utils/dateConvert'
import s from './TracePage.module.css'

// ════════════════════════════════════════════
// Core 요약 칸 (배포4 — 목업 B '공정 스텝' 채택, 2026-09-12)
//   BE /lot/trace 응답의 result.core 가 있을 때만 그린다 (없으면 칸 자체가 없다 = 종전 화면).
//   ★ 모듈 스코프 컴포넌트 — 부모 값은 props 로만 받는다 (FinishedInventoryPage `presenting` 사고 참조).
//   ★ 공정 순서·이름은 processConst.PROCESS_LIST 에서 파생한다 (공정 정의 진실의 원천).
// ════════════════════════════════════════════
const PROC_KEYS = PROCESS_LIST.map((p) => p.key)
const BIRTH_IDX = PROC_KEYS.indexOf('BO')
// 칩 레일 = 탄생(BO) ~ 완제품(FP)
const CORE_RAIL = PROCESS_LIST.slice(BIRTH_IDX, PROC_KEYS.indexOf('FP') + 1)
// 탄생 전 공정 — born_from 키(ht/ea/mp/rm) 를 가까운 공정부터
const BORN_KEYS = PROC_KEYS.slice(0, BIRTH_IDX).map((k) => k.toLowerCase()).reverse()
const CORE_NO_RE = /^CORE-\d{6}-\d{4}$/i

// 'MM-DD HH:mm' (KST) — fmtKstDateTime 이 이미 KST 로 바꾼 'YYYY-MM-DD HH:mm' 을 자른다 (ISO 원문 슬라이스 아님)
const shortTime = (iso) => {
  const t = fmtKstDateTime(iso)
  return t && t.length >= 16 ? t.slice(5, 16) : ''
}

// 되돌린 공정이 탄생 이전이면 스택을 푼 것(해체)
const isDissolve = (proc) => {
  const i = PROC_KEYS.indexOf(proc)
  return i > -1 && i < BIRTH_IDX
}

function CoreSection({ core, onNavigate }) {
  const [open, setOpen] = useState(false)
  const ops = core.operations || []
  const live = ops.filter((o) => !o.void)
  const last = live[live.length - 1]
  const active = core.status === 'active'
  const born = core.born_from || {}
  const ancestors = born.dissolved_from || []
  const reworks = core.reworks || []
  const motor = MOTOR_LABEL[core.motor_type] || core.motor_type || ''
  const bornKeys = BORN_KEYS.filter((k) => (born[k] || []).length > 0)
  const subParts = [
    core.phi && <b key="model">Φ{core.phi}{motor && ` · ${motor}`}</b>,
    core.born_at && <span key="born">본딩 {shortTime(core.born_at)}</span>,
    core.serial_no && <span key="serial">시리얼 <b>{core.serial_no}</b></span>,
  ].filter(Boolean)

  return (
    <section className={s.core}>
      <div className={s.coreTop}>
        <span className={s.coreKicker}>CORE</span>
        <span className={s.coreNo}>{core.core_no}</span>
        <span className={`${s.coreChip} ${s[`coreSt_${core.status}`] || ''}`}>{core.status_label}</span>
      </div>
      {subParts.length > 0 && (
        <div className={s.coreSub}>
          {subParts.map((p, i) => <Fragment key={i}>{i > 0 && ' · '}{p}</Fragment>)}
        </div>
      )}
      {ancestors.length > 0 && (
        <div className={s.coreLineage}>
          ↳ {ancestors.map((no, i) => (
            <Fragment key={no}>
              {i > 0 && ', '}
              <button type="button" className={s.linkBtn} onClick={() => onNavigate(no)}>{no}</button>
            </Fragment>
          ))} 을 풀어 다시 본딩
        </div>
      )}

      {/* 공정 스텝 — 지금 어디 있는지가 먼저 보이게 */}
      <div className={s.coreSteps}>
        {CORE_RAIL.map((p, i) => {
          const n = live.filter((o) => o.process === p.key).length
          const v = ops.filter((o) => o.void && o.process === p.key).length
          const isNow = active && last?.process === p.key
          const label = isNow ? (n > 1 ? `지금 · ${n}회` : '지금') : (n ? `${n}회` : '–')
          return (
            <Fragment key={p.key}>
              {i > 0 && <span className={s.stepArrow}>›</span>}
              <div className={`${s.step} ${isNow ? s.stepNow : (n ? s.stepDone : '')}`} title={p.label}>
                <span className={s.stepCode}>{p.key}</span>
                <span className={`${s.stepN} ${v ? s.stepWarn : ''}`}>{label}{v ? ` · 무효${v}` : ''}</span>
              </div>
            </Fragment>
          )
        })}
      </div>

      {/* 재공정 — 결정 1건 = 1줄 (사유는 되돌리기 때 필수로 받은 값) */}
      {reworks.length > 0 && (
        <>
          <div className={s.coreSecLabel}>재공정 {reworks.length}회</div>
          {reworks.map((r, i) => (
            <div key={i} className={s.rwRow}>
              <span className={s.rwWhen}>{shortTime(r.decided_at)}</span>
              <span className={s.rwWhat}>
                <b>{r.ng_process && `${r.ng_process} 불량 → `}{r.restart_process} 부터{isDissolve(r.restart_process) && ' (해체)'}</b>
                {(r.defect_code || r.reason) && (
                  <span className={s.rwWhy}> · {[r.defect_code, r.reason].filter(Boolean).join(' · ')}</span>
                )}
              </span>
            </div>
          ))}
        </>
      )}

      {/* 회차별 LOT — 눌러야 펼친다 (Progressive Disclosure) */}
      <button type="button" className={s.coreMore} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{open ? '회차별 LOT 접기' : `회차별 LOT ${ops.length}건 보기`}</span>
        <span className={`${s.coreChevron} ${open ? s.coreChevronOpen : ''}`}>›</span>
      </button>
      {open && (
        <div className={s.opList}>
          {ops.map((o) => {
            const isNow = active && !o.void && o === last
            return (
              <div key={`${o.process}-${o.pass_no}`}
                className={`${s.opRow} ${o.void ? s.opVoid : ''} ${isNow ? s.opNow : ''}`}>
                <span className={`${s.opBadge} ${s[`opBadge_${o.process}`] || ''}`}>{o.process}</span>
                <span className={s.opPass}>{o.pass_no}회</span>
                <button type="button" className={s.opLot} onClick={() => onNavigate(o.lot_no)}>
                  {o.lot_no}
                  {o.void && <span className={s.voidTag}>채번오류</span>}
                  {isNow && <span className={s.nowTag}>지금</span>}
                </button>
                <span className={s.opTime}>{shortTime(o.occurred_at)}</span>
                {o.rework && (
                  <span className={s.opRwNote}>
                    ↺ 재공정 — {o.rework.ng_process && `${o.rework.ng_process} 불량으로 `}{o.rework.restart_process} 부터
                    {o.rework.reason && ` · ${o.rework.reason}`}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {bornKeys.length > 0 && (
        <p className={s.corePre}>
          <b>탄생 전</b>
          {bornKeys.map((k, i) => (
            <Fragment key={k}>{i > 0 && ' / '}{k.toUpperCase()} {born[k].join(' · ')}</Fragment>
          ))}
        </p>
      )}
    </section>
  )
}

export default function TracePage({ onLogout, onBack }) {
  // 외부 진입점 지원 (2026-04-24) — 송장 관리 등에서 OB 번호 클릭 → 자동 스캔
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const DAY_BATCH_PROCS = ['MP', 'EA', 'HT', 'BO', 'EC', 'WI', 'SO', 'IQ', 'OQ', 'UB', 'MB', 'OB']
  const initialLot = location.state?.lotNo || searchParams.get('lot') || null
  const autoScanned = useRef(false)

  const [result, setResult] = useState(null)
  // 마지막으로 조회한 입력값 — Core QR 로 들어왔는지 표시용 (결과 lot_no 는 그 Core 의 BO LOT 으로 바뀌어 온다)
  const [query, setQuery] = useState(initialLot)
  const [loading, setLoading] = useState(!!initialLot)
  const [step, setStep] = useState(initialLot ? 'result' : 'qr')
  const [autoError, setAutoError] = useState(null)

  const handleScan = async (val) => {
    setLoading(true)
    try {
      const data = await traceLot(val)
      setResult(data)
      setQuery(val)
      setStep('result')
    } catch (e) {
      throw new Error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (autoScanned.current) return
    if (!initialLot) return
    autoScanned.current = true
    handleScan(initialLot).catch((e) => {
      console.error('자동 스캔 실패:', e.message)
      setAutoError(`${initialLot} 이력 조회 실패 — ${e.message}`)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 교체품/원본 클릭 → 새 trace 조회로 화면 전환 (Core 칸의 LOT·조상 Core 클릭도 여기로)
  const navigateTo = async (lotNo) => {
    if (!lotNo) return
    setLoading(true)
    try {
      const data = await traceLot(lotNo)
      setResult(data)
      setQuery(lotNo)
    } catch (e) {
      console.error('재조회 실패:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setResult(null)
    setStep('qr')
  }

  if (step === 'qr') {
    return (
      <QRScanner
        processLabel="LOT 이력 조회"
        onScan={handleScan}
        onLogout={onLogout}
        onBack={onBack}
      />
    )
  }

  return (
    <div className="page-flat">
      <PageHeader title="LOT 이력 조회" onBack={onBack} />

      {/* 상단: 스캔 정보 */}
      <div className={s.searchBar}>
        <div className={s.searchInfo}>
          <span className={s.searchLabel}>조회</span>
          <span className={s.searchValue}>{result?.lot_no}</span>
          {CORE_NO_RE.test((query || '').trim()) && <span className={s.viaTag}>Core QR</span>}
          {result?.scanned_process && (
            <span className={s.searchProcess}>{result.scanned_process}</span>
          )}
        </div>
        <div className={s.searchActions}>
          {result?.work_date && DAY_BATCH_PROCS.includes(result?.scanned_process) && (
            <button type="button" className={s.dayBatchBtn}
              onClick={() => navigate(
                `/admin/day-batch?process=${result.scanned_process}&date=${result.work_date}`,
              )}>
              같은 날 · {result.scanned_process} 전체 보기
            </button>
          )}
          <button type="button" className={s.resetBtn} onClick={handleReset}>
            다시 조회
          </button>
        </div>
      </div>

      {/* Core 요약 (배포4) — 조회 LOT 이 Core 에 매달려 있을 때만. key 로 Core 가 바뀌면 펼침 상태 초기화 */}
      {!loading && result?.core && (
        <CoreSection key={result.core.core_no} core={result.core} onNavigate={navigateTo} />
      )}

      {/* 자동 스캔 실패 */}
      {!loading && autoError && !result && (
        <div className={s.empty} style={{ color: 'var(--color-error)', whiteSpace: 'pre-line' }}>
          ⚠ {autoError}
          {'\n\n'}• 해당 LOT 번호가 snbt 체인에 기록되지 않았을 수 있습니다
          {'\n'}"다시 조회" 버튼으로 QR 스캐너에서 직접 재스캔해보세요
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className={s.timeline}>
          <SkeletonLotTimeline />
        </div>
      )}

      {/* 세로 생애 타임라인 (2026-06-05) */}
      {!loading && result?.entities && (
        <LifelineView
          entities={result.entities}
          scannedLot={result.lot_no}
          scannedProcess={result.scanned_process}
          repairSiblings={result.repair_siblings || []}
          chainRepairSummary={result.chain_repair_summary || []}
          inspections={result.inspections || []}
          onNavigate={navigateTo}
        />
      )}

      {/* 이력 없음 */}
      {!loading && !result?.entities && !autoError && (
        <div className={s.empty}>이력이 없습니다.</div>
      )}
    </div>
  )
}
