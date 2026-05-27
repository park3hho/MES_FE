// utils/categoryTree.js
// 분류 트리(대>중>소) 순수 헬퍼 (2026-05-21).
// ItemManagePage 내부 함수에서 분리.
//
// 사용처:
//   - ItemManagePage: CategoryManager reassign 옵션, ItemEditor 캐스케이드 선택
//   - (향후) BomManagePage 카테고리 필터 등

/**
 * 트리를 id→node, id→parentId 의 두 dict 로 평탄화.
 * @param tree - 루트 노드 배열, 각 노드는 { id, name, children?: [...] }
 * @returns { byId, parentOf }
 */
export function flattenTree(tree) {
  const byId = {}
  const parentOf = {}
  const walk = (nodes, pid) =>
    (nodes || []).forEach((n) => {
      byId[n.id] = n
      parentOf[n.id] = pid
      if (n.children?.length) walk(n.children, n.id)
    })
  walk(tree, null)
  return { byId, parentOf }
}

/**
 * 노드 id 의 경로 문자열 ("대분류 › 중분류 › 소분류").
 * @param id - 노드 id
 * @param byId - flattenTree 결과
 * @param parentOf - flattenTree 결과
 * @returns 경로 문자열. 루트까지 가지 못하면 부분 경로.
 */
export function pathOf(id, byId, parentOf) {
  const names = []
  let cur = id
  let guard = 0
  while (cur != null && byId[cur] && guard < 8) {
    names.unshift(byId[cur].name)
    cur = parentOf[cur]
    guard += 1
  }
  return names.join(' › ')
}

/**
 * 트리를 select 옵션 배열로 평탄화 (계층은 들여쓰기로 표시).
 * @param tree - 루트 노드 배열
 * @returns [{ id, label: "  중분류" }, ...]
 */
export function flatOptions(tree, depth = 0, acc = []) {
  ;(tree || []).forEach((n) => {
    acc.push({ id: n.id, label: `${'  '.repeat(depth)}${n.name}` })
    if (n.children?.length) flatOptions(n.children, depth + 1, acc)
  })
  return acc
}

/**
 * 품목번호 풀 식별코드 합성 — 분류 약자 + part_no + reserved + etc (사진1 형식, 2026-05-26).
 *   예: "F-ASD-0001A-123" (대분류-중분류-품목번호+예비-기타). 비어있는 부분은 자동 생략.
 *   분류 미지정 시 part_no 단독 반환. ItemManagePage 리스트·BomManagePage 리스트 공통 사용.
 * @param item - { part_no, category_id, reserved, etc }
 * @param byId - flattenTree 결과
 * @param parentOf - flattenTree 결과
 */
export function composeFullCode(item, byId, parentOf) {
  if (!item || !item.part_no) return item?.part_no || ''
  let lvl1Code = ''
  let lvl2Code = ''
  let cur = item.category_id
  let guard = 0
  while (cur != null && byId[cur] && guard < 8) {
    const node = byId[cur]
    if (node.level === 1) lvl1Code = node.code || ''
    else if (node.level === 2) lvl2Code = node.code || ''
    cur = parentOf[cur]
    guard += 1
  }
  const middle = `${item.part_no}${item.reserved || ''}`
  const tail = item.etc || ''
  const head = [lvl1Code, lvl2Code].filter((x) => x).join('-')
  if (!head) return tail ? `${middle}-${tail}` : middle
  const composed = `${head}-${middle}`
  return tail ? `${composed}-${tail}` : composed
}
