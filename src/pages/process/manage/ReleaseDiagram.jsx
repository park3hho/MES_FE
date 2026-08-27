// pages/process/manage/ReleaseDiagram.jsx
// 아키텍처 다이어그램 보기 (2026-08-27) — 공용 1장. 배포 문서의 두 번째 보기.
//
// ★ 좌표는 논리 viewBox(1000×600) 기준이고 SVG 가 뷰포트에 맞춰 스케일한다 —
//   절대 px 로 그리면 모바일에서 잘린다(품질 대시보드 TrendChart 와 같은 방식).
// ★ 노드를 고르면 그 시스템을 건드린 배포만 남는다 — 정션(release_note_node)이 그 근거고,
//   목록은 이미 부모가 1회 fetch 해 뒀으므로 여기선 클라이언트 필터만 한다.
// ★ 상호작용은 클릭 기준 — hover 툴팁은 현장 주력 기기(폰·태블릿)에서 동작하지 않는다.
import { useMemo, useState } from 'react'

import { ARCH_CANVAS_W, ARCH_CANVAS_H, NODE_KIND_LABELS } from '@/constants/releaseConst'
import { fmtKstDateTime } from '@/utils/dateConvert'

import s from './ReleaseDiagram.module.css'

const DEF_R = 46          // 원 반지름 기본값
const DEF_W = 132         // 사각형 기본 폭·높이
const DEF_H = 62
const NODE_COLOR = '#4a5878'

const shapeOf = (n) => (n.style?.shape === 'rect' ? 'rect' : 'circle')
const sizeOf = (n) => (shapeOf(n) === 'rect'
  ? { w: n.style?.w || DEF_W, h: n.style?.h || DEF_H }
  : { w: (n.style?.r || DEF_R) * 2, h: (n.style?.r || DEF_R) * 2 })

// 두 노드 중심을 잇되 선이 도형 안으로 파고들지 않게 경계에서 끊는다.
//   (원은 반지름만큼, 사각형은 변까지 — 화살촉이 도형에 가려지면 방향을 못 읽는다)
function edgePoints(a, b) {
  const dx = b.pos_x - a.pos_x
  const dy = b.pos_y - a.pos_y
  const len = Math.hypot(dx, dy)
  // 겹쳤거나 도형 반경 합보다 가까우면 그리지 않는다 — 길이 0 선(원)이나
  //   0*Infinity=NaN 좌표(사각형)가 나오고, 컷 합이 거리보다 크면 화살표가 뒤집힌다.
  const half = (n) => (shapeOf(n) === 'circle'
    ? (n.style?.r || DEF_R)
    : Math.min(sizeOf(n).w, sizeOf(n).h) / 2)
  if (len < half(a) + half(b) + 8) return null
  const ux = dx / len
  const uy = dy / len
  const cut = (n, sx, sy) => {
    if (shapeOf(n) === 'circle') {
      const r = (n.style?.r || DEF_R) + 4
      return { x: n.pos_x + sx * r, y: n.pos_y + sy * r }
    }
    const { w, h } = sizeOf(n)
    // 사각형 경계 — 가로/세로 중 먼저 닿는 쪽까지의 거리
    const tx = sx === 0 ? Infinity : (w / 2 + 4) / Math.abs(sx)
    const ty = sy === 0 ? Infinity : (h / 2 + 4) / Math.abs(sy)
    const t = Math.min(tx, ty)
    return { x: n.pos_x + sx * t, y: n.pos_y + sy * t }
  }
  return { from: cut(a, ux, uy), to: cut(b, -ux, -uy) }
}

export default function ReleaseDiagram({ nodes, edges, notes, onOpenNote }) {
  const [sel, setSel] = useState('')       // 선택된 노드 key
  const [q, setQ] = useState('')           // 노드 검색 (이름·설명)

  const byId = useMemo(() => {
    const m = {}
    for (const n of nodes) m[n.id] = n
    return m
  }, [nodes])

  // 검색 일치 노드 — 하이라이트 대상 (필터가 아니라 강조: 구조는 그대로 보여야 한다)
  const hits = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return null
    return new Set(nodes
      .filter((n) => `${n.name} ${n.description} ${n.key}`.toLowerCase().includes(kw))
      .map((n) => n.key))
  }, [q, nodes])

  const related = useMemo(
    () => (sel ? (notes || []).filter((n) => (n.node_keys || []).includes(sel)) : []),
    [sel, notes],
  )
  const selNode = nodes.find((n) => n.key === sel) || null

  if (nodes.length === 0) {
    return (
      <p className={s.empty}>
        아직 등록된 시스템이 없습니다. 관리 권한이 있으면 <b>구성 편집</b>에서 추가하세요.
      </p>
    )
  }

  return (
    <div className={s.wrap}>
      {/* 좌 — 시스템 목록·설명. 모바일에선 아래로 내려간다 */}
      <aside className={s.side}>
        <input className={s.search} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="시스템 검색" aria-label="시스템 검색" />
        <div className={s.nodeList}>
          {nodes.map((n) => {
            const dim = hits && !hits.has(n.key)
            return (
              <button key={n.key} type="button"
                className={`${s.nodeItem} ${sel === n.key ? s.nodeItemOn : ''} ${dim ? s.dim : ''}`}
                aria-pressed={sel === n.key}
                onClick={() => setSel(sel === n.key ? '' : n.key)}>
                <span className={s.nodeItemTop}>
                  <b className={s.nodeName}>{n.name}</b>
                  {n.kind && <span className={s.kindTag}>{NODE_KIND_LABELS[n.kind] || n.kind}</span>}
                </span>
                {n.description && <span className={s.nodeDesc}>{n.description}</span>}
              </button>
            )
          })}
        </div>
      </aside>

      {/* 우 — 다이어그램 + 선택 노드의 배포 이력 */}
      <div className={s.main}>
        <div className={s.canvasWrap}>
          <svg className={s.canvas} viewBox={`0 0 ${ARCH_CANVAS_W} ${ARCH_CANVAS_H}`}
            preserveAspectRatio="xMidYMid meet" role="img" aria-label="시스템 구성도">
            <defs>
              <marker id="rdArrow" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a93a8" />
              </marker>
              <marker id="rdArrowOn" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
              </marker>
            </defs>

            {edges.map((e) => {
              const a = byId[e.source_id]
              const b = byId[e.target_id]
              if (!a || !b) return null
              const pts = edgePoints(a, b)
              if (!pts) return null          // 두 노드가 겹쳐 있으면 선을 그릴 자리가 없다
              const { from, to } = pts
              const on = sel && (a.key === sel || b.key === sel)
              // 선택 시 화살촉 색도 함께 바뀌어야 한다 — 선만 파래지면 끝점이 회색으로 남는다
              const mk = on ? 'url(#rdArrowOn)' : 'url(#rdArrow)'
              return (
                <g key={e.id} className={`${s.edge} ${on ? s.edgeOn : ''}`}>
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    strokeDasharray={e.style?.dashed ? '6 5' : undefined}
                    markerEnd={mk}
                    markerStart={e.style?.dir === 'both' ? mk : undefined} />
                  {e.label && (
                    <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6}
                      textAnchor="middle" className={s.edgeLabel}>{e.label}</text>
                  )}
                </g>
              )
            })}

            {nodes.map((n) => {
              const { w, h } = sizeOf(n)
              const on = sel === n.key
              const dim = hits && !hits.has(n.key)
              const fill = n.style?.color || NODE_COLOR
              return (
                // 캔버스는 svg role="img" 안이라 접근성 트리에서 잘린다 — 키보드 선택은
                //   좌측 목록 버튼이 담당하고, 여기선 포커스를 만들지 않는다(포커스만 가고 안 읽히는 상태 방지)
                <g key={n.key} className={`${s.node} ${on ? s.nodeOn : ''} ${dim ? s.dim : ''}`}
                  onClick={() => setSel(on ? '' : n.key)}>
                  <title>{n.name}</title>
                  {shapeOf(n) === 'circle' ? (
                    <circle cx={n.pos_x} cy={n.pos_y} r={w / 2} fill={fill} />
                  ) : (
                    <rect x={n.pos_x - w / 2} y={n.pos_y - h / 2} width={w} height={h}
                      rx={12} fill={fill} />
                  )}
                  {/* 긴 이름은 도형 밖으로 삐져나가 옆 노드와 겹친다 — 잘라 넣고 전체는 <title> 로 */}
                  <text x={n.pos_x} y={n.pos_y + 6} textAnchor="middle" className={s.nodeLabel}>
                    {n.name.length > 9 ? `${n.name.slice(0, 8)}…` : n.name}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {selNode ? (
          <div className={s.detail}>
            <p className={s.detailHead}>
              <b>{selNode.name}</b>
              <span className={s.muted}>
                {' '}관련 배포 {related.length}건
              </span>
              <button type="button" className={s.clear} onClick={() => setSel('')}>선택 해제</button>
            </p>
            {selNode.description && <p className={s.detailDesc}>{selNode.description}</p>}
            {related.length === 0 ? (
              <p className={s.muted}>이 시스템을 건드린 배포 문서가 아직 없습니다.</p>
            ) : (
              <div className={s.relList}>
                {related.map((n) => (
                  <button key={n.id} type="button" className={s.relItem}
                    onClick={() => onOpenNote?.(n)}>
                    <span className={s.relVer}>{n.version}</span>
                    <span className={s.relTitle}>{n.title}</span>
                    <span className={s.relWhen}>
                      {n.is_draft ? '작성 중' : fmtKstDateTime(n.released_at)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className={s.hint}>시스템을 누르면 그 시스템을 건드린 배포만 모아 봅니다.</p>
        )}
      </div>
    </div>
  )
}
