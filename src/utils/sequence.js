const counters = {}

function getToday() {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return { dateStr: `${yy}${mm}${dd}`, key: `${yy}${mm}${dd}` }
}

export async function fetchSequence(process) {
  const { dateStr, key } = getToday()
  const cacheKey = `${process}-${key}`

  if (!counters[cacheKey]) {
    counters[cacheKey] = 0
  }
  counters[cacheKey] += 1

  return {
    date: dateStr,
    order: String(counters[cacheKey]).padStart(2, '0'),
  }
}


