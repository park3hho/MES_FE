// ══════════════════════════════════════════════════════════════
// PageHeader — Toss-style 타이틀 + 서브텍스트 + (선택) 뒤로 버튼
// ══════════════════════════════════════════════════════════════
// 사용: <PageHeader title="어디로 갈까요?" subtitle="공정을 선택하세요" />
// 카드 내부가 아닌 .page-flat 안에서 좌측 정렬로 표시
//
// 규약 (2026-04-16 확정):
//   - 뒤로가기 버튼은 **우상단** 고정 (전체 페이지 통일)
//   - 마운트 시 `window.scrollTo(0, 0)` — 페이지 진입 시 항상 최상단부터 보여줌

import { useEffect } from 'react'

export default function PageHeader({
  title,        // string: 메인 타이틀 (질문형 권장: "공정을 고를까요?")
  subtitle,     // string?: 보조 설명
  onBack,       // function?: 뒤로가기 (없으면 버튼 미표시) — 우상단 배치
  action,       // ReactNode?: 우측 커스텀 액션 (onBack과 공존 시 action이 우선)
}) {
  // 페이지 진입 시 최상단 스크롤 고정
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0)
    }
  }, [])

  // 우상단 액션: action이 있으면 action, 없으면 onBack 버튼, 둘 다 없으면 생략
  const rightNode = action
    ? action
    : onBack
      ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로가기"
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: 22,
            color: 'var(--color-dark)',
            padding: '4px 8px',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ←
        </button>
      )
      : null

  return (
    <header className="page-header">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {rightNode && <div style={{ flexShrink: 0 }}>{rightNode}</div>}
      </div>
    </header>
  )
}
