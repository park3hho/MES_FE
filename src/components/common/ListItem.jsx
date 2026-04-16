// ══════════════════════════════════════════════════════════════
// ListItem — Toss-style 리스트 row
// ══════════════════════════════════════════════════════════════
// border 없음, 탭 시 --color-ripple 배경
// 구조: [leftKey] [title + sub] [chevron/right]
//
// 사용:
//   <ListItem leftKey="RM" title="원자재" sub="Raw Material" onClick={...} />
//   <ListItem title="설정" right={<Badge>NEW</Badge>} onClick={...} />

export default function ListItem({
  leftKey,    // string?: 왼쪽 코드 (RM, MP 등). 없으면 생략
  title,      // string: 메인 텍스트
  sub,        // string?: 보조 텍스트 (한 줄)
  right,      // ReactNode?: 우측 커스텀 노드 (뱃지/카운트 등)
  onClick,    // function: 탭 콜백
  disabled,   // boolean?: 비활성 상태
  hideChevron,// boolean?: 우측 화살표 숨김
}) {
  // 2자 이하 짧은 키(RM, MP 등)는 크게, 3자 이상(PRINT, TRACE 등)은 작게
  const keyClass =
    leftKey && leftKey.length <= 2
      ? 'list-item-key list-item-key--short'
      : 'list-item-key'

  return (
    <button
      type="button"
      className="list-item"
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
    >
      {leftKey && <span className={keyClass}>{leftKey}</span>}
      <span className="list-item-main">
        <span className="list-item-title">{title}</span>
        {sub && <span className="list-item-sub">{sub}</span>}
      </span>
      {right && <span style={{ flexShrink: 0 }}>{right}</span>}
      {!right && !hideChevron && <span className="list-item-chevron">›</span>}
    </button>
  )
}
