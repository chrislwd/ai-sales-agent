import { describe, it, expect, vi, beforeAll } from 'vitest'

// Ensure no real API calls — mock mode
beforeAll(() => {
  delete process.env['ANTHROPIC_API_KEY']
})

// Mock the DB layer for workspace/ICP lookups
vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      workspaces: { findFirst: vi.fn().mockResolvedValue({ id: 'ws-1', companyDescription: 'a B2B SaaS platform', brandVoice: 'friendly, professional' }) },
      icpConfigs: { findFirst: vi.fn().mockResolvedValue({ id: 'icp-1', isDefault: true }) },
    },
  },
  workspaces: {},
  icpConfigs: {},
  eq: vi.fn(),
  and: vi.fn(),
}))

vi.mock('../client.js', () => ({
  anthropic: {},
  AI_MODEL: 'claude-sonnet-4-6',
}))

import { generateEmail } from '../email-generator.js'

const mockContact = {
  firstName: 'Jane',
  lastName: 'Doe',
  title: 'VP of Sales',
  email: 'jane@acme.com',
  company: 'Acme Corp',
  industry: 'SaaS',
  employeeSize: 150,
  websiteSummary: null,
}

describe('Email Generator (mock mode)', () => {
  it('returns a valid email structure with subject and body', async () => {
    const result = await generateEmail({
      contact: mockContact,
      workspaceId: 'ws-1',
      stepPosition: 0,
    })

    expect(result).toHaveProperty('subject')
    expect(result).toHaveProperty('body')
    expect(typeof result.subject).toBe('string')
    expect(typeof result.body).toBe('string')
  })

  it('returns a non-empty subject', async () => {
    const result = await generateEmail({
      contact: mockContact,
      workspaceId: 'ws-1',
      stepPosition: 0,
    })

    expect(result.subject.length).toBeGreaterThan(0)
  })

  it('body contains prospect first name', async () => {
    const result = await generateEmail({
      contact: mockContact,
      workspaceId: 'ws-1',
      stepPosition: 0,
    })

    expect(result.body).toContain('Jane')
  })

  it('body contains company name when provided', async () => {
    const result = await generateEmail({
      contact: mockContact,
      workspaceId: 'ws-1',
      stepPosition: 0,
    })

    expect(result.body).toContain('Acme Corp')
  })

  it('generates a follow-up email for stepPosition > 0', async () => {
    const result = await generateEmail({
      contact: mockContact,
      workspaceId: 'ws-1',
      stepPosition: 1,
    })

    expect(result.subject).toBeTruthy()
    expect(result.body).toBeTruthy()
    expect(result.body).toContain('Jane')
  })

  it('subject references company name for first touch', async () => {
    const result = await generateEmail({
      contact: mockContact,
      workspaceId: 'ws-1',
      stepPosition: 0,
    })

    expect(result.subject).toContain('Acme Corp')
  })

  it('falls back gracefully when company is not provided', async () => {
    const result = await generateEmail({
      contact: { ...mockContact, company: undefined },
      workspaceId: 'ws-1',
      stepPosition: 0,
    })

    expect(result.subject.length).toBeGreaterThan(0)
    expect(result.body.length).toBeGreaterThan(0)
  })
})
