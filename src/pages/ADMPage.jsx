import { FaradayLogo } from '@/components/FaradayLogo'
import { PRODUCE_LIST, INSPECT_LIST, SHIPPING_LIST, ADMIN_LIST } from '@/constants/processConst'
import s from './ADMPage.module.css'

// hover는 CSS .processBtn:hover로 처리 — onMouseEnter/Leave 제거
function ProcessButton({ item, onSelect }) {
  return (
    <button className={s.processBtn} onClick={() => onSelect(item.key)}>
      <span className={s.processKey}>{item.key}</span>
      <span className={s.processLabel}>{item.label}</span>
      <span className={s.processDesc}>{item.desc}</span>
    </button>
  )
}

export default function ADMPage({ onSelect, onLogout }) {
  return (
    <div className="page">
      <div className={`card-wide ${s.admCard}`}>
        {/* 로고 중앙 정렬 */}
        <div className={s.header}>
          <FaradayLogo size="md" />
        </div>
        <h2 className={s.title}>공정 선택</h2>

        {/* 제작 (RM~SO) */}
        <div className={s.grid}>
          {PRODUCE_LIST.map(p => (
            <ProcessButton key={p.key} item={p} onSelect={onSelect} />
          ))}
        </div>

        <div className={s.divider} />

        {/* 검사 (IQ, OQ) */}
        <div className={s.grid}>
          {INSPECT_LIST.map(p => (
            <ProcessButton key={p.key} item={p} onSelect={onSelect} />
          ))}
        </div>

        <div className={s.divider} />

        {/* 출하 (UB~OB) */}
        <div className={s.grid}>
          {SHIPPING_LIST.map(p => (
            <ProcessButton key={p.key} item={p} onSelect={onSelect} />
          ))}
        </div>

        <div className={s.divider} />

        {/* 관리 도구 */}
        <div className={s.grid}>
          {ADMIN_LIST.map(p => (
            <ProcessButton key={p.key} item={p} onSelect={onSelect} />
          ))}
        </div>

        {/* hover는 CSS .inventoryBtn:hover로 처리 */}
        <button className={s.inventoryBtn} onClick={() => onSelect('INVENTORY')}>
          📦 실시간 재고 현황
        </button>

        {/* 로그아웃 — 하단 배치 */}
        <button className={`btn-ghost btn-sm ${s.logoutBtn}`} onClick={onLogout}>로그아웃</button>
      </div>
    </div>
  )
}