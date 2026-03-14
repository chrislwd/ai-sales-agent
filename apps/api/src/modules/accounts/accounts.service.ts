import { db, accounts, contacts, icpConfigs } from '../../db/index.js'
import { eq, and, inArray } from 'drizzle-orm'

interface ScoreBreakdown {
  industry: number
  country: number
  employeeSize: number
  techStack: number
  total: number
}

export async function scoreAccount(
  accountId: string,
  workspaceId: string,
): Promise<{ score: number; breakdown: ScoreBreakdown }> {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspaceId)),
  })
  if (!account) throw new Error('Account not found')

  const icp = await db.query.icpConfigs.findFirst({
    where: and(eq(icpConfigs.workspaceId, workspaceId), eq(icpConfigs.isDefault, true)),
  })

  if (!icp) return { score: 0, breakdown: { industry: 0, country: 0, employeeSize: 0, techStack: 0, total: 0 } }

  let score = 0
  const breakdown: ScoreBreakdown = { industry: 0, country: 0, employeeSize: 0, techStack: 0, total: 0 }

  // Industry match: 30 points
  if (account.industry && icp.industries.length > 0) {
    if (icp.industries.some((i) => account.industry?.toLowerCase().includes(i.toLowerCase()))) {
      breakdown.industry = 30
      score += 30
    }
  } else if (icp.industries.length === 0) {
    breakdown.industry = 30
    score += 30
  }

  // Country match: 20 points
  if (account.country && icp.countries.length > 0) {
    if (icp.countries.includes(account.country)) {
      breakdown.country = 20
      score += 20
    }
  } else if (icp.countries.length === 0) {
    breakdown.country = 20
    score += 20
  }

  // Employee size: 25 points
  if (account.employeeSize) {
    const min = icp.employeeSizeMin ?? 0
    const max = icp.employeeSizeMax ?? Infinity
    if (account.employeeSize >= min && account.employeeSize <= max) {
      breakdown.employeeSize = 25
      score += 25
    }
  } else {
    breakdown.employeeSize = 12
    score += 12 // partial if unknown
  }

  // Tech stack overlap: 25 points
  if (icp.techStack.length > 0 && account.techStack.length > 0) {
    const overlap = account.techStack.filter((t) =>
      icp.techStack.some((it) => it.toLowerCase() === t.toLowerCase()),
    ).length
    const techScore = Math.min(25, Math.round((overlap / icp.techStack.length) * 25))
    breakdown.techStack = techScore
    score += techScore
  } else if (icp.techStack.length === 0) {
    breakdown.techStack = 25
    score += 25
  }

  breakdown.total = score
  return { score, breakdown }
}

export async function scoreContact(
  contactId: string,
  workspaceId: string,
): Promise<number> {
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId)),
  })
  if (!contact) throw new Error('Contact not found')

  const icp = await db.query.icpConfigs.findFirst({
    where: and(eq(icpConfigs.workspaceId, workspaceId), eq(icpConfigs.isDefault, true)),
  })

  if (!icp) return 0

  let score = 0

  // Seniority match: 50 points
  if (contact.seniority && icp.seniorityLevels.length > 0) {
    if (icp.seniorityLevels.includes(contact.seniority)) score += 50
  } else if (icp.seniorityLevels.length === 0) {
    score += 50
  }

  // Job function match: 50 points
  if (contact.jobFunction && icp.jobFunctions.length > 0) {
    if (icp.jobFunctions.includes(contact.jobFunction)) score += 50
  } else if (icp.jobFunctions.length === 0) {
    score += 50
  }

  return score
}
