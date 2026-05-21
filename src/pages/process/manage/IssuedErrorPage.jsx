// pages/process/manage/IssuedErrorPage.jsx
// LOT 채번 오류 처리 (2026-05-20) — 라벨 오발급(실물 없음) soft 삭제 워크플로.
// Toss flat · 별도 페이지 (미배포 메뉴 진입).
//
// 흐름:
//   1) 공정 + LOT 번호 입력 → "미리보기" 로 영향 범위 표시 (Inventory 상태/snbt 카운트)
//   2) Inventory 가 in_stock/in_inspection 일 때만 처리 가능 (BE 가드)
//   3) 사유 입력 후 "채번 오류 처리" → LotXX + Inventory + SnbtXX 일괄 마킹
//   4) 하단 표 = 현재 마킹된 LOT 목록. team_rnd 만 [해제] 버튼 (403 시 alert)

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  previewIssueError, markIssueError, undoIssueError, listIssueErrors,
  previewRestoreUpstream, restoreUpstreamInventory,
} from '@/api'
import { useToast } from '@/contexts/ToastContext'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import s from './IssuedErrorPage.module.css'

// BE core/lot_config.PROCESS_ORDER 와 동기 (FP 는 LotXX 없어 제외)
const PROCESSES = [
  'RM', 'MP', 'EA', 'HT', 'BO', 'EC',
  'WI', 'SO', 'IQ', 'OQ', 'UB', 'MB', 'OB',
]

const STATUS_LABEL = {
  in_stock: '재고', in_inspection: '검사중',
  consumed: '소비됨', shipped: '출하됨',
  discarded: '폐기', repair: '수리',
  internal_use: '사내사용', issued_error: '채번오류',
}

export default function IssuedErrorPage({ onBack }) {
  const toast = useToast()
  const confirm = useConfirm()
  // 입력
  const [process, setProcess] = useState('MP')
  const [lotNo, setLotNo] = useState('')
  const [reason, setReason] = useState('')
  // 미리보기 결과
  const [preview, setPreview] = useState(null)   // null | {exists, blockable, inventory[], snbt_count, already_marked}
  const [previewing, setPreviewing] = useState(false)
  const [marking, setMarking] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [formOk, setFormOk] = useState('')
  // 목록
  const [items, setItems] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listErr, setListErr] = useState('')
  // 뷰 모드 — list(기본) | restore(상위 Inventory 복원, 예민 동작이라 별도 페이지)
  const [view, setView] = useState({ mode: 'list' })
  const backToList = () => { setView({ mode: 'list' }); reloadList() }

  const reloadList = useCallback(async () => {
    setListLoading(true); setListErr('')
    try { setItems(await listIssueErrors(100)) }
    catch (e) { setListErr(e.message || '목록 로드 실패') }
    finally { setListLoading(false) }
  }, [])
  useEffect(() => { reloadList() }, [reloadList])

  const doPreview = async () => {
    const ln = lotNo.trim()
    if (!ln) { setFormErr('LOT 번호를 입력하세요.'); return }
    setPreviewing(true); setFormErr(''); setFormOk(''); setPreview(null)
    try {
      const pv = await previewIssueError(process, ln)
      setPreview(pv)
      if (!pv.exists) setFormErr(`${process} LOT 을 찾을 수 없습니다: ${ln}`)
      else if (pv.already_marked) setFormErr('이미 채번오류 처리된 LOT 입니다.')
      else if (!pv.blockable) setFormErr('이미 후속 공정에서 소비/처리되어 처리할 수 없습니다.')
    } catch (e) { setFormErr(e.message || '미리보기 실패') }
    finally { setPreviewing(false) }
  }

  const doMark = async () => {
    const rsn = reason.trim()
    if (!rsn) { setFormErr('사유를 입력하세요.'); return }
    if (!preview?.blockable) { setFormErr('미리보기로 처리 가능 여부를 먼저 확인하세요.'); return }
    setMarking(true); setFormErr('')
    try {
      const r = await markIssueError(process, lotNo.trim(), rsn)
      setFormOk(`처리 완료 — Inventory ${r.inventory_marked}개 / snbt ${r.snbt_marked}개 마킹.`)
      setLotNo(''); setReason(''); setPreview(null)
      reloadList()
    } catch (e) { setFormErr(e.message || '처리 실패') }
    finally { setMarking(false) }
  }

  const doUndo = async (it) => {
    if (!(await confirm({
      title: '채번오류 처리 해제',
      message: `'${it.lot_no}' 채번오류 처리를 해제할까요?\n(team_rnd 전용 — 다른 역할은 거부됩니다)`,
      confirmText: '해제',
    }))) return
    try {
      await undoIssueError(it.process, it.lot_no)
      reloadList()
      toast('처리가 해제되었습니다', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const fmtKst = (iso) => {
    if (!iso) return '-'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
  }

  // 상위 Inventory 복원 — 별도 뷰. 가드/미리보기/실제 복원이 모두 BE 보장.
  if (view.mode === 'restore') {
    return <RestoreUpstreamView item={view.item} onBack={backToList} />
  }

  return (
    <div className="page-flat">
      <PageHeader title="LOT 채번 오류 처리"
        subtitle="라벨 오발급(실물 없음) soft 삭제 · 시퀀스 영향 없음"
        onBack={onBack} />

      {/* ── 신규 처리 ──────────────────────────────────────── */}
      <div className={s.section}>
        <h3 className={s.sectTitle}>새 처리</h3>
        <div className={s.inputRow}>
          <select value={process} onChange={(e) => { setProcess(e.target.value); setPreview(null) }}>
            {PROCESSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className={s.lotInput} placeholder="LOT 번호 (예: SR130120260520-19)"
            value={lotNo} onChange={(e) => { setLotNo(e.target.value); setPreview(null) }}
            onKeyDown={(e) => e.key === 'Enter' && doPreview()} />
          <button type="button" className="btn-secondary btn-md" onClick={doPreview} disabled={previewing}>
            {previewing ? '확인 중...' : '미리보기'}
          </button>
        </div>

        {preview?.exists && (
          <div className={s.previewBox}>
            <div className={s.previewRow}>
              <span className={s.label}>Inventory ({preview.inventory.length}개):</span>
              {preview.inventory.length === 0
                ? <span className={s.muted}>없음</span>
                : preview.inventory.map((r) => (
                    <span key={r.id} className={`${s.statusChip} ${s[`st_${r.status}`] || ''}`}>
                      {STATUS_LABEL[r.status] || r.status} · {r.quantity}
                    </span>
                  ))}
            </div>
            <div className={s.previewRow}>
              <span className={s.label}>SnbtXX 행:</span>
              <span>{preview.snbt_count}개</span>
              {preview.already_marked && <span className={s.warnChip}>이미 마킹됨</span>}
              {preview.blockable
                ? <span className={s.okChip}>처리 가능</span>
                : <span className={s.warnChip}>처리 불가 — 다운스트림 정리 필요</span>}
            </div>
          </div>
        )}

        {preview?.blockable && !preview.already_marked && (
          <div className={s.inputRow}>
            <textarea className={s.reasonInput} rows={2}
              placeholder="사유 (필수, 최대 300자)"
              value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} />
            <button type="button" className="btn-primary btn-md" onClick={doMark} disabled={marking}>
              {marking ? '처리 중...' : '채번 오류 처리'}
            </button>
          </div>
        )}

        {formErr && <p className={s.err}>{formErr}</p>}
        {formOk && <p className={s.ok}>{formOk}</p>}
      </div>

      {/* ── 처리 이력 ──────────────────────────────────────── */}
      <div className={s.section}>
        <h3 className={s.sectTitle}>처리 이력 (최근 100건)</h3>
        {listLoading && <p className={s.muted}>로딩 중...</p>}
        {listErr && <p className={s.err}>{listErr}</p>}
        {!listLoading && items.length === 0 && <p className={s.muted}>처리된 LOT 이 없습니다.</p>}
        {!listLoading && items.length > 0 && (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>공정</th><th>LOT 번호</th><th>처리 시각 (KST)</th>
                  <th>사유</th><th>처리자</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={`${it.process}-${it.lot_no}`}>
                    <td>{it.process}</td>
                    <td className={s.mono}>{it.lot_no}</td>
                    <td>{fmtKst(it.issued_error_at)}</td>
                    <td className={s.reasonCell}>{it.issued_error_reason || '-'}</td>
                    <td>{it.issued_error_by ?? '-'}</td>
                    <td className={s.actionsCell}>
                      <button type="button" className={s.restoreBtn}
                        onClick={() => setView({ mode: 'restore', item: it })}>
                        상위 복원
                      </button>
                      <button type="button" className={s.undoBtn} onClick={() => doUndo(it)}>
                        해제
                      </button>
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

// ════════════════════════════════════════════
// 상위 Inventory 복원 뷰 — 예민한 동작이라 별도 페이지 (Toss flat)
// ════════════════════════════════════════════
// 흐름:
//   1) 진입 즉시 BE preview 호출 → 가드 1(다운스트림 마킹 여부) 결과 표시
//   2) 가드 1 통과 시 상위 LOT 목록 + 각 행 상태(consumed/그 외)/restorable 표시
//   3) "복원 실행" 클릭 → BE 가 가드 2(consumed 재확인) + 실제 복원
//   4) restored / skipped 명세 + 사유까지 사용자에게 보여줌
// 모든 분기에 명확한 화면 메시지. BE 가 로깅 책임.
function RestoreUpstreamView({ item, onBack }) {
  const confirm = useConfirm()
  const [pv, setPv] = useState(null)        // preview 결과
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)   // 복원 후 결과

  const loadPreview = useCallback(async () => {
    setLoading(true); setErr(''); setResult(null); setPv(null)
    try { setPv(await previewRestoreUpstream(item.process, item.lot_no)) }
    catch (e) { setErr(e.message || '미리보기 실패') }
    finally { setLoading(false) }
  }, [item.process, item.lot_no])
  useEffect(() => { loadPreview() }, [loadPreview])

  const doRestore = async () => {
    if (!pv?.ready) return
    if (!(await confirm({
      title: '상위 재고 복원',
      message:
        `상위 Inventory ${pv.upstream.filter((u) => u.restorable).length}개를 ` +
        `'consumed' → 'in_stock' 으로 복원합니다.\n계속할까요?`,
      confirmText: '복원',
    }))) return
    setRunning(true); setErr('')
    try {
      const r = await restoreUpstreamInventory(item.process, item.lot_no)
      setResult(r)
    } catch (e) { setErr(e.message || '복원 실패') }
    finally { setRunning(false) }
  }

  const fmtKst = (iso) => {
    if (!iso) return '-'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="상위 Inventory 복원"
        subtitle={`${item.process} / ${item.lot_no} — 채번오류 처리된 LOT 이 소비했던 상위 항목 복원`}
        onBack={onBack}
      />

      <div className={s.section}>
        {loading && <p className={s.muted}>가드 검증 중...</p>}
        {err && <p className={s.err}>{err}</p>}

        {/* 가드 1 — 다운스트림 채번오류 처리 여부 */}
        {pv && pv.error && (
          <div className={s.guardFailBox}>
            <div className={s.guardFailTitle}>⚠ 가드 검증 실패 — 복원 불가</div>
            <div>{pv.error}</div>
          </div>
        )}
        {pv && !pv.error && (
          <div className={s.guardOkBox}>
            ✓ 가드 1 통과 — 다운스트림 LOT이 채번오류 처리됨 ({fmtKst(pv.downstream_marked_at)} KST)
          </div>
        )}

        {/* 가드 2 — 상위 LOT 목록 + 각 행 상태 */}
        {pv && !pv.error && (
          <>
            <h3 className={s.sectTitle} style={{ marginTop: 20 }}>
              상위 LOT 현황 ({pv.upstream.length}건)
            </h3>
            {pv.upstream.length === 0 && (
              <p className={s.muted}>SnbtXX 에서 추출된 상위 LOT 이 없습니다.</p>
            )}
            {pv.upstream.length > 0 && (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>공정</th><th>LOT 번호</th>
                      <th>현재 Inventory status</th>
                      <th>복원 대상</th>
                      <th>사유 (skip 인 경우)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pv.upstream.map((u, i) => (
                      <tr key={`${u.process}-${u.lot_no}-${i}`}>
                        <td>{u.process}</td>
                        <td className={s.mono}>{u.lot_no}</td>
                        <td>
                          <span className={`${s.statusChip} ${s[`st_${u.inventory_status}`] || ''}`}>
                            {STATUS_LABEL[u.inventory_status] || u.inventory_status || '-'}
                          </span>
                        </td>
                        <td>
                          {u.restorable
                            ? <span className={s.okChip}>복원 예정</span>
                            : <span className={s.warnChip}>skip</span>}
                        </td>
                        <td className={s.reasonCell}>{u.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className={s.inputRow} style={{ marginTop: 16 }}>
              {pv.ready
                ? (
                  <button type="button" className="btn-primary btn-md"
                    onClick={doRestore} disabled={running}>
                    {running ? '복원 중...' : '복원 실행 (consumed → in_stock)'}
                  </button>
                )
                : (
                  <span className={s.muted}>
                    복원 가능한 상위가 없습니다 (모두 'consumed' 가 아님).
                  </span>
                )}
              <button type="button" className="btn-secondary btn-md" onClick={loadPreview} disabled={running}>
                새로고침
              </button>
            </div>
          </>
        )}

        {/* 복원 결과 — restored / skipped 모두 명세 */}
        {result && (
          <div className={s.resultBox}>
            <div className={s.sectTitle}>
              복원 결과 — 성공 {result.total_restored} · 스킵 {result.total_skipped}
            </div>
            {result.restored.length > 0 && (
              <>
                <p className={s.label} style={{ marginTop: 8 }}>✓ 복원됨</p>
                <ul className={s.resultList}>
                  {result.restored.map((r, i) => (
                    <li key={i}>
                      <code>{r.process}/{r.lot_no}</code> · {r.from_status} → {r.to_status}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {result.skipped.length > 0 && (
              <>
                <p className={s.label} style={{ marginTop: 8 }}>⚠ 스킵됨</p>
                <ul className={s.resultList}>
                  {result.skipped.map((r, i) => (
                    <li key={i}>
                      <code>{r.process}/{r.lot_no}</code> — {r.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
