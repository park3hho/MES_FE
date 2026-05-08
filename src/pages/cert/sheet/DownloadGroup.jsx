// pages/cert/sheet/DownloadGroup.jsx
// PDF / XLSX / JSON 다운로드 버튼 + JSON viewer 모달 (2026-05-01 / CertFlow 분할 2026-05-08)
//
// 2026-05-01:
//   - PDF / XLSX: BE /cert/export/{pdf|xlsx} → blob 다운로드
//   - JSON: 별도 모달로 raw JSON 표시 + 복사 (다운로드 X — Postman 스타일 viewer)

import { useState } from 'react'
import { certDownload, certFetchExportJson } from '@/api'
import s from '../CertFlow.module.css'

export default function DownloadGroup({ compact, sessionToken }) {
  const [busy, setBusy] = useState('') // '' | 'pdf' | 'xlsx' | 'json'
  const [jsonData, setJsonData] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleDownload = async (fmt) => {
    // PDF/XLSX 만 — blob → a.download
    if (busy) return
    if (!sessionToken) {
      alert('Authentication required. Please re-enter password.')
      return
    }
    setBusy(fmt)
    try {
      const { blob, filename } = await certDownload(sessionToken, fmt)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`${fmt.toUpperCase()} download failed: ${e.message || e}`)
    } finally {
      setBusy('')
    }
  }

  const handleJson = async () => {
    if (busy) return
    if (!sessionToken) {
      alert('Authentication required. Please re-enter password.')
      return
    }
    setBusy('json')
    try {
      // BASE_URL 직접 호출하면 cert.* 도메인 으로 가 SPA HTML 받음 → certFetchExportJson 사용
      const data = await certFetchExportJson(sessionToken)
      setJsonData(data)
    } catch (e) {
      alert(`JSON load failed: ${e.message || e}`)
    } finally {
      setBusy('')
    }
  }

  const handleCopy = async () => {
    if (!jsonData) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      alert('Clipboard access denied. Please select and copy manually.')
    }
  }

  const closeJson = () => {
    setJsonData(null)
    setCopied(false)
  }

  return (
    <>
      <div className={compact ? s.dlGroupCompact : s.dlGroup}>
        <button
          className={s.dlBtn}
          onClick={() => handleDownload('pdf')}
          disabled={Boolean(busy)}
          style={busy === 'pdf' ? { opacity: 0.6 } : undefined}
        >
          {busy === 'pdf' ? '…' : 'PDF'}
        </button>
        <button
          className={s.dlBtn}
          onClick={() => handleDownload('xlsx')}
          disabled={Boolean(busy)}
          style={busy === 'xlsx' ? { opacity: 0.6 } : undefined}
        >
          {busy === 'xlsx' ? '…' : 'XLSX'}
        </button>
        <button
          className={s.dlBtn}
          onClick={handleJson}
          disabled={Boolean(busy)}
          style={busy === 'json' ? { opacity: 0.6 } : undefined}
        >
          {busy === 'json' ? '…' : 'JSON'}
        </button>
      </div>

      {/* JSON viewer 모달 — Postman 스타일 raw + 복사 (2026-05-01) */}
      {jsonData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
          }}
          onClick={closeJson}
        >
          <div
            style={{
              background: '#1e293b',
              color: '#e2e8f0',
              borderRadius: 10,
              width: 'min(820px, 94vw)',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 12px 48px rgba(0,0,0,0.4)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div
              style={{
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#0f172a',
                borderBottom: '1px solid #334155',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>
                Response · application/json
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleCopy}
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    background: copied ? '#16a34a' : '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  {copied ? '✓ Copied' : '📋 Copy'}
                </button>
                <button
                  onClick={closeJson}
                  style={{
                    padding: '4px 10px',
                    fontSize: 14,
                    fontWeight: 700,
                    background: 'transparent',
                    color: '#94a3b8',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* JSON body */}
            <pre
              style={{
                margin: 0,
                padding: '14px 16px',
                fontSize: 12,
                lineHeight: 1.55,
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                overflow: 'auto',
                flex: 1,
                whiteSpace: 'pre',
                userSelect: 'text',
              }}
            >
              {JSON.stringify(jsonData, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  )
}
