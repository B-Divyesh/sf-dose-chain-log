import { describe, expect, it } from 'vitest'
import { dueLabel, formatInterval, localDay, logsToCsv, scheduledAt, type LogEntry } from './data'

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
