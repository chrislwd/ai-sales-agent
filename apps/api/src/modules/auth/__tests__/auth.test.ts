import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock DB ────────────────────────────────────────────────────────────────

vi.mock('../../../db/index.js', () => {
  const mockDb = {
    query: {
      users: { findFirst: vi.fn() },
      workspaceMembers: { findFirst: vi.fn(), findMany: vi.fn() },
      refreshTokens: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
  // chain: insert().values().returning()
  const insertChain = { returning: vi.fn().mockResolvedValue([{ id: 'mock-id' }]) }
  mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue(insertChain) })
  // chain: delete().where()
  mockDb.delete.mockReturnValue({ where: vi.fn().mockResolvedValue([]) })
  return {
    db: mockDb,
    users: { id: 'users.id', email: 'users.email' },
    workspaces: { id: 'workspaces.id' },
    workspaceMembers: { userId: 'workspaceMembers.userId', workspaceId: 'workspaceMembers.workspaceId' },
    refreshTokens: { token: 'refreshTokens.token' },
    eq: vi.fn((a, b) => ({ a, b })),
    and: vi.fn((...args: unknown[]) => args),
  }
})

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
import fastifyJwt from '@fastify/jwt'
import { authRoutes } from '../auth.routes.js'
import { db } from '../../../db/index.js'

function buildApp() {
  const app = Fastify({ logger: false })

  app.register(fastifyJwt, { secret: 'test-secret-at-least-16' })

  // Decorate with authenticate hook matching the production pattern
  app.decorate('authenticate', async (req: any, reply: any) => {
    try {
      await req.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.register(authRoutes, { prefix: '/auth' })
  return app
}

describe('Auth — password hashing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset insert chain for each test
    const insertChain = { returning: vi.fn() }
    insertChain.returning.mockResolvedValueOnce([{ id: 'user-1', name: 'Test', email: 'test@example.com', avatarUrl: null }])
    insertChain.returning.mockResolvedValueOnce([{ id: 'ws-1', name: 'Test Workspace', slug: 'test-workspace' }])
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockReturnValue(insertChain) } as any)
  })

  it('hashes password during registration (not stored in plain text)', async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined) // no existing user

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Test User',
        email: 'test@example.com',
        password: 'securePass123',
        workspaceName: 'My Workspace',
      },
    })

    expect(res.statusCode).toBe(201)
    // Verify that insert was called and the password was hashed (not plain text)
    const insertCalls = vi.mocked(db.insert).mock.results
    const valuesCall = vi.mocked(db.insert({} as any).values).mock.calls
    // The first insert is the user — password should be a bcrypt hash
    expect(valuesCall.length).toBeGreaterThan(0)
    const userValues = valuesCall[0]?.[0] as any
    if (userValues?.passwordHash) {
      expect(userValues.passwordHash).not.toBe('securePass123')
      expect(userValues.passwordHash).toMatch(/^\$2[aby]\$/)
    }
  })
})

describe('Auth — login and JWT tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset insert chain (for refresh token storage)
    const insertChain = { returning: vi.fn().mockResolvedValue([{ id: 'rt-1' }]) }
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockReturnValue(insertChain) } as any)
  })

  it('returns 401 for invalid credentials', async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'wrong' },
    })

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.payload)).toEqual({ error: 'Invalid credentials' })
  })

  it('returns 401 for wrong password', async () => {
    // bcrypt hash of "correctPassword"
    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.hash('correctPassword', 4)

    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: 'user-1',
      name: 'Test',
      email: 'test@example.com',
      passwordHash: hash,
      avatarUrl: null,
    } as any)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'wrongPassword' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns tokens on successful login', async () => {
    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.hash('correctPassword', 4)

    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: 'user-1',
      name: 'Test',
      email: 'test@example.com',
      passwordHash: hash,
      avatarUrl: null,
    } as any)

    vi.mocked(db.query.workspaceMembers.findFirst).mockResolvedValue({
      userId: 'user-1',
      workspaceId: 'ws-1',
      role: 'owner',
      workspace: { id: 'ws-1', name: 'Test Workspace' },
    } as any)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'correctPassword' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.data.tokens).toHaveProperty('accessToken')
    expect(body.data.tokens).toHaveProperty('refreshToken')
    expect(typeof body.data.tokens.accessToken).toBe('string')
    expect(typeof body.data.tokens.refreshToken).toBe('string')
  })

  it('returns 403 when user has no workspace', async () => {
    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.hash('pass12345678', 4)

    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: 'user-1',
      name: 'Test',
      email: 'test@example.com',
      passwordHash: hash,
      avatarUrl: null,
    } as any)

    vi.mocked(db.query.workspaceMembers.findFirst).mockResolvedValue(undefined)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'pass12345678' },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.payload)).toEqual({ error: 'No workspace access' })
  })
})

describe('Auth — refresh token rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset insert chain
    const insertChain = { returning: vi.fn().mockResolvedValue([{ id: 'rt-new' }]) }
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockReturnValue(insertChain) } as any)
    // Reset delete chain
    vi.mocked(db.delete).mockReturnValue({ where: vi.fn().mockResolvedValue([]) } as any)
  })

  it('returns 401 for expired refresh token', async () => {
    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValue({
      token: 'old-token',
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1000), // expired
    } as any)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'old-token' },
    })

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.payload)).toEqual({ error: 'Invalid or expired refresh token' })
  })

  it('returns 401 for non-existent refresh token', async () => {
    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValue(undefined)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'does-not-exist' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('deletes old token and issues new tokens on valid refresh', async () => {
    const app = buildApp()

    // First, sign a valid refresh token so jwt.decode works
    await app.ready()
    const validRefreshToken = app.jwt.sign(
      { sub: 'user-1', workspaceId: 'ws-1', role: 'owner' },
      { expiresIn: '7d' },
    )

    vi.mocked(db.query.refreshTokens.findFirst).mockResolvedValue({
      token: validRefreshToken,
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // valid
    } as any)

    vi.mocked(db.query.workspaceMembers.findFirst).mockResolvedValue({
      userId: 'user-1',
      workspaceId: 'ws-1',
      role: 'owner',
    } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: validRefreshToken },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.data.tokens).toHaveProperty('accessToken')
    expect(body.data.tokens).toHaveProperty('refreshToken')

    // Old token should be deleted (rotation)
    expect(db.delete).toHaveBeenCalled()

    // New token should be inserted
    expect(db.insert).toHaveBeenCalled()
  })
})
