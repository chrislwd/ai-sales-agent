import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock DB ────────────────────────────────────────────────────────────────

const mockMessage = {
  id: 'msg-1',
  contactId: 'cnt-1',
  enrollmentId: 'enroll-1',
  externalMessageId: 'ext-msg-1',
  enrollment: {
    id: 'enroll-1',
    sequence: { workspaceId: 'ws-1' },
  },
  contact: {
    id: 'cnt-1',
  },
}

vi.mock('../../../db/index.js', () => {
  const mockDb = {
    query: {
      messages: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
  // chain: update().set().where()
  mockDb.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{}]),
    }),
  })
  // chain: insert().values().returning()
  const insertChain = {
    returning: vi.fn().mockResolvedValue([{ id: 'reply-1' }]),
  }
  mockDb.insert.mockReturnValue({
    values: vi.fn().mockReturnValue(insertChain),
  })
  return {
    db: mockDb,
    messages: { id: 'messages.id', externalMessageId: 'messages.externalMessageId' },
    replies: { id: 'replies.id' },
    contacts: { id: 'contacts.id' },
    sequenceEnrollments: { id: 'sequenceEnrollments.id' },
    eq: vi.fn((a, b) => ({ a, b })),
    and: vi.fn((...args: unknown[]) => args),
  }
})

vi.mock('../../../ai/reply-classifier.js', () => ({
  classifyReply: vi.fn(),
}))

vi.mock('../../analytics/activity.js', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-secret-at-least-16',
    JWT_REFRESH_SECRET: 'test-refresh-secret-16',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  },
}))

import Fastify from 'fastify'
import { webhookRoutes } from '../webhook.routes.js'
import { db } from '../../../db/index.js'
import { classifyReply } from '../../../ai/reply-classifier.js'
import { logActivity } from '../../analytics/activity.js'

function buildApp() {
  const app = Fastify({ logger: false })
  app.register(webhookRoutes)
  return app
}

describe('Webhook — open event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates openedAt on open event', async () => {
    vi.mocked(db.query.messages.findFirst).mockResolvedValue(mockMessage as any)
    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{}]) })
    vi.mocked(db.update).mockReturnValue({ set: setMock } as any)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/email/open',
      payload: { messageId: 'ext-msg-1' },
    })

    expect(res.statusCode).toBe(200)
    expect(db.update).toHaveBeenCalled()
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ openedAt: expect.any(Date) }),
    )
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: 'email_opened' }),
    )
  })
})

describe('Webhook — click event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates clickedAt on click event', async () => {
    vi.mocked(db.query.messages.findFirst).mockResolvedValue(mockMessage as any)
    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{}]) })
    vi.mocked(db.update).mockReturnValue({ set: setMock } as any)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/email/click',
      payload: { messageId: 'ext-msg-1' },
    })

    expect(res.statusCode).toBe(200)
    expect(db.update).toHaveBeenCalled()
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ clickedAt: expect.any(Date) }),
    )
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: 'email_clicked' }),
    )
  })
})

describe('Webhook — bounce event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates message status and enrollment on bounce', async () => {
    vi.mocked(db.query.messages.findFirst).mockResolvedValue(mockMessage as any)
    const whereMock = vi.fn().mockResolvedValue([{}])
    const setMock = vi.fn().mockReturnValue({ where: whereMock })
    vi.mocked(db.update).mockReturnValue({ set: setMock } as any)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/email/bounce',
      payload: { messageId: 'ext-msg-1' },
    })

    expect(res.statusCode).toBe(200)
    // message update (bouncedAt + status) + enrollment update (status: bounced)
    expect(db.update).toHaveBeenCalledTimes(2)
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ bouncedAt: expect.any(Date), status: 'bounced' }),
    )
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'bounced' }),
    )
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: 'email_bounced' }),
    )
  })
})

describe('Webhook — reply event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset insert chain
    const insertChain = { returning: vi.fn().mockResolvedValue([{ id: 'reply-1' }]) }
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockReturnValue(insertChain) } as any)
    // Reset update chain
    const whereMock = vi.fn().mockResolvedValue([{}])
    const setMock = vi.fn().mockReturnValue({ where: whereMock })
    vi.mocked(db.update).mockReturnValue({ set: setMock } as any)
  })

  it('sets contact.unsubscribed on unsubscribe intent', async () => {
    vi.mocked(db.query.messages.findFirst).mockResolvedValue(mockMessage as any)
    vi.mocked(classifyReply).mockResolvedValue({
      intent: 'unsubscribe',
      confidence: 0.95,
      requiresHumanReview: false,
      suggestedAction: 'Remove from all sequences',
    } as any)

    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{}]) })
    vi.mocked(db.update).mockReturnValue({ set: setMock } as any)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/email/reply',
      payload: { messageId: 'ext-msg-1', body: 'Please unsubscribe me' },
    })

    expect(res.statusCode).toBe(200)
    expect(classifyReply).toHaveBeenCalledWith('Please unsubscribe me')
    // Should update contacts with unsubscribed: true
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ unsubscribed: true, unsubscribedAt: expect.any(Date) }),
    )
  })

  it('updates lifecycleStatus on interested intent', async () => {
    vi.mocked(db.query.messages.findFirst).mockResolvedValue(mockMessage as any)
    vi.mocked(classifyReply).mockResolvedValue({
      intent: 'interested',
      confidence: 0.85,
      requiresHumanReview: false,
      suggestedAction: 'Schedule a call',
    } as any)

    const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{}]) })
    vi.mocked(db.update).mockReturnValue({ set: setMock } as any)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/email/reply',
      payload: { messageId: 'ext-msg-1', body: 'This sounds interesting!' },
    })

    expect(res.statusCode).toBe(200)
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycleStatus: 'replied' }),
    )
  })
})

describe('Webhook — unknown messageId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 when messageId not found (no error thrown)', async () => {
    vi.mocked(db.query.messages.findFirst).mockResolvedValue(undefined)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/email/open',
      payload: { messageId: 'unknown-ext-id' },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ ok: true })
    // Should NOT have called update since message wasn't found
    expect(db.update).not.toHaveBeenCalled()
    expect(logActivity).not.toHaveBeenCalled()
  })
})
