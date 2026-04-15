import { FaradayLogo } from '@/components/FaradayLogo'
import { PRODUCE_LIST, INSPECT_LIST, SHIPPING_LIST, ADMIN_LIST, TEAM_ACCESS } from '@/constants/processConst'
import { useIsDesktop } from '@/hooks/useBreakpoint'
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

export default function ADMPage({ onSelect, onLogout, loginId }) {
  const isDesktop = useIsDesktop()
  const team = TEAM_ACCESS[loginId]
  const filterProc = (list) => team ? list.filter(p => team.processes.includes(p.key)) : list
  const filterAdmin = (list) => team ? list.filter(p => team.admin.includes(p.key)) : list

  const produceItems = filterProc(PRODUCE_LIST)
  const inspectItems = team ? filterProc(INSPECT_LIST) : INSPECT_LIST
  const shippingItems = team ? filterProc(SHIPPING_LIST) : SHIPPING_LIST
  const adminItems = filterAdmin(ADMIN_LIST)

  return (
    <div className="page-top">
      <div className={`card-wide ${s.admCard}`}>
        <div className={s.header}>
          <FaradayLogo size="md" />
        </div>
        <h2 className={s.title}>공정 선택</h2>

        {/* 제작 */}
        {produceItems.length > 0 && (
          <div className={s.grid}>
            {produceItems.map(p => (
              <ProcessButton key={p.key} item={p} onSelect={onSelect} />
            ))}
          </div>
        )}

        {/* 검사 */}
        {inspectItems.length > 0 && (
          <>
            <div className={s.divider} />
            <div className={s.grid}>
              {inspectItems.map(p => (
                <ProcessButton key={p.key} item={p} onSelect={onSelect} />
              ))}
            </div>
          </>
        )}

        {/* 출하 */}
        {shippingItems.length > 0 && (
          <>
            <div className={s.divider} />
            <div className={s.grid}>
              {shippingItems.map(p => (
                <ProcessButton key={p.key} item={p} onSelect={onSelect} />
              ))}
            </div>
          </>
        )}

        {/* 관리 도구 */}
        {adminItems.length > 0 && (
          <>
            <div className={s.divider} />
            <div className={s.grid}>
              {adminItems.map(p => (
                <ProcessButton key={p.key} item={p} onSelect={onSelect} />
              ))}
            </div>
          </>
        )}

        {/* 데스크탑에선 SideNav의 재고 탭으로 진입 — 버튼 중복 제거 */}
        {!isDesktop && (
          <button className={s.inventoryBtn} onClick={() => onSelect('INVENTORY')}>
            실시간 재고 현황
          </button>
        )}

        <button className={`btn-ghost btn-sm ${s.logoutBtn}`} onClick={onLogout}>로그아웃</button>
      </div>
    </div>
  )
}