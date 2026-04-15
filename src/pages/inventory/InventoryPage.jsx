import InventoryDashboard from '@/components/Inventory'

// onLogout, onBack — App.jsx에서 전달
export default function InventoryPage({ onLogout, onBack }) {
  return <InventoryDashboard onLogout={onLogout} onBack={onBack} />
}
