import { useState, useEffect } from 'react'

import { getBoxSummary, getInventoryDetail } from '@/api'
import { PROCESS_LIST, PROCESS_INPUT } from '@/constants/processConst'

import GroupAccordion from './GroupAccordion'
import { BoxAccordionGroup, ContentsRow } from './BoxSection'
import s from './Inventory.module.css'
const BOX_PROCESSES = new Set(['UB', 'MB'])

// ════════════════════════════════════════════
// 상세 패널 — 셀 클릭 시 열리는 재고 목록
// ════════════════════════════════════════════

// process — 선택된 공정 키, visible — 애니메이션 트리거
// isMobile — useMobile() 결과 (부모에서 전달, 폰트 크기 분기용)
// inline — true면 리스트 행 안에 삽입된 모드 (panel chrome 최소화)
export default function DetailPanel({ process, visible, onClose, isMobile, inline = false }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const isKg = PROCESS_INPUT[process]?.unit === 'kg'
  const isBox = BOX_PROCESSES.has(process)
  const unit = PROCESS_INPUT[process]?.unit || '개'

  const fontSize = isMobile ? 9 : 11

  const formatTime = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // ────────────────────────────────────────────
  // 데이터 fetch — 박스/일반 분기
  // ────────────────────────────────────────────

  useEffect(() => {
    if (!process) return
    setLoading(true)
    setDetail(null)

    if (BOX_PROCESSES.has(process)) {
      getBoxSummary(process)
        .then((d) => {
          setDetail({ total: d.boxes?.length || 0, display_type: 'box', boxes: d.boxes || [] })
          setLoading(false)
        })
        .catch(() => setLoading(false))
    } else {
      getInventoryDetail(process)
        .then((d) => {
          setDetail(d)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [process])

  const processLabel = PROCESS_LIST.find((p) => p.key === process)?.label || process
  const totalDisplay =
    detail?.total != null
      ? typeof detail.total === 'object'
        ? `${detail.total.weight}kg / ${detail.total.qty}개`
        : `${detail.total}${isBox ? '박스' : unit}`
      : '...'

  // ────────────────────────────────────────────
  // 일반 공정 목록 헤더 — 3곳에서 재사용
  // ────────────────────────────────────────────

  const listHeader = (qtyLabel) => (
    <div className={s.groupListHeader}>
      <span className={s.detailCol} style={{ flex: 3, fontSize }}>
        LOT 번호
      </span>
      <span className={s.detailCol} style={{ flex: 2.5, fontSize }}>
        생성일시
      </span>
      <span className={s.detailCol} style={{ flex: isBox ? 0.5 : 1, fontSize }}>
        {qtyLabel}
      </span>
    </div>
  )

  // ────────────────────────────────────────────
  // 일반 공정 아이템 행
  // ────────────────────────────────────────────

  const itemRow = (item, idx) => (
    <div
      key={`${item.lot_no}-${idx}`}
      className={s.detailRow}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: `opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${idx * 0.05}s, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${idx * 0.05}s`,
      }}
    >
      <span className={`${s.detailCol} ${s.colLot}`}>
        {item.lot_no}
      </span>
      <span className={`${s.detailCol} ${s.colTime}`}>
        {formatTime(item.created_at)}
      </span>
      <span className={`${s.detailCol} ${s.colQty}`}>
        {isKg ? `${item.quantity}kg` : item.quantity}
      </span>
    </div>
  )

  // ════════════════════════════════════════════
  // 렌더링
  // ════════════════════════════════════════════

  return (
    <div
      className={`${s.detailPanel} ${inline ? s.detailPanelInline : ''}`}
      style={{
        maxHeight: visible ? 600 : 0,
        opacity: visible ? 1 : 0,
        marginTop: visible ? (inline ? 0 : 16) : 0,
        borderWidth: inline ? 0 : visible ? 1 : 0,
      }}
    >
      {/* 인라인 모드에선 헤더 생략 — 행 자체가 이미 공정 정보 표시 */}
      {!inline && (
        <div className={s.detailHeader}>
          <span className={s.detailProcessKey}>{process}</span>
          <span className={s.detailTitle}>{processLabel} 재고 상세</span>
          <span className={s.detailTotalBadge}>{totalDisplay}</span>
          <button className={s.detailClose} onClick={onClose}>
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className={s.detailLoading}>조회 중...</div>
      ) : isBox ? (
        /* ── 박스 공정 (UB/MB) ── */
        !detail?.boxes?.length ? (
          <div className={s.detailLoading}>박스가 없습니다</div>
        ) : (
          <div className={s.detailList}>
            <BoxAccordionGroup
              label="사용 중"
              boxes={detail.boxes.filter((b) => !b.empty)}
              process={process}
              visible={visible}
              defaultOpen={true}
            />
            <BoxAccordionGroup
              label="빈 박스"
              boxes={detail.boxes.filter((b) => b.empty)}
              process={process}
              visible={visible}
              defaultOpen={false}
            />
          </div>
        )
      ) : !detail?.groups?.length ? (
        <div className={s.detailLoading}>재고가 없습니다</div>
      ) : (
        <div className={s.detailList}>
          {/* ── 내용물 타입 (BX/OB) ── */}
          {detail.display_type === 'contents' ? (
            <>
              {listHeader('수량')}
              {detail.groups[0]?.items?.map((item, idx) => (
                <ContentsRow key={idx} item={item} formatTime={formatTime} />
              ))}
            </>
          ) : /* ── 미분류 단일 그룹 — 아코디언 없이 플랫 ── */
          detail.groups.length === 1 && detail.groups[0].key === '(미분류)' ? (
            <>
              {listHeader(isKg ? '중량' : '수량')}
              {detail.groups[0].items.map(itemRow)}
            </>
          ) : (
            /* ── 다중 그룹 — 아코디언 ── */
            detail.groups.map((group) => (
              <GroupAccordion
                key={group.key}
                group={group}
                visible={visible}
                formatTime={formatTime}
                proc={process}
                isMobile={isMobile}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
