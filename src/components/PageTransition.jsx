import './PageTransition.module.css'

// key가 바뀔 때마다 React가 remount → mount 애니메이션 자동 트리거
export default function PageTransition({ children, pageKey }) {
  return (
    <div key={pageKey} className="page-transition-wrap">
      {children}
    </div>
  )
}
