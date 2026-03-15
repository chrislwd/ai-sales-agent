import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all external dependencies
vi.mock('../../../db/index.js', () => {
  const mockDb = {
    query: {
      contacts: { findFirst: vi.fn() },
      sequenceEnrollments: { findFirst: vi.fn() },
      sequences: { findFirst: vi.fn() },
      messages: { findFirst: vi.fn() },
      sequenceSteps: { findMany: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
  // chain returning()
  const chain = { returning: vi.fn().mockResolvedValue([{ id: 'mock-id' }]) }
  mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue(chain) })
  mockDb.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{}]) }),
    }),
  })
  return {
    db: mockDb,
    contacts: {},
    sequenceEnrollments: {},
    sequences: {},
    messages: {},
    sequenceSteps: {},
    eq: vi.fn((a, b) => ({ a, b })),
    and: vi.fn((...args) => args),
  }
})

vi.mock('../../../queues/index.js', () => ({
  scheduleNextStep: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../analytics/activity.js', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { enrollContact } from '../sequences.service.js'
import { db } from '../../../db/index.js'
import { scheduleNextStep } from '../../../queues/index.js'

const mockContact = {
  id: 'cnt-1',
  workspaceId: 'ws-1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  unsubscribed: false,
  doNotContact: false,
}

describe('Sequence Enrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset insert chain
    const chain = { returning: vi.fn().mockResolvedValue([{ id: 'enroll-1' }]) }
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockReturnValue(chain) } as any)
  })

  it('creates enrollment for valid contact', async () => {
    vi.mocked(db.query.contacts.findFirst).mockResolvedValue(mockContact as any)
    vi.mocked(db.query.sequenceEnrollments.findFirst).mockResolvedValue(undefined) // not enrolled

    await enrollContact('seq-1', 'cnt-1', 'user-1')

    expect(db.insert).toHaveBeenCalled()
    expect(scheduleNextStep).toHaveBeenCalledWith('enroll-1')
  })

  it('throws for unsubscribed contacts', async () => {
    vi.mocked(db.query.contacts.findFirst).mockResolvedValue({
      ...mockContact,
      unsubscribed: true,
    } as any)

    await expect(enrollContact('seq-1', 'cnt-1')).rejects.toThrow('Contact is suppressed')
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('throws for do-not-contact contacts', async () => {
    vi.mocked(db.query.contacts.findFirst).mockResolvedValue({
      ...mockContact,
      doNotContact: true,
    } as any)

    await expect(enrollContact('seq-1', 'cnt-1')).rejects.toThrow('Contact is suppressed')
  })

  it('throws when contact not found', async () => {
    vi.mocked(db.query.contacts.findFirst).mockResolvedValue(undefined)
    await expect(enrollContact('seq-1', 'bad-id')).rejects.toThrow('Contact not found')
  })

  it('throws when already enrolled', async () => {
    vi.mocked(db.query.contacts.findFirst).mockResolvedValue(mockContact as any)
    vi.mocked(db.query.sequenceEnrollments.findFirst).mockResolvedValue({ id: 'existing' } as any)

    await expect(enrollContact('seq-1', 'cnt-1')).rejects.toThrow('Already enrolled')
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('schedules first step immediately', async () => {
    vi.mocked(db.query.contacts.findFirst).mockResolvedValue(mockContact as any)
    vi.mocked(db.query.sequenceEnrollments.findFirst).mockResolvedValue(undefined)

    await enrollContact('seq-1', 'cnt-1')

    expect(scheduleNextStep).toHaveBeenCalledWith('enroll-1') // no delay for first step
  })
})
