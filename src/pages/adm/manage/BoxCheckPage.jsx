// src/pages/adm/manage/BoxCheckPage.jsx
// 박스 확인 — MB QR 스캔 → 트리 뷰 (MB → UBs → STs) + 엑셀 추출
// RT 컬럼은 엑셀에서 현장 수기 입력용 빈칸. Phase 1에서는 RT 자동 채번 없음.

import { useState } from 'react'

import { getBoxMbFull, downloadBoxMbExcel } from '@/api'
import QRScanner from '@/components/QRScanner'
import { PHI_SPECS } from '@/constants/processConst'

import s from './BoxCheckPage.module.css'

const phiColor = (phi) => PHI_SPECS[phi]?.color ?? '#c0c8d8'
const phiLabel = (phi) => (phi ? `Φ${phi}` : '—')

const formatDate = (iso) => {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

// 한 UB 카드 — 헤더(lot_no, phi, count) + ST 시리얼 리스트
function UbCard({ ub }) {
  const [open, setOpen] = useState(false)  // 기본 접힘
  const color = phiColor(ub.phi)

  return (
    <div className={`${s.ubCard} ${open ? s.ubCardOpen : ''}`}>
      <button type="button" className={s.ubHeader} onClick={() => setOpen(!open)}>
        <span className={s.ubDot} style={{ background: color }} />
        <span className={s.ubLotNo}>{ub.ub_lot_no}</span>
        <span className={s.ubPhi} style={{ color }}>{phiLabel(ub.phi)}</span>
        <span className={s.ubCount}>{ub.item_count}개</span>
        <span className={`${s.ubArrow} ${open ? s.ubArrowOpen : ''}`}>▾</span>
      </button>

      {open && (
        <div className={s.stList}>
          {ub.items.length === 0 ? (
            <div className={s.stEmpty}>ST 없음 — 현장 수기 입력 대상</div>
          ) : (
            ub.items.map((item, idx) => (
              <div key={item.st_serial} className={s.stRow}>
                <span className={s.stIndex}>{String(idx + 1).padStart(2, '0')}</span>
                <span className={s.stSerial}>{item.st_serial}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function BoxCheckPage({ onLogout, onBack }) {
  const [step, setStep] = useState('qr')  // 'qr' | 'tree'
  const [tree, setTree] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)

  // QRScanner 내부에서 error toast로 표시됨 — throw만 하면 됨
  const handleScan = async (val) => {
    const lotNo = (val || '').trim()
    if (!lotNo.startsWith('MB-')) {
      throw new Error(`MB 박스 번호만 스캔 가능합니다. (${lotNo})`)
    }
    const data = await getBoxMbFull(lotNo)
    setTree(data)
    setStep('tree')
  }

  const handleRescan = () => {
    setTree(null)
    setError(null)
    setStep('qr')
  }

  const handleDownloadExcel = async () => {
    if (!tree) return
    setDownloading(true)
    try {
      const blob = await downloadBoxMbExcel(tree.mb_lot_no)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `box_check_${tree.mb_lot_no}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message || '엑셀 다운로드 실패')
    } finally {
      setDownloading(false)
    }
  }

  // ── 렌더링 ──

  if (step === 'qr') {
    return (
      <QRScanner
        processLabel="박스 확인 — MB 스캔"
        onScan={handleScan}
        onLogout={onLogout}
        onBack={onBack}
      />
    )
  }

  // tree step
  return (
    <div className="page-flat">
      <div className={s.header}>
        <button className="btn-ghost btn-sm" onClick={handleRescan}>
          ← 이전으로
        </button>
      </div>

      {/* 상단 MB 요약 */}
      <div className={s.summary}>
        <div className={s.summaryLeft}>
          <span className={s.mbBadge}>MB</span>
          <div className={s.summaryText}>
            <h2 className={s.mbLotNo}>{tree.mb_lot_no}</h2>
            <p className={s.summaryMeta}>
              생성 {formatDate(tree.created_at)} · UB {tree.total_ub}개 · ST {tree.total_st}개
            </p>
          </div>
        </div>
        <button
          className="btn-primary btn-md"
          onClick={handleDownloadExcel}
          disabled={downloading || tree.total_ub === 0}
        >
          {downloading ? '생성 중...' : '📥 엑셀 다운로드'}
        </button>
      </div>

      {error && <p className={s.error}>{error}</p>}

      {/* UB 리스트 (flat) */}
      {tree.ubs.length === 0 ? (
        <div className={s.empty}>이 MB 박스에 담긴 UB가 없습니다.</div>
      ) : (
        <div className={s.ubList}>
          {tree.ubs.map((ub) => (
            <UbCard key={ub.ub_lot_no} ub={ub} />
          ))}
        </div>
      )}
    </div>
  )
}
