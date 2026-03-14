import { describe, it, expect, vi, beforeAll } from 'vitest'

// Ensure no real API calls - ANTHROPIC_API_KEY not set in tests
beforeAll(() => {
  delete process.env['ANTHROPIC_API_KEY']
})

import { classifyReply } from '../reply-classifier.js'

describe('Reply Intent Classification (mock mode)', () => {
  it('classifies unsubscribe requests', async () => {
    const result = await classifyReply('Please unsubscribe me from all future emails.')
    expect(result.intent).toBe('unsubscribe')
    expect(result.confidence).toBeGreaterThan(0.9)
    expect(result.requiresHumanReview).toBe(false)
  })

  it('classifies out-of-office replies', async () => {
    const result = await classifyReply(
      'I am out of the office until January 15. For urgent matters contact john@example.com.',
    )
    expect(result.intent).toBe('out_of_office')
    expect(result.confidence).toBeGreaterThan(0.9)
  })

  it('classifies demo requests', async () => {
    const result = await classifyReply("I'd like to schedule a demo. Can we get on a call?")
    expect(result.intent).toBe('request_demo')
    expect(result.confidence).toBeGreaterThan(0.7)
  })

  it('classifies interest signals', async () => {
    const result = await classifyReply('This sounds interesting! Tell me more about your product.')
    expect(result.intent).toBe('interested')
    expect(result.confidence).toBeGreaterThan(0.7)
  })

  it('classifies not-now responses', async () => {
    const result = await classifyReply(
      "Now is not a good time. Maybe check back next quarter.",
    )
    expect(result.intent).toBe('not_now')
    expect(result.confidence).toBeGreaterThan(0.7)
  })

  it('classifies competitor usage', async () => {
    const result = await classifyReply(
      "We're already using a solution from a competitor for this.",
    )
    expect(result.intent).toBe('using_competitor')
    expect(result.confidence).toBeGreaterThan(0.7)
  })

  it('flags unknown replies for human review', async () => {
    const result = await classifyReply(
      'Interesting. What happens if we need to renegotiate the contract mid-year given our legal team requirements?',
    )
    expect(result.intent).toBe('unknown')
    expect(result.requiresHumanReview).toBe(true)
    expect(result.confidence).toBeLessThan(0.7)
  })

  it('returns a suggested action for every intent', async () => {
    const intents = [
      'Please unsubscribe me',
      'I am out of office',
      "I'd love a demo",
      'Sounds interesting',
      'Maybe next quarter',
    ]

    for (const text of intents) {
      const result = await classifyReply(text)
      expect(result.suggestedAction).toBeTruthy()
      expect(result.suggestedAction.length).toBeGreaterThan(5)
    }
  })
})
