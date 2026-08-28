import { describe, expect, it } from 'vitest'
import { dueLabel, formatInterval, localDay, logsToCsv, scheduledAt, validateBackup, type Backup, type LogEntry } from './data'

const validBackup = (): Backup => ({
  version: 1,
  exportedAt: '2026-08-28T08:00:00.000Z',
  windows: [{
    id: 'window-1', label: 'Morning', time: '08:00', createdAt: '2026-08-28T07:00:00.000Z',
    medicines: [{ id: 'medicine-1', label: 'Medicine A', followUpMinutes: 15 }],
  }],
  logs: [{
    id: 'log-1', windowId: 'window-1', windowLabel: 'Morning', medicineId: 'medicine-1', medicineLabel: 'Medicine A',
    status: 'taken', scheduledFor: '2026-08-28T08:00:00.000Z', recordedAt: '2026-08-28T08:01:00.000Z',
  }],
  followUps: [{
    id: 'follow-1', sourceLogId: 'log-1', windowId: 'window-1', medicineId: 'medicine-1', medicineLabel: 'Medicine A',
    dueAt: '2026-08-28T08:16:00.000Z', intervalMinutes: 15, status: 'pending',
  }],
})

describe('dose time helpers', () => {
  it('formats actual-time intervals without fractional units', () => {
    expect(formatInterval(15)).toBe('15 min')
    expect(formatInterval(120)).toBe('2 hr')
    expect(formatInterval(135)).toBe('2 hr 15 min')
  })

  it('anchors a planned time to the local day', () => {
    const day = new Date(2026, 7, 28, 21, 40)
    const result = scheduledAt('08:15', day)
    expect(result.getHours()).toBe(8)
    expect(result.getMinutes()).toBe(15)
    expect(localDay(result)).toBe('2026-08-28')
  })

  it('describes relative due time', () => {
    const now = new Date('2026-08-28T08:00:00Z')
    expect(dueLabel(new Date('2026-08-28T08:30:00Z'), now)).toBe('in 30 min')
    expect(dueLabel(new Date('2026-08-28T07:00:00Z'), now)).toBe('1 hr ago')
  })
})

describe('CSV export', () => {
  it('quotes user labels safely', () => {
    const log: LogEntry = {
      id: '1', windowId: 'w', windowLabel: 'Morning, main', medicineId: 'm',
      medicineLabel: 'Label "A"', status: 'taken',
      scheduledFor: '2026-08-28T08:00:00.000Z', recordedAt: '2026-08-28T08:04:00.000Z',
    }
    const csv = logsToCsv([log])
    expect(csv).toContain('"Morning, main"')
    expect(csv).toContain('"Label ""A"""')
  })
})

describe('backup validation', () => {
  it('rejects malformed window, event, and follow-up records before import', () => {
    const malformedWindow = validBackup()
    malformedWindow.windows = [{ id: 'bad' } as never]
    expect(() => validateBackup(malformedWindow)).toThrow(/invalid window 1 medicines/i)

    const malformedLog = validBackup()
    malformedLog.logs[0] = { ...malformedLog.logs[0]!, status: 'unknown' as never }
    expect(() => validateBackup(malformedLog)).toThrow(/invalid event 1 status/i)

    const malformedFollowUp = validBackup()
    malformedFollowUp.followUps[0] = { ...malformedFollowUp.followUps[0]!, sourceLogId: 'missing-log' }
    expect(() => validateBackup(malformedFollowUp)).toThrow(/invalid follow-up source event reference/i)
  })

  it('accepts factual history that remains after a window is deleted', () => {
    const backup = validBackup()
    backup.windows = []
    expect(validateBackup(backup)).toEqual(backup)
  })
})
