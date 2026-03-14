import { anthropic, AI_MODEL } from './client.js'
import { db, workspaces, icpConfigs } from '../db/index.js'
import { eq, and } from 'drizzle-orm'

interface ContactInfo {
  firstName: string
  lastName: string
  title: string | null
  email: string
  company?: string
  industry?: string
  employeeSize?: number | null
  websiteSummary?: string | null
}

interface GenerateEmailParams {
  contact: ContactInfo
  workspaceId: string
  stepPosition: number // 0 = first touch, 1+ = follow-up
  templateSubject?: string
  templateBody?: string
}

interface GeneratedEmail {
  subject: string
  body: string
}

export async function generateEmail(params: GenerateEmailParams): Promise<GeneratedEmail> {
  const { contact, workspaceId, stepPosition, templateSubject, templateBody } = params

  const [workspace, icp] = await Promise.all([
    db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) }),
    db.query.icpConfigs.findFirst({
      where: and(eq(icpConfigs.workspaceId, workspaceId), eq(icpConfigs.isDefault, true)),
    }),
  ])

  const companyContext = workspace?.companyDescription ?? 'a B2B software company'
  const brandVoice = workspace?.brandVoice ?? 'professional, concise, value-focused'

  const isFollowUp = stepPosition > 0
  const emailType = isFollowUp ? `follow-up email #${stepPosition}` : 'first cold outreach email'

  const systemPrompt = `You are an expert B2B sales email writer for ${companyContext}.

Brand voice: ${brandVoice}

Rules:
- Write concise, human-sounding emails (under 120 words for body)
- Never fabricate facts about the prospect's company
- Always reference a specific, plausible value proposition
- Include ONE clear call-to-action
- Do NOT use generic openers like "I hope this finds you well"
- Do NOT use ALL CAPS or excessive punctuation
- Output ONLY valid JSON with keys: subject, body`

  const userPrompt = `Generate a ${emailType} to:
Name: ${contact.firstName} ${contact.lastName}
Title: ${contact.title ?? 'unknown'}
Company: ${contact.company ?? 'their company'}
Industry: ${contact.industry ?? 'unknown'}
Company size: ${contact.employeeSize ?? 'unknown'} employees
${contact.websiteSummary ? `Company context: ${contact.websiteSummary}` : ''}

${templateSubject ? `Use this subject as inspiration: ${templateSubject}` : ''}
${templateBody ? `Use this body as inspiration: ${templateBody}` : ''}
${isFollowUp ? `This is follow-up #${stepPosition}. Reference the previous email briefly.` : ''}

Return JSON: {"subject": "...", "body": "..."}`

  // If no API key, return mock
  if (!process.env['ANTHROPIC_API_KEY']) {
    return mockGenerateEmail(contact, stepPosition)
  }

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
    return { subject: json.subject ?? '', body: json.body ?? '' }
  } catch {
    // fallback: extract from text
    return mockGenerateEmail(contact, stepPosition)
  }
}

function mockGenerateEmail(contact: ContactInfo, stepPosition: number): GeneratedEmail {
  if (stepPosition === 0) {
    return {
      subject: `Quick question about ${contact.company ?? 'your team'}'s outbound process`,
      body: `Hi ${contact.firstName},

I came across ${contact.company ?? 'your company'} and noticed your team is scaling — congrats on the growth.

We help ${contact.industry ?? 'B2B'} teams like yours automate outbound outreach and book more qualified meetings, without adding headcount.

Worth a 20-minute chat to see if it's relevant?

[Your name]`,
    }
  }

  return {
    subject: `Re: Quick question about ${contact.company ?? 'your team'}`,
    body: `Hi ${contact.firstName},

Following up on my note from last week — I know your inbox is busy.

Happy to share a quick case study from a similar company that cut their time-to-meeting by 40%.

Does Thursday at 10am work, or feel free to grab time here: [booking link]

[Your name]`,
  }
}
