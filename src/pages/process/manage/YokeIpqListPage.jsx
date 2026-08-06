// pages/process/manage/YokeIpqListPage.jsx
// 요크 IPQ 검사 이력 (2026-08-06) — OQ 의 '검사목록(INSPECT LIST)' 에 대응하는 IPQ 조회 화면.
//   입력은 YokeIpqPage(측정), 폐기는 YokeDiscardPage. 여기는 **조회 + 엑셀 내보내기 전용**.
//
// 엑셀 '요크 검사 이력서' 양식(요크 1개 = 1행)에 맞춰 컬럼을 구성했다.
//   ⚠️ 기존 수기 엑셀은 '모델명' 칸에 `90파이요크 26극`·`9대1 선기어` 같은 특수사양이 섞여 있었는데,
//     시스템은 **phi(숫자) / model_name(품목명) / remark(비고)** 로 이미 분리해 저장한다.
//     내보내기에서도 모델명 칸엔 phi 만 넣고 특수사양은 비고로 보낸다 (사용자 결정 2026-08-06).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { listYokeIpq } from '@/api'
import s from './YokeIpqListPage.module.css'

const PAGE_SIZE = 20
const J_LABEL = { OK: '양호', FAIL: '불량', PENDING: '미검사' }
const MOTOR_LABEL = { inner: '내전', outer: '외전', axial: '축' }

const fmtNum = (v) => (v == null || v === '' ? '-' : String(v))
// 'YYYY-MM-DDTHH:mm:ss+09:00' → 'YYYY-MM-DD'
const dateOf = (r) => (r.work_date || (r.created_at || '').slice(0, 10) || '')

// ── 정렬 훅 ── (phi 는 문자열이라 숫자 파생 필드로 정렬)
function useSort(rows, initialKey, initialDir = 'desc') {
  const [key, setKey] = useState(initialKey)
  const [dir, setDir] = useState(initialDir)
  const sorted = useMemo(() => {
    const arr = [...(rows || [])]
    arr.sort((a, b) => {
      const x = a[key]
      const y = b[key]
      let c
      if (typeof x === 'number' && typeof y === 'number') c = x - y
      else c = String(x ?? '').localeCompare(String(y ?? ''), 'ko')
      return dir === 'asc' ? c : -c
    })
    return arr
  }, [rows, key, dir])
  const toggle = (k) => {
    if (k === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setKey(k); setDir('asc') }
  }
  return { sorted, key, dir, toggle }
}

function SortTh({ label, sortKey: k, st, align }) {
  const on = st.key === k
  return (
    <th className={align === 'right' ? s.num : undefined}>
      <button type="button" className={s.sortBtn} onClick={() => st.toggle(k)}>
        {label}
        <span className={on ? s.sortMark : s.sortMarkIdle}>
          {on ? (st.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

// ── 엑셀(CSV) 내보내기 ──
//   FE 에 xlsx 라이브러리가 없어 CSV 로 저장한다 (Excel 에서 그대로 열림).
//   ★ BOM(﻿) 필수 — 없으면 Excel 이 한글을 깨서 연다.
const CSV_HEADER = [
  'NO', '작업일자', '년', '월', '일', '순서', '모델명', '호기', '구분',
  '외경', '진원도', '내경', '진원도', '동심도', '검사자', '비고', '요크 LOT',
]

function toCsv(rows) {
  const esc = (v) => {
    const t = v == null ? '' : String(v)
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const lines = [CSV_HEADER.join(',')]
  rows.forEach((r, i) => {
    const d = dateOf(r)
    const [y, m, dd] = d ? d.split('-') : ['', '', '']
    // 특수사양(품목명)은 모델명 칸이 아니라 비고로 — 수기 엑셀에서 섞여 있던 문제를 여기서 차단
    const remark = [r.model_name, r.remark].filter(Boolean).join(' / ')
    lines.push([
      i + 1,
      d ? `${y}-${Number(m)}-${Number(dd)}-${r.sample_no ?? ''}` : '',
      y, Number(m) || '', Number(dd) || '', r.sample_no ?? '',
      r.phi ?? '', r.vendor ?? '', J_LABEL[r.judgment] || r.judgment || '',
      r.outer_dia ?? '', r.outer_roundness ?? '', r.inner_dia ?? '',
      r.inner_roundness ?? '', r.concentricity ?? '',
      r.worker ?? '', remark, r.lot_ea_no ?? '',
    ].map(esc).join(','))
  })
  return '﻿' + lines.join('\r\n')
}

function downloadCsv(rows, from, to) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `요크검사이력_${from || '전체'}_${to || ''}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}


export default function YokeIpqListPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [judgment, setJudgment] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const f = {}
      if (from) f.date_from = from
      if (to) f.date_to = to
      if (judgment) f.judgment = judgment
      const r = await listYokeIpq(f)
      setRows(r.items || [])
      setPage(1)
      setMsg(null)
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '불러오기 실패' })
    } finally { setLoading(false); setLoaded(true) }
  }, [from, to, judgment])

  useEffect(() => { load() }, [load])

  const withNum = useMemo(() => rows.map((r) => ({ ...r, phi_num: Number(r.phi) || 0 })), [rows])
  const st = useSort(withNum, 'created_at', 'desc')

  const okCount = rows.filter((r) => r.judgment === 'OK').length
  const ngCount = rows.filter((r) => r.judgment === 'FAIL').length

  const totalPages = Math.max(1, Math.ceil(st.sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = st.sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const jClass = (j) => (j === 'OK' ? s.jOk : j === 'FAIL' ? s.jNg : s.jNone)

  return (
    <div className="page-flat">
      <PageHeader
        title="요크 검사 이력 (IPQ)"
        subtitle="요크 1개당 1건 — 측정값과 판정 조회 · 엑셀 내보내기"
        onBack={() => nav('/admin/manage')}
      />
      <div className="page-content">
        {msg && (
          <p className={`${s.msg} ${msg.type === 'err' ? s.msgErr : s.msgOk}`}>{msg.text}</p>
        )}

        <div className={s.filters}>
          <label className={s.field}>
            <span className={s.fieldLabel}>검사일 From</span>
            <input type="date" className={`${s.input} ${s.wDate}`} value={from}
              onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>To</span>
            <input type="date" className={`${s.input} ${s.wDate}`} value={to}
              onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>판정</span>
            <select className={`${s.input} ${s.wSel}`} value={judgment}
              onChange={(e) => setJudgment(e.target.value)}>
              <option value="">전체</option>
              <option value="OK">양호</option>
              <option value="FAIL">불량</option>
              <option value="PENDING">미검사</option>
            </select>
          </label>
          <button type="button" className={`btn-secondary btn-sm ${s.smallBtn}`}
            disabled={loading} onClick={load}>
            {loading ? '조회 중…' : '조회'}
          </button>
          <button type="button" className={`btn-primary btn-sm ${s.smallBtn} ${s.spacer}`}
            disabled={st.sorted.length === 0}
            onClick={() => downloadCsv(st.sorted, from, to)}>
            엑셀 내보내기 ({st.sorted.length}건)
          </button>
        </div>

        <div className={s.summary}>
          <span>전체 <b className={s.summaryNum}>{rows.length}</b>건</span>
          <span>양호 <b className={`${s.summaryNum} ${s.ok}`}>{okCount}</b></span>
          <span>불량 <b className={`${s.summaryNum} ${s.ng}`}>{ngCount}</b></span>
        </div>
        <p className={s.hint}>
          ※ 내보내기는 <b>현재 조회·정렬된 전체 건</b>이 대상입니다 (화면의 페이지 구간이 아니라).
          모델명 칸에는 파이(Φ) 숫자만 들어가고, 특수사양(예: 26극·선기어)은 <b>비고</b> 로 나갑니다.
        </p>

        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>NO</th>
                <SortTh label="검사일" sortKey="created_at" st={st} />
                <SortTh label="순서" sortKey="sample_no" st={st} align="right" />
                <SortTh label="모델" sortKey="phi_num" st={st} />
                <SortTh label="모터" sortKey="motor_type" st={st} />
                <SortTh label="호기" sortKey="vendor" st={st} />
                <SortTh label="구분" sortKey="judgment" st={st} />
                <th className={s.num}>외경</th>
                <th className={s.num}>진원도</th>
                <th className={s.num}>내경</th>
                <th className={s.num}>진원도</th>
                <th className={s.num}>동심도</th>
                <SortTh label="검사자" sortKey="worker" st={st} />
                <th>비고</th>
                <SortTh label="요크 LOT" sortKey="lot_ea_no" st={st} />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={r.id}>
                  <td className={s.sub}>{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                  <td>{dateOf(r)}</td>
                  <td className={s.num}>{r.sample_no ?? '-'}</td>
                  <td>{r.phi ? `Φ${r.phi}` : '-'}</td>
                  <td>{MOTOR_LABEL[r.motor_type] || r.motor_type || '-'}</td>
                  <td>{r.vendor || '-'}</td>
                  <td className={jClass(r.judgment)}>{J_LABEL[r.judgment] || r.judgment || '-'}</td>
                  <td className={s.num}>{fmtNum(r.outer_dia)}</td>
                  <td className={s.num}>{fmtNum(r.outer_roundness)}</td>
                  <td className={s.num}>{fmtNum(r.inner_dia)}</td>
                  <td className={s.num}>{fmtNum(r.inner_roundness)}</td>
                  <td className={s.num}>{fmtNum(r.concentricity)}</td>
                  <td>{r.worker || '-'}</td>
                  <td className={s.remarkCell} title={[r.model_name, r.remark].filter(Boolean).join(' / ')}>
                    {[r.model_name, r.remark].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td className={s.lot}>{r.lot_ea_no}</td>
                </tr>
              ))}
              {loaded && rows.length === 0 && (
                <tr><td colSpan={15} className={s.empty}>
                  조회된 검사 이력이 없습니다 — 기간·판정 조건을 바꿔보세요.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {st.sorted.length > 0 && (
          <div className={s.pager}>
            <button type="button" className={`btn-text ${s.smallBtn}`}
              disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>이전</button>
            <span className={s.pagerInfo}>
              {safePage} / {totalPages} · 전체 {st.sorted.length}건
            </span>
            <button type="button" className={`btn-text ${s.smallBtn}`}
              disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>다음</button>
          </div>
        )}
      </div>
    </div>
  )
}
