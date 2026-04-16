// src/components/Skeleton.jsx
// 스켈레톤 로더 — 데이터 로딩 중 UI placeholder
// 사용법:
//   <Skeleton w="100%" h={20} />          → 한 줄 텍스트
//   <Skeleton w={80} h={80} r="50%" />    → 원형 아바타
//   <Skeleton w="100%" h={150} r={12} />  → 카드
//   <SkeletonGroup rows={5} gap={8} />    → 리스트 행

import s from './Skeleton.module.css'

// 단일 스켈레톤 블록
// w: 너비 (number → px, string → 그대로), h: 높이, r: border-radius
export function Skeleton({ w = '100%', h = 16, r = 6, style = {} }) {
  return (
    <div
      className={s.bone}
      style={{
        width: typeof w === 'number' ? `${w}px` : w,
        height: typeof h === 'number' ? `${h}px` : h,
        borderRadius: typeof r === 'number' ? `${r}px` : r,
        ...style,
      }}
    />
  )
}

// 여러 줄 스켈레톤 그룹 — 리스트/테이블 행 시뮬레이션
export function SkeletonGroup({ rows = 3, gap = 8, h = 16, r = 6 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton
          key={i}
          w={i === rows - 1 ? '60%' : '100%'}
          h={h}
          r={r}
        />
      ))}
    </div>
  )
}

// 재고 셀 스켈레톤 — InventoryCell 형태 모방
export function InventoryCellSkeleton() {
  return (
    <div className={s.cellSkeleton}>
      <Skeleton w={40} h={14} r={4} />
      <Skeleton w={30} h={10} r={3} />
      <Skeleton w={50} h={32} r={6} />
      <Skeleton w={24} h={10} r={3} />
    </div>
  )
}

// 인벤토리 그리드 스켈레톤 — 셀 8개
export function InventoryGridSkeleton({ count = 8 }) {
  return (
    <div className={s.gridSkeleton}>
      {Array.from({ length: count }, (_, i) => (
        <InventoryCellSkeleton key={i} />
      ))}
    </div>
  )
}

// 테이블 행 스켈레톤 — InspectionList/ExportPage용
export function TableSkeleton({ rows = 5, cols = 6 }) {
  return (
    <div className={s.tableSkeleton}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={s.tableRow}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} w={c === 0 ? '80%' : '60%'} h={14} r={4} />
          ))}
        </div>
      ))}
    </div>
  )
}

// 폼 스켈레톤 — OQInspectionEditor용
export function FormSkeleton() {
  return (
    <div className={s.formSkeleton}>
      <Skeleton w={120} h={18} r={4} />
      <Skeleton w="100%" h={44} r={8} />
      <Skeleton w={80} h={14} r={4} style={{ marginTop: 16 }} />
      <div className={s.formRow}>
        <Skeleton w="30%" h={44} r={8} />
        <Skeleton w="30%" h={44} r={8} />
        <Skeleton w="30%" h={44} r={8} />
      </div>
      <Skeleton w={100} h={14} r={4} style={{ marginTop: 16 }} />
      <Skeleton w="100%" h={44} r={8} />
      <Skeleton w="100%" h={44} r={8} />
      <Skeleton w="100%" h={50} r={10} style={{ marginTop: 24 }} />
    </div>
  )
}
