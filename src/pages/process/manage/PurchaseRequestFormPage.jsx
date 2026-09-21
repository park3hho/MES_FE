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
import ScanLoader from '@/components/ScanLoader'
import { createPurchaseRequest, extractDocument } from '@/api'
import { useMobile } from '@/hooks/useMobile'
import { countryName } from './PurchaseRequestPage'
import s from './PurchaseRequest.module.css'

const MAX_FILES = 20            // BE purchase_request_service.MAX_FILES 와 동기
const MAX_READ = 5              // 한 번에 읽는 사진·PDF 수 — BE services/extract/service.MAX_FILES 와 동기
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

// 안내 문구 색 — warn(주황) = 채우긴 했는데 일부러 비운 칸이 있다. 초록(성공)에 섞이면 안 읽힌다.
const MSG_CLS = { err: s.msgErr, warn: s.msgWarn }
// SWIFT 5~6번째 글자 = 은행 소재국(BIC 규격). BE 도 같은 규칙으로 저장한다.
const swiftCountry = (swift) => (/^[A-Z]{6}/.test(swift || '') ? swift.slice(4, 6) : '')

const isImage = (f) => (f.type || '').startsWith('image/')
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`)
const ext = (name) => (name.includes('.') ? name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE')

export default function PurchaseRequestFormPage() {
  const nav = useNavigate()
  const isMobile = useMobile()
  const [payType, setPayType] = useState('')       // '' = 아직 안 고름 → 아래 폼이 안 열린다
  const [payTiming, setPayTiming] = useState('')
  const [scope, setScope] = useState('')          // 계좌이체 전용
  const [bank, setBank] = useState('')
  const [acctNo, setAcctNo] = useState('')
  const [holder, setHolder] = useState('')
  // 해외송금 전용 — 받는 회사(payee) / 지급 은행(bank). 둘은 나라가 다를 수 있다.
  const [payeeCountry, setPayeeCountry] = useState('')
  const [payeeCity, setPayeeCity] = useState('')
  const [payeeAddr, setPayeeAddr] = useState('')
  const [swift, setSwift] = useState('')
  const [bankAddr, setBankAddr] = useState('')
  // 견적서가 '은행 주소'에서 읽은 나라 — 저장하지 않는다. SWIFT 의 나라와 대조해
  //   중계은행 SWIFT 를 잘못 집어 온 경우를 경고하는 데만 쓴다.
  const [readBankCountry, setReadBankCountry] = useState('')
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
  const startRef = useRef(null)      // 1단계 파일 선택
  const startShotRef = useRef(null)  // 1단계 사진 선택 (폰 갤러리)
  // 견적서 읽기 — 1단계에서 자료를 다 올리고 '확인' 을 누르면 **한 번** 읽는다(2026-09-21). 호출마다 비용이 든다.
  //   결과는 제안이라 빈 칸만 채우고, 사람이 친 값은 건드리지 않는다.
  const [step, setStep] = useState('upload')   // upload → form (사용자 지시 2026-09-17)
  const [reading, setReading] = useState(false)
  const [autoFilled, setAutoFilled] = useState([])
  const isTransfer = payType === 'transfer'
  // 해외송금이면 은행 외화송금 화면이 요구하는 3칸을 더 받는다 (2026-09-21).
  //   ★ BE 도 같은 조건으로 막는다 — 빠진 채 제출되면 이 의뢰서는 수정이 없어 반려밖에 답이 없다.
  const isOverseas = isTransfer && scope === 'overseas'

  // 필수 항목 — 결제 수단에 따라 갈린다.
  //   ★ 표시(칩·바·요약)와 제출 검증이 **이 목록 하나**를 본다. 두 곳에 따로 적으면 반드시 어긋난다.
  //   ★ BE 도 같은 규칙으로 막는다 — 화면 검증은 편의지 보안이 아니다.
  const REQ = [
    { key: 'title', label: '제품 이름', ok: Boolean(title.trim()) },
    { key: 'purpose', label: '용도', ok: Boolean(purpose.trim()) },
    ...(isTransfer
      ? [
        // ★ 순서 = 화면 순서. 요약 칩·제출 실패가 '첫 빈칸' 으로 데려가므로 어긋나면 엉뚱한 칸으로 튄다.
        ...(isOverseas
          // 해외송금 — 은행 외화송금 화면('받으시는분 정보') 순서 그대로 (2026-09-21).
          //   은행 주소는 선택(은행 화면이 SWIFT 를 고르면 주소 칸을 잠근다). 소재국은 SWIFT 에서 자동.
          ? [
            { key: 'holder', label: '영문이름', ok: Boolean(holder.trim()) },
            { key: 'payeeCountry', label: '소재국가', ok: /^[A-Z]{2}$/.test(payeeCountry) },
            { key: 'payeeAddr', label: '영문주소', ok: Boolean(payeeAddr.trim()) },
            { key: 'payeeCity', label: '영문시/도명', ok: Boolean(payeeCity.trim()) },
            { key: 'acctNo', label: '입금계좌번호', ok: Boolean(acctNo.trim()) },
            { key: 'swift', label: 'SWIFT CODE', ok: Boolean(swift.trim()) },
            { key: 'bank', label: '지급은행명', ok: Boolean(bank.trim()) },
          ]
          // 국내송금 — 이체 화면 순서(은행 → 계좌번호 → 예금주)
          : [
            { key: 'bank', label: '은행', ok: Boolean(bank.trim()) },
            { key: 'acctNo', label: '계좌번호', ok: Boolean(acctNo.trim()) },
            { key: 'holder', label: '예금주', ok: Boolean(holder.trim()) },
          ]),
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
    payeeCountry: 'pr-payee-country', payeeCity: 'pr-payee-city', payeeAddr: 'pr-payee-addr',
    swift: 'pr-swift',
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

  // ★ 지금 입력칸에 뭐가 들어 있는지를 ref 로 본다. applyExtracted 가 addFiles 의 닫힌 값(closure)을
  //   타면 '사용자가 방금 친 값'이 아니라 '메모될 때의 값'을 보고, 사람이 친 값을 덮어쓴다.
  const formRef = useRef({})
  formRef.current = {
    title, bank, acctNo, holder, memo, payType, payTiming, scope,
    payeeCountry, payeeCity, payeeAddr, swift, bankAddr,
  }
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

  // 읽은 값을 폼에 담는다. **빈 칸만** 채운다 — 사람이 친 값을 기계가 덮으면 안 된다.
  const applyExtracted = (d) => {
    const done = []
    const put = (cur, setter, val, key) => {
      const v = val === null || val === undefined ? '' : String(val).trim()
      if (!v || cur.trim()) return          // 값이 없거나 이미 채워져 있으면 건너뛴다
      setter(v)
      done.push(key)
    }
    const now = formRef.current
    // 결제 조건 칩 — 자료에서 판단되면 미리 눌러둔다. 이미 고른 게 있으면 건드리지 않는다.
    //   enum 이라 엉뚱한 값은 안 오지만, 모르는 값이 와도 칩이 안 눌리고 끝난다.
    if (!now.payType && PAY_TYPES.some((o) => o.v === d.pay_type)) {
      setPayType(d.pay_type)
      done.push('payType')
    }
    if (!now.payTiming && PAY_TIMINGS.some((o) => o.v === d.pay_timing)) {
      setPayTiming(d.pay_timing)
      done.push('payTiming')
    }
    // 송금 구분은 계좌이체일 때만 의미가 있다 — 카드로 판단됐으면 건드리지 않는다
    if (!now.scope && d.pay_type === 'transfer'
        && TRANSFER_SCOPES.some((o) => o.v === d.transfer_scope)) {
      setScope(d.transfer_scope)
      done.push('scope')
    }
    put(now.title, setTitle, d.item_name, 'title')

    // ── 헷갈리면 채우지 않는다 (사용자 지시 2026-09-21) ──
    //   빈칸은 필수 표시가 붉게 잡아 사람이 원본을 보고 채운다. 채워진 값은 '자동 입력됨' 이 붙어도
    //   그냥 넘어가기 쉽다 — 송금 정보는 틀리면 돈이 엉뚱한 곳으로 간다. 틀린 값보다 빈칸이 낫다.
    //   ★ 모델에게도 "헷갈리면 비워라" 를 시켰지만(프롬프트 15번) 모델은 자기 확신도를 못 잰다
    //     (services/extract/service.py 머리말). 그래서 **규칙으로 판정되는** 헷갈림은 여기서 코드가 거른다.
    //   ★ 거를 땐 그 주체의 칸을 **묶음째** 비운다 — 한 주체의 값이 두 출처에서 섞이면
    //     전부 틀린 것보다 찾기 어렵다(프롬프트 15번 ★와 같은 규칙).
    //   ★ 국내 자료는 payee_·bank_ 가 null 이라 아래 판정이 전부 통과한다 — 국내 흐름은 그대로다.
    const upper = (v) => String(v ?? '').trim().toUpperCase()
    const skipped = []

    // ② 지급 은행·계좌 — SWIFT 의 나라(5~6번째 글자)와 은행 '주소'의 나라가 다르면 둘 중 하나는
    //   다른 은행 것이다. 대개 중계은행(Intermediary) SWIFT 다. 어느 쪽이 맞는지 모르고, 중계은행 칸의
    //   계좌번호를 집어 왔을 수도 있으니 은행명·계좌번호까지 통째로 비운다.
    const sw = upper(d.bank_swift).replace(/\s/g, '')
    const rc = upper(d.bank_country)              // 은행 주소에서 읽은 나라 — 입력칸이 아니라 대조용
    const swc = swiftCountry(sw)
    const bankIssue = () => {
      if (!sw) return ''
      if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(sw)) return 'SWIFT 형식 아님'
      if (swc === 'KR') return '한국 은행 SWIFT — 구매자(우리) 쪽 은행으로 보임'
      if (/^[A-Z]{2}$/.test(rc) && rc !== swc) {
        return `SWIFT는 ${countryName(swc) || swc} 은행인데 은행 주소는 ${countryName(rc) || rc}`
          + ' — 중계은행 SWIFT일 수 있음'
      }
      return ''
    }
    const bankBad = bankIssue()
    if (bankBad) {
      skipped.push(`지급 은행·계좌번호(${bankBad})`)
    } else {
      put(now.bank, setBank, d.account_bank, 'bank')
      put(now.acctNo, setAcctNo, d.account_no, 'acctNo')
      put(now.swift, setSwift, sw, 'swift')
      put(now.bankAddr, setBankAddr, d.bank_addr, 'bankAddr')
    }
    // 예금주는 은행 정보의 Beneficiary Name 에서 온다(프롬프트) — 주소 판정과 출처가 달라 따로 둔다
    put(now.holder, setHolder, d.account_holder, 'holder')

    // ① 받는 회사 주소 — 나라가 KR 이면 사는 쪽(우리) 주소를 읽은 것이다.
    //   같은 주소에서 나온 도시·주소도 같이 버린다.
    const pc = upper(d.payee_country)
    let payeeBad = ''
    if (pc === 'KR') payeeBad = '한국 주소 — 구매자(우리) 쪽을 읽은 것으로 보임'
    else if (pc && !/^[A-Z]{2}$/.test(pc)) payeeBad = '국가 코드 형식 아님'
    if (payeeBad) {
      skipped.push(`받는 회사 소재지(${payeeBad})`)
    } else {
      put(now.payeeCountry, setPayeeCountry, pc, 'payeeCountry')
      put(now.payeeCity, setPayeeCity, d.payee_city, 'payeeCity')
      put(now.payeeAddr, setPayeeAddr, d.payee_addr, 'payeeAddr')
    }
    // 걸러낸 경우에도 대조용 나라는 남긴다 — 사람이 SWIFT 를 직접 칠 때 다시 대조해 경고한다
    setReadBankCountry(/^[A-Z]{2}$/.test(rc) ? rc : '')
    // 규격·수량은 폼에 자리가 없어 메모로 합친다
    const bits = [d.spec, d.quantity != null ? `수량 ${d.quantity}` : ''].filter(Boolean)
    put(now.memo, setMemo, bits.join(' · '), 'memo')
    setAutoFilled(done)
    // 비운 게 있으면 **왜 비웠는지** 같이 알린다 — 말없이 비우면 '못 읽었구나' 하고 아무 값이나 친다.
    //   주황(warn)으로 띄운다: 성공(초록)에 묻히면 안 읽힌다.
    const skipNote = skipped.length
      ? ` 헷갈리는 값은 비워뒀습니다 — ${skipped.join(' / ')}. 원본에서 확인해 직접 입력해 주세요.`
      : ''
    if (done.length) {
      setMsg({
        type: skipped.length ? 'warn' : 'ok',
        text: `견적서에서 ${done.length}개 항목을 채웠습니다. 원본과 맞는지 확인해 주세요.${skipNote}`,
      })
    } else {
      setMsg({ type: 'err', text: `견적서에서 채울 값을 찾지 못했습니다. 직접 입력해 주세요.${skipNote}` })
    }
  }

  // 1단계 '확인' — 모은 자료를 **한 번에** 읽고 작성 화면으로 넘어간다 (사용자 지시 2026-09-21).
  //   ★ 올리자마자 읽지 않는다 — 견적서·캡처를 여러 장 올리는 일이 많아, 첫 장에서 읽어 버리면
  //     뒤에 올린 자료가 빠진다. 다 올리고 사람이 '확인' 을 눌러야 읽는다.
  //   ★ 장마다 따로 부르지 않고 한 번에 싣는다 — 비용이 장 수만큼 들고, 장끼리 값이 부딪칠 때
  //     먼저 읽힌 값이 조용히 이긴다. 한 번에 읽으면 모델이 대조하고 부딪히면 비운다(프롬프트 20번).
  //   ★ 읽기에 실패해도 넘어간다 — 파일은 첨부에 남아 있고 사람이 직접 채우면 된다.
  //     여기서 막으면 자료가 안 읽히는 날 아무도 의뢰를 못 쓴다.
  const readable = items.filter((it) => isImage(it.file) || it.file.type === 'application/pdf')
  const readAndStart = async () => {
    const targets = readable.slice(0, MAX_READ).map((it) => it.file)
    if (targets.length) {
      setReading(true)
      try {
        applyExtracted(await extractDocument('purchase', targets))
      } catch (e) {
        setMsg({ type: 'err', text: `${e.message} 직접 입력해 주세요.` })
      } finally {
        setReading(false)
      }
    }
    setStep('form')
  }

  // PC: 스크린샷을 찍고 Ctrl+V — 입력칸에 포커스가 없어도 되게 document 에서 듣는다
  useEffect(() => {
    const onPaste = (e) => {
      const files = Array.from(e.clipboardData?.files || [])
      if (files.length) {
        e.preventDefault()
        // 1단계에서도 붙이기만 한다 — 읽기는 다 올리고 '확인' 을 눌렀을 때 한 번(readAndStart)
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
        payeeCountry: isOverseas ? payeeCountry : '',
        payeeCity: isOverseas ? payeeCity.trim() : '',
        payeeAddr: isOverseas ? payeeAddr.trim() : '',
        bankSwift: isOverseas ? swift.trim().toUpperCase() : '',
        bankAddr: isOverseas ? bankAddr.trim() : '',
      })
      // 알림이 일부라도 못 갔으면 상세로 넘기기 전에 알려준다 — 조용히 넘어가면 아무도 모른다
      // 알림은 첨부를 드라이브에 올리고 링크를 받은 뒤에 나간다(BE 백그라운드).
      //   그래서 여기선 결과를 모른다 — 상세 화면이 잠시 뒤 다시 읽어 notify_note 를 보여준다.
      nav(`/admin/purchase/requests/${d.request.id}`, { state: { justSubmitted: true } })
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

  // ── 1단계: 자료 먼저 (사용자 지시 2026-09-17) ──
  //   견적서만 오는 게 아니다. 쇼핑몰 화면 캡처가 그대로 올라온다 — 그래서 붙여넣기를 앞세운다.
  //   읽고 나면 값이 채워진 채로 작성 화면이 열린다. 자료가 없으면 건너뛴다.
  if (step === 'upload') {
    return (
      <div className="page-flat">
        <PageHeader
          title="새 구매 의뢰"
          subtitle="자료를 모두 올리고 확인을 누르면 품명 · 금액 · 계좌를 읽어서 채워드립니다"
          onBack={() => nav('/admin/purchase/requests')}
        />
        <div className="page-content">
          {msg && <p className={MSG_CLS[msg.type] || s.msgOk}>{msg.text}</p>}

          {/* 한 화면에 질문 하나 — 가운데 한 덩어리로 모은다.
              PC 는 폭이 넓어 좌우로 흩어지면 휑하다(사용자 지적 2026-09-17) → .startWrap 이 읽기 폭으로 묶는다. */}
          <div className={s.startWrap}>
            {reading ? (
              <div className={s.startBox}>
                <ScanLoader
                  label="자료를 읽고 있어요"
                  sub="보통 5초쯤 걸립니다 · 못 읽어도 직접 채우면 됩니다"
                />
              </div>
            ) : (
              <div
                className={`${s.startBox} ${dragOver ? s.startBoxOver : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false)
                  addFiles(e.dataTransfer?.files)
                }}
              >
                <span className={s.startIcon} aria-hidden="true">
                  <svg
                    width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
                    <path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
                  </svg>
                </span>
                <p className={s.startTitle}>
                  {items.length ? `자료 ${items.length}개를 올렸어요` : '견적서나 화면 캡처 있으세요?'}
                </p>
                <p className={s.startSub}>
                  {items.length
                    ? '더 있으면 추가하고, 다 올렸으면 확인을 눌러 주세요'
                    : '올려주시면 품명 · 금액 · 계좌를 읽어서 미리 채워드려요'}
                </p>

                {/* 모은 자료 — 확인 전에 잘못 올린 걸 뺄 수 있어야 한다(읽기는 한 번뿐이다) */}
                {items.length > 0 && (
                  <div className={`${s.files} ${s.startFiles}`}>
                    {items.map((it, i) => (
                      <div key={`${it.file.name}-${i}`} className={s.file}>
                        <span className={s.fileIcon}>{ext(it.file.name)}</span>
                        <span className={s.fileName}>{it.file.name}</span>
                        <span className={s.fileSize}>{kb(it.file.size)}</span>
                        <button
                          type="button" className={s.iconBtn} aria-label="빼기"
                          onClick={() => removeAt(i)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 버튼 주인공이 바뀐다 — 자료가 없으면 '올리기', 있으면 '확인'.
                    폰은 갤러리가 먼저다(현장 사진). PC 는 파일 창 하나면 된다(거기서 이미지도 고른다). */}
                <div className={s.startBtns}>
                  {items.length > 0 && (
                    <button type="button" className="btn-primary btn-lg btn-full" onClick={readAndStart}>
                      {readable.length ? `확인 · ${Math.min(readable.length, MAX_READ)}개 읽기` : '확인 · 작성하기'}
                    </button>
                  )}
                  {isMobile && (
                    <button
                      type="button"
                      className={`${items.length ? 'btn-secondary' : 'btn-primary'} btn-lg btn-full`}
                      onClick={() => startShotRef.current?.click()}
                    >
                      {items.length ? '사진 · 캡처 더 올리기' : '사진 · 캡처 올리기'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${isMobile || items.length ? 'btn-secondary' : 'btn-primary'} btn-lg btn-full`}
                    onClick={() => startRef.current?.click()}
                  >
                    {items.length ? '파일 더 올리기' : '파일 고르기'}
                  </button>
                </div>
                {/* 읽을 수 없는 자료만 있거나, 읽기 상한을 넘으면 미리 말한다 — 눌러 보고 나서 알면 늦다 */}
                {items.length > 0 && readable.length === 0 && (
                  <p className={s.startHint}>사진·PDF가 아니라 읽을 수는 없어요 — 첨부로만 올라갑니다</p>
                )}
                {readable.length > MAX_READ && (
                  <p className={s.startHint}>사진·PDF는 앞의 {MAX_READ}개까지 읽습니다 — 나머지는 첨부로만 올라갑니다</p>
                )}

                {/* 끌어놓기·붙여넣기는 PC 에서만 된다 — 폰에 Ctrl 키는 없다 */}
                {!isMobile && (
                  <p className={s.startHint}>
                    여기로 끌어다 놓거나 <span className={s.kbd}>Ctrl</span>+
                    <span className={s.kbd}>V</span> 로 붙여넣어도 됩니다
                  </p>
                )}
              </div>
            )}

            <div className={s.skipRow}>
              <button
                type="button" className="btn-text" disabled={reading}
                onClick={() => setStep('form')}
              >
                {items.length ? '읽지 않고 직접 작성하기' : '자료 없이 직접 작성하기'}
              </button>
            </div>
          </div>

          {/* capture 를 주지 않는다 — 폰에서 카메라를 강제하지 않고 갤러리도 고를 수 있어야 한다 */}
          <input ref={startShotRef} type="file" accept="image/*" multiple hidden onChange={pick} />
          <input ref={startRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={pick} />
        </div>
      </div>
    )
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="새 구매 의뢰"
        subtitle="제출하면 바로 승인자에게 알림이 갑니다. 이후 수정은 안 됩니다"
        onBack={() => nav('/admin/purchase/requests')}
      />
      <div className="page-content">
        {msg && <p className={MSG_CLS[msg.type] || s.msgOk}>{msg.text}</p>}
        {reading && <ScanLoader inline label="견적서를 읽는 중이에요" />}

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
            {autoFilled.includes('payType') && <span className={s.auto}>자동 선택됨</span>}
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
          {/* 항상 띄워 둔다(사용자 지시 2026-09-17) — 감췄다 나타나면 폼이 출렁이고,
              계좌이체를 고르기 전엔 이런 선택이 있다는 것조차 모른다.
              카드일 땐 누를 수만 없게 잠근다. */}
          <div className={s.payRow}>
            <span className={s.payLabel}>송금 구분</span>
            {isTransfer && <span className={s.reqTag}>필수</span>}
            {TRANSFER_SCOPES.map((o) => (
              <button
                key={o.v} type="button" disabled={!isTransfer}
                className={scope === o.v && isTransfer ? s.chipOn : s.chip}
                onClick={() => setScope(o.v)}
              >
                {o.label}
              </button>
            ))}
            {!isTransfer && <span className={s.payNote}>계좌이체일 때만</span>}
            {isTransfer && autoFilled.includes('scope')
              && <span className={s.auto}>자동 선택됨</span>}
          </div>
          <div className={s.payRow}>
            <span className={s.payLabel}>지급 시점</span>
            {autoFilled.includes('payTiming') && <span className={s.auto}>자동 선택됨</span>}
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
                {autoFilled.includes('title') && <span className={s.auto}>자동 입력됨</span>}
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
            {/* 카드면 링크 / 계좌이체면 계좌. 둘 다 필수라 한쪽만 보여준다.
                ★ 해외송금은 **은행 외화송금 화면('받으시는분 정보')의 칸 순서 그대로** 받는다(사용자 지시 2026-09-21).
                  구매 담당이 위에서부터 한 칸씩 옮겨 적는다 — 순서가 다르면 칸을 건너뛰며 찾다가 틀린다.
                  ① 영문이름 ② 소재국가 ③ 영문주소 ④ 영문시/도명 ⑤ 입금계좌번호 / ⑥ 지급은행 소재국 ⑦ SWIFT ⑧ 은행명 ⑨ 은행주소
                ★ 국내송금은 이체 화면 순서(은행 → 계좌번호 → 예금주)가 달라 한 줄 3칸 그대로 둔다. */}
            {isTransfer && !isOverseas && (
              <div className={s.field}>
                <label className={`form-label ${s.fLabel}`} htmlFor="pr-bank">
                  입금 계좌 <span className={s.reqTag}>필수</span>
                  <span className={s.hint}>은행 · 계좌번호 · 예금주 세 칸 모두</span>
                  {autoFilled.includes('bank') && <span className={s.auto}>자동 입력됨</span>}
                </label>
                <div className={s.acct}>
                  <input
                    id="pr-bank" className={inCls('bank')} value={bank} maxLength={100}
                    placeholder="은행" onChange={(e) => setBank(e.target.value)}
                  />
                  <input
                    id="pr-acctno" className={inCls('acctNo')} value={acctNo} maxLength={40}
                    placeholder="계좌번호" onChange={(e) => setAcctNo(e.target.value)}
                  />
                  <input
                    id="pr-holder" className={inCls('holder')} value={holder} maxLength={100}
                    placeholder="예금주" onChange={(e) => setHolder(e.target.value)}
                  />
                </div>
                {errFor('bank', '은행을 입력해주세요')}
                {errFor('acctNo', '계좌번호를 입력해주세요')}
                {errFor('holder', '예금주를 입력해주세요')}
                <p className={s.hint}>승인자에게 가는 알림에 그대로 실립니다.</p>
              </div>
            )}
            {/* 해외송금 — 받는 회사 / 지급 은행 두 블록. 둘은 나라가 다를 수 있다(중국 회사 + 홍콩 은행). */}
            {isOverseas && (
              <div className={s.field}>
                <label className={`form-label ${s.fLabel}`} htmlFor="pr-holder">
                  받는 회사 <span className={s.reqTag}>필수</span>
                  <span className={s.hint}>수취인 — 은행 화면 &apos;받으시는분 정보&apos; 순서</span>
                  {['holder', 'payeeCountry', 'payeeAddr', 'payeeCity', 'acctNo'].some((k) => autoFilled.includes(k))
                    && <span className={s.auto}>자동 입력됨</span>}
                </label>
                {/* ① 영문이름 */}
                <input
                  id="pr-holder" className={inCls('holder')} value={holder} maxLength={100}
                  placeholder="영문이름 (예: HUNAN SOLAR CHEMICAL CO.,LTD)"
                  onChange={(e) => setHolder(e.target.value)}
                />
                {/* ② 소재국가 → ③ 영문주소 */}
                <div className={`${s.acctIntl} ${s.acctRow}`}>
                  <div className={s.cc}>
                    <input
                      id="pr-payee-country" className={inCls('payeeCountry')} value={payeeCountry}
                      maxLength={2} placeholder="소재국가 (CN)" autoCapitalize="characters"
                      onChange={(e) => setPayeeCountry(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                    />
                    {/* 코드만 보면 틀려도 모른다 — 옆에 한글 이름을 띄워 오타를 눈으로 잡게 한다 */}
                    <span className={s.ccName}>{countryName(payeeCountry)}</span>
                  </div>
                  <input
                    id="pr-payee-addr" className={inCls('payeeAddr')} value={payeeAddr} maxLength={200}
                    placeholder="영문주소 (예: NO.88 XINGSHA RD, HUNAN)"
                    onChange={(e) => setPayeeAddr(e.target.value)}
                  />
                </div>
                {/* ④ 영문시/도명 → ⑤ 입금계좌번호 */}
                <div className={`${s.acctIntl} ${s.acctRow}`}>
                  <input
                    id="pr-payee-city" className={inCls('payeeCity')} value={payeeCity} maxLength={35}
                    placeholder="영문시/도명 (예: CHANGSHA)"
                    onChange={(e) => setPayeeCity(e.target.value)}
                  />
                  <input
                    id="pr-acctno" className={inCls('acctNo')} value={acctNo} maxLength={40}
                    placeholder="입금계좌번호 · IBAN"
                    onChange={(e) => setAcctNo(e.target.value)}
                  />
                </div>
                {errFor('holder', '영문이름(예금주)을 입력해주세요')}
                {errFor('payeeCountry', '소재국가를 두 글자 코드로 입력해주세요 (예: CN)')}
                {errFor('payeeAddr', '영문주소를 입력해주세요')}
                {errFor('payeeCity', '영문시/도명을 입력해주세요')}
                {errFor('acctNo', '입금계좌번호를 입력해주세요')}
                {payeeCountry === 'KR' && (
                  <p className={s.warnMsg}>
                    한국(KR)은 사는 쪽(우리 회사) 주소입니다 — 인보이스의 Seller·Beneficiary 주소를 넣어주세요.
                  </p>
                )}
                <p className={s.hint}>
                  국가 코드 예: CN 중국 · HK 홍콩 · TW 대만 · JP 일본 · US 미국 · DE 독일.
                  영문시/도명은 35자까지(점·하이픈 외 특수문자 불가), 주소엔 도시·나라 이름을 빼고 적어주세요.
                </p>
              </div>
            )}
            {isOverseas && (
              <div className={s.field}>
                <label className={`form-label ${s.fLabel}`} htmlFor="pr-swift">
                  지급 은행 <span className={s.reqTag}>필수</span>
                  <span className={s.hint}>받는 계좌가 있는 은행 — 회사와 나라가 다를 수 있습니다</span>
                  {['swift', 'bank', 'bankAddr'].some((k) => autoFilled.includes(k))
                    && <span className={s.auto}>자동 입력됨</span>}
                </label>
                {/* ⑥ 소재국 → ⑦ SWIFT. 소재국은 입력받지 않는다 — SWIFT 5~6번째 글자가 곧 나라다
                    (BE 도 같은 규칙으로 저장). 은행 화면에선 이 칸을 보고 드롭다운을 고르면 된다. */}
                <div className={s.acctIntl}>
                  <input
                    className={`form-input ${s.ro}`} readOnly tabIndex={-1}
                    aria-label="지급은행 소재국 — SWIFT CODE에서 자동"
                    placeholder="소재국 · SWIFT에서 자동"
                    value={swiftCountry(swift)
                      ? `${countryName(swiftCountry(swift)) || swiftCountry(swift)} (${swiftCountry(swift)})` : ''}
                  />
                  <input
                    id="pr-swift" className={inCls('swift')} value={swift} maxLength={11}
                    placeholder="SWIFT CODE (예: BKCHHKHH)" autoCapitalize="characters"
                    onChange={(e) => setSwift(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  />
                </div>
                {/* ⑧ 지급은행명(영문) */}
                <input
                  id="pr-bank" className={`${inCls('bank')} ${s.acctRow}`} value={bank} maxLength={100}
                  placeholder="지급은행명 (영문, 예: BANK OF CHINA (HONG KONG) LIMITED)"
                  onChange={(e) => setBank(e.target.value)}
                />
                {/* ⑨ 지급은행주소(영문) — 선택. 은행 화면은 SWIFT 를 고르면 이 칸을 잠근다 */}
                <input
                  id="pr-bank-addr" className={`form-input ${s.acctRow}`}
                  value={bankAddr} maxLength={200}
                  placeholder="지급은행 영문주소 (선택)"
                  onChange={(e) => setBankAddr(e.target.value)}
                />
                {errFor('swift', 'SWIFT CODE를 입력해주세요')}
                {errFor('bank', '지급은행명을 입력해주세요')}
                {/* 견적서의 '은행 주소 나라'와 SWIFT 의 나라가 다르면 — 중계은행(Intermediary) SWIFT 를
                    집어 왔을 가능성이 크다(달러 송금 인보이스에 흔하다). 막지는 않는다: 읽기가 틀렸을 수도 있다. */}
                {readBankCountry && swiftCountry(swift) && readBankCountry !== swiftCountry(swift) && (
                  <p className={s.warnMsg}>
                    견적서의 은행 주소는 {countryName(readBankCountry) || readBankCountry}인데
                    SWIFT는 {countryName(swiftCountry(swift)) || swiftCountry(swift)} 은행입니다 —
                    중계은행(Intermediary) SWIFT가 아닌지 원본을 확인해주세요.
                  </p>
                )}
                {swiftCountry(swift) === 'KR' && (
                  <p className={s.warnMsg}>
                    한국 은행 SWIFT입니다 — 국내 계좌로 받는 건이면 국내송금을 골라주세요.
                  </p>
                )}
                <p className={s.hint}>
                  소재국은 SWIFT CODE에서 자동으로 정해집니다. 은행 주소는 SWIFT를 모를 때를 대비해 받아 둡니다.
                </p>
              </div>
            )}
            {!isTransfer && (
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
                {autoFilled.includes('memo') && <span className={s.auto}>자동 입력됨</span>}
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
