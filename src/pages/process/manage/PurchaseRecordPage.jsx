// src/pages/process/manage/PurchaseRecordPage.jsx
// 구매 검수 (2026-09-16) — 산 것을 영수증·사진으로 남긴다.
//   ★ 검수 자료가 없는 건을 눈에 띄게 둔다(요약 + 필터). 구매는 했는데 영수증을 안 올린 건이 쌓이는 게 실제 문제다.
//   ★ 사진은 현장에서 손에 들고 있을 때 찍어야 남는다 → 촬영 입력(capture)을 따로 둔다.
//   ★ 등록 흐름은 (1) 촬영·파일 선택 → (2) 내용 기입 두 단계뿐이다. 금액은 받지 않는다(사용자 결정).
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import {
  listPurchaseRecords, createPurchaseRecord, updatePurchaseRecord, deletePurchaseRecord,
  uploadPurchaseEvidence, deletePurchaseEvidence, getPurchaseEvidenceUrl,
  retryPurchaseEvidenceNw,
} from '@/api'
import s from './PurchaseRecordPage.module.css'

// BE models/purchase/purchase.py 와 문자열 동기 (진실의 원천은 BE)
const PAY_LABELS = { transfer: '계좌이체', card: '법인카드', cash: '현금', etc: '기타' }
const DOC_LABELS = {
  receipt: '영수증', statement: '거래명세서', tax_invoice: '세금계산서', photo: '사진', etc: '기타',
}
// 네이버웍스 드라이브 동기화 상태 — BE models/purchase/purchase.py 와 문자열 동기
const NW_LABELS = { done: '드라이브 저장됨', pending: '드라이브 대기', failed: '드라이브 실패' }
// 금액은 화면에서 받지 않는다(사용자 결정 2026-09-16) — DB 컬럼은 남겨두고 입력만 뺐다.
const EMPTY = {
  purchased_at: '', supplier_name: '', title: '',
  pay_method: 'transfer', doc_type: 'receipt', memo: '',
}

const ymd = (d) => {
  // 로컬 기준 YYYY-MM-DD. toISOString 을 쓰면 UTC 로 밀려 하루 어긋난다.
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const monthRange = (offset = 0) => {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { from: ymd(from), to: ymd(to) }
}

export default function PurchaseRecordPage() {
  const nav = useNavigate()
  const confirm = useConfirm()
  const [rows, setRows] = useState([])
  const [period, setPeriod] = useState('this')      // this | last | all
  const [payFilter, setPayFilter] = useState('')
  const [onlyNoEvidence, setOnlyNoEvidence] = useState(false)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY)

  const [detail, setDetail] = useState(null)        // 상세로 연 기록
  const [pendingFile, setPendingFile] = useState(null)   // 등록 흐름에서 먼저 고른 파일
  const shotRef = useRef(null)      // 상세에서 검수 자료 추가
  const fileRef = useRef(null)
  const newShotRef = useRef(null)   // 새 구매 등록 — 촬영으로 시작
  const newFileRef = useRef(null)   // 새 구매 등록 — 파일로 시작

  const load = useCallback(async () => {
    const range = period === 'all' ? null : monthRange(period === 'last' ? -1 : 0)
    try {
      const d = await listPurchaseRecords({
        dateFrom: range?.from, dateTo: range?.to,
        payMethod: payFilter, noEvidence: onlyNoEvidence,
      })
      setRows(d.items || [])
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    }
  }, [period, payFilter, onlyNoEvidence])
  useEffect(() => { load() }, [load])

  // 상세 창은 목록이 새로 오면 같은 id 로 다시 맞춘다(업로드 직후 썸네일 반영)
  useEffect(() => {
    if (!detail) return
    const fresh = rows.find((r) => r.id === detail.id)
    if (fresh) setDetail(fresh)
  }, [rows])   // eslint-disable-line react-hooks/exhaustive-deps

  const noEvCount = rows.filter((r) => !r.evidence_count).length
  // 드라이브에 아직 안 올라간 검수 자료 — 백그라운드 업로드라 '대기'도 여기 포함된다
  const nwPending = rows.flatMap((r) => r.evidences || []).filter((e) => e.nw_status !== 'done').length

  // (1) 촬영·파일 선택 → (2) 내용 기입 → 끝. 파일이 먼저 와야 현장에서 빠뜨리지 않는다.
  const startWithFile = (e, docType) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPendingFile(file)
    setEditingId(null)
    setForm({ ...EMPTY, purchased_at: ymd(new Date()), doc_type: docType })
    setMsg(null)
    setShowForm(true)
  }
  const openEdit = (r) => {
    setEditingId(r.id)
    setForm({
      purchased_at: r.purchased_at || '',
      supplier_name: r.supplier_name || '',
      title: r.title || '',
      pay_method: r.pay_method || 'transfer',
      doc_type: 'receipt',
      memo: r.memo || '',
    })
    setMsg(null)
    setShowForm(true)
  }

  const save = async () => {
    if (!form.title.trim()) return setMsg({ type: 'err', text: '구매 내역을 입력해주세요.' })
    setBusy(true); setMsg(null)
    try {
      const body = {
        purchased_at: form.purchased_at || null,
        supplier_name: form.supplier_name.trim(),
        title: form.title.trim(),
        pay_method: form.pay_method,
        memo: form.memo.trim(),
      }
      if (editingId) {
        await updatePurchaseRecord(editingId, body)
        setMsg({ type: 'ok', text: '수정했습니다.' })
      } else {
        // 기록을 먼저 만들고 그 id 로 파일을 올린다. 업로드가 실패해도 기록은 남으므로
        // 상세에서 다시 올리면 된다(사진을 다시 찍게 만드는 것보다 낫다).
        const d = await createPurchaseRecord(body)
        if (pendingFile && d.record) {
          await uploadPurchaseEvidence(d.record.id, pendingFile, form.doc_type)
        }
        setMsg({ type: 'ok', text: '등록했습니다. 드라이브 업로드는 곧 이어집니다.' })
        setTimeout(() => { load() }, 3000)   // 드라이브 상태는 응답 뒤에 바뀐다
      }
      setShowForm(false)
      setPendingFile(null)
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (r) => {
    const ok = await confirm({
      title: '구매 기록 삭제',
      message: `'${r.title}' 기록과 검수 자료 ${r.evidence_count || 0}건을 삭제할까요?`,
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    setBusy(true); setMsg(null)
    try {
      await deletePurchaseRecord(r.id)
      if (detail?.id === r.id) setDetail(null)
      setMsg({ type: 'ok', text: '삭제했습니다.' })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const pickFile = async (e, docType) => {
    const file = e.target.files?.[0]
    e.target.value = ''            // 같은 파일을 다시 골라도 change 가 뜨게
    if (!file || !detail) return
    setBusy(true); setMsg(null)
    try {
      await uploadPurchaseEvidence(detail.id, file, docType)
      setMsg({ type: 'ok', text: '검수 자료를 올렸습니다. 드라이브 업로드는 곧 이어집니다.' })
      await load()
      // 드라이브 업로드는 응답 뒤에 도는 작업이라 방금 받은 상태는 '대기'다. 잠시 뒤 한 번 더 확인한다.
      setTimeout(() => { load() }, 3000)
    } catch (err) {
      setMsg({ type: 'err', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const retryNw = async (ev) => {
    setBusy(true); setMsg(null)
    try {
      const d = await retryPurchaseEvidenceNw(ev.id)
      setMsg(d.ok
        ? { type: 'ok', text: '드라이브에 올렸습니다.' }
        : { type: 'err', text: `드라이브 업로드 실패 — ${d.evidence?.nw_error || '사유 미상'}` })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const openEvidence = async (ev) => {
    try {
      const url = await getPurchaseEvidenceUrl(ev.id, true)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    }
  }

  const removeEvidence = async (ev) => {
    const ok = await confirm({ title: '검수 자료 삭제', message: `'${ev.filename}' 을 삭제할까요?`, confirmText: '삭제', danger: true })
    if (!ok) return
    setBusy(true)
    try {
      await deletePurchaseEvidence(ev.id)
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="구매 검수"
        subtitle="구매 의뢰에서 확정된 건이 여기로 넘어옵니다 — 영수증·사진을 올려 검수를 마칩니다"
        onBack={() => nav('/admin/manage')}
      />
      <div className="page-content">
        {msg && <p className={msg.type === 'err' ? s.msgErr : s.msgOk}>{msg.text}</p>}

        <div className={s.sumRow}>
          <div className={s.sum}>
            <div className={s.sumLabel}>건수</div>
            <div className={s.sumVal}>{rows.length}건</div>
          </div>
          <div className={s.sum}>
            <div className={s.sumLabel}>검수 대기</div>
            <div className={noEvCount ? s.sumValWarn : s.sumVal}>{noEvCount}건</div>
          </div>
          <div className={s.sum}>
            <div className={s.sumLabel}>드라이브 미동기</div>
            <div className={nwPending ? s.sumValWarn : s.sumVal}>{nwPending}건</div>
          </div>
        </div>

        <div className={s.filters}>
          {[['this', '이번 달'], ['last', '지난 달'], ['all', '전체']].map(([k, label]) => (
            <button key={k} type="button"
                    className={period === k ? s.chipOn : s.chip}
                    onClick={() => setPeriod(k)}>{label}</button>
          ))}
          <span className={s.sep} />
          {Object.entries(PAY_LABELS).map(([k, label]) => (
            <button key={k} type="button"
                    className={payFilter === k ? s.chipOn : s.chip}
                    onClick={() => setPayFilter(payFilter === k ? '' : k)}>{label}</button>
          ))}
          <span className={s.sep} />
          <button type="button"
                  className={onlyNoEvidence ? s.chipOn : s.chip}
                  onClick={() => setOnlyNoEvidence(!onlyNoEvidence)}>검수 대기만</button>
          <input ref={newShotRef} type="file" accept="image/*" capture="environment"
                 className={s.hiddenInput} onChange={(e) => startWithFile(e, 'photo')} />
          <input ref={newFileRef} type="file" accept="image/*,application/pdf"
                 className={s.hiddenInput} onChange={(e) => startWithFile(e, 'receipt')} />
          <button type="button" className="btn-primary btn-md"
                  onClick={() => newShotRef.current?.click()}>사진 촬영</button>
          <button type="button" className="btn-secondary btn-md"
                  onClick={() => newFileRef.current?.click()}>파일 선택</button>
        </div>

        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>번호</th>
                <th>구매일</th>
                <th>거래처</th>
                <th>내역</th>
                <th>결제</th>
                <th>검수 자료</th>
                <th aria-label="작업" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className={s.empty}>기록이 없습니다.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className={s.row} onClick={() => setDetail(r)}>
                  <td className={s.no}>{r.insp_no || '—'}</td>
                  <td>{(r.purchased_at || '').slice(5)}</td>
                  <td>{r.supplier_name || '—'}</td>
                  <td>
                    {r.title}
                    {/* 구매 의뢰에서 확정돼 넘어온 건 — 검수 담당이 출처를 알아야 한다 (2026-09-17) */}
                    {r.request_id ? <span className={s.badge}> 의뢰</span> : null}
                  </td>
                  <td><span className={s.badge}>{PAY_LABELS[r.pay_method] || r.pay_method}</span></td>
                  <td>
                    {r.evidence_count
                      ? <span className={s.badgeOk}>{r.evidence_count}건</span>
                      : <span className={s.badgeNo}>없음</span>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className={s.actions}>
                      <button type="button" className="btn-ghost btn-sm" disabled={busy}
                              onClick={() => openEdit(r)}>수정</button>
                      <button type="button" className="btn-ghost btn-sm" disabled={busy}
                              onClick={() => remove(r)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 등록·수정 ── */}
      {showForm && (
        <div className={s.overlay} onClick={() => !busy && setShowForm(false)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h2>{editingId ? '구매 수정' : '구매 등록'}</h2>
              {!editingId && pendingFile && (
                <p className={s.hint}>첨부: {pendingFile.name}</p>
              )}
            </div>

            <div className={s.field}>
              <label className={s.label} htmlFor="pr-date">구매일</label>
              <input id="pr-date" className="form-input" type="date" value={form.purchased_at}
                     max={ymd(new Date())}
                     onChange={(e) => setForm({ ...form, purchased_at: e.target.value })} />
            </div>

            <div className={s.field}>
              <label className={s.label} htmlFor="pr-sup">거래처</label>
              <input id="pr-sup" className="form-input" value={form.supplier_name}
                     placeholder="예: ○○상사 / 철물점"
                     onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} />
              <p className={s.hint}>한 번 쓰는 곳도 많아서 직접 입력을 막지 않습니다.</p>
            </div>

            <div className={s.field}>
              <label className={s.label} htmlFor="pr-title">내역</label>
              <input id="pr-title" className="form-input" value={form.title}
                     placeholder="예: 에나멜 동선 0.8mm 20kg"
                     onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            {!editingId && (
              <div className={s.field}>
                <label className={s.label} htmlFor="pr-doc">검수 자료 종류</label>
                <select id="pr-doc" className="form-input" value={form.doc_type}
                        onChange={(e) => setForm({ ...form, doc_type: e.target.value })}>
                  {Object.entries(DOC_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className={s.field}>
              <label className={s.label} htmlFor="pr-pay">결제 수단</label>
              <select id="pr-pay" className="form-input" value={form.pay_method}
                      onChange={(e) => setForm({ ...form, pay_method: e.target.value })}>
                {Object.entries(PAY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>

            <div className={s.field}>
              <label className={s.label} htmlFor="pr-memo">메모 (선택)</label>
              <input id="pr-memo" className="form-input" value={form.memo}
                     onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </div>

            <div className={s.modalFooter}>
              <button type="button" className="btn-secondary btn-md" disabled={busy}
                      onClick={() => setShowForm(false)}>취소</button>
              <button type="button" className="btn-primary btn-md" disabled={busy}
                      onClick={save}>{busy ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 상세 (검수 자료) ── */}
      {detail && (
        <div className={s.overlay} onClick={() => !busy && setDetail(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h2>{detail.title}</h2>
              <p className={s.hint}>
                {detail.insp_no ? `${detail.insp_no} · ` : ''}
                {detail.purchased_at} · {detail.supplier_name || '거래처 미입력'}
              </p>
            </div>

            {detail.memo && <p className={s.memo}>{detail.memo}</p>}

            <div className={s.evList}>
              {(detail.evidences || []).length === 0 && (
                <p className={s.empty}>검수 자료가 없습니다. 아래에서 올려주세요.</p>
              )}
              {(detail.evidences || []).map((ev) => (
                <div key={ev.id} className={s.evRow}>
                  <button type="button" className={s.evName} onClick={() => openEvidence(ev)}>
                    <span className={s.evKind}>{ev.kind === 'photo' ? '사진' : '파일'}</span>
                    {ev.filename}
                  </button>
                  <span className={s.evDoc}>{DOC_LABELS[ev.doc_type] || ev.doc_type}</span>
                  <span
                    className={ev.nw_status === 'done' ? s.nwOk : (ev.nw_status === 'failed' ? s.nwFail : s.nwWait)}
                    title={ev.nw_error || ''}
                  >
                    {NW_LABELS[ev.nw_status] || ev.nw_status}
                  </span>
                  {ev.nw_status !== 'done' && (
                    <button type="button" className="btn-ghost btn-sm" disabled={busy}
                            onClick={() => retryNw(ev)}>재시도</button>
                  )}
                  <button type="button" className="btn-ghost btn-sm" disabled={busy}
                          onClick={() => removeEvidence(ev)}>삭제</button>
                </div>
              ))}
            </div>

            {/* 촬영과 파일 선택을 나눈다 — 모바일에서 카메라가 바로 열려야 현장에서 남는다 */}
            <input ref={shotRef} type="file" accept="image/*" capture="environment"
                   className={s.hiddenInput} onChange={(e) => pickFile(e, 'photo')} />
            <input ref={fileRef} type="file" accept="image/*,application/pdf"
                   className={s.hiddenInput} onChange={(e) => pickFile(e, 'receipt')} />

            <div className={s.uploadRow}>
              <button type="button" className="btn-secondary btn-md" disabled={busy}
                      onClick={() => shotRef.current?.click()}>사진 촬영</button>
              <button type="button" className="btn-secondary btn-md" disabled={busy}
                      onClick={() => fileRef.current?.click()}>파일 선택</button>
            </div>

            <div className={s.modalFooter}>
              <button type="button" className="btn-secondary btn-md" onClick={() => setDetail(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
