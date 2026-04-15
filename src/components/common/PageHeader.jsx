// ══════════════════════════════════════════════════════════════
// PageHeader — Toss-style 타이틀 + 서브텍스트 + (선택) 뒤로 버튼
// ══════════════════════════════════════════════════════════════
// 사용: <PageHeader title="어디로 갈까요?" subtitle="공정을 선택하세요" />
// 카드 내부가 아닌 .page-flat 안에서 좌측 정렬로 표시

export default function PageHeader({
  title,        // string: 메인 타이틀 (질문형 권장: "공정을 고를까요?")
  subtitle,     // string?: 보조 설명
  onBack,       // function?: 뒤로가기 (없으면 버튼 미표시)
  action,       // ReactNode?: 우측 액션 (예: 로그아웃 텍스트 버튼)
}) {
  return (
    <header className="page-header">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: 22,
            color: 'var(--color-dark)',
            padding: '4px 8px',
            marginLeft: -8,
            marginBottom: 8,
            cursor: 'pointer',
          }}
          aria-label="뒤로가기"
        >
          ←
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </header>
  )
}
