// src/pages/process/manage/PurchaseRequestFormPage.jsx
// 구매 의뢰 — 작성·제출 (2026-09-16)
//   ★ 임시저장이 없다. 제출 한 번에 첨부까지 올라가고 그 뒤로는 수정·취소가 없다(사용자 결정).
//     그래서 파일은 서버가 아니라 **브라우저 메모리**에 모았다가 제출 때 한 번에 보낸다.
//   ★ 스크린샷은 현장에서 '찍어 붙여넣기'가 가장 빠르다 — document paste 를 듣는다(PC).
//     모바일은 붙여넣기가 없으므로 갤러리 선택. 카메라를 강제하지 않는다(사용자 결정).
//   ★ 미리보기 URL(createObjectURL)은 언마운트에서 반드시 회수한다 — 안 하면 탭이 메모리를 물고 있는다.
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { createPurchaseRequest } from '@/api'
import s from './PurchaseRequest.module.css'

const MAX_FILES = 20            // BE purchase_request_service.MAX_FILES 와 동기
const MAX_IMAGE_MB = 10
const MAX_FILE_MB = 20

// 결제 조건 — BE models/purchase/purchase_request.py 의 문자열과 같아야 한다
const PAY_TYPES = [
  // 칩에는 '카드' 만 쓰고 '플랫폼 결제도 카드' 라는 설명은 (i) 오버레이로 뺀다(사용자 지시 2026-09-17).
  { v: 'card', label: '카드', hint: '쿠팡·네이버 등 온라인 결제. 상품 링크가 필요합니다' },
  { v: 'transfer', label: '계좌이체', hint: '입금할 계좌와 관련 서류가 필요합니다' },
]
// 계좌이체일 때만 고른다. 해외송금 필수 서류는 목록 미확정이라 아직 강제하지 않는다(2026-09-16).
const TRANSFER_SCOPES = [
  { v: 'domestic', label: '국내송금' },
  { v: 'overseas', label: '해외송금' },
]
const PAY_TIMINGS = [
  { v: 'prepay', label: '선금', hint: '물건을 받기 전에 먼저 지급' },
  { v: 'postpay', label: '후불', hint: '물건을 받은 뒤 지급' },
]

const isImage = (f) => (f.type || '').startsWith('image/')
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`)
const ext = (name) => (name.includes('.') ? name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE')

export default function PurchaseRequestFormPage() {
  const nav = useNavigate()
  const [payType, setPayType] = useState('')       // '' = 아직 안 고름 → 아래 폼이 안 열린다
  const [payTiming, setPayTiming] = useState('')
  const [scope, setScope] = useState('')          // 계좌이체 전용
  const [bank, setBank] = useState('')
  const [acctNo, setAcctNo] = useState('')
  const [holder, setHolder] = useState('')
  const [title, setTitle] = useState('')
  const [purpose, setPurpose] = useState('')
  const [link, setLink] = useState('')
  const [memo, setMemo] = useState('')
  const [items, setItems] = useState([])        // { file, url? } — url 은 이미지 미리보기용
  const [dragOver, setDragOver] = useState(false)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showErrors, setShowErrors] = useState(false)   // 제출을 누른 뒤부터 빨갛게 (처음부터 붉으면 잔소리다)
  const [tip, setTip] = useState(false)                 // 카드 (i) 설명 오버레이
  const shotRef = useRef(null)
  const fileRef = useRef(null)
  const isTransfer = payType === 'transfer'

  // 필수 항목 — 결제 수단에 따라 갈린다.
  //   ★ 표시(칩·바·요약)와 제출 검증이 **이 목록 하나**를 본다. 두 곳에 따로 적으면 반드시 어긋난다.
  //   ★ BE 도 같은 규칙으로 막는다 — 화면 검증은 편의지 보안이 아니다.
  const REQ = [
    { key: 'title', label: '제품 이름', ok: Boolean(title.trim()) },
    { key: 'purpose', label: '용도', ok: Boolean(purpose.trim()) },
    ...(isTransfer
      ? [
        { key: 'bank', label: '은행', ok: Boolean(bank.trim()) },
        { key: 'acctNo', label: '계좌번호', ok: Boolean(acctNo.trim()) },
        { key: 'holder', label: '예금주', ok: Boolean(holder.trim()) },
        // 사진이든 파일이든 1개면 된다 — 첨부는 한 묶음(items)으로 센다
        { key: 'files', label: '서류 첨부', ok: items.length > 0 },
      ]
      : [{ key: 'link', label: '구매 링크', ok: Boolean(link.trim()) }]),
  ]
  const missing = REQ.filter((r) => !r.ok)
  const reqOf = (key) => REQ.find((r) => r.key === key)          // 없으면 이 수단에선 필수가 아니다
  const okOf = (key) => Boolean(reqOf(key)?.ok)

  // 입력칸 왼쪽 바 — 비었으면 빨강, 채웠으면 초록. 제출 이후엔 빈 칸을 붉게.
  const inCls = (key) => {
    const r = reqOf(key)
    if (!r) return 'form-input'
    if (showErrors && !r.ok) return `form-input ${s.inErr}`
    return `form-input ${r.ok ? s.inFilled : s.inNeed}`
  }
  const boxCls = (key) => {
    const r = reqOf(key)
    if (!r) return ''
    if (showErrors && !r.ok) return s.inErr
    return r.ok ? '' : s.inNeed
  }
  const errFor = (key, text) =>
    (showErrors && reqOf(key) && !okOf(key) ? <p className={s.errMsg}>{text}</p> : null)

  // 요약 칩·제출 실패에서 해당 칸으로 이동
  const FOCUS_ID = {
    title: 'pr-title', purpose: 'pr-purpose', link: 'pr-link',
    bank: 'pr-bank', acctNo: 'pr-acctno', holder: 'pr-holder', files: 'pr-files',
  }
  const goto = (key) => {
    const el = document.getElementById(FOCUS_ID[key])
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus?.({ preventScroll: true })
  }

  // 미리보기 URL 회수 — items 가 바뀔 때가 아니라 화면을 떠날 때 한 번만 (중간 회수는 이미지가 깨진다)
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => () => itemsRef.current.forEach((it) => it.url && URL.revokeObjectURL(it.url)), [])

  const addFiles = useCallback((list) => {
    const incoming = Array.from(list || [])
    if (!incoming.length) return
    setMsg(null)
    setItems((prev) => {
      const room = MAX_FILES - prev.length
      if (room <= 0) {
        setMsg({ type: 'err', text: `첨부는 최대 ${MAX_FILES}개까지 올릴 수 있습니다.` })
        return prev
      }
      const next = []
      for (const f of incoming.slice(0, room)) {
        const limit = (isImage(f) ? MAX_IMAGE_MB : MAX_FILE_MB) * 1024 * 1024
        if (f.size > limit) {
          setMsg({
            type: 'err',
            text: `'${f.name}' 이(가) 너무 큽니다. (이미지 ${MAX_IMAGE_MB}MB · 파일 ${MAX_FILE_MB}MB)`,
          })
          continue
        }
        next.push({ file: f, url: isImage(f) ? URL.createObjectURL(f) : '' })
      }
      return [...prev, ...next]
    })
  }, [])

  // PC: 스크린샷을 찍고 Ctrl+V — 입력칸에 포커스가 없어도 되게 document 에서 듣는다
  useEffect(() => {
    const onPaste = (e) => {
      const files = Array.from(e.clipboardData?.files || [])
      if (files.length) {
        e.preventDefault()
        addFiles(files)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [addFiles])

  const removeAt = (i) => setItems((prev) => {
    const it = prev[i]
    if (it?.url) URL.revokeObjectURL(it.url)
    return prev.filter((_, idx) => idx !== i)
  })

  const pick = (e) => {
    addFiles(e.target.files)
    e.target.value = ''        // 같은 파일을 다시 골라도 change 가 뜨게
  }

  const submit = async () => {
    if (!ready) return                      // 결제 조건 전이면 버튼 자체가 잠겨 있다
    // 형식 오류는 '비어 있음' 과 다르므로 따로 먼저 잡는다
    if (link.trim() && !/^https?:\/\//i.test(link.trim())) {
      setShowErrors(true); goto('link')
      return setMsg({ type: 'err', text: '구매 링크는 http:// 또는 https:// 로 시작해야 합니다.' })
    }
    if (missing.length) {
      // 빠진 칸을 전부 붉게 칠하고 첫 칸으로 데려간다 — 어디가 문제인지 찾게 만들지 않는다
      setShowErrors(true); goto(missing[0].key)
      return setMsg({
        type: 'err',
        text: `필수 항목 ${missing.length}개가 비어 있습니다 — ${missing.map((m) => m.label).join(' · ')}`,
      })
    }
    setBusy(true); setMsg(null)
    try {
      const d = await createPurchaseRequest({
        title: title.trim(), purpose: purpose.trim(),
        link: link.trim(), memo: memo.trim(),
        files: items.map((it) => it.file),
        payType, payTiming, transferScope: isTransfer ? scope : '',
        accountBank: bank.trim(), accountNo: acctNo.trim(), accountHolder: holder.trim(),
      })
      // 알림이 일부라도 못 갔으면 상세로 넘기기 전에 알려준다 — 조용히 넘어가면 아무도 모른다
      const miss = d.notify?.not_notified || []
      nav(`/admin/purchase/requests/${d.request.id}`, {
        state: miss.length ? { notice: `알림 못 받음: ${miss.join(', ')}` } : undefined,
      })
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
      setBusy(false)
    }
  }

  const ready = Boolean(payType && payTiming && (!isTransfer || scope))
  const payHint = ready
    ? [PAY_TYPES.find((o) => o.v === payType)?.hint,
       PAY_TIMINGS.find((o) => o.v === payTiming)?.hint].filter(Boolean).join(' · ')
    : '두 가지를 고르면 나머지 항목이 나타납니다.'

  const shots = items.map((it, i) => ({ ...it, i })).filter((it) => it.url)
  const docs = items.map((it, i) => ({ ...it, i })).filter((it) => !it.url)

  return (
    <div className="page-flat">
      <PageHeader
        title="새 구매 의뢰"
        subtitle="제출하면 바로 승인자에게 알림이 갑니다. 이후 수정은 안 됩니다"
        onBack={() => nav('/admin/purchase/requests')}
      />
      <div className="page-content">
        {msg && <p className={msg.type === 'err' ? s.msgErr : s.msgOk}>{msg.text}</p>}

        {/* 남은 필수를 위에서 한 번 더 — 결제 수단에 따라 필수가 갈리므로 '지금 몇 개 남았나'가 필요하다.
            칩을 누르면 그 칸으로 이동한다. */}
        {ready && (missing.length > 0 ? (
          <div className={s.sum}>
            <span className={s.sumDot}>{missing.length}</span>
            <span>아직 채우지 않은 필수 항목이 <b>{missing.length}개</b> 있습니다</span>
            {missing.map((m) => (
              <button
                key={m.key} type="button" className={s.missChip} onClick={() => goto(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : (
          <div className={`${s.sum} ${s.sumDone}`}>
            <span className={s.sumDot}>✓</span>
            <span>필수 항목을 모두 채웠습니다. 제출하면 승인자에게 바로 알림이 갑니다.</span>
          </div>
        ))}

        {/* 결제 조건을 맨 앞에서 고른다(사용자 결정 2026-09-16) — 이후 입력 항목이 여기서 갈린다.
            고르기 전에는 아래를 감춘다. 다 적고 나서 수단을 바꾸면 헛수고가 되기 때문이다. */}
        <div className={s.paySec}>
          <div className={s.payRow}>
            <span className={s.payLabel}>결제 수단</span>
            <span className={s.reqTag}>필수</span>
            {PAY_TYPES.map((o) => (
              <button
                key={o.v} type="button" className={payType === o.v ? s.chipOn : s.chip}
                onClick={() => setPayType(o.v)}
              >
                {o.label}
              </button>
            ))}
            {/* 폰은 hover 가 없으므로 tap 으로도 열린다 */}
            <span className={s.infoWrap}>
              <button
                type="button" className={s.infoBtn} aria-label="카드 결제 설명"
                onClick={() => setTip((v) => !v)}
                onMouseEnter={() => setTip(true)}
                onMouseLeave={() => setTip(false)}
                onBlur={() => setTip(false)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 16.5v-5M12 8h.01" />
                </svg>
              </button>
              {tip && (
                <span className={s.tip} role="tooltip">
                  플랫폼 결제 또한 카드 결제에 속합니다.
                </span>
              )}
            </span>
          </div>
          {isTransfer && (
            <div className={s.payRow}>
              <span className={s.payLabel}>송금 구분</span>
              <span className={s.reqTag}>필수</span>
              {TRANSFER_SCOPES.map((o) => (
                <button
                  key={o.v} type="button" className={scope === o.v ? s.chipOn : s.chip}
                  onClick={() => setScope(o.v)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          <div className={s.payRow}>
            <span className={s.payLabel}>지급 시점</span>
            <span className={s.reqTag}>필수</span>
            {PAY_TIMINGS.map((o) => (
              <button
                key={o.v} type="button" className={payTiming === o.v ? s.chipOn : s.chip}
                onClick={() => setPayTiming(o.v)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className={s.hint}>{payHint}</p>
        </div>

        {ready && (
        <div className={s.two}>
          <div>
            <div className={s.field}>
              <label className={`form-label ${s.fLabel}`} htmlFor="pr-title">
                제품 이름 <span className={s.reqTag}>필수</span>
                {okOf('title') && <span className={s.okMark}>✓</span>}
              </label>
              <input
                id="pr-title" className={inCls('title')} value={title} maxLength={200}
                placeholder="네오디뮴 자석 N35 20×10×5mm 100개"
                onChange={(e) => setTitle(e.target.value)}
              />
              {errFor('title', '제품 이름을 입력해주세요')}
            </div>
            <div className={s.field}>
              <label className={`form-label ${s.fLabel}`} htmlFor="pr-purpose">
                용도 <span className={s.reqTag}>필수</span>
                {okOf('purpose') && <span className={s.okMark}>✓</span>}
              </label>
              <input
                id="pr-purpose" className={inCls('purpose')} value={purpose} maxLength={200}
                placeholder="EC 지그 고정용"
                onChange={(e) => setPurpose(e.target.value)}
              />
              {errFor('purpose', '용도를 입력해주세요')}
              <p className={s.hint}>승인자가 가장 먼저 보는 항목입니다.</p>
            </div>
            {/* 카드면 링크, 계좌이체면 계좌 3칸. 둘 다 필수라 한쪽만 보여준다. */}
            {isTransfer ? (
              <div className={s.field}>
                <label className={`form-label ${s.fLabel}`} htmlFor="pr-bank">
                  입금 계좌 <span className={s.reqTag}>필수</span>
                  <span className={s.hint}>은행 · 계좌번호 · 예금주 세 칸 모두</span>
                </label>
                <div className={s.acct}>
                  <input
                    id="pr-bank" className={inCls('bank')} value={bank} maxLength={30}
                    placeholder="은행" onChange={(e) => setBank(e.target.value)}
                  />
                  <input
                    id="pr-acctno" className={inCls('acctNo')} value={acctNo} maxLength={40}
                    placeholder="계좌번호" onChange={(e) => setAcctNo(e.target.value)}
                  />
                  <input
                    id="pr-holder" className={inCls('holder')} value={holder} maxLength={50}
                    placeholder="예금주" onChange={(e) => setHolder(e.target.value)}
                  />
                </div>
                {errFor('bank', '은행을 입력해주세요')}
                {errFor('acctNo', '계좌번호를 입력해주세요')}
                {errFor('holder', '예금주를 입력해주세요')}
                <p className={s.hint}>승인자에게 가는 알림에 그대로 실립니다.</p>
              </div>
            ) : (
              <div className={s.field}>
                <label className={`form-label ${s.fLabel}`} htmlFor="pr-link">
                  구매 링크 <span className={s.reqTag}>필수</span>
                  {okOf('link') && <span className={s.okMark}>✓</span>}
                </label>
                <input
                  id="pr-link" className={inCls('link')} value={link} maxLength={500}
                  placeholder="https://"
                  onChange={(e) => setLink(e.target.value)}
                />
                {errFor('link', '상품 주소를 입력해주세요')}
                <p className={s.hint}>승인자가 알림에서 바로 눌러 확인할 수 있습니다.</p>
              </div>
            )}
            <div className={s.field}>
              <label className={`form-label ${s.fLabel}`} htmlFor="pr-memo">
                메모 <span className={s.optTag}>선택</span>
              </label>
              <textarea
                id="pr-memo" className="form-input" rows={4} value={memo} maxLength={500}
                placeholder="규격·수량처럼 덧붙일 내용이 있으면 적어주세요"
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className={s.field}>
              <label className={`form-label ${s.fLabel}`}>
                사진 · 스크린샷 <span className={s.optTag}>선택</span>
              </label>
              <div
                className={`${s.drop} ${dragOver ? s.dropOver : ''}`}
                onClick={() => shotRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer?.files)
                }}
              >
                <p className={s.dropMain}>
                  <span className={s.kbd}>Ctrl</span>+<span className={s.kbd}>V</span> 로 붙여넣기
                </p>
                <p className={s.dropSub}>
                  끌어다 놓거나 눌러서 고를 수도 있습니다 · 장당 {MAX_IMAGE_MB}MB
                </p>
              </div>
              {/* capture 를 주지 않는다 — 폰에서 카메라를 강제하지 않고 갤러리를 고를 수 있어야 한다 */}
              <input
                ref={shotRef} type="file" accept="image/*" multiple hidden onChange={pick}
              />
              {shots.length > 0 && (
                <div className={s.shots}>
                  {shots.map((it) => (
                    <div key={it.i} className={s.shot}>
                      <img src={it.url} alt={it.file.name} />
                      <button
                        type="button" className={s.shotX} aria-label="빼기"
                        onClick={() => removeAt(it.i)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={s.field}>
              <label className={`form-label ${s.fLabel}`}>
                파일 첨부
                {isTransfer
                  ? <span className={s.reqTag}>필수</span>
                  : <span className={s.optTag}>선택</span>}
                {isTransfer && okOf('files') && <span className={s.okMark}>✓</span>}
              </label>
              {/* 계좌이체는 서류가 있어야 제출된다 — 그 사실을 첨부 영역에서 보여준다.
                  예전엔 계좌 칸 아래 도움말에만 있어서 오른쪽 열만 보는 사람은 몰랐다. */}
              {isTransfer && (
                <div id="pr-files" className={`${s.drop} ${boxCls('files')}`}>
                  <p className={s.dropMain}>견적서 · 거래명세서 같은 서류를 1개 이상</p>
                  <p className={s.dropSub}>사진으로 찍은 것도 됩니다 · 개당 {MAX_FILE_MB}MB</p>
                </div>
              )}
              {errFor('files', '계좌이체는 관련 서류를 1개 이상 첨부해주세요')}
              <button
                type="button" className="btn-secondary btn-sm"
                onClick={() => fileRef.current?.click()}
              >
                파일 선택
              </button>
              <input ref={fileRef} type="file" multiple hidden onChange={pick} />
              {docs.length > 0 && (
                <div className={s.files}>
                  {docs.map((it) => (
                    <div key={it.i} className={s.file}>
                      <span className={s.fileIcon}>{ext(it.file.name)}</span>
                      <span className={s.fileName}>{it.file.name}</span>
                      <span className={s.fileSize}>{kb(it.file.size)}</span>
                      <button
                        type="button" className={s.iconBtn} aria-label="빼기"
                        onClick={() => removeAt(it.i)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        <div className={s.actions}>
          {ready && missing.length > 0 && (
            <span className={s.footInfo}>필수 <b>{missing.length}개</b> 남음</span>
          )}
          <button
            type="button" className="btn-secondary" disabled={busy}
            onClick={() => nav('/admin/purchase/requests')}
          >
            돌아가기
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy || !ready}>
            {busy ? '제출 중...' : '제출'}
          </button>
        </div>
      </div>
    </div>
  )
}
