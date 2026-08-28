// pages/process/manage/ItemMappingPage.jsx
// 품목 매핑 허브 (2026-08-27) — "시스템 개념 ↔ 품목 마스터" 연결을 한 화면에 모은다.
//
// ★ 왜 전용 화면인가: 매핑이 필요한 자리마다(UB 생성 화면 등) 편집 UI 를 심으면
//   설정이 흩어져 어디서 바꾸는지 아무도 모르게 된다 — 사용자 결정으로 여기로 이관.
//   앞으로 새 매핑이 생기면 이 화면에 섹션을 추가한다. 사용처엔 읽기 전용 배지만 남긴다.
// ★ 섹션 2(종류↔분류)의 BE 게이트는 DASH_INVENTORY(기존 유지 — 재고 화면 인라인 편집과 공유).
//   이 화면 feature(ADMIN_ITEM_MAPPING)와 다르므로, 권한 없으면 조회도 안 하고 **안내 문구만**
//   보여준다 (목록 GET 자체가 그 게이트 뒤라 읽기 전용 표시는 불가능).
import { useState, useEffect, useMemo } from 'react'

import {
  getUbBoxItemConfig, setUbBoxItemConfig,
  getProductStockKinds, setProductStockKindCategory,
  getItemCategoryTree,
} from '@/api'
import PageHeader from '@/components/common/PageHeader'
import { ItemPicker } from '@/components/Inventory/ProductStockSection'
import { Feature, canAccess } from '@/constants/permissions'
import { PHI_SPECS as PHI } from '@/constants/processConst'
import { useToast } from '@/contexts/ToastContext'
import { useModels } from '@/hooks/useModels'
import { flatOptions } from '@/utils/categoryTree'

import s from './ItemMappingPage.module.css'

export default function ItemMappingPage({ user, onLogout, onBack }) {
  const toast = useToast()
  const { models } = useModels()

  // Φ 선택지 — UB 생성 화면(BoxManager)과 같은 파생: 활성 DB 모델 + PHI_SPECS fallback.
  //   여기서 다르게 뽑으면 생성 화면엔 뜨는 Φ 가 매핑 화면엔 없어 지정할 길이 없어진다.
  const phiOptions = useMemo(() => {
    const map = new Map()
    for (const m of models || []) {
      if (m.is_active === false) continue
      const p = String(m.phi ?? '').trim()
      if (!p) continue
      if (!map.has(p)) {
        map.set(p, { phi: p, color: m.color_hex || PHI[p]?.color || '#9CA3AF', order: m.display_order ?? 999 })
      }
    }
    for (const p of Object.keys(PHI)) {
      if (!map.has(p)) map.set(p, { phi: p, color: PHI[p].color, order: 900 })
    }
    return [...map.values()].sort((a, b) => a.order - b.order || Number(a.phi) - Number(b.phi))
  }, [models])

  // ── 섹션 1: Φ → UB BOX 품목 ──
  const [cfgs, setCfgs] = useState(null)        // null = 로딩
  const [editingPhi, setEditingPhi] = useState('')

  useEffect(() => {
    getUbBoxItemConfig().then(setCfgs).catch((e) => {
      setCfgs([])
      toast(`UB 매핑 조회 실패: ${e.message}`, 'error')
    })
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const saveUb = async (phi, itemId) => {
    try {
      const r = await setUbBoxItemConfig(phi, itemId)
      const row = { phi: r.phi, item_id: r.item_id, item_name: r.item_name, part_no: r.part_no, has_bom: r.has_bom }
      setCfgs((prev) => [...(prev || []).filter((c) => c.phi !== phi), row])
      setEditingPhi('')
      if (!itemId) toast(`Φ${phi} 매핑 해제됨`)
      else toast(`Φ${phi} → ${r.item_name || r.part_no} 지정됨${r.has_bom ? '' : ' (BOM 미등록 — 소비 생략)'}`)
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  // ── 섹션 2: 제품 LOT 종류 → 품목 분류 ──
  const canEditKind = canAccess(user, Feature.DASH_INVENTORY)   // BE PUT 게이트와 동일
  const [kinds, setKinds] = useState(null)
  const [editingKind, setEditingKind] = useState('')
  const [catOpts, setCatOpts] = useState(null)   // [{id, label}] — 트리 평탄화, 1회 로드
  const [catSel, setCatSel] = useState('')
  const [catSaving, setCatSaving] = useState(false)

  useEffect(() => {
    // 목록 GET 도 DASH_INVENTORY 게이트라 권한 없으면 부르지 않는다 (403 토스트 소음 방지)
    if (!canEditKind) { setKinds([]); return }
    getProductStockKinds().then((r) => setKinds(r.kinds || [])).catch((e) => {
      setKinds([])
      toast(`종류 목록 조회 실패: ${e.message}`, 'error')
    })
  }, [canEditKind])   // eslint-disable-line react-hooks/exhaustive-deps

  const openKindEdit = async (k) => {
    setEditingKind(k.kind)
    setCatSel(k.category_id ? String(k.category_id) : '')
    if (catOpts) return
    try {
      setCatOpts(flatOptions(await getItemCategoryTree(true)))
    } catch (e) {
      // 실패를 [] 로 캐시하면 "분류가 없습니다" 오진 + 재시도 불가 — 편집만 닫고 null 유지(재진입 시 재시도)
      toast(`분류 조회 실패: ${e.message}`, 'error')
      setEditingKind('')
    }
  }

  const saveKind = async (k) => {
    setCatSaving(true)
    try {
      const id = catSel ? Number(catSel) : null
      await setProductStockKindCategory(k.kind, id)
      // 상단 고정 option(목록에 없는 현재 분류)을 그대로 재저장한 경우 기존 이름을 유지
      const name = (catOpts || []).find((o) => o.id === id)?.label.trim()
        || (id === k.category_id ? (k.category_name || '') : '')
      setKinds((prev) => (prev || []).map((r) =>
        (r.kind === k.kind ? { ...r, category_id: id, category_name: name } : r)))
      setEditingKind('')
      toast(id ? `${k.label} → ${name} 지정됨` : `${k.label} 분류 매핑 해제됨`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setCatSaving(false)
    }
  }

  return (
    <div className="page-flat">
      <PageHeader title="품목 매핑" subtitle="시스템 개념과 품목 마스터의 연결 설정"
        onBack={onBack} onLogout={onLogout} />

      {/* ── Φ → UB BOX 품목 ── */}
      <section className={s.sec}>
        <h2 className={s.secTitle}>UB 박스 부자재 소비 (Φ → UB BOX 품목)</h2>
        <p className={s.secDesc}>
          UB 박스 생성 시 여기 지정된 품목의 <b>생산 BOM(RELEASED)</b> 대로 창고 부자재 재고가
          자동 소비됩니다. 재고가 부족하면 박스 생성이 막힙니다.
          미지정이거나 품목에 BOM 이 없으면 소비 없이 그대로 출력됩니다.
        </p>
        {cfgs === null ? (
          <p className={s.info}>불러오는 중…</p>
        ) : (
          <div className={s.tscroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.thPhi}>Φ</th>
                  <th className={s.thL}>UB BOX 품목</th>
                  <th className={s.thL}>BOM 소비</th>
                  <th className={s.thAct} aria-label="동작" />
                </tr>
              </thead>
              <tbody>
                {phiOptions.map((o) => {
                  const cfg = cfgs.find((c) => c.phi === o.phi)
                  const mapped = !!cfg?.item_id
                  return (
                    <tr key={o.phi}>
                      <td className={s.phiCell}>
                        <i className={s.phiDot} style={{ background: o.color }} />Φ{o.phi}
                      </td>
                      <td className={s.itemCell}>
                        {mapped || editingPhi === o.phi ? (
                          <ItemPicker
                            value={mapped ? { id: cfg.item_id, part_no: cfg.part_no, name: cfg.item_name } : null}
                            onPick={(it) => saveUb(o.phi, it.id)} />
                        ) : (
                          <button type="button" className={s.linkBtn}
                            onClick={() => setEditingPhi(o.phi)}>지정</button>
                        )}
                      </td>
                      <td>
                        {!mapped ? <span className={s.muted}>—</span>
                          : cfg.has_bom ? <span className={s.ok}>생성 시 자동 소비</span>
                            : <span className={s.warn}>BOM 미등록 — 소비 생략</span>}
                      </td>
                      <td className={s.actCell}>
                        {mapped && (
                          <button type="button" className={s.dangerLink}
                            onClick={() => saveUb(o.phi, null)}>해제</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 제품 LOT 종류 → 품목 분류 ── */}
      <section className={s.sec}>
        <h2 className={s.secTitle}>제품 LOT 발급 후보 (종류 → 품목 분류)</h2>
        <p className={s.secDesc}>
          지정하면 그 종류의 LOT 발급 시 해당 분류(하위 포함) 품목만 후보가 됩니다 —
          볼트가 PCB LOT 으로 발급되는 사고를 막는 검증입니다. 미지정이면 검증하지 않습니다.
        </p>
        {!canEditKind ? (
          <p className={s.info}>이 매핑은 재고 대시보드 권한(재고 화면과 동일)이 있어야 편집할 수 있습니다.</p>
        ) : kinds === null ? (
          <p className={s.info}>불러오는 중…</p>
        ) : (
          <div className={s.tscroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.thL}>종류</th>
                  <th className={s.thL}>품목 분류</th>
                  <th className={s.thAct} aria-label="동작" />
                </tr>
              </thead>
              <tbody>
                {kinds.map((k) => (
                  <tr key={k.kind}>
                    <td><b>{k.label}</b> <span className={s.muted}>({k.kind})</span></td>
                    <td>
                      {editingKind === k.kind ? (
                        <span className={s.catEdit}>
                          {catOpts === null ? (
                            <span className={s.muted}>분류 불러오는 중…</span>
                          ) : catOpts.length === 0 ? (
                            <span className={s.warn}>등록된 분류가 없습니다 — 품목 관리 → 분류에서 먼저 만들어주세요.</span>
                          ) : (
                            <select className={s.catSelect} value={catSel}
                              onChange={(e) => setCatSel(e.target.value)}>
                              <option value="">(미지정 — 검증 안 함)</option>
                              {/* 매핑된 분류가 비활성 등으로 목록에 없으면 상단 고정 — 없으면 select 표시는
                                  '미지정'처럼 보이는데 저장은 옛 id 가 나가는 표시-저장 불일치가 생긴다 */}
                              {k.category_id && !catOpts.some((c) => c.id === k.category_id) && (
                                <option value={k.category_id}>
                                  {k.category_name || '현재 분류'} (목록에 없음)
                                </option>
                              )}
                              {catOpts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                          )}
                          <button type="button" className="btn-secondary btn-sm"
                            onClick={() => setEditingKind('')}>취소</button>
                          {catOpts !== null && catOpts.length > 0 && (
                            <button type="button" className="btn-primary btn-sm" disabled={catSaving}
                              onClick={() => saveKind(k)}>
                              {catSaving ? '저장 중…' : '저장'}
                            </button>
                          )}
                        </span>
                      ) : k.category_id ? (
                        <span>{k.category_name || '지정된 분류'} <span className={s.muted}>(하위 포함)</span></span>
                      ) : (
                        <span className={s.warn}>미지정 — 아무 품목이나 선택됩니다</span>
                      )}
                    </td>
                    <td className={s.actCell}>
                      {editingKind !== k.kind && (
                        <button type="button" className={s.linkBtn}
                          onClick={() => openKindEdit(k)}>{k.category_id ? '변경' : '지정'}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
