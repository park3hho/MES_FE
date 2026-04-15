// ══════════════════════════════════════════════════════════════
// Section — 섹션 라벨 + children 래퍼
// ══════════════════════════════════════════════════════════════
// 사용:
//   <Section label="제작">
//     <ListItem ... />
//     <ListItem ... />
//   </Section>

export default function Section({
  label,     // string?: 섹션 라벨 (없으면 라벨 숨김)
  children,  // ReactNode: 섹션 콘텐츠
}) {
  return (
    <section className="section">
      {label && <p className="section-label">{label}</p>}
      {children}
    </section>
  )
}
