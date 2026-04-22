// src/components/RequireFeature.jsx
// 라우트 가드 컴포넌트 (Phase A, 2026-04-22)
//
// 사용:
//   <Route path="/admin/invoice" element={
//     <RequireFeature feature={Feature.ADMIN_INVOICE}>
//       <AdmPageRoute Component={InvoicePage} />
//     </RequireFeature>
//   } />
//
// 권한 없으면 fallback(기본 "/") 으로 redirect

import { Navigate, useOutletContext } from 'react-router-dom'
import { canAccess } from '@/constants/permissions'

export default function RequireFeature({ feature, children, fallback = '/' }) {
  const ctx = useOutletContext() || {}
  const user = ctx.user
  if (!canAccess(user, feature)) {
    return <Navigate to={fallback} replace />
  }
  return children
}
