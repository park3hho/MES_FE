// src/pages/adm/manage/PrintHistoryPage.jsx
// 프린트 이력 감사 — general_admin + team_rnd (2026-04-24)
// 기능: 최근 30일 프린트 이력 조회 / 필터 (공정·사용자·LOT 검색) / 상세 / 엑셀
// - 리스트 페이지 = PrintLog + machine 조인
// - 상세 모달 = LOT 메타 + 재료 체인 + 현재 상태 + 공정별 특화(OQ 판정 등)

import { useState, useEffect, useCallback } from 'react'
import {
  getAllPrintHistory,
  getPrintHistoryDetail,
  downloadPrintHistoryExcel,
} from '@/api'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import s from './PrintHistoryPage.module.css'

// 공정 필터 옵션 — prefix 파싱용
const PROCESS_OPTIONS = [
  '',  // 전체
  'RM', 'MP', 'EA', 'HT', 'BO', 'EC', 'WI', 'SO', 'OQ', 'UB', 'MB', 'OB',
]

// 출력 소스 — PrintLog.source 값 → 한글 라벨 (2026-04-24)
// 'data before v0.7.75' = 마이그레이션 이전 데이터 (DEFAULT 로 백필된 값)
const SOURCE_LABEL = {
  process:        '공정 출력',
  admin_lot:      'LOT 입력',
  oq_inspection:  'OQ 검사',
  oq_history:     'OQ 이력',
  box:            '박스',
  reprint:        '재출력',
  seed_chain:     '체인 시딩',
  'data before v0.7.75': '이전 데이터',
}

const PAGE_SIZE = 50

// ISO → "04/24 09:15" 형태
const formatTime = (iso) => {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

const formatFullTime = (iso) => {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return iso
  }
}

// ════════════════════════════════════════════
// 상세 모달
// ════════════════════════════════════════════

function DetailModal({ printLogId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getPrintHistoryDetail(printLogId)
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(e.message || '조회 실패') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [printLogId])

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <span className={s.modalTitle}>프린트 이력 상세</span>
          <button className={s.closeBtn} onClick={onClose} aria-label="닫기">✕</button>
        </div>

        {loading && <p className={s.loadingMsg}>불러오는 중…</p>}
        {error && <p className={s.errorMsg}>{error}</p>}

        {data && (
          <div className={s.modalBody}>
            {/* ── 기본 정보 ── */}
            <div className={s.detailSection}>
              <div className={s.sectionLabel}>출력 정보</div>
              <div className={s.detailGrid}>
                <div className={s.detailRow}>
                  <span className={s.detailKey}>LOT 번호</span>
                  <span className={s.detailVal}>{data.print_log.lot_num}</span>
                </div>
                <div className={s.detailRow}>
                  <span className={s.detailKey}>공정</span>
                  <span className={s.detailVal}>{data.process || '-'}</span>
                </div>
                <div className={s.detailRow}>
                  <span className={s.detailKey}>출력 시각</span>
                  <span className={s.detailVal}>{formatFullTime(data.print_log.printed_at)}</span>
                </div>
                <div className={s.detailRow}>
                  <span className={s.detailKey}>출력 장수</span>
                  <span className={s.detailVal}>{data.print_log.print_count}</span>
                </div>
                <div className={s.detailRow}>
                  <span className={s.detailKey}>작업자</span>
                  <span className={s.detailVal}>
                    {data.print_log.login_id}
                    {data.print_log.role && <em className={s.roleTag}>{data.print_log.role}</em>}
                  </span>
                </div>
              </div>
            </div>

            {/* ── 현재 상태 ── */}
            {data.status && (
              <div className={s.detailSection}>
                <div className={s.sectionLabel}>현재 상태</div>
                <div className={s.detailGrid}>
                  <div className={s.detailRow}>
                    <span className={s.detailKey}>재고 상태</span>
                    <span className={`${s.detailVal} ${s['status_' + data.status.status] || ''}`}>
                      {data.status.status}
                    </span>
                  </div>
                  {data.status.quantity != null && (
                    <div className={s.detailRow}>
                      <span className={s.detailKey}>수량</span>
                      <span className={s.detailVal}>{data.status.quantity}</span>
                    </div>
                  )}
                  {data.status.consumed_by && (
                    <div className={s.detailRow}>
                      <span className={s.detailKey}>소진 대상</span>
                      <span className={s.detailVal}>{data.status.consumed_by}</span>
                    </div>
                  )}
                  {data.status.group_key && (
                    <div className={s.detailRow}>
                      <span className={s.detailKey}>그룹</span>
                      <span className={s.detailVal}>{data.status.group_key}</span>
                    </div>
                  )}
                  {data.status.motor_type && (
                    <div className={s.detailRow}>
                      <span className={s.detailKey}>Motor</span>
                      <span className={s.detailVal}>{data.status.motor_type}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── LOT 메타 ── */}
            {data.lot_meta && Object.keys(data.lot_meta).length > 0 && (
              <div className={s.detailSection}>
                <div className={s.sectionLabel}>LOT 메타</div>
                <div className={s.detailGrid}>
                  {Object.entries(data.lot_meta).map(([k, v]) => (
                    v !== null && v !== '' && (
                      <div key={k} className={s.detailRow}>
                        <span className={s.detailKey}>{k}</span>
                        <span className={s.detailVal}>{String(v)}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* ── 재료 체인 ── */}
            {data.chain && Object.keys(data.chain).length > 0 && (
              <div className={s.detailSection}>
                <div className={s.sectionLabel}>재료 체인</div>
                <div className={s.chainList}>
                  {Object.entries(data.chain)
                    .filter(([_, v]) => v && v !== '-')
                    .map(([key, lot]) => {
                      const proc = key.replace('lot_', '').replace('_no', '').toUpperCase()
                      return (
                        <div key={key} className={s.chainRow}>
                          <span className={s.chainProc}>{proc}</span>
                          <span className={s.chainLot}>{lot}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* ── OQ 검사 결과 ── */}
            {data.extra?.inspection && (
              <div className={s.detailSection}>
                <div className={s.sectionLabel}>OQ 검사 결과</div>
                <div className={s.detailGrid}>
                  <div className={s.detailRow}>
                    <span className={s.detailKey}>판정</span>
                    <span className={s.detailVal}>{data.extra.inspection.judgment}</span>
                  </div>
                  {data.extra.inspection.serial_no && (
                    <div className={s.detailRow}>
                      <span className={s.detailKey}>ST 시리얼</span>
                      <span className={s.detailVal}>{data.extra.inspection.serial_no}</span>
                    </div>
                  )}
                  {data.extra.inspection.lot_so_no && (
                    <div className={s.detailRow}>
                      <span className={s.detailKey}>원본 SO</span>
                      <span className={s.detailVal}>{data.extra.inspection.lot_so_no}</span>
                    </div>
                  )}
                  {data.extra.inspection.resistance != null && (
                    <div className={s.detailRow}>
                      <span className={s.detailKey}>R</span>
                      <span className={s.detailVal}>{data.extra.inspection.resistance}</span>
                    </div>
                  )}
                  {data.extra.inspection.inductance != null && (
                    <div className={s.detailRow}>
                      <span className={s.detailKey}>L</span>
                      <span className={s.detailVal}>{data.extra.inspection.inductance}</span>
                    </div>
                  )}
                  {data.extra.inspection.k_t_rms != null && (
                    <div className={s.detailRow}>
                      <span className={s.detailKey}>Kt(RMS)</span>
                      <span className={s.detailVal}>{data.extra.inspection.k_t_rms}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 이 LOT의 전체 프린트 이력 ── */}
            {data.print_timeline && data.print_timeline.length > 1 && (
              <div className={s.detailSection}>
                <div className={s.sectionLabel}>이 LOT 프린트 타임라인 ({data.print_timeline.length}회)</div>
                <div className={s.timelineList}>
                  {data.print_timeline.map((t) => (
                    <div
                      key={t.id}
                      className={`${s.timelineRow} ${t.is_this ? s.timelineRowActive : ''}`}
                    >
                      <span className={s.timelineTime}>{formatFullTime(t.printed_at)}</span>
                      <span className={s.timelineUser}>{t.login_id || '-'}</span>
                      <span className={s.timelineCount}>×{t.print_count}</span>
                      {t.is_this && <span className={s.timelineCurrent}>현재</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
// 메인 페이지
// ════════════════════════════════════════════

export default function PrintHistoryPage({ onBack }) {
  const [filters, setFilters] = useState({
    process: '',
    login_id: '',
    search: '',
  })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [downloading, setDownloading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getAllPrintHistory({
        days: 30,
        ...filters,
        page,
        page_size: PAGE_SIZE,
      })
      setData(res)
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 필터 변경 시 1페이지로 리셋
  useEffect(() => { setPage(1) }, [filters])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const blob = await downloadPrintHistoryExcel({ days: 30, ...filters })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `print_history_30d.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message || '다운로드 실패')
    } finally {
      setDownloading(false)
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="page-flat">
      <PageHeader
        title="프린트 이력"
        subtitle={`최근 ${data?.window_days || 30}일${data ? ` · 전체 ${data.total}건` : ''}`}
        onBack={onBack}
      />

      {/* ── 필터 ── */}
      <Section label="필터">
        <div className={s.filterWrap}>
          <div className={s.filterRow}>
            <label className={s.fLabel}>공정</label>
            <select
              className={s.fSelect}
              value={filters.process}
              onChange={(e) => setFilters((f) => ({ ...f, process: e.target.value }))}
            >
              {PROCESS_OPTIONS.map((p) => (
                <option key={p} value={p}>{p || '전체'}</option>
              ))}
            </select>
          </div>

          <div className={s.filterRow}>
            <label className={s.fLabel}>작업자</label>
            <input
              type="text"
              className={s.fInput}
              value={filters.login_id}
              onChange={(e) => setFilters((f) => ({ ...f, login_id: e.target.value }))}
              placeholder="login_id 부분일치"
            />
          </div>

          <div className={s.filterRow}>
            <label className={s.fLabel}>LOT 검색</label>
            <input
              type="text"
              className={s.fInput}
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="LOT 번호 부분일치"
            />
          </div>

          <div className={s.filterActions}>
            <button
              type="button"
              className={s.resetBtn}
              onClick={() => setFilters({ process: '', login_id: '', search: '' })}
            >
              초기화
            </button>
            <button
              type="button"
              className={s.downloadBtn}
              onClick={handleDownload}
              disabled={downloading || !data || data.total === 0}
            >
              {downloading ? '생성 중...' : `📥 엑셀 (${data?.total || 0}건)`}
            </button>
          </div>
        </div>
      </Section>

      {error && <p className={s.errorMsg}>{error}</p>}

      {/* ── 리스트 ── */}
      <Section label={loading ? '불러오는 중…' : `결과 ${data?.total || 0}건`}>
        {!loading && data && data.items.length === 0 ? (
          <div className={s.empty}>조건에 맞는 프린트 이력이 없어요.</div>
        ) : (
          <>
            {/* 데스크탑: 테이블 (print_count 컬럼 제거 — 2026-04-24) */}
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>시각</th>
                    <th>LOT 번호</th>
                    <th>공정</th>
                    <th>기능</th>
                    <th>작업자</th>
                    <th>역할</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.items || []).map((it) => (
                    <tr key={it.id}>
                      <td className={s.timeCell}>{formatTime(it.printed_at)}</td>
                      <td className={s.lotCell}>{it.lot_num}</td>
                      <td><span className={s.procBadge}>{it.process || '-'}</span></td>
                      <td>
                        <span className={s.sourceBadge}>
                          {SOURCE_LABEL[it.source] || it.source || '-'}
                        </span>
                      </td>
                      <td>{it.login_id || '-'}</td>
                      <td><span className={s.roleBadge}>{it.role || '-'}</span></td>
                      <td>
                        <button
                          type="button"
                          className={s.viewBtn}
                          onClick={() => setSelectedId(it.id)}
                        >
                          상세
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일: 카드 뷰 (2026-04-24) */}
            <div className={s.cardList}>
              {(data?.items || []).map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={s.card}
                  onClick={() => setSelectedId(it.id)}
                >
                  <div className={s.cardTop}>
                    <span className={s.procBadge}>{it.process || '-'}</span>
                    <span className={s.cardLot}>{it.lot_num}</span>
                    <span className={s.cardTime}>{formatTime(it.printed_at)}</span>
                  </div>
                  <div className={s.cardBot}>
                    <span className={s.sourceBadge}>
                      {SOURCE_LABEL[it.source] || it.source || '-'}
                    </span>
                    <span className={s.cardUser}>{it.login_id || '-'}</span>
                    <span className={s.roleBadge}>{it.role || '-'}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* 페이지네이션 */}
        {data && totalPages > 1 && (
          <div className={s.pagination}>
            <button
              type="button"
              className={s.pageBtn}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← 이전
            </button>
            <span className={s.pageInfo}>{page} / {totalPages}</span>
            <button
              type="button"
              className={s.pageBtn}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              다음 →
            </button>
          </div>
        )}
      </Section>

      {selectedId && (
        <DetailModal printLogId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
