import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB layer entirely
vi.mock('../../../db/index.js', () => ({
  db: {
    query: {
      accounts: { findFirst: vi.fn() },
      icpConfigs: { findFirst: vi.fn() },
      contacts: { findFirst: vi.fn() },
    },
  },
  accounts: {},
  contacts: {},
  icpConfigs: {},
  eq: vi.fn(),
  and: vi.fn(),
}))

import { scoreAccount, scoreContact } from '../accounts.service.js'
import { db } from '../../../db/index.js'

const mockAccount = {
  id: 'acc-1',
  workspaceId: 'ws-1',
  companyName: 'Acme Corp',
  domain: 'acme.com',
  industry: 'SaaS',
  country: 'US',
  employeeSize: 200,
  techStack: ['Salesforce', 'Slack'],
  score: 0,
}

const mockIcp = {
  id: 'icp-1',
  workspaceId: 'ws-1',
  industries: ['SaaS', 'Software'],
  countries: ['US', 'GB'],
  employeeSizeMin: 50,
  employeeSizeMax: 500,
  techStack: ['Salesforce'],
  seniorityLevels: ['vp', 'c_level'],
  jobFunctions: ['sales'],
  isDefault: true,
}

describe('Account Scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('scores 100 when account perfectly matches ICP', async () => {
    vi.mocked(db.query.accounts.findFirst).mockResolvedValue(mockAccount as any)
    vi.mocked(db.query.icpConfigs.findFirst).mockResolvedValue(mockIcp as any)

    const { score } = await scoreAccount('acc-1', 'ws-1')
    expect(score).toBe(100)
  })

  it('returns 0 score when no ICP configured', async () => {
    vi.mocked(db.query.accounts.findFirst).mockResolvedValue(mockAccount as any)
    vi.mocked(db.query.icpConfigs.findFirst).mockResolvedValue(undefined)

    const { score } = await scoreAccount('acc-1', 'ws-1')
    expect(score).toBe(0)
  })

  it('deducts points for wrong industry', async () => {
    vi.mocked(db.query.accounts.findFirst).mockResolvedValue({
      ...mockAccount,
      industry: 'Retail',
    } as any)
    vi.mocked(db.query.icpConfigs.findFirst).mockResolvedValue(mockIcp as any)

    const { score, breakdown } = await scoreAccount('acc-1', 'ws-1')
    expect(breakdown.industry).toBe(0)
    expect(score).toBeLessThan(100)
  })

  it('deducts points for employee size out of range', async () => {
    vi.mocked(db.query.accounts.findFirst).mockResolvedValue({
      ...mockAccount,
      employeeSize: 10000, // too large
    } as any)
    vi.mocked(db.query.icpConfigs.findFirst).mockResolvedValue(mockIcp as any)

    const { breakdown } = await scoreAccount('acc-1', 'ws-1')
    expect(breakdown.employeeSize).toBe(0)
  })

  it('gives partial tech stack score for partial overlap', async () => {
    vi.mocked(db.query.accounts.findFirst).mockResolvedValue({
      ...mockAccount,
      techStack: ['Slack'], // only 0/1 ICP tech stack match
    } as any)
    vi.mocked(db.query.icpConfigs.findFirst).mockResolvedValue(mockIcp as any)

    const { breakdown } = await scoreAccount('acc-1', 'ws-1')
    expect(breakdown.techStack).toBe(0) // no overlap with ['Salesforce']
  })

  it('gives full score when ICP has no tech stack filter', async () => {
    vi.mocked(db.query.accounts.findFirst).mockResolvedValue(mockAccount as any)
    vi.mocked(db.query.icpConfigs.findFirst).mockResolvedValue({
      ...mockIcp,
      techStack: [], // no filter
    } as any)

    const { breakdown } = await scoreAccount('acc-1', 'ws-1')
    expect(breakdown.techStack).toBe(25)
  })

  it('throws when account not found', async () => {
    vi.mocked(db.query.accounts.findFirst).mockResolvedValue(undefined)
    await expect(scoreAccount('bad-id', 'ws-1')).rejects.toThrow('Account not found')
  })
})

describe('Contact Scoring', () => {
  const mockContact = {
    id: 'cnt-1',
    workspaceId: 'ws-1',
    seniority: 'vp',
    jobFunction: 'sales',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('scores 100 when contact matches ICP persona', async () => {
    vi.mocked(db.query.contacts.findFirst).mockResolvedValue(mockContact as any)
    vi.mocked(db.query.icpConfigs.findFirst).mockResolvedValue(mockIcp as any)

    const score = await scoreContact('cnt-1', 'ws-1')
    expect(score).toBe(100)
  })

  it('scores 50 when only seniority matches', async () => {
    vi.mocked(db.query.contacts.findFirst).mockResolvedValue({
      ...mockContact,
      jobFunction: 'engineering', // wrong function
    } as any)
    vi.mocked(db.query.icpConfigs.findFirst).mockResolvedValue(mockIcp as any)

    const score = await scoreContact('cnt-1', 'ws-1')
    expect(score).toBe(50)
  })

  it('scores 0 when neither matches', async () => {
    vi.mocked(db.query.contacts.findFirst).mockResolvedValue({
      ...mockContact,
      seniority: 'manager',
      jobFunction: 'engineering',
    } as any)
    vi.mocked(db.query.icpConfigs.findFirst).mockResolvedValue(mockIcp as any)

    const score = await scoreContact('cnt-1', 'ws-1')
    expect(score).toBe(0)
  })
})
