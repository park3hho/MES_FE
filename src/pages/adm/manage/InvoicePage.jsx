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
  deleteInvoice,
} from '@/api'
import InvoiceDetailModal from './InvoiceDetailModal'
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

// 오늘 기준 1주일 전 YYYY-MM-DD
function defaultDateFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

const ACCEPTED_EXTS = ['.pdf', '.xlsx', '.xls']

export default function InvoicePage({ onBack, onLogout }) {
  // 업로드 폼 state
  const [invoiceNo, setInvoiceNo] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

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
    const t = setTimeout(() => setMsg(null), 2500)
    return () => clearTimeout(t)
  }, [msg])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 3500)
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

  // ── 업로드 ──
  const handleUpload = async (e) => {
    e.preventDefault()
    if (!invoiceNo.trim()) return setError('송장 번호를 입력해주세요.')
    if (!file) return setError('파일을 선택해주세요.')

    setUploading(true)
    setError(null)
    try {
      await uploadInvoice({
        invoiceNo: invoiceNo.trim(),
        title: title.trim(),
        notes: notes.trim(),
        file,
      })
      setMsg(`업로드 완료: ${invoiceNo}`)
      setInvoiceNo(''); setTitle(''); setNotes(''); setFile(null)
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

  // ── 삭제 ──
  const handleDelete = async (item) => {
    if (!window.confirm(`정말 삭제할까요?\n\n${item.invoice_no}\n\n(S3 Versioning으로 복구는 가능하지만 일반 조회에선 사라집니다)`)) return
    try {
      await deleteInvoice(item.id)
      setMsg(`삭제 완료: ${item.invoice_no}`)
      await fetchList()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="송장 관리"
        subtitle="엑셀/PDF를 올리면 자동으로 PDF로 변환돼서 보관돼요"
        onBack={onBack}
      />

      {/* 업로드 폼 */}
      <section className={s.uploadCard}>
        <h2 className={s.sectionTitle}>새 송장 업로드</h2>
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
          <div className={s.formRow}>
            <label className={s.label}>파일 *</label>
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
                  <span className={s.dropzoneIcon}>📎</span>
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
            disabled={uploading || !invoiceNo.trim() || !file}
          >
            {uploading ? '업로드 중...' : '업로드'}
          </button>
        </form>
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
                <div className={s.invoiceNo}>{item.invoice_no}</div>
                {item.title && <div className={s.invoiceTitle}>{item.title}</div>}
                {item.notes && <div className={s.invoiceNotes}>📝 {item.notes}</div>}
                <div className={s.invoiceMeta}>
                  <span>📎 {item.original_ext.toUpperCase()} · {formatSize(item.file_size_original)}</span>
                  <span>🕒 {formatDate(item.created_at)}</span>
                </div>
              </div>
              <div className={s.invoiceActions}>
                <button className={s.btnPreview} onClick={() => setDetailInvoiceId(item.id)}>
                  진척률
                </button>
                <button className={s.btnPreview} onClick={() => handlePreview(item)}>
                  미리보기
                </button>
                <button className={s.btnDownload} onClick={() => handleDownload(item)}>
                  PDF
                </button>
                <button className={s.btnDelete} onClick={() => handleDelete(item)}>
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
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
