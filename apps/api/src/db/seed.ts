import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { eq } from 'drizzle-orm'
import { hash } from 'bcryptjs'
import * as schema from './schema.js'

const databaseUrl =
  process.env['DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/ai_sales_agent'

const pool = new pg.Pool({ connectionString: databaseUrl })
const db = drizzle(pool, { schema })

// ─── ICP Scoring Helpers ───────────────────────────────────────────────────────

interface IcpConfig {
  industries: string[]
  countries: string[]
  employeeSizeMin: number | null
  employeeSizeMax: number | null
  techStack: string[]
  seniorityLevels: string[]
  jobFunctions: string[]
}

function scoreAccount(
  account: { industry: string | null; country: string | null; employeeSize: number | null; techStack: string[] },
  icp: IcpConfig,
): { score: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {}

  // Industry match (30 points)
  if (account.industry && icp.industries.length > 0) {
    breakdown.industry = icp.industries.some((i) => i.toLowerCase() === account.industry!.toLowerCase()) ? 30 : 0
  } else {
    breakdown.industry = 0
  }

  // Country match (20 points)
  if (account.country && icp.countries.length > 0) {
    breakdown.country = icp.countries.some((c) => c.toLowerCase() === account.country!.toLowerCase()) ? 20 : 0
  } else {
    breakdown.country = 0
  }

  // Employee size match (25 points)
  if (account.employeeSize != null) {
    const inMin = icp.employeeSizeMin == null || account.employeeSize >= icp.employeeSizeMin
    const inMax = icp.employeeSizeMax == null || account.employeeSize <= icp.employeeSizeMax
    breakdown.employeeSize = inMin && inMax ? 25 : 0
  } else {
    breakdown.employeeSize = 0
  }

  // Tech stack overlap (25 points)
  if (account.techStack.length > 0 && icp.techStack.length > 0) {
    const lower = icp.techStack.map((t) => t.toLowerCase())
    const matches = account.techStack.filter((t) => lower.includes(t.toLowerCase())).length
    breakdown.techStack = Math.round((matches / icp.techStack.length) * 25)
  } else {
    breakdown.techStack = 0
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0)
  return { score, breakdown }
}

function scoreContact(
  contact: { seniority: string | null; jobFunction: string | null },
  icp: IcpConfig,
): number {
  let score = 0
  if (contact.seniority && icp.seniorityLevels.length > 0) {
    if (icp.seniorityLevels.some((s) => s.toLowerCase() === contact.seniority!.toLowerCase())) {
      score += 50
    }
  }
  if (contact.jobFunction && icp.jobFunctions.length > 0) {
    if (icp.jobFunctions.some((f) => f.toLowerCase() === contact.jobFunction!.toLowerCase())) {
      score += 50
    }
  }
  return score
}

// ─── Main Seed ─────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Starting seed...')

  // 1. Workspace
  console.log('  Creating workspace...')
  const existingWorkspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.slug, 'acme-sales-team'),
  })

  let workspaceId: string
  if (existingWorkspace) {
    workspaceId = existingWorkspace.id
    console.log('  Workspace already exists, skipping.')
  } else {
    const [ws] = await db.insert(schema.workspaces).values({
      name: 'Acme Sales Team',
      slug: 'acme-sales-team',
      timezone: 'America/New_York',
      companyDescription: 'AI-powered sales engagement platform helping B2B teams close more deals.',
      dailySendLimit: 200,
      sendWindowStart: '08:00',
      sendWindowEnd: '18:00',
      suppressionDomains: ['acme.com', 'example.com'],
    }).returning()
    workspaceId = ws!.id
  }

  // 2. User
  console.log('  Creating demo user...')
  const existingUser = await db.query.users.findFirst({
    where: eq(schema.users.email, 'demo@example.com'),
  })

  let userId: string
  if (existingUser) {
    userId = existingUser.id
    console.log('  User already exists, skipping.')
  } else {
    const passwordHash = await hash('demo1234', 10)
    const [user] = await db.insert(schema.users).values({
      name: 'Demo User',
      email: 'demo@example.com',
      passwordHash,
    }).returning()
    userId = user!.id
  }

  // Workspace membership (upsert via conflict skip)
  const existingMember = await db.query.workspaceMembers.findFirst({
    where: eq(schema.workspaceMembers.userId, userId),
  })
  if (!existingMember) {
    await db.insert(schema.workspaceMembers).values({
      userId,
      workspaceId,
      role: 'owner',
    })
  }

  // 3. ICP Config
  console.log('  Creating ICP config...')
  const icpData: IcpConfig = {
    industries: ['SaaS', 'Software', 'Cloud Computing'],
    countries: ['US', 'GB'],
    employeeSizeMin: 50,
    employeeSizeMax: 500,
    techStack: ['Salesforce', 'HubSpot'],
    seniorityLevels: ['vp', 'c_level'],
    jobFunctions: ['sales', 'marketing'],
  }

  const existingIcp = await db.query.icpConfigs.findFirst({
    where: eq(schema.icpConfigs.workspaceId, workspaceId),
  })

  let icpConfigId: string
  if (existingIcp) {
    icpConfigId = existingIcp.id
    console.log('  ICP config already exists, skipping.')
  } else {
    const [icp] = await db.insert(schema.icpConfigs).values({
      workspaceId,
      name: 'Primary ICP - SaaS Mid-Market',
      industries: icpData.industries,
      countries: icpData.countries,
      employeeSizeMin: icpData.employeeSizeMin,
      employeeSizeMax: icpData.employeeSizeMax,
      techStack: icpData.techStack,
      seniorityLevels: icpData.seniorityLevels,
      jobFunctions: icpData.jobFunctions,
      isDefault: true,
    }).returning()
    icpConfigId = icp!.id
  }

  // 4. Accounts
  console.log('  Creating sample accounts...')
  const accountsData = [
    { companyName: 'BrightPath Analytics', domain: 'brightpathanalytics.com', industry: 'SaaS', country: 'US', employeeSize: 120, techStack: ['Salesforce', 'Segment', 'Snowflake'], fundingStage: 'Series B', revenueRange: '$10M-$50M' },
    { companyName: 'CloudVault Systems', domain: 'cloudvaultsys.com', industry: 'Cloud Computing', country: 'US', employeeSize: 340, techStack: ['HubSpot', 'AWS', 'Datadog'], fundingStage: 'Series C', revenueRange: '$50M-$100M' },
    { companyName: 'Nexus Workflow', domain: 'nexusworkflow.io', industry: 'Software', country: 'GB', employeeSize: 85, techStack: ['Salesforce', 'Jira', 'Slack'], fundingStage: 'Series A', revenueRange: '$5M-$10M' },
    { companyName: 'PulseMetrics Inc.', domain: 'pulsemetrics.com', industry: 'Data Analytics', country: 'US', employeeSize: 210, techStack: ['HubSpot', 'Looker', 'dbt'], fundingStage: 'Series B', revenueRange: '$10M-$50M' },
    { companyName: 'ScaleGrid Technologies', domain: 'scalegrid.tech', industry: 'SaaS', country: 'GB', employeeSize: 460, techStack: ['Salesforce', 'HubSpot', 'Stripe'], fundingStage: 'Series C', revenueRange: '$50M-$100M' },
  ]

  const accountIds: string[] = []
  for (const acct of accountsData) {
    const existing = await db.query.accounts.findFirst({
      where: eq(schema.accounts.domain, acct.domain),
    })
    if (existing) {
      accountIds.push(existing.id)
      continue
    }

    const { score, breakdown } = scoreAccount(acct, icpData)
    const [inserted] = await db.insert(schema.accounts).values({
      workspaceId,
      companyName: acct.companyName,
      domain: acct.domain,
      industry: acct.industry,
      country: acct.country,
      employeeSize: acct.employeeSize,
      techStack: acct.techStack,
      fundingStage: acct.fundingStage,
      revenueRange: acct.revenueRange,
      score,
      scoreBreakdown: breakdown,
      ownerId: userId,
      source: 'seed',
    }).returning()
    accountIds.push(inserted!.id)
  }
  console.log(`  ${accountIds.length} accounts ready.`)

  // 5. Contacts
  console.log('  Creating sample contacts...')
  const contactsData = [
    { firstName: 'Sarah', lastName: 'Mitchell', email: 'sarah.mitchell@brightpathanalytics.com', title: 'VP of Sales', seniority: 'vp', jobFunction: 'sales', country: 'US', accountIdx: 0 },
    { firstName: 'James', lastName: 'Carter', email: 'james.carter@brightpathanalytics.com', title: 'Marketing Director', seniority: 'director', jobFunction: 'marketing', country: 'US', accountIdx: 0 },
    { firstName: 'Emily', lastName: 'Zhang', email: 'emily.zhang@cloudvaultsys.com', title: 'Chief Revenue Officer', seniority: 'c_level', jobFunction: 'sales', country: 'US', accountIdx: 1 },
    { firstName: 'Robert', lastName: 'Patel', email: 'robert.patel@cloudvaultsys.com', title: 'VP of Marketing', seniority: 'vp', jobFunction: 'marketing', country: 'US', accountIdx: 1 },
    { firstName: 'Olivia', lastName: 'Brown', email: 'olivia.brown@nexusworkflow.io', title: 'Head of Sales', seniority: 'vp', jobFunction: 'sales', country: 'GB', accountIdx: 2 },
    { firstName: 'Thomas', lastName: 'Williams', email: 'thomas.williams@nexusworkflow.io', title: 'Growth Marketing Manager', seniority: 'manager', jobFunction: 'marketing', country: 'GB', accountIdx: 2 },
    { firstName: 'Maria', lastName: 'Garcia', email: 'maria.garcia@pulsemetrics.com', title: 'CEO', seniority: 'c_level', jobFunction: 'sales', country: 'US', accountIdx: 3 },
    { firstName: 'David', lastName: 'Kim', email: 'david.kim@pulsemetrics.com', title: 'VP of Business Development', seniority: 'vp', jobFunction: 'sales', country: 'US', accountIdx: 3 },
    { firstName: 'Charlotte', lastName: 'Evans', email: 'charlotte.evans@scalegrid.tech', title: 'Chief Marketing Officer', seniority: 'c_level', jobFunction: 'marketing', country: 'GB', accountIdx: 4 },
    { firstName: 'Daniel', lastName: 'Hughes', email: 'daniel.hughes@scalegrid.tech', title: 'VP of Sales Operations', seniority: 'vp', jobFunction: 'sales', country: 'GB', accountIdx: 4 },
  ]

  const contactIds: string[] = []
  for (const ct of contactsData) {
    const existing = await db.query.contacts.findFirst({
      where: eq(schema.contacts.email, ct.email),
    })
    if (existing) {
      contactIds.push(existing.id)
      continue
    }

    const contactScore = scoreContact(ct, icpData)
    const [inserted] = await db.insert(schema.contacts).values({
      workspaceId,
      accountId: accountIds[ct.accountIdx]!,
      firstName: ct.firstName,
      lastName: ct.lastName,
      email: ct.email,
      title: ct.title,
      seniority: ct.seniority,
      jobFunction: ct.jobFunction,
      country: ct.country,
      score: contactScore,
      lifecycleStatus: 'new',
      ownerId: userId,
    }).returning()
    contactIds.push(inserted!.id)
  }
  console.log(`  ${contactIds.length} contacts ready.`)

  // 6. Sequence
  console.log('  Creating email sequence...')
  const existingSeq = await db.query.sequences.findFirst({
    where: eq(schema.sequences.name, 'Cold Outbound v1'),
  })

  let sequenceId: string
  if (existingSeq) {
    sequenceId = existingSeq.id
    console.log('  Sequence already exists, skipping.')
  } else {
    const [seq] = await db.insert(schema.sequences).values({
      workspaceId,
      name: 'Cold Outbound v1',
      description: 'Initial cold outreach sequence for ICP-matched prospects. 3 steps over 8 days.',
      status: 'active',
      icpConfigId,
      dailySendLimit: 50,
      sendWindowStart: '09:00',
      sendWindowEnd: '17:00',
      timezone: 'America/New_York',
      defaultApprovalMode: 'auto',
      createdBy: userId,
    }).returning()
    sequenceId = seq!.id

    // Steps
    await db.insert(schema.sequenceSteps).values([
      {
        sequenceId,
        position: 1,
        stepType: 'email',
        delayDays: 0,
        condition: null,
        templateSubject: 'Quick question about {{account.companyName}}\'s sales process',
        templateBody: `Hi {{contact.firstName}},

I noticed {{account.companyName}} is growing fast in the {{account.industry}} space — congrats on the momentum.

We help teams like yours automate outbound prospecting with AI so reps can focus on closing, not sourcing. Companies similar to yours have seen 3x more qualified meetings within the first month.

Would it make sense to chat for 15 minutes this week?

Best,
{{sender.name}}`,
        approvalMode: 'auto',
      },
      {
        sequenceId,
        position: 2,
        stepType: 'email',
        delayDays: 3,
        condition: { trigger: 'not_replied' },
        templateSubject: 'Re: Quick question about {{account.companyName}}\'s sales process',
        templateBody: `Hi {{contact.firstName}},

Just wanted to bump this in case it got buried. I know things get busy.

I put together a short case study from a {{account.industry}} company in a similar stage — happy to share it if helpful.

Worth a quick call?

Best,
{{sender.name}}`,
        approvalMode: 'auto',
      },
      {
        sequenceId,
        position: 3,
        stepType: 'email',
        delayDays: 5,
        condition: { trigger: 'not_replied' },
        templateSubject: 'Should I close the loop?',
        templateBody: `Hi {{contact.firstName}},

I don't want to be a pest, so I'll keep this short. If now isn't the right time, totally understand — just let me know and I'll check back in a few months.

But if you're open to exploring how AI can help {{account.companyName}} book more meetings on autopilot, I'd love 15 minutes on your calendar.

Either way, thanks for your time.

Best,
{{sender.name}}`,
        approvalMode: 'auto',
      },
    ])
  }

  // 7. Activity logs
  console.log('  Creating activity log entries...')
  const existingLogs = await db.query.activityLogs.findFirst({
    where: eq(schema.activityLogs.workspaceId, workspaceId),
  })

  if (!existingLogs) {
    await db.insert(schema.activityLogs).values([
      {
        workspaceId,
        objectType: 'workspace',
        objectId: workspaceId,
        activityType: 'workspace_created',
        actorType: 'user',
        actorId: userId,
        payload: { name: 'Acme Sales Team' },
      },
      {
        workspaceId,
        objectType: 'sequence',
        objectId: sequenceId,
        activityType: 'sequence_created',
        actorType: 'user',
        actorId: userId,
        payload: { name: 'Cold Outbound v1', steps: 3 },
      },
      {
        workspaceId,
        objectType: 'account',
        objectId: accountIds[0]!,
        activityType: 'account_imported',
        actorType: 'system',
        payload: { source: 'seed', count: 5 },
      },
      {
        workspaceId,
        objectType: 'contact',
        objectId: contactIds[0]!,
        activityType: 'contact_scored',
        actorType: 'ai',
        payload: { score: 100, method: 'icp_match' },
      },
    ])
  } else {
    console.log('  Activity logs already exist, skipping.')
  }

  console.log('')
  console.log('Seed complete!')
  console.log('  Workspace: Acme Sales Team')
  console.log('  Login:     demo@example.com / demo1234')
  console.log(`  Accounts:  ${accountIds.length}`)
  console.log(`  Contacts:  ${contactIds.length}`)
  console.log('  Sequence:  Cold Outbound v1 (3 steps)')
}

seed()
  .then(async () => {
    await pool.end()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('Seed failed:', err)
    await pool.end()
    process.exit(1)
  })
