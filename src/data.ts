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
const followUpIntervals = new Set([15, 30, 60, 120, 240, 360, 480, 720, 1440])
const doseStatuses = new Set<DoseStatus>(['taken', 'skipped', 'late'])
const followUpStatuses = new Set<FollowUp['status']>(['pending', 'taken', 'skipped'])

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalidBackup(detail: string): never {
  throw new Error(`This backup has invalid ${detail}. Your current log was not changed.`)
}

function requiredString(record: Record<string, unknown>, field: string, detail: string): string {
  const value = record[field]
  if (typeof value !== 'string' || !value.trim()) invalidBackup(detail)
  return value
}

function requiredTimestamp(record: Record<string, unknown>, field: string, detail: string): string {
  const value = requiredString(record, field, detail)
  if (!Number.isFinite(Date.parse(value))) invalidBackup(detail)
  return value
}

function requiredTime(record: Record<string, unknown>, field: string, detail: string): string {
  const value = requiredString(record, field, detail)
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) invalidBackup(detail)
  return value
}

function validateWindow(value: unknown, index: number): DoseWindow {
  const detail = `window ${index + 1}`
  if (!isRecord(value)) invalidBackup(detail)
  if (!Array.isArray(value.medicines) || value.medicines.length === 0) invalidBackup(`${detail} medicines`)
  const medicines = value.medicines.map((medicine, medicineIndex): Medicine => {
    if (!isRecord(medicine)) invalidBackup(`${detail} medicine ${medicineIndex + 1}`)
    const interval = medicine.followUpMinutes
    if (interval !== null && (typeof interval !== 'number' || !followUpIntervals.has(interval))) {
      invalidBackup(`${detail} medicine ${medicineIndex + 1} follow-up interval`)
    }
    return {
      id: requiredString(medicine, 'id', `${detail} medicine ${medicineIndex + 1} ID`),
      label: requiredString(medicine, 'label', `${detail} medicine ${medicineIndex + 1} label`),
      followUpMinutes: interval,
    }
  })
  const medicineIds = new Set<string>()
  const medicineLabels = new Set<string>()
  for (const medicine of medicines) {
    if (medicineIds.has(medicine.id)) invalidBackup(`${detail} duplicate medicine IDs`)
    if (medicineLabels.has(medicine.label.trim().toLowerCase())) invalidBackup(`${detail} duplicate medicine labels`)
    medicineIds.add(medicine.id)
    medicineLabels.add(medicine.label.trim().toLowerCase())
  }
  return {
    id: requiredString(value, 'id', `${detail} ID`),
    label: requiredString(value, 'label', `${detail} label`),
    time: requiredTime(value, 'time', `${detail} planned time`),
    medicines,
    createdAt: requiredTimestamp(value, 'createdAt', `${detail} creation time`),
  }
}

function validateLog(value: unknown, index: number): LogEntry {
  const detail = `event ${index + 1}`
  if (!isRecord(value)) invalidBackup(detail)
  const status = requiredString(value, 'status', `${detail} status`)
  if (!doseStatuses.has(status as DoseStatus)) invalidBackup(`${detail} status`)
  const sourceFollowUpId = value.sourceFollowUpId
  if (sourceFollowUpId !== undefined && (typeof sourceFollowUpId !== 'string' || !sourceFollowUpId.trim())) {
    invalidBackup(`${detail} source follow-up ID`)
  }
  return {
    id: requiredString(value, 'id', `${detail} ID`),
    windowId: requiredString(value, 'windowId', `${detail} window ID`),
    windowLabel: requiredString(value, 'windowLabel', `${detail} window label`),
    medicineId: requiredString(value, 'medicineId', `${detail} medicine ID`),
    medicineLabel: requiredString(value, 'medicineLabel', `${detail} medicine label`),
    status: status as DoseStatus,
    scheduledFor: requiredTimestamp(value, 'scheduledFor', `${detail} scheduled time`),
    recordedAt: requiredTimestamp(value, 'recordedAt', `${detail} recorded time`),
    ...(sourceFollowUpId === undefined ? {} : { sourceFollowUpId }),
  }
}

function validateFollowUp(value: unknown, index: number): FollowUp {
  const detail = `follow-up ${index + 1}`
  if (!isRecord(value)) invalidBackup(detail)
  const status = requiredString(value, 'status', `${detail} status`)
  if (!followUpStatuses.has(status as FollowUp['status'])) invalidBackup(`${detail} status`)
  const interval = value.intervalMinutes
  if (typeof interval !== 'number' || !followUpIntervals.has(interval)) invalidBackup(`${detail} interval`)
  const completedAt = value.completedAt
  if (status === 'pending' && completedAt !== undefined) invalidBackup(`${detail} completion time`)
  if (status !== 'pending' && (typeof completedAt !== 'string' || !completedAt.trim() || !Number.isFinite(Date.parse(completedAt)))) {
    invalidBackup(`${detail} completion time`)
  }
  return {
    id: requiredString(value, 'id', `${detail} ID`),
    sourceLogId: requiredString(value, 'sourceLogId', `${detail} source event ID`),
    windowId: requiredString(value, 'windowId', `${detail} window ID`),
    medicineId: requiredString(value, 'medicineId', `${detail} medicine ID`),
    medicineLabel: requiredString(value, 'medicineLabel', `${detail} medicine label`),
    dueAt: requiredTimestamp(value, 'dueAt', `${detail} due time`),
    intervalMinutes: interval,
    status: status as FollowUp['status'],
    ...(completedAt === undefined ? {} : { completedAt: completedAt as string }),
  }
}

function assertUniqueIds(records: Array<{ id: string }>, name: string): void {
  const ids = new Set<string>()
  for (const record of records) {
    if (ids.has(record.id)) invalidBackup(`duplicate ${name} IDs`)
    ids.add(record.id)
  }
}

/** Validates a v1 backup completely before import can open a write transaction. */
export function validateBackup(value: unknown): Backup {
  if (!isRecord(value)) throw new Error('This is not a Dose Chain Log backup.')
  if (value.version !== 1 || !Array.isArray(value.windows) || !Array.isArray(value.logs) || !Array.isArray(value.followUps)) {
    throw new Error('This backup version is not supported.')
  }
  const exportedAt = requiredTimestamp(value, 'exportedAt', 'export time')
  const windows = value.windows.map(validateWindow)
  const logs = value.logs.map(validateLog)
  const followUps = value.followUps.map(validateFollowUp)
  assertUniqueIds(windows, 'window')
  assertUniqueIds(logs, 'event')
  assertUniqueIds(followUps, 'follow-up')

  const logsById = new Map(logs.map(log => [log.id, log]))
  const followUpsById = new Map(followUps.map(followUp => [followUp.id, followUp]))
  for (const followUp of followUps) {
    const sourceLog = logsById.get(followUp.sourceLogId)
    if (!sourceLog || sourceLog.status === 'skipped' || sourceLog.windowId !== followUp.windowId || sourceLog.medicineId !== followUp.medicineId || sourceLog.medicineLabel !== followUp.medicineLabel) {
      invalidBackup(`follow-up source event reference`)
    }
  }
  for (const log of logs) {
    if (!log.sourceFollowUpId) continue
    const sourceFollowUp = followUpsById.get(log.sourceFollowUpId)
    if (!sourceFollowUp || sourceFollowUp.status === 'pending' || sourceFollowUp.windowId !== log.windowId || sourceFollowUp.medicineId !== log.medicineId || sourceFollowUp.medicineLabel !== log.medicineLabel || sourceFollowUp.status !== log.status) {
      invalidBackup(`event source follow-up reference`)
    }
  }
  // Windows can be removed while their factual events and active chains remain.
  // Those historic references are intentionally valid and must survive export/import.
  return { version: 1, exportedAt, windows, logs, followUps }
}

export async function importBackup(value: unknown): Promise<void> {
  const backup = validateBackup(value)
  const database = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(stores, 'readwrite')
    for (const store of stores) tx.objectStore(store).clear()
    for (const item of backup.windows) tx.objectStore('windows').put(item)
    for (const item of backup.logs) tx.objectStore('logs').put(item)
    for (const item of backup.followUps) tx.objectStore('followUps').put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Could not import that backup.'))
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
