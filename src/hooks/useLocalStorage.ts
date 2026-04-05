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
        // handled here: if the expected type is a string, treat the raw value as the
        // stored string, then rewrite it as JSON so future reads succeed.
        if (typeof initialValue === 'string') {
          try { window.localStorage.setItem(key, JSON.stringify(item)) } catch { /* ignore */ }
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
