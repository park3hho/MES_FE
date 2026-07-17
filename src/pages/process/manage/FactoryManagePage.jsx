// pages/process/manage/FactoryManagePage.jsx
// 공장(FactoryLocation) 관리 — 생성·수정·삭제 (2026-07-16).
//   계정/프린터 등록 시 쓰는 공장 목록의 원천. 삭제는 참조 0건일 때만(BE 가드).
//   권한: ADMIN_PRINTER (기존 /factory-locations GET 과 동일 게이트).
//   Toss flat: .page-flat / PageHeader / 리스트 + 인라인 편집.

import { useState, useEffect } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  listFactoryLocations, createFactoryLocation, updateFactoryLocation, deleteFactoryLocation,
} from '@/api'
import { useConfirm } from '@/contexts/ConfirmDialogContext'
import s from './FactoryManagePage.module.css'

const EMPTY = { factory_address: '', factory_specific_address: '' }

export default function FactoryManagePage({ onBack }) {
  const confirm = useConfirm()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3500)
    return () => clearTimeout(t)
  }, [msg])

  async function load() {
    setLoading(true)
    try {
      setRows(await listFactoryLocations())
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setLoading(false)
    }
  }

  const setRow = (id, patch) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  async function addFactory() {
    const specific = form.factory_specific_address.trim()
    const addr = form.factory_address.trim()
    if (!addr) return setMsg({ type: 'err', text: '공장 주소를 입력해주세요.' })
    if (!specific) return setMsg({ type: 'err', text: '상세/표시명을 입력해주세요.' })
    setBusy(true); setMsg(null)
    try {
      await createFactoryLocation({ factory_address: addr, factory_specific_address: specific })
      setForm(EMPTY)
      setMsg({ type: 'ok', text: `공장 추가됨: ${specific}` })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function saveRow(r) {
    if (!r.factory_address.trim() || !r.factory_specific_address.trim()) {
      return setMsg({ type: 'err', text: '주소는 비울 수 없습니다.' })
    }
    setBusy(true); setMsg(null)
    try {
      await updateFactoryLocation(r.id, {
        factory_address: r.factory_address.trim(),
        factory_specific_address: r.factory_specific_address.trim(),
      })
      setMsg({ type: 'ok', text: `저장됨: ${r.factory_specific_address}` })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
      await load()   // 실패 시 서버값 복원
    } finally {
      setBusy(false)
    }
  }

  async function removeRow(r) {
    const ok = await confirm({
      title: '공장 삭제',
      message: `'${r.factory_specific_address}' (id=${r.id}) 공장을 삭제할까요?\n이 공장을 쓰는 계정·프린터가 있으면 삭제되지 않습니다.`,
      confirmText: '삭제',
    })
    if (!ok) return
    setBusy(true); setMsg(null)
    try {
      await deleteFactoryLocation(r.id)
      setMsg({ type: 'ok', text: `삭제됨: ${r.factory_specific_address}` })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="공장 관리"
        subtitle="계정·프린터가 소속되는 공장(사업장) 추가·수정·삭제"
        onBack={onBack}
      />
      {msg && <p className={msg.type === 'ok' ? s.ok : s.err}>{msg.text}</p>}

      {/* 새 공장 추가 */}
      <div className={s.addRow}>
        <input
          className={s.inp}
          placeholder="공장 주소 (예: 경기도 화성시 …)"
          value={form.factory_address}
          onChange={(e) => setForm({ ...form, factory_address: e.target.value })}
          disabled={busy}
        />
        <input
          className={s.inp}
          placeholder="상세/표시명 (예: 1공장)"
          value={form.factory_specific_address}
          onChange={(e) => setForm({ ...form, factory_specific_address: e.target.value })}
          disabled={busy}
        />
        <button className="btn-primary btn-sm" onClick={addFactory} disabled={busy}>
          + 추가
        </button>
      </div>
      <p className={s.hint}>드롭다운·라벨에는 “상세/표시명”이 우선 표시됩니다.</p>

      {loading && <p className={s.note}>불러오는 중…</p>}
      {!loading && rows.length === 0 && <p className={s.note}>등록된 공장이 없습니다.</p>}

      <ul className={s.list}>
        {rows.map((r) => (
          <li key={r.id} className={s.row}>
            <span className={s.idBadge}>#{r.id}</span>
            <div className={s.fields}>
              <input
                className={s.rowInp}
                value={r.factory_specific_address}
                onChange={(e) => setRow(r.id, { factory_specific_address: e.target.value })}
                placeholder="상세/표시명"
                disabled={busy}
              />
              <input
                className={s.rowInpSub}
                value={r.factory_address}
                onChange={(e) => setRow(r.id, { factory_address: e.target.value })}
                placeholder="공장 주소"
                disabled={busy}
              />
            </div>
            <div className={s.actions}>
              <button className="btn-secondary btn-sm" onClick={() => saveRow(r)} disabled={busy}>저장</button>
              <button className={s.delBtn} onClick={() => removeRow(r)} disabled={busy}>삭제</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
