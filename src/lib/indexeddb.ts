const DB_NAME = 'pokemon-tcg-db'
const DB_VERSION = 1

export interface DBStores {
  cards: 'cards'
  sets: 'sets'
  metadata: 'metadata'
}

export const STORES: DBStores = {
  cards: 'cards',
  sets: 'sets',
  metadata: 'metadata'
}

let dbInstance: IDBDatabase | null = null

export async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'))
    }

    request.onsuccess = () => {
      dbInstance = request.result
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(STORES.cards)) {
        const cardsStore = db.createObjectStore(STORES.cards, { keyPath: 'id' })
        cardsStore.createIndex('name', 'name', { unique: false })
        cardsStore.createIndex('setId', 'set.id', { unique: false })
        cardsStore.createIndex('number', 'number', { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.sets)) {
        const setsStore = db.createObjectStore(STORES.sets, { keyPath: 'id' })
        setsStore.createIndex('name', 'name', { unique: false })
        setsStore.createIndex('series', 'series', { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.metadata)) {
        db.createObjectStore(STORES.metadata, { keyPath: 'key' })
      }
    }
  })
}

export async function clearStore(storeName: keyof DBStores): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES[storeName], 'readwrite')
    const store = transaction.objectStore(STORES[storeName])
    const request = store.clear()

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to clear ${storeName}`))
  })
}

export async function bulkPut<T>(storeName: keyof DBStores, items: T[]): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES[storeName], 'readwrite')
    const store = transaction.objectStore(STORES[storeName])

    let completed = 0
    const total = items.length

    for (const item of items) {
      const request = store.put(item)
      request.onsuccess = () => {
        completed++
        if (completed === total) {
          resolve()
        }
      }
      request.onerror = () => {
        reject(new Error(`Failed to put item in ${storeName}`))
      }
    }

    if (items.length === 0) {
      resolve()
    }
  })
}

export async function getAll<T>(storeName: keyof DBStores): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES[storeName], 'readonly')
    const store = transaction.objectStore(STORES[storeName])
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(new Error(`Failed to get all from ${storeName}`))
  })
}

export async function get<T>(storeName: keyof DBStores, key: string): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES[storeName], 'readonly')
    const store = transaction.objectStore(STORES[storeName])
    const request = store.get(key)

    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(new Error(`Failed to get from ${storeName}`))
  })
}

export async function put<T>(storeName: keyof DBStores, item: T): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES[storeName], 'readwrite')
    const store = transaction.objectStore(STORES[storeName])
    const request = store.put(item)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error(`Failed to put in ${storeName}`))
  })
}

export async function searchByIndex<T>(
  storeName: keyof DBStores,
  indexName: string,
  query: string | IDBKeyRange
): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES[storeName], 'readonly')
    const store = transaction.objectStore(STORES[storeName])
    const index = store.index(indexName)
    const request = index.getAll(query)

    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(new Error(`Failed to search ${storeName} by ${indexName}`))
  })
}

export async function count(storeName: keyof DBStores): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES[storeName], 'readonly')
    const store = transaction.objectStore(STORES[storeName])
    const request = store.count()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error(`Failed to count ${storeName}`))
  })
}

export async function deleteDatabase(): Promise<void> {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Failed to delete database'))
  })
}
