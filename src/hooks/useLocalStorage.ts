import { useState, useCallback } from 'react'

type Updater<T> = T | ((prev: T) => T)

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: Updater<T>) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      if (item === null) return initialValue
      try {
        return JSON.parse(item) as T
      } catch {
        // Legacy plain-string values (stored before useLocalStorage adopted JSON) are
        // handled here: if the raw item is a string (localStorage always returns strings),
        // treat it as the stored value and rewrite it as JSON so future reads succeed.
        // The migration write is best-effort: failure is acceptable because the value is
        // already in memory and will be rewritten to JSON on the next setValue call.
        if (typeof item === 'string' && typeof initialValue === 'string') {
          try { window.localStorage.setItem(key, JSON.stringify(item)) } catch { /* best-effort migration */ }
          return item as unknown as T
        }
        return initialValue
      }
    } catch {
      // Ignore storage access errors (e.g. private browsing) and fall back to the initial value
      return initialValue
    }
  })

  const setValue = useCallback(
    (value: Updater<T>) => {
      setStoredValue((prev) => {
        const newValue = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value
        try {
          window.localStorage.setItem(key, JSON.stringify(newValue))
        } catch {
          // ignore write errors (e.g. private browsing quota exceeded)
        }
        return newValue
      })
    },
    [key],
  )

  return [storedValue, setValue]
}
