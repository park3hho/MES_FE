import { useState, useEffect } from 'react'

function getDate() {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

export function useDate() {
  const [date, setDate] = useState(getDate())

  useEffect(() => {
    const now = new Date()
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now
    const t = setTimeout(() => setDate(getDate()), msUntilMidnight)
    return () => clearTimeout(t)
  }, [date])

  return date
}
