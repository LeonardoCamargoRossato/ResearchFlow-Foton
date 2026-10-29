import type { ResearchReport } from '../models/ResearchReport'

const DB_NAME = 'researchflow-foton'
const STORE = 'reports'
const DB_VERSION = 1

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const withStore = async <T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = callback(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => reject(tx.error)
  })
}

export const reportRepository = {
  async list(): Promise<ResearchReport[]> {
    const reports = await withStore<ResearchReport[]>('readonly', (store) => store.getAll())
    return reports.filter((report) => report.status !== 'deleted' && !report.deletedByResearcher)
  },

  async save(report: ResearchReport): Promise<void> {
    await withStore<IDBValidKey>('readwrite', (store) => store.put(report))
  },

  async softDelete(report: ResearchReport): Promise<void> {
    await this.save({ ...report, status: 'deleted', deletedByResearcher: true })
  }
}
