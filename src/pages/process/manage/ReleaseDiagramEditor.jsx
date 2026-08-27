// pages/process/manage/ReleaseDiagramEditor.jsx
// 아키텍처 다이어그램 편집 (2026-08-27) — RELEASE_MANAGE 전용.
//
// ★ 좌표는 드래그로 잡는다 — 논리 viewBox(1000×600) 값이라 숫자로 맞추는 건 고통이다.
//   드래그 중에는 로컬 상태만 움직이고, 손을 뗄 때 한 번만 PATCH 한다(이동 중 서버 왕복 금지).
// ★ key 는 만든 뒤 못 바꾼다 — 발행된 문서의 노드 필터가 이 문자열을 박제하고 있어서,
//   개명하면 과거 배포 이력이 에러 없이 사라진다. 그래서 수정 폼에 key 입력이 아예 없다.
import { useRef, useState } from 'react'

import {
  createArchNode, updateArchNode, deleteArchNode,
  createArchEdge, deleteArchEdge,
} from '@/api'
import { ARCH_CANVAS_W, ARCH_CANVAS_H, ARCH_NODE_KINDS, NODE_KIND_LABELS } from '@/constants/releaseConst'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import { useToast } from '@/contexts/ToastContext'

import s from './ReleaseDiagram.module.css'

const DEF_R = 46
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export default function ReleaseDiagramEditor({ nodes, edges, onChanged }) {
  const toast = useToast()
  const confirm = useConfirm()
  const svgRef = useRef(null)
  const dragRef = useRef(null)     // {id, moved} — pointer 로 잡고 있는 노드
  const [pos, pos_set] = useState({})   // 드래그 중 로컬 좌표 {id: {x, y}}
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({ key: '', name: '', kind: '' })
  const [edgeDraft, setEdgeDraft] = useState({ source_id: '', target_id: '', label: '' })

  const at = (n) => pos[n.id] || { x: n.pos_x, y: n.pos_y }

  // 화면 좌표 → viewBox 좌표. SVG 가 폭에 맞춰 스케일되므로 비율로 환산한다.
  const toCanvas = (e) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || !r.width) return null
    return {
      x: clamp(Math.round(((e.clientX - r.left) / r.width) * ARCH_CANVAS_W), 0, ARCH_CANVAS_W),
      y: clamp(Math.round(((e.clientY - r.top) / r.height) * ARCH_CANVAS_H), 0, ARCH_CANVAS_H),
    }
  }

  const dropLocal = (id) => pos_set((prev) => {
    const next = { ...prev }
    delete next[id]
    return next
  })

  // ★ 그랩 오프셋(커서와 노드 중심의 차이)을 기록한다 — 안 하면 도형 가장자리를 잡는 순간
  //   노드가 커서 자리로 반지름만큼 순간이동한다.
  const onDown = (n) => (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p0 = toCanvas(e)
    dragRef.current = {
      id: n.id, moved: false, p: null,
      start: { x: n.pos_x, y: n.pos_y },     // 이동 임계값 판정 기준
      dx: p0 ? p0.x - n.pos_x : 0,
      dy: p0 ? p0.y - n.pos_y : 0,
      r: n.style?.r || DEF_R,
    }
  }

  const onMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const raw = toCanvas(e)
    if (!raw) return
    // 도형 중심이 캔버스 밖으로 나가면 절반이 잘린다 — 반지름만큼 안쪽으로 제한
    const p = {
      x: clamp(raw.x - d.dx, d.r, ARCH_CANVAS_W - d.r),
      y: clamp(raw.y - d.dy, d.r, ARCH_CANVAS_H - d.r),
    }
    // 시작점에서 3px(논리 좌표) 넘게 움직여야 '드래그' — 손이 1px 흔들린 클릭이
    //   위치 저장(PATCH)으로 이어지면 안 된다. 되돌릴 방법이 없기 때문.
    if (Math.hypot(p.x - d.start.x, p.y - d.start.y) >= 3) d.moved = true
    d.p = p                      // ★ ref 에도 남긴다 — onUp 이 최신 좌표를 확실히 읽게
    pos_set((prev) => ({ ...prev, [d.id]: p }))
  }

  const onCancel = () => {
    const d = dragRef.current
    dragRef.current = null
    if (d) dropLocal(d.id)       // 저장하지 않는다 — 취소된 제스처의 좌표는 의도가 아니다
  }

  const onUp = async () => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    const p = d.p                // 상태가 아니라 ref — 마지막 move 가 커밋 전이어도 안전
    if (!d.moved || !p) { dropLocal(d.id); return }
    try {
      await updateArchNode(d.id, { pos_x: p.x, pos_y: p.y })
      await onChanged()
    } catch (err) {
      toast(err.message || '위치 저장 실패', 'error')
    } finally {
      // 서버 값으로 다시 그리게 로컬 좌표는 버린다 (저장 실패 시 원위치가 정답)
      dropLocal(d.id)
    }
  }

  const run = async (fn, okMsg) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await fn()
      await onChanged()
      if (okMsg) toast(okMsg)
    } catch (e) {
      setError(e.message || '처리 실패')
    } finally {
      setBusy(false)
    }
  }

  const addNode = () => {
    const key = draft.key.trim().toLowerCase()
    const name = draft.name.trim()
    if (!key || !name) { setError('key 와 이름을 입력해주세요.'); return }
    run(async () => {
      // ★ 격자로 흩어 놓는다 — 전부 같은 좌표면 나중 노드가 앞 노드를 덮어 아래 것은 잡히지도 않고,
      //   둘을 연결하면 길이 0 선이 되어 화살표가 아예 안 보인다. 위치는 드래그로 다듬는다.
      const k = nodes.length
      await createArchNode({
        key, name, kind: draft.kind,
        pos_x: 200 + (k % 4) * 200,
        pos_y: 140 + Math.floor(k / 4) * 140,
        style: {},
      })
      setDraft({ key: '', name: '', kind: '' })
    }, '시스템이 추가됐습니다.')
  }

  const addEdge = () => {
    const { source_id, target_id, label } = edgeDraft
    if (!source_id || !target_id) { setError('출발·도착 시스템을 고르세요.'); return }
    run(async () => {
      await createArchEdge({
        source_id: Number(source_id), target_id: Number(target_id), label: label.trim(), style: {},
      })
      setEdgeDraft({ source_id: '', target_id: '', label: '' })
    }, '연결이 추가됐습니다.')
  }

  const removeNode = async (n) => {
    const ok = await confirm({
      title: `${n.name} 삭제`,
      message: '이 시스템과 연결된 화살표도 함께 사라집니다.\n'
        + '이미 발행된 배포 문서의 기록은 그대로 남습니다(이름 대신 key 로 표시됩니다).\n'
        + '잠시 감추는 것이라면 삭제 대신 "은퇴"를 쓰세요.',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    run(() => deleteArchNode(n.id), '삭제됐습니다.')
  }

  const byId = {}
  for (const n of nodes) byId[n.id] = n

  return (
    <div className={s.edWrap}>
      {error && <p className={s.edErr}>⚠ {error}</p>}
      <p className={s.edHint}>
        도형을 <b>끌어서</b> 위치를 잡으세요. 손을 떼면 저장됩니다.
        key 는 만든 뒤 바꿀 수 없습니다 — 발행된 문서가 이 값으로 시스템을 가리킵니다.
      </p>

      <div className={s.edCanvasWrap}>
        <svg ref={svgRef} className={s.canvas}
          viewBox={`0 0 ${ARCH_CANVAS_W} ${ARCH_CANVAS_H}`} preserveAspectRatio="xMidYMid meet"
          onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
          onPointerCancel={onCancel}>
          {edges.map((e) => {
            const a = byId[e.source_id]
            const b = byId[e.target_id]
            if (!a || !b) return null
            const pa = at(a)
            const pb = at(b)
            return (
              <g key={e.id} className={s.edge}>
                <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />
              </g>
            )
          })}
          {nodes.map((n) => {
            const p = at(n)
            return (
              <g key={n.id} className={`${s.node} ${s.drag}`}
                onPointerDown={onDown(n)}>
                <circle cx={p.x} cy={p.y} r={n.style?.r || DEF_R}
                  fill={n.style?.color || (n.is_active ? '#4a5878' : '#aab2c0')} />
                <text x={p.x} y={p.y + 5} textAnchor="middle" className={s.nodeLabel}>{n.name}</text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className={s.edCols}>
        {/* ── 시스템(노드) ── */}
        <div className={s.edCol}>
          <p className={s.edColLab}>시스템</p>
          {nodes.map((n) => (
            <div key={n.id} className={s.edRow}>
              <span className={s.edKey}>{n.key}</span>
              <input className={s.edInput} defaultValue={n.name} maxLength={50}
                onBlur={(e) => e.target.value.trim() !== n.name
                  && run(() => updateArchNode(n.id, { name: e.target.value.trim() }))} />
              <select className={s.edSel} value={n.kind || ''}
                onChange={(e) => run(() => updateArchNode(n.id, { kind: e.target.value }))}>
                <option value="">분류 없음</option>
                {ARCH_NODE_KINDS.map((k) => (
                  <option key={k} value={k}>{NODE_KIND_LABELS[k] || k}</option>
                ))}
              </select>
              <button type="button" className={s.edDel}
                title={n.is_active ? '은퇴 (다이어그램에서 감춤 · 기록은 보존)' : '다시 표시'}
                onClick={() => run(() => updateArchNode(n.id, { is_active: !n.is_active }))}>
                {n.is_active ? '⊘' : '↺'}
              </button>
              <button type="button" className={s.edDel} title="삭제" onClick={() => removeNode(n)}>✕</button>
              <textarea className={`${s.edInput} ${s.edWide}`} rows={2} defaultValue={n.description}
                placeholder="이 시스템이 무엇을 하는지 (좌측 설명 패널에 보입니다)"
                onBlur={(e) => e.target.value.trim() !== (n.description || '')
                  && run(() => updateArchNode(n.id, { description: e.target.value.trim() }))} />
            </div>
          ))}
          <div className={s.edRow}>
            <input className={s.edInput} value={draft.key} maxLength={30} placeholder="key (mes-be)"
              onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
            <input className={s.edInput} value={draft.name} maxLength={50} placeholder="표시 이름"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <select className={s.edSel} value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              <option value="">분류 없음</option>
              {ARCH_NODE_KINDS.map((k) => (
                <option key={k} value={k}>{NODE_KIND_LABELS[k] || k}</option>
              ))}
            </select>
          </div>
          <button type="button" className={s.edAdd} disabled={busy} onClick={addNode}>
            ＋ 시스템 추가
          </button>
        </div>

        {/* ── 연결(엣지) ── */}
        <div className={s.edCol}>
          <p className={s.edColLab}>연결</p>
          {edges.length === 0 && <p className={s.muted}>아직 연결이 없습니다.</p>}
          {edges.map((e) => (
            <div key={e.id} className={s.edRow}>
              <span className={s.edKey}>{byId[e.source_id]?.name || e.source_id}</span>
              <span className={s.muted}>→</span>
              <span className={s.edKey}>{byId[e.target_id]?.name || e.target_id}</span>
              {e.label && <span className={s.muted}>{e.label}</span>}
              <button type="button" className={s.edDel} title="연결 삭제"
                onClick={() => run(() => deleteArchEdge(e.id), '연결이 삭제됐습니다.')}>✕</button>
            </div>
          ))}
          <div className={s.edRow}>
            <select className={s.edSel} value={edgeDraft.source_id}
              onChange={(ev) => setEdgeDraft({ ...edgeDraft, source_id: ev.target.value })}>
              <option value="">출발</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <select className={s.edSel} value={edgeDraft.target_id}
              onChange={(ev) => setEdgeDraft({ ...edgeDraft, target_id: ev.target.value })}>
              <option value="">도착</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <input className={s.edInput} value={edgeDraft.label} maxLength={50}
              placeholder="관계 (REST, WebSocket…)"
              onChange={(ev) => setEdgeDraft({ ...edgeDraft, label: ev.target.value })} />
          </div>
          <button type="button" className={s.edAdd} disabled={busy} onClick={addEdge}>
            ＋ 연결 추가
          </button>
        </div>
      </div>
    </div>
  )
}
