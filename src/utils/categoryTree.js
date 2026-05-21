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
