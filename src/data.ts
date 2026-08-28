export type DoseStatus = 'taken' | 'skipped' | 'late'

export interface Medicine {
  id: string
  label: string
  followUpMinutes: number | null
}

export interface DoseWindow {
  id: string
  label: string
  time: string
  medicines: Medicine[]
  createdAt: string
}

export interface LogEntry {
  id: string
  windowId: string
  windowLabel: string
  medicineId: string
  medicineLabel: string
  status: DoseStatus
  scheduledFor: string
  recordedAt: string
  sourceFollowUpId?: string
}

export interface FollowUp {
  id: string
  sourceLogId: string
  windowId: string
  medicineId: string
  medicineLabel: string
  dueAt: string
  intervalMinutes: number
  status: 'pending' | 'taken' | 'skipped'
  completedAt?: string
}

export interface Backup {
  version: 1
  exportedAt: string
  windows: DoseWindow[]
  logs: LogEntry[]
  followUps: FollowUp[]
}

const DB_NAME = 'dose-chain-log'
const DB_VERSION = 1
const stores = ['windows', 'logs', 'followUps'] as const
type StoreName = (typeof stores)[number]

let dbPromise: Promise<IDBDatabase> | undefined

function db(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      for (const store of stores) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open the local log.'))
  })
  return dbPromise
}

async function all<T>(store: StoreName): Promise<T[]> {
  const database = await db()
  return new Promise((resolve, reject) => {
    const request = database.transaction(store).objectStore(store).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

async function put<T>(store: StoreName, value: T): Promise<void> {
  const database = await db()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite')
    tx.objectStore(store).put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function remove(store: StoreName, id: string): Promise<void> {
  const database = await db()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite')
    tx.objectStore(store).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const uid = (): string => crypto.randomUUID()

export function localDay(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function scheduledAt(time: string, day = new Date()): Date {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  const date = new Date(day)
  date.setHours(hours, minutes, 0, 0)
  return date
}

export function dueLabel(target: Date, now = new Date()): string {
  const minutes = Math.round((target.getTime() - now.getTime()) / 60_000)
  if (Math.abs(minutes) < 1) return 'due now'
  if (minutes > 0) return `in ${formatInterval(minutes)}`
  return `${formatInterval(Math.abs(minutes))} ago`
}

export function formatInterval(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes} min`
  if (!minutes) return `${hours} hr`
  return `${hours} hr ${minutes} min`
}

export async function getSnapshot(): Promise<Backup> {
  const [windows, logs, followUps] = await Promise.all([
    all<DoseWindow>('windows'), all<LogEntry>('logs'), all<FollowUp>('followUps'),
  ])
  return { version: 1, exportedAt: new Date().toISOString(), windows, logs, followUps }
}

export async function saveWindow(window: DoseWindow): Promise<void> {
  await put('windows', window)
}

export async function deleteWindow(id: string): Promise<DoseWindow | undefined> {
  const windows = await all<DoseWindow>('windows')
  const target = windows.find(window => window.id === id)
  if (target) await remove('windows', id)
  return target
}

export async function logWindow(window: DoseWindow, status: DoseStatus, when = new Date()): Promise<{ logs: LogEntry[]; followUps: FollowUp[] }> {
  const dayTime = scheduledAt(window.time, when).toISOString()
  const logs: LogEntry[] = window.medicines.map(medicine => ({
    id: uid(), windowId: window.id, windowLabel: window.label, medicineId: medicine.id,
    medicineLabel: medicine.label, status, scheduledFor: dayTime, recordedAt: when.toISOString(),
  }))
  const followUps: FollowUp[] = status === 'skipped' ? [] : logs.flatMap(log => {
    const medicine = window.medicines.find(item => item.id === log.medicineId)
    if (!medicine?.followUpMinutes) return []
    return [{
      id: uid(), sourceLogId: log.id, windowId: window.id, medicineId: medicine.id,
      medicineLabel: medicine.label,
      dueAt: new Date(when.getTime() + medicine.followUpMinutes * 60_000).toISOString(),
      intervalMinutes: medicine.followUpMinutes, status: 'pending' as const,
    }]
  })
  await Promise.all([...logs.map(log => put('logs', log)), ...followUps.map(followUp => put('followUps', followUp))])
  return { logs, followUps }
}

export async function undoGroup(logIds: string[], followUpIds: string[]): Promise<void> {
  await Promise.all([...logIds.map(id => remove('logs', id)), ...followUpIds.map(id => remove('followUps', id))])
}

export async function completeFollowUp(followUp: FollowUp, status: 'taken' | 'skipped', when = new Date()): Promise<{ log: LogEntry; next?: FollowUp }> {
  const snapshot = await getSnapshot()
  const window = snapshot.windows.find(item => item.id === followUp.windowId)
  const medicine = window?.medicines.find(item => item.id === followUp.medicineId)
  const completed = { ...followUp, status, completedAt: when.toISOString() }
  const log: LogEntry = {
    id: uid(), windowId: followUp.windowId, windowLabel: window?.label ?? 'Follow-up',
    medicineId: followUp.medicineId, medicineLabel: followUp.medicineLabel,
    status, scheduledFor: followUp.dueAt, recordedAt: when.toISOString(), sourceFollowUpId: followUp.id,
  }
  const next = status === 'taken' && medicine?.followUpMinutes ? {
    id: uid(), sourceLogId: log.id, windowId: followUp.windowId, medicineId: followUp.medicineId,
    medicineLabel: followUp.medicineLabel,
    dueAt: new Date(when.getTime() + medicine.followUpMinutes * 60_000).toISOString(),
    intervalMinutes: medicine.followUpMinutes, status: 'pending' as const,
  } : undefined
  await Promise.all([put('followUps', completed), put('logs', log), ...(next ? [put('followUps', next)] : [])])
  return { log, next }
}

export async function undoFollowUp(followUp: FollowUp, logId: string, nextId?: string): Promise<void> {
  await Promise.all([put('followUps', followUp), remove('logs', logId), ...(nextId ? [remove('followUps', nextId)] : [])])
}

export async function importBackup(value: unknown): Promise<void> {
  if (!value || typeof value !== 'object') throw new Error('This is not a Dose Chain Log backup.')
  const backup = value as Partial<Backup>
  if (backup.version !== 1 || !Array.isArray(backup.windows) || !Array.isArray(backup.logs) || !Array.isArray(backup.followUps)) {
    throw new Error('This backup version is not supported.')
  }
  const database = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(stores, 'readwrite')
    for (const store of stores) tx.objectStore(store).clear()
    for (const item of backup.windows!) tx.objectStore('windows').put(item)
    for (const item of backup.logs!) tx.objectStore('logs').put(item)
    for (const item of backup.followUps!) tx.objectStore('followUps').put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

export function logsToCsv(logs: LogEntry[]): string {
  const head = ['recorded_at', 'scheduled_for', 'window', 'medicine', 'status']
  const rows = logs.map(log => [log.recordedAt, log.scheduledFor, log.windowLabel, log.medicineLabel, log.status])
  return [head, ...rows].map(row => row.map(csvCell).join(',')).join('\n')
}
