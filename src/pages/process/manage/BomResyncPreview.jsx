// pages/process/manage/BomResyncPreview.jsx
// Resync 미리보기 — 동기화 적용 전 "뭐가 어떻게 바뀌나" 표시 (2026-05-21).
// 사용자 요청: 트리/상세는 snapshot 기반(옛 값), preview 만 새 값 비교 표시.
// Toss flat 별도 뷰 (BomManagePage view='resyncPreview' 로 진입).

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { getBomResyncPreview, resyncBom } from '@/api'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import s from './BomManagePage.module.css'

const KIND_LABEL = {
  update: '갱신',
  add: '추가',
  remove: '삭제',
  kept_override: 'OVERRIDE 보존',
  kept_own: 'OWN 보존',
}

const fmt = (v) => {
  if (v == null) return '-'
  if (typeof v === 'number') {
    // 가격/수량은 천단위 + 소수점 4자리까지
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 4 })
  }
  return String(v)
}

export default function BomResyncPreview({ bom, onBack, onApplied }) {
  const confirm = useConfirm()
  const [pv, setPv] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(''); setPv(null); setResult(null)
    try {
      const p = await getBomResyncPreview(bom.id)
      setPv(p)
      if (p.error) setErr(p.error)
    } catch (e) { setErr(e.message || '미리보기 실패') }
    finally { setLoading(false) }
  }, [bom.id])
  useEffect(() => { load() }, [load])

  const doApply = async () => {
    if (!pv?.ready) return
    const sum = pv.summary
    if (!await confirm({
      title: '동기화 적용',
      message:
        `이 변경 사항으로 동기화를 적용합니다.\n\n` +
        `· 갱신: ${sum.update}  · 추가: ${sum.add}  · 삭제: ${sum.remove}\n` +
        `· OVERRIDE 보존: ${sum.kept_override}  · OWN 보존: ${sum.kept_own}\n\n` +
        `계속할까요?`,
      confirmText: '적용',
    })) return
    setApplying(true); setErr('')
    try {
      const saved = await resyncBom(bom.id)
      setResult(saved?.resync_summary || null)
      // 사용자 요청 — 결과 보여준 뒤 뒤로 가기는 수동
    } catch (e) { setErr(e.message || '적용 실패') }
    finally { setApplying(false) }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="동기화 미리보기"
        subtitle={`${bom.code} · ${bom.bom_type} v${bom.version} → 출처와 3-way merge`}
        onBack={onBack}
      />

      {loading && <p className={s.info}>미리보기 계산 중...</p>}
      {err && <p className={s.err}>{err}</p>}

      {pv && pv.ready && (
        <>
          <div className={s.previewMeta}>
            <div><b>출처:</b> {pv.source_bom_type} #{pv.source_id}</div>
            <div>
              <b>파생 시점 버전:</b> v{pv.source_version_at_derive}
              {' '}<b>→ 현재:</b> v{pv.source_version_now}
            </div>
            <div className={s.previewSummary}>
              갱신 <b>{pv.summary.update}</b> · 추가 <b>{pv.summary.add}</b> ·
              삭제 <b>{pv.summary.remove}</b> · OVERRIDE 보존 <b>{pv.summary.kept_override}</b> ·
              OWN 보존 <b>{pv.summary.kept_own}</b>
            </div>
          </div>

          {pv.changes.length === 0 && (
            <p className={s.info}>변경 사항 없음 — 동기화 불필요.</p>
          )}

          {pv.changes.length > 0 && (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>종류</th><th>품목번호</th><th>변경 내역</th>
                  </tr>
                </thead>
                <tbody>
                  {pv.changes.map((c, i) => (
                    <tr key={i} className={s[`changeKind_${c.kind}`] || ''}>
                      <td>
                        <span className={`${s.kindChip} ${s[`kind_${c.kind}`] || ''}`}>
                          {KIND_LABEL[c.kind] || c.kind}
                        </span>
                      </td>
                      <td className={s.mono}>{c.part_no}</td>
                      <td>
                        {c.fields_changed?.length > 0 ? (
                          <ul className={s.diffList}>
                            {c.fields_changed.map((f, j) => (
                              <li key={j}>
                                <span className={s.diffField}>{f.name}:</span>{' '}
                                <span className={s.diffBefore}>{fmt(f.before)}</span>
                                {' → '}
                                <span className={s.diffAfter}>{fmt(f.after)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className={s.muted}>—</span>
                        )}
                        {c.reason && <div className={s.diffReason}>{c.reason}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && (
            <div className={s.resultBox}>
              <div className={s.resultTitle}>✓ 동기화 완료</div>
              <ul>
                <li>갱신: {result.updated}</li>
                <li>추가: {result.added}</li>
                <li>삭제: {result.removed_inherited}</li>
                <li>OVERRIDE 보존: {result.kept_override}</li>
                <li>OWN 보존: {result.kept_own}</li>
              </ul>
              <button type="button" className="btn-primary btn-md" onClick={onApplied}>
                목록으로
              </button>
            </div>
          )}

          {!result && pv.changes.length > 0 && (
            <div className={s.footRow}>
              <button type="button" className="btn-secondary btn-md" onClick={onBack}>
                취소
              </button>
              <button type="button" className="btn-primary btn-md"
                onClick={doApply} disabled={applying}>
                {applying ? '적용 중...' : '동기화 적용'}
              </button>
            </div>
          )}
        </>
      )}

      {pv && !pv.ready && pv.error && (
        <div className={s.guardFailBox || s.err}>
          ⚠ 가드 검증 실패: {pv.error}
        </div>
      )}
    </div>
  )
}
