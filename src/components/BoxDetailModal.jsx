// components/BoxDetailModal.jsx
// 박스 상세 — 안 내용물 표 + 빼기 액션 (2026-06-09)
//
// props:
//   boxId   : 박스 ID (필수)
//   onClose : 닫기 콜백
// API: getBoxContents, removeFromBox
import { useCallback, useEffect, useState } from 'react'
import { getBoxContents, removeFromBox } from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import { useConfirm } from '@/contexts/ConfirmDialogContext'

const TYPE_LABELS = {
  warehouse: { ko: '자재', cls: '#5b8def' },
  inventory: { ko: '공정', cls: '#34d399' },
  nc:        { ko: '부적합', cls: '#ef4444' },
}

export default function BoxDetailModal({ boxId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(0)         // 진행 중 content_id
  const confirm = useConfirm()

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const d = await getBoxContents(boxId)
      setData(d)
    } catch (e) {
      setError(e.message || '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [boxId])

  useEffect(() => { reload() }, [reload])

  // ESC 닫기
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onRemove = async (c) => {
    const ok = await confirm({
      title: '박스에서 빼기',
      message: `${c.ref} (${TYPE_LABELS[c.item_type]?.ko || c.item_type}) 을(를) 박스에서 뺍니다.`,
      confirmText: '빼기',
    })
    if (!ok) return
    setBusy(c.content_id)
    try {
      await removeFromBox(c.content_id)
      emitToast('박스에서 뺐습니다.', 'success')
      await reload()
    } catch (e) {
      emitToast(e.message || '빼기 실패', 'error')
    } finally {
      setBusy(0)
    }
  }

  const box = data?.box
  const contents = data?.contents || []

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: '92%', maxWidth: 720,
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* 헤더 */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-list-divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>📦 박스 상세</h3>
            <button onClick={onClose} style={{
              marginLeft: 'auto', background: 'transparent', border: 'none',
              fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)',
            }} aria-label="닫기">✕</button>
          </div>
          {box && (
            <div style={{ marginTop: 8, fontSize: 14, color: 'var(--color-text-sub)' }}>
              <strong style={{ color: 'var(--color-text)' }}>{box.code || box.name}</strong>
              {box.name && box.code && box.name !== box.code && <span> · {box.name}</span>}
              <span> · {box.box_type}</span>
              <span> · 위치: {box.location_full || '미지정'}</span>
              <span> · 보관 {contents.length}개</span>
            </div>
          )}
        </div>

        {/* 본문 */}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          {loading && <p style={{ color: 'var(--color-text-sub)' }}>불러오는 중…</p>}
          {error && <p style={{ color: '#ef4444' }}>{error}</p>}
          {!loading && !error && contents.length === 0 && (
            <p style={{ color: 'var(--color-text-sub)', textAlign: 'center', padding: '40px 0' }}>
              박스가 비어있습니다.
            </p>
          )}
          {!loading && !error && contents.length > 0 && (
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-list-divider)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 4px' }}>분류</th>
                  <th style={{ textAlign: 'left', padding: '8px 4px' }}>식별자</th>
                  <th style={{ textAlign: 'left', padding: '8px 4px' }}>이름</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px' }}>수량</th>
                  <th style={{ textAlign: 'center', padding: '8px 4px', width: 60 }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {contents.map((c) => {
                  const tl = TYPE_LABELS[c.item_type] || { ko: c.item_type, cls: '#9ca3af' }
                  return (
                    <tr key={c.content_id}
                      style={{ borderBottom: '1px solid var(--color-list-divider)' }}>
                      <td style={{ padding: '10px 4px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                          fontSize: 11, fontWeight: 600, color: '#fff', background: tl.cls,
                        }}>{tl.ko}</span>
                      </td>
                      <td style={{ padding: '10px 4px', fontFamily: 'monospace' }}>{c.ref}</td>
                      <td style={{ padding: '10px 4px' }}>
                        {c.name}
                        {c.sub && (
                          <div style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>
                            {c.sub}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 4px', textAlign: 'right' }}>
                        {c.qty ?? '—'}
                      </td>
                      <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                        <button onClick={() => onRemove(c)} disabled={busy === c.content_id}
                          style={{
                            background: 'transparent', border: '1px solid #ef4444',
                            color: '#ef4444', borderRadius: 4, padding: '4px 10px',
                            fontSize: 12, cursor: 'pointer',
                          }}>
                          {busy === c.content_id ? '…' : '빼기'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
