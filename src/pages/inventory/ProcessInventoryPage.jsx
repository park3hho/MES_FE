// 공정 재고 페이지 — 공정별 셀/행 대시보드 (BottomNav '재고' 탭의 process 뷰)
// 기존 InventoryPage를 리네이밍 — FinishedInventoryPage와 쌍을 이룸
import InventoryDashboard from '@/components/Inventory'

// onLogout, onBack — App.jsx에서 전달
export default function ProcessInventoryPage({ onLogout, onBack }) {
  return <InventoryDashboard onLogout={onLogout} onBack={onBack} />
}
