import { anthropic, AI_MODEL } from './client.js'
import type { ReplyIntent } from '@ai-sales/types'

interface ClassifyReplyResult {
  intent: ReplyIntent
  confidence: number
  requiresHumanReview: boolean
  suggestedAction: string
}

const INTENT_ACTIONS: Record<ReplyIntent, string> = {
  interested: 'Schedule a meeting or hand off to AE',
  request_demo: 'Send calendar link immediately',
  not_now: 'Add to nurture sequence, re-engage in 60 days',
  not_relevant: 'Disqualify and stop sequence',
  using_competitor: 'Send competitive differentiation email, flag for AE',
  pricing_concern: 'Send pricing overview, notify AE',
  security_concern: 'Send security documentation pack, notify AE immediately',
  referral: 'Update contact record with referred person, continue sequence',
  unsubscribe: 'Stop all outreach immediately, add to suppression list',
  out_of_office: 'Pause sequence, resume after out-of-office date',
  unknown: 'Escalate to human review',
}

const SYSTEM_PROMPT = `You are an expert sales reply classifier. Given an email reply from a B2B prospect, classify the intent into exactly ONE of these categories:

- interested: prospect wants to learn more or engage
- request_demo: explicitly asking for a demo or meeting
- not_now: timing issue, come back later
- not_relevant: wrong company, wrong person, not a fit
- using_competitor: already using a competing solution
- pricing_concern: questions or concerns about cost
- security_concern: questions about security, compliance, or data
- referral: asking to contact a different person
- unsubscribe: wants to be removed from outreach
- out_of_office: automated or manual OOO response
- unknown: can't determine clearly

Rules:
- Output ONLY valid JSON
- Confidence is 0.0 to 1.0
- Set requires_human_review to true if confidence < 0.7 or the situation is complex
- JSON keys: intent, confidence, requires_human_review, reason`

export async function classifyReply(replyBody: string): Promise<ClassifyReplyResult> {
  if (!process.env['ANTHROPIC_API_KEY']) {
    return mockClassify(replyBody)
  }

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Classify this email reply:\n\n---\n${replyBody.slice(0, 2000)}\n---`,
      },
    ],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
    const intent = json.intent as ReplyIntent
    const confidence = parseFloat(json.confidence) || 0.5
    const requiresHumanReview = json.requires_human_review === true || confidence < 0.7

    return {
      intent: INTENT_ACTIONS[intent] ? intent : 'unknown',
      confidence,
      requiresHumanReview,
      suggestedAction: INTENT_ACTIONS[intent] ?? INTENT_ACTIONS['unknown'],
    }
  } catch {
    return mockClassify(replyBody)
  }
}

function mockClassify(body: string): ClassifyReplyResult {
  const lower = body.toLowerCase()

  if (lower.includes('unsubscribe') || lower.includes('remove me') || lower.includes('stop emailing')) {
    return { intent: 'unsubscribe', confidence: 0.98, requiresHumanReview: false, suggestedAction: INTENT_ACTIONS['unsubscribe']! }
  }
  if (lower.includes('out of office') || lower.includes('out of the office') || lower.includes('on vacation') || lower.includes('auto-reply') || lower.includes('ooo')) {
    return { intent: 'out_of_office', confidence: 0.95, requiresHumanReview: false, suggestedAction: INTENT_ACTIONS['out_of_office']! }
  }
  if (lower.includes('demo') || lower.includes('call') || lower.includes('meeting')) {
    return { intent: 'request_demo', confidence: 0.85, requiresHumanReview: false, suggestedAction: INTENT_ACTIONS['request_demo']! }
  }
  if (lower.includes('interested') || lower.includes('tell me more') || lower.includes('sounds good')) {
    return { intent: 'interested', confidence: 0.82, requiresHumanReview: false, suggestedAction: INTENT_ACTIONS['interested']! }
  }
  if (lower.includes('not a good time') || lower.includes('maybe next') || lower.includes('next quarter')) {
    return { intent: 'not_now', confidence: 0.80, requiresHumanReview: false, suggestedAction: INTENT_ACTIONS['not_now']! }
  }
  if (lower.includes('already using') || lower.includes('competitor') || lower.includes('have a solution')) {
    return { intent: 'using_competitor', confidence: 0.78, requiresHumanReview: false, suggestedAction: INTENT_ACTIONS['using_competitor']! }
  }

  return { intent: 'unknown', confidence: 0.3, requiresHumanReview: true, suggestedAction: INTENT_ACTIONS['unknown']! }
}

export async function generatePreCallBrief(params: {
  contactFirstName: string
  contactLastName: string
  contactTitle: string | null
  companyName: string
  industry: string | null
  touchHistory: string[]
  meetingContext: string
}): Promise<string> {
  if (!process.env['ANTHROPIC_API_KEY']) {
    return `## Pre-Call Brief: ${params.companyName}

**Contact**: ${params.contactFirstName} ${params.contactLastName}, ${params.contactTitle ?? 'unknown role'}
**Company**: ${params.companyName} (${params.industry ?? 'unknown industry'})

**How we got here**: ${params.touchHistory.join(' → ')}

**Key talking points**:
- Understand their current outbound process
- Identify key pain points and manual steps
- Align on ideal outcome from this conversation

**Suggested opener**: Reference the specific email/topic that triggered the reply.`
  }

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 512,
    system: 'You are an expert sales coach. Generate a concise pre-call brief for a sales rep.',
    messages: [{
      role: 'user',
      content: `Generate a pre-call brief for:
Contact: ${params.contactFirstName} ${params.contactLastName}, ${params.contactTitle}
Company: ${params.companyName}, ${params.industry}
Touch history: ${params.touchHistory.join(' → ')}
Meeting context: ${params.meetingContext}

Format as markdown with sections: Contact Summary, Company Summary, Touch History, Key Talking Points, Suggested Opener.`,
    }],
  })

  return response.content[0]?.type === 'text' ? response.content[0].text : ''
}
