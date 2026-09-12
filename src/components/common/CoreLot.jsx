// components/common/CoreLot.jsx
// Core 번호 + LOT 2단 표기 (2026-09-12) — 대시보드 LOT 목록 공용
//   (재고 상세 · 생산 현황 드릴다운 · 주간 LOT 목록 · 작업자 실적 드릴다운 · 품질 상세 이력).
//
//   라벨 디자인과 같은 규칙: 윗줄 = Core 번호(개체 내내 그대로), 아랫줄 = 그 행의 LOT(공정마다 바뀜).
//   core 가 없으면(옛 레일 · 탄생 전 공정 · 조회 실패) LOT 한 줄 = 종전 화면 그대로.
//   ★ 글꼴·굵기·색은 부모 칸(.colLot · .lno · .lotNo · .dLot)을 물려받는다 — 윗줄은 부모 모양 그대로, 아랫줄만 작고 흐리게.
//   children = 윗줄 뒤에 붙일 배지 (생산 현황의 구분 배지 등). core 가 없으면 LOT 바로 뒤에 붙는다(종전 배치).
//
// 사용 예:
//   <CoreLot core={item.core_no} lot={item.lot_no} />
//   <CoreLot core={l.core_no} lot={l.lot_no}><span className={s.badge}>신규</span></CoreLot>
import s from './CoreLot.module.css'

export default function CoreLot({ core, lot, children }) {
  if (!core) return <>{lot}{children}</>
  return (
    <>
      <span className={s.core}>{core}{children}</span>
      <span className={s.lot}>{lot}</span>
    </>
  )
}
