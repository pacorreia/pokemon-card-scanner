import { useState, useCallback } from 'react'

type Updater<T> = T | ((prev: T) => T)

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: Updater<T>) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item !== null ? (JSON.parse(item) as T) : initialValue
    } catch {
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
