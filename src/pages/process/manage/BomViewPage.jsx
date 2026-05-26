// src/pages/process/manage/BomViewPage.jsx
// BOM 조회 전용 — BomManagePage 의 readOnly 모드 wrapper (2026-05-26)
// 호출: App.jsx → /admin/bom-view
//
// 정책:
//   - 모든 로그인 사용자 접근 가능 (Feature.ADMIN_BOM_VIEW, 전체 role 에 grant)
//   - 추가/편집/PLM 전이/삭제 등 모든 변이 액션 숨김
//   - 트리/이력 조회 + 검색 + 필터 는 유지 (확인용 핵심 기능)
import BomManagePage from './BomManagePage'

export default function BomViewPage(props) {
  return <BomManagePage {...props} readOnly />
}
