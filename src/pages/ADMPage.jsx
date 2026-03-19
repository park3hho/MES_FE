import { FaradayLogo } from '@/components/FaradayLogo'
import { PROCESS_LIST, ADMIN_LIST } from '@/constants/processConst'
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
    <div className={s.container}>
      <div className={s.card}>
        <div className={s.header}>
          <FaradayLogo size="md" />
          <button className={s.logoutBtn} onClick={onLogout}>로그아웃</button>
        </div>
        <h2 className={s.title}>공정 선택</h2>

        {/* 12개 공정 */}
        <div className={s.grid}>
          {PROCESS_LIST.map(p => (
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
      </div>
    </div>
  )
}