// src/pages/adm/manage/PrinterManagePage.jsx
// 프린터 CRUD 관리자 페이지 (Phase 1, 2026-04-22)
// - 목록 조회 + 생성 + 수정 + 삭제 + 활성/비활성 토글
// - Toss flat 원칙 준수: .page-flat / PageHeader / .list-item / sticky-cta
//
// 향후 Phase 2 — machine_type 기반 권한 체크 (admin_rnd 만 접근)

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  listPrinters, createPrinter, updatePrinter, deletePrinter,
  listFactoryLocations,
} from '@/api'
import s from './PrinterManagePage.module.css'

const EMPTY_FORM = {
  name: '',
  ip: '',
  location_id: '',
  machine_id_legacy: '',
  active: true,
  memo: '',
}

export default function PrinterManagePage({ onBack }) {
  const [printers, setPrinters] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)

  // 편집 모달 state (editingId === null && show → 신규, id 있으면 수정)
  const [show, setShow] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, locs] = await Promise.all([
        listPrinters(),
        listFactoryLocations(),
      ])
      setPrinters(list)
      setLocations(locs)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // 메시지 자동 해제
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2500)
    return () => clearTimeout(t)
  }, [msg])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 3500)
    return () => clearTimeout(t)
  }, [error])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, location_id: locations[0]?.id ?? '' })
    setShow(true)
  }

  const openEdit = (p) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      ip: p.ip,
      location_id: p.location_id,
      machine_id_legacy: p.machine_id_legacy ?? '',
      active: p.active,
      memo: p.memo ?? '',
    })
    setShow(true)
  }

  const closeModal = () => {
    if (saving) return
    setShow(false)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return setError('이름을 입력해주세요.')
    if (!form.ip.trim()) return setError('IP를 입력해주세요.')
    if (!form.location_id) return setError('공장을 선택해주세요.')

    const payload = {
      name: form.name.trim(),
      ip: form.ip.trim(),
      location_id: Number(form.location_id),
      machine_id_legacy: form.machine_id_legacy === '' ? null : Number(form.machine_id_legacy),
      active: form.active,
      memo: form.memo.trim(),
    }

    setSaving(true)
    try {
      if (editingId) {
        await updatePrinter(editingId, payload)
        setMsg(`수정 완료: ${payload.name}`)
      } else {
        await createPrinter(payload)
        setMsg(`등록 완료: ${payload.name}`)
      }
      setShow(false)
      await fetchAll()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (p) => {
    try {
      await updatePrinter(p.id, { active: !p.active })
      await fetchAll()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDelete = async (p) => {
    if (!window.confirm(`정말 삭제할까요?\n\n${p.name} (${p.ip})`)) return
    try {
      await deletePrinter(p.id)
      setMsg(`삭제 완료: ${p.name}`)
      await fetchAll()
    } catch (e) {
      setError(e.message)
    }
  }

  const locationLabel = (id) => {
    const loc = locations.find((l) => l.id === id)
    return loc ? (loc.factory_specific_address || loc.factory_address) : `공장 ${id}`
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="프린터 관리"
        subtitle="물리 프린터 IP와 공장 소속을 등록해요"
        onBack={onBack}
      />

      {msg && <p className={s.msgOk}>{msg}</p>}
      {error && <p className={s.msgErr}>⚠ {error}</p>}

      <div className={s.topBar}>
        <span className={s.count}>총 {printers.length}대</span>
        <button type="button" className="btn-primary btn-sm" onClick={openCreate}>
          + 새 프린터
        </button>
      </div>

      {loading && <p className={s.emptyTxt}>불러오는 중...</p>}

      {!loading && printers.length === 0 && (
        <p className={s.emptyTxt}>등록된 프린터가 없습니다.</p>
      )}

      <ul className={s.list}>
        {printers.map((p) => (
          <li key={p.id} className={`list-item ${s.row} ${!p.active ? s.rowInactive : ''}`}>
            <div className={s.rowMain}>
              <div className={s.rowTop}>
                <strong className={s.name}>{p.name}</strong>
                <span className={s.ip}>{p.ip}</span>
                {!p.active && <span className={s.badgeOff}>비활성</span>}
              </div>
              <div className={s.rowSub}>
                <span>🏭 {locationLabel(p.location_id)}</span>
                {p.machine_id_legacy != null && (
                  <span>레거시 machine_id: {p.machine_id_legacy}</span>
                )}
                {p.memo && <span className={s.memo}>📝 {p.memo}</span>}
              </div>
            </div>
            <div className={s.rowActions}>
              <button type="button" className={s.actBtn} onClick={() => handleToggleActive(p)}>
                {p.active ? '비활성' : '활성'}
              </button>
              <button type="button" className={s.actBtn} onClick={() => openEdit(p)}>
                편집
              </button>
              <button type="button" className={`${s.actBtn} ${s.actBtnDanger}`} onClick={() => handleDelete(p)}>
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* 편집/생성 모달 */}
      {show && (
        <div className={s.overlay} onClick={closeModal}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h2>{editingId ? '프린터 수정' : '새 프린터 등록'}</h2>
              <button type="button" className={s.closeBtn} onClick={closeModal} disabled={saving}>✕</button>
            </div>

            <div className={s.formBody}>
              <div className={s.field}>
                <label className={s.label}>이름 *</label>
                <input
                  type="text"
                  className={s.input}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="예: 1층 라벨기"
                  disabled={saving}
                />
              </div>

              <div className={s.field}>
                <label className={s.label}>IP *</label>
                <input
                  type="text"
                  className={s.input}
                  value={form.ip}
                  onChange={(e) => setForm({ ...form, ip: e.target.value })}
                  placeholder="192.168.0.200"
                  disabled={saving}
                />
              </div>

              <div className={s.field}>
                <label className={s.label}>공장 *</label>
                <select
                  className={s.input}
                  value={form.location_id}
                  onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                  disabled={saving}
                >
                  <option value="">공장을 선택</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.factory_specific_address || l.factory_address} (id={l.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className={s.field}>
                <label className={s.label}>레거시 machine_id (옵션)</label>
                <input
                  type="number"
                  className={s.input}
                  value={form.machine_id_legacy}
                  onChange={(e) => setForm({ ...form, machine_id_legacy: e.target.value })}
                  placeholder="MiddleServer PRINTERS dict 매핑용"
                  disabled={saving}
                />
              </div>

              <div className={s.field}>
                <label className={s.label}>메모</label>
                <input
                  type="text"
                  className={s.input}
                  value={form.memo}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  placeholder="선택 입력 (최대 200자)"
                  maxLength={200}
                  disabled={saving}
                />
              </div>

              <label className={s.checkRow}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  disabled={saving}
                />
                <span>활성</span>
              </label>
            </div>

            <div className={s.modalFooter}>
              <button type="button" className="btn-secondary btn-md" onClick={closeModal} disabled={saving}>
                취소
              </button>
              <button type="button" className="btn-primary btn-md" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : (editingId ? '수정' : '등록')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
