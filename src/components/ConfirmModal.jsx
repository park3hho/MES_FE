import { FaradayLogo } from '@/components/FaradayLogo'
import s from './ConfirmModal.module.css'

// kg이면 소수점 3자리, 개수면 정수
const formatQty = (num, unit) => unit === 'kg'
  ? Math.round(num * 1000) / 1000
  : Math.floor(num)

// unit 기본값 '개' — PrintPage처럼 unit 안 넘길 때 "1" 만 뜨는 버그 수정
export function ConfirmModal({ lotNo, printCount, totalWeight, items = [], consumedQty, printing, done, error, onConfirm, onCancel, producedUnit, consumedUnit, unit = '개' }) {
  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <div className={s.logoWrap}>
          <FaradayLogo size="md" />
        </div>
        <div className={s.lotDisplay}>
          <span className={s.lotLabel}>LOT No</span>
          <span className={s.lotValue}>{lotNo}</span>

          {totalWeight != null ? (
            // MP 모드 — 개체 리스트 표시
            <div style={{ marginTop: 12, textAlign: 'left' }}>
              <div className={s.listHeader}>
                <span className={s.listHeaderNo}>No</span>
                <span className={s.listHeaderLot}>LOT</span>
                <span>무게</span>
              </div>
              {items.map(item => (
                <div key={item.seq} className={s.listRow}>
                  <span className={s.listRowNo}>{item.seq}</span>
                  <span>{item.weight} {producedUnit}</span>
                </div>
              ))}
              <div className={s.listTotal}>
                <span>총 {items.length}개</span>
                <span>{totalWeight} {producedUnit}</span>
              </div>
            </div>

          ) : consumedQty != null ? (
            // 일반 N:1 공정 — 투입량 → 생산량
            <div className={s.qtyRow}>
              <div className={s.qtyBlock}>
                <span className={s.lotLabel}>투입량</span>
                <span className={s.qtyValue}>
                  {formatQty(consumedQty, consumedUnit)} {consumedUnit}
                </span>
              </div>
              <span className={s.arrow}>→</span>
              <div className={s.qtyBlock}>
                <span className={s.lotLabel}>생산량</span>
                <span className={s.qtyValue}>
                  {formatQty(printCount, producedUnit)} {producedUnit}
                </span>
              </div>
            </div>

          ) : (
            // 단일 공정 — 수량만 표시
            <span className={s.lotLabel} style={{ marginTop: 8 }}>
              {formatQty(printCount, unit)} {unit}
            </span>
          )}
        </div>

        {done ? (
          <div className={s.doneMsg}>✓ 인쇄 완료</div>
        ) : error ? (
          <div className={s.failMsg}>✕ 인쇄 실패</div>
        ) : (
          <div className={s.btnRow}>
            <button className={s.secondaryBtn} onClick={onCancel} disabled={printing}>취소</button>
            {/* disabled 시 opacity는 CSS .primaryBtn:disabled 로 처리 */}
            <button className={s.primaryBtn} onClick={onConfirm} disabled={printing}>
              {printing ? '인쇄 중...' : '확인 및 출력'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}