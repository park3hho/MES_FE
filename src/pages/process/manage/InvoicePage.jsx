// src/pages/adm/manage/InvoicePage.jsx
// 송장 문서 관리 — admin_rnd 전용
// 호출: App.jsx → ADMIN_LIST.INVOICE
//
// 기능:
//   1. 파일 업로드 (xlsx/xls/pdf) — 자동 PDF 변환
//   2. 목록 조회 (날짜 필터 + 검색)
//   3. 미리보기 모달 (iframe + presigned PDF URL)
//   4. PDF 다운로드 / 삭제
// 참고: 원본(xlsx)도 S3에 보관되지만 FE에선 다운로드 노출 안 함 (감사용 보관)
//
// 규약 준수:
//   - PageHeader 사용 → 뒤로가기 우상단 + scrollTo(0,0) 자동 처리
//   - API 호출은 api/index.js에만 정의
//   - 디자인 토큰 + variables.css 변수 사용, hex 하드코딩 금지

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  uploadInvoice, listInvoices,
  getInvoicePreviewUrl, getInvoiceDownloadUrl,
  deleteInvoice, attachInvoiceFile, deleteInvoiceFile,   // 파일만 삭제 (2026-08-28)
  attachInvoiceWaybill, getInvoiceWaybillUrl, deleteInvoiceWaybill,  // 운송장 (2026-05-08)
  getCompanies,                 // 회사 드롭다운 (2026-05-02 Phase B)
} from '@/api'
import InvoiceDetailModal from './InvoiceDetailModal'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import { TOAST_MSG_MS, TOAST_ERROR_MS } from '@/constants/etcConst'
import { kstDaysAgo } from '@/utils/dateConvert'
import s from './InvoicePage.module.css'

// 바이트 → 사람 읽기 쉬운 단위
function formatSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// ISO → YYYY-MM-DD HH:MM
function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 오늘(KST) 기준 1달 전 YYYY-MM-DD — 송장은 주 단위보다 월 단위로 도니 1주일이면
// 지난달 말 송장이 첫 화면에서 사라져 "없어졌다" 오해가 잦았다 (2026-08-28, 7일→30일)
const defaultDateFrom = () => kstDaysAgo(30)

const ACCEPTED_EXTS = ['.pdf', '.xlsx', '.xls']

export default function InvoicePage({ onBack, onLogout }) {
  const confirm = useConfirm()
  // 업로드 폼 state
  const [invoiceNo, setInvoiceNo] = useState('')
  const [title, setTitle] = useState('')
  const [customer, setCustomer] = useState('')
  const [companyId, setCompanyId] = useState('')   // 회사 FK (2026-05-02). '' = 미선택 → customer 텍스트 직접
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  // 업로드 폼 접이식 (2026-08-28) — 이 화면의 주 사용은 '목록 조회'인데 폼이 첫 화면을 다 먹었다.
  //   기본 접힘, "새 송장" 버튼으로 펼침. 업로드 성공하면 다시 접는다.
  const [uploadOpen, setUploadOpen] = useState(false)

  // 회사 마스터 — customer role 필터 (2026-05-02 Phase B)
  const [companies, setCompanies] = useState([])
  useEffect(() => {
    let cancelled = false
    getCompanies(true)
      .then((data) => {
        if (cancelled) return
        // customer role 보유한 회사만 표시 — 송장은 구매사 대상
        const customers = (data.companies || []).filter(
          (c) => Array.isArray(c.roles) && c.roles.includes('customer')
        )
        // 정렬: display_order → name
        customers.sort((a, b) =>
          (a.display_order || 999) - (b.display_order || 999) ||
          (a.name || '').localeCompare(b.name || '')
        )
        setCompanies(customers)
      })
      .catch(() => { /* 조용히 — 드롭다운만 비고 customer 텍스트는 그대로 동작 */ })
    return () => { cancelled = true }
  }, [])

  // 회사 선택 시 customer 텍스트 자동 채움
  const handleCompanyChange = (e) => {
    const cid = e.target.value
    setCompanyId(cid)
    if (cid) {
      const c = companies.find((x) => String(x.id) === cid)
      if (c) setCustomer(c.name || '')
    }
  }

  // 목록 state
  const [dateFrom, setDateFrom] = useState(defaultDateFrom())
  const [dateTo, setDateTo] = useState('')
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  // UI state
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  const [preview, setPreview] = useState(null)   // { url, invoice_no }
  const [detailInvoiceId, setDetailInvoiceId] = useState(null)  // 진척률 모달 대상 (2026-04-21)
  const [attachTargetId, setAttachTargetId] = useState(null)    // 파일 첨부 대상 invoice.id
  const [waybillTargetId, setWaybillTargetId] = useState(null)  // 운송장 첨부 대상 invoice.id (2026-05-08)

  // ── 목록 조회 ──
  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listInvoices({
        dateFrom, dateTo, q,
        limit: 100, offset: 0,
      })
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, q])

  useEffect(() => { fetchList() }, [fetchList])

  // 메시지/에러 자동 해제
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), TOAST_MSG_MS)
    return () => clearTimeout(t)
  }, [msg])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), TOAST_ERROR_MS)
    return () => clearTimeout(t)
  }, [error])

  // ── 파일 선택/드롭 공통 처리 ── (제목은 파일명으로 동기화)
  const handleFile = (f) => {
    if (!f) {
      setFile(null)
      return
    }
    const ext = '.' + (f.name.split('.').pop() || '').toLowerCase()
    if (!ACCEPTED_EXTS.includes(ext)) {
      setError(`허용되지 않는 파일 형식입니다. (${ACCEPTED_EXTS.join(', ')})`)
      return
    }
    setFile(f)
    // 파일명(확장자 제거)을 송장 번호·제목에 동시 반영. 사용자가 이후 수동 편집 가능.
    const baseName = f.name.replace(/\.[^/.]+$/, '')
    setInvoiceNo(baseName)
    setTitle(baseName)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    if (uploading) return
    setDragOver(true)
  }
  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragOver(false)
  }
  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (uploading) return
    handleFile(e.dataTransfer.files?.[0] || null)
  }

  // ── 업로드 (파일 optional — 파일 없이 meta만 생성 허용) ──
  const handleUpload = async (e) => {
    e.preventDefault()
    if (!invoiceNo.trim()) return setError('송장 번호를 입력해주세요.')

    setUploading(true)
    setError(null)
    try {
      await uploadInvoice({
        invoiceNo: invoiceNo.trim(),
        title: title.trim(),
        customer: customer.trim(),
        companyId: companyId ? Number(companyId) : null,
        notes: notes.trim(),
        file,
      })
      setMsg(`업로드 완료: ${invoiceNo}`)
      setInvoiceNo(''); setTitle(''); setCustomer(''); setCompanyId(''); setNotes(''); setFile(null)
      setUploadOpen(false)   // 성공 → 폼 접고 목록으로 시선 이동
      // 파일 input 리셋
      const fileInput = document.getElementById('invoice-file-input')
      if (fileInput) fileInput.value = ''
      await fetchList()
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  // ── 미리보기 ──
  const handlePreview = async (item) => {
    try {
      const { url } = await getInvoicePreviewUrl(item.id)
      setPreview({ url, invoice_no: item.invoice_no })
    } catch (e) {
      setError(e.message)
    }
  }

  // ── PDF 다운로드 (원본은 S3에 보관만, FE 노출 X) ──
  const handleDownload = async (item) => {
    try {
      const { url } = await getInvoiceDownloadUrl(item.id)
      // 브라우저가 Content-Disposition 따라 저장
      window.location.href = url
    } catch (e) {
      setError(e.message)
    }
  }

  // ── 첨부 파일만 제거 (2026-08-28) ──
  //   잘못 올린 파일을 되돌릴 방법이 '송장 통삭제' 뿐이었다 — 그러면 요구 항목·MB 할당·진척까지
  //   같이 날아간다. 여기서는 파일만 지우고 송장은 남긴다.
  const handleDeleteFile = async (item) => {
    if (!(await confirm({
      title: '첨부 파일 삭제',
      message: `${item.invoice_no} 의 첨부 파일을 지울까요?\n`
        + '송장 자체와 요구 항목·MB 할당·운송장은 그대로 남습니다.\n'
        + '올바른 파일로 바꾸려는 거면 "교체"를 쓰면 한 번에 됩니다.',
      confirmText: '파일 삭제',
      danger: true,
    }))) return
    try {
      await deleteInvoiceFile(item.id)
      setMsg(`파일 삭제 완료: ${item.invoice_no}`)
      await fetchList()
    } catch (e) {
      setError(e.message)
    }
  }

  // ── 운송장 제거 (2026-05-08 API 를 이제야 화면에 연결) ──
  const handleDeleteWaybill = async (item) => {
    if (!(await confirm({
      title: '운송장 삭제',
      message: `${item.invoice_no} 의 운송장을 지울까요?`,
      confirmText: '삭제',
      danger: true,
    }))) return
    try {
      await deleteInvoiceWaybill(item.id)
      setMsg(`운송장 삭제 완료: ${item.invoice_no}`)
      await fetchList()
    } catch (e) {
      setError(e.message)
    }
  }

  // ── 삭제 ──
  const handleDelete = async (item) => {
    if (!(await confirm({
      title: '인보이스 삭제',
      message: `${item.invoice_no} 인보이스를 삭제할까요?\nS3 Versioning 으로 복구는 가능하지만 일반 조회에선 사라집니다.`,
      confirmText: '삭제',
      danger: true,
    }))) return
    try {
      await deleteInvoice(item.id)
      setMsg(`삭제 완료: ${item.invoice_no}`)
      await fetchList()
    } catch (e) {
      setError(e.message)
    }
  }

  // ── 인라인 SVG 아이콘 (2026-08-28 리디자인) ──
  //   MES_FE 엔 아이콘 폰트가 없다(ti ti-* 미로드) — 인라인 SVG 가 규약.
  //   이모지(🏢📎🕒🚚)는 기기·OS 마다 렌더가 제각각이고 톤도 안 맞아 전부 교체.
  const Ic = ({ d, size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  )
  const icons = {
    edit: <Ic d={<><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>} />,
    eye: <Ic d={<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>} />,
    download: <Ic d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>} />,
    swap: <Ic d={<><path d="M3 12a9 9 0 0 1 15.5-6.4L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.4L3 16" /><path d="M3 21v-5h5" /></>} />,
    trash: <Ic d={<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>} />,
    truck: <Ic d={<><path d="M14 18V6a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1" /><path d="M14 9h4l3 3v5a1 1 0 0 1-1 1h-1" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /><path d="M9 18h6" /></>} />,
    clip: <Ic d={<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />} />,
    building: <Ic d={<><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01M12 6h.01M12 10h.01M12 14h.01" /></>} size={12} />,
    clock: <Ic d={<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>} size={12} />,
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="송장 관리"
        subtitle="엑셀/PDF를 올리면 자동으로 PDF로 변환돼서 보관돼요"
        onBack={onBack}
      />

      {/* 업로드 폼 — 접이식 (2026-08-28). 주 사용은 목록이라 기본 접힘 */}
      <section className={s.uploadCard}>
        <button
          type="button"
          className={s.uploadToggle}
          onClick={() => setUploadOpen((v) => !v)}
          aria-expanded={uploadOpen}
        >
          <span className={s.uploadToggleLabel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            새 송장 업로드
          </span>
          <svg
            className={`${s.uploadChevron} ${uploadOpen ? s.uploadChevronOpen : ''}`}
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {uploadOpen && (
        <form className={s.uploadForm} onSubmit={handleUpload}>
          <div className={s.formRow}>
            <label className={s.label}>송장 번호 *</label>
            <input
              type="text"
              className={s.input}
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="예: INV-2026-0001"
              disabled={uploading}
            />
          </div>
          <div className={s.formRow}>
            <label className={s.label}>제목</label>
            <input
              type="text"
              className={s.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="선택 입력"
              disabled={uploading}
            />
          </div>
          <div className={s.formRow}>
            <label className={s.label}>고객사</label>
            <select
              className={s.input}
              value={companyId}
              onChange={handleCompanyChange}
              disabled={uploading || companies.length === 0}
            >
              <option value="">— 회사 선택 —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.name_ko ? ` (${c.name_ko})` : ''}{c.code ? ` · ${c.code}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className={`${s.formRow} ${s.formRowFull}`}>
            <label className={s.label}>비고</label>
            <textarea
              className={s.input}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="선택 입력 (최대 500자)"
              maxLength={500}
              rows={2}
              disabled={uploading}
            />
          </div>
          <div className={`${s.formRow} ${s.formRowFull}`}>
            <label className={s.label}>파일</label>
            <label
              htmlFor="invoice-file-input"
              className={`${s.dropzone} ${dragOver ? s.dropzoneActive : ''} ${file ? s.dropzoneFilled : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {file ? (
                <div className={s.dropzoneFileInfo}>
                  <strong>{file.name}</strong>
                  <span>{formatSize(file.size)}</span>
                  <button
                    type="button"
                    className={s.dropzoneClear}
                    onClick={(e) => {
                      e.preventDefault()
                      handleFile(null)
                      const fi = document.getElementById('invoice-file-input')
                      if (fi) fi.value = ''
                    }}
                    disabled={uploading}
                    aria-label="파일 선택 취소"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className={s.dropzoneHint}>
                  <span className={s.dropzoneIcon}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </span>
                  <span>파일을 드래그하거나 클릭해서 선택</span>
                  <span className={s.dropzoneSubhint}>PDF / XLSX / XLS</span>
                </div>
              )}
              <input
                id="invoice-file-input"
                type="file"
                className={s.fileInputHidden}
                accept=".pdf,.xlsx,.xls"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
                disabled={uploading}
              />
            </label>
          </div>
          <button
            type="submit"
            className={s.uploadBtn}
            disabled={uploading || !invoiceNo.trim()}
          >
            {uploading ? '업로드 중...' : (file ? '업로드' : '파일 없이 생성')}
          </button>
        </form>
        )}
      </section>

      {/* 메시지 / 에러 */}
      {msg && <p className={s.msgOk}>{msg}</p>}
      {error && <p className={s.msgErr}>⚠ {error}</p>}

      {/* 목록 필터 */}
      <section className={s.filterCard}>
        <div className={s.filterRow}>
          <label className={s.filterLabel}>기간</label>
          <input
            type="date"
            className={s.dateInput}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className={s.dateSep}>~</span>
          <input
            type="date"
            className={s.dateInput}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className={s.filterRow}>
          <label className={s.filterLabel}>검색</label>
          <input
            type="text"
            className={s.input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="송장 번호 또는 제목"
          />
        </div>
      </section>

      {/* 목록 */}
      <section className={s.listSection}>
        <div className={s.listHeader}>
          <span className={s.listCount}>총 {total}건</span>
          {loading && <span className={s.loadingTxt}>불러오는 중...</span>}
        </div>

        {items.length === 0 && !loading && (
          <p className={s.emptyTxt}>등록된 송장이 없습니다.</p>
        )}

        <ul className={s.invoiceList}>
          {items.map((item) => (
            <li key={item.id} className={s.invoiceItem}>
              <div className={s.invoiceMain}>
                <div className={s.invoiceNo}>
                  {item.invoice_no}
                  {item.status === 'done' && <span className={`${s.statusPill} ${s.statusDone}`}>출하완료</span>}
                  {item.status === 'archived' && <span className={`${s.statusPill} ${s.statusArchived}`}>종료됨</span>}
                </div>
                {item.title && item.title !== item.invoice_no && (
                  <div className={s.invoiceTitle}>{item.title}</div>
                )}
                <div className={s.invoiceMeta}>
                  {item.has_file ? (
                    <span className={s.fileChip}>
                      {item.original_ext.toUpperCase()} · {formatSize(item.file_size_original)}
                    </span>
                  ) : (
                    <span className={`${s.fileChip} ${s.fileChipEmpty}`}>파일 없음</span>
                  )}
                  {(item.company_name || item.customer) && (
                    <span className={s.metaItem}>
                      {icons.building}
                      {item.company_name || item.customer}
                      {item.company_code && ` · ${item.company_code}`}
                    </span>
                  )}
                  <span className={s.metaItem}>{icons.clock}{formatDate(item.created_at)}</span>
                  {item.has_waybill && <span className={s.metaItem}>{icons.truck}운송장</span>}
                </div>
              </div>
              {/* 액션 (2026-08-28 리디자인) — 세로 기둥 → 가로 2열.
                  1열 = 자주 쓰는 것(편집·미리보기·PDF), 2열 = 파일 정정·운송장·삭제.
                  파괴적 동작(삭제류)은 아이콘+빨강으로 구분하고 confirm 이 한 번 더 막는다. */}
              <div className={s.invoiceActions}>
                <div className={s.actRow}>
                  <button className={`${s.act} ${s.actPrimary}`} onClick={() => setDetailInvoiceId(item.id)}>
                    {icons.edit}편집
                  </button>
                  {item.has_file && (
                    <>
                      <button className={s.act} onClick={() => handlePreview(item)}>
                        {icons.eye}미리보기
                      </button>
                      <button className={s.act} onClick={() => handleDownload(item)}>
                        {icons.download}PDF
                      </button>
                    </>
                  )}
                </div>
                <div className={s.actRow}>
                  {item.has_file ? (
                    <>
                      {/* 잘못 올렸을 때 — 교체가 1순위(한 번에 끝남), 파일 삭제는 '없는 상태'로 되돌릴 때 */}
                      <button
                        className={s.act}
                        onClick={() => {
                          setAttachTargetId(item.id)
                          document.getElementById('invoice-attach-input')?.click()
                        }}
                        title="다른 파일로 교체 (xlsx/xls/pdf)"
                      >
                        {icons.swap}교체
                      </button>
                      <button
                        className={`${s.act} ${s.actDanger}`}
                        onClick={() => handleDeleteFile(item)}
                        title="첨부 파일만 삭제 — 송장은 남습니다"
                      >
                        {icons.trash}파일
                      </button>
                    </>
                  ) : (
                    <button
                      className={s.act}
                      onClick={() => {
                        setAttachTargetId(item.id)
                        document.getElementById('invoice-attach-input')?.click()
                      }}
                      title="파일 첨부 (xlsx/xls/pdf)"
                    >
                      {icons.clip}파일 첨부
                    </button>
                  )}
                  {item.has_waybill ? (
                    <>
                      <button
                        className={s.act}
                        onClick={async () => {
                          try {
                            const res = await getInvoiceWaybillUrl(item.id)
                            if (res?.url) window.open(res.url, '_blank', 'noopener,noreferrer')
                          } catch (e) { setError(e.message || '운송장 다운로드 실패') }
                        }}
                        title={item.waybill_filename || '운송장 다운로드'}
                      >
                        {icons.truck}운송장
                      </button>
                      <button
                        className={`${s.act} ${s.actDanger}`}
                        onClick={() => handleDeleteWaybill(item)}
                        title="운송장 삭제"
                      >
                        {icons.trash}운송장
                      </button>
                    </>
                  ) : (
                    <button
                      className={s.act}
                      onClick={() => {
                        setWaybillTargetId(item.id)
                        document.getElementById('invoice-waybill-input')?.click()
                      }}
                      title="운송장 첨부 (PDF/이미지)"
                    >
                      {icons.truck}운송장 추가
                    </button>
                  )}
                  <button
                    className={`${s.act} ${s.actDanger}`}
                    onClick={() => handleDelete(item)}
                    title="송장 전체 삭제 — 요구 항목·MB 할당도 함께 사라집니다"
                  >
                    {icons.trash}삭제
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* 파일 첨부 전용 hidden input — 각 행 "파일 첨부" 버튼에서 click 트리거 */}
        <input
          id="invoice-attach-input"
          type="file"
          accept=".pdf,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''  // 같은 파일 재선택 허용
            if (!f || !attachTargetId) return
            setError(null); setMsg(null)
            // 이 input 은 '첨부'와 '교체' 두 버튼이 같이 쓴다 — 안내 문구는 실제로 한 일에 맞춘다
            const replacing = items.find((x) => x.id === attachTargetId)?.has_file
            try {
              await attachInvoiceFile(attachTargetId, f)
              setMsg(replacing ? '파일이 교체되었습니다.' : '파일이 첨부되었습니다.')
              await fetchList()
            } catch (err) {
              setError(err.message || '파일 첨부 실패')
            } finally {
              setAttachTargetId(null)
            }
          }}
        />

        {/* 운송장 첨부 전용 hidden input (2026-05-08) */}
        <input
          id="invoice-waybill-input"
          type="file"
          accept=".pdf,image/*"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f || !waybillTargetId) return
            setError(null); setMsg(null)
            try {
              await attachInvoiceWaybill(waybillTargetId, f)
              setMsg('운송장이 첨부되었습니다.')
              await fetchList()
            } catch (err) {
              setError(err.message || '운송장 첨부 실패')
            } finally {
              setWaybillTargetId(null)
            }
          }}
        />
      </section>

      {/* 미리보기 모달 */}
      {preview && (
        <div className={s.previewOverlay} onClick={() => setPreview(null)}>
          <div className={s.previewBox} onClick={(e) => e.stopPropagation()}>
            <div className={s.previewHeader}>
              <span className={s.previewTitle}>{preview.invoice_no}</span>
              <button className={s.previewClose} onClick={() => setPreview(null)}>✕</button>
            </div>
            <iframe
              className={s.previewFrame}
              src={preview.url}
              title={preview.invoice_no}
            />
          </div>
        </div>
      )}

      {/* 진척률/할당 상세 모달 (2026-04-21) */}
      {detailInvoiceId != null && (
        <InvoiceDetailModal
          invoiceId={detailInvoiceId}
          onClose={() => setDetailInvoiceId(null)}
        />
      )}
    </div>
  )
}
