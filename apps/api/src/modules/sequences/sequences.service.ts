import { db, sequenceEnrollments, sequenceSteps, contacts, sequences, messages } from '../../db/index.js'
import { eq, and, lte, inArray } from 'drizzle-orm'
import { generateEmail } from '../../ai/email-generator.js'
import { sendEmail } from '../../email/email.service.js'
import { logActivity } from '../analytics/activity.js'
import { scheduleNextStep } from '../../queues/index.js'

export async function enrollContact(
  sequenceId: string,
  contactId: string,
  enrolledBy?: string,
): Promise<void> {
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) })
  if (!contact) throw new Error('Contact not found')
  if (contact.unsubscribed || contact.doNotContact) throw new Error('Contact is suppressed')

  // check not already enrolled
  const existing = await db.query.sequenceEnrollments.findFirst({
    where: and(
      eq(sequenceEnrollments.sequenceId, sequenceId),
      eq(sequenceEnrollments.contactId, contactId),
    ),
  })
  if (existing) throw new Error('Already enrolled')

  const [enrollment] = await db.insert(sequenceEnrollments).values({
    sequenceId,
    contactId,
    enrolledBy,
    status: 'active',
    currentStepPosition: 0,
    nextSendAt: new Date(), // first step: send immediately
  }).returning()

  await logActivity({
    workspaceId: contact.workspaceId,
    objectType: 'contact',
    objectId: contactId,
    activityType: 'enrolled_in_sequence',
    actorType: enrolledBy ? 'user' : 'system',
    actorId: enrolledBy,
    payload: { sequenceId },
  })

  // schedule first step
  await scheduleNextStep(enrollment!.id)
}

export async function pauseEnrollment(enrollmentId: string): Promise<void> {
  await db.update(sequenceEnrollments)
    .set({ status: 'paused', pausedAt: new Date() })
    .where(eq(sequenceEnrollments.id, enrollmentId))
}

export async function resumeEnrollment(enrollmentId: string): Promise<void> {
  await db.update(sequenceEnrollments)
    .set({ status: 'active', pausedAt: null, nextSendAt: new Date() })
    .where(eq(sequenceEnrollments.id, enrollmentId))
  await scheduleNextStep(enrollmentId)
}

export async function executeStep(enrollmentId: string): Promise<void> {
  const enrollment = await db.query.sequenceEnrollments.findFirst({
    where: eq(sequenceEnrollments.id, enrollmentId),
    with: {
      contact: true,
      sequence: { with: { steps: { orderBy: (s, { asc }) => [asc(s.position)] } } },
    },
  })

  if (!enrollment || enrollment.status !== 'active') return

  const step = enrollment.sequence.steps.find(
    (s) => s.position === enrollment.currentStepPosition,
  )

  if (!step) {
    // sequence complete
    await db.update(sequenceEnrollments)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(sequenceEnrollments.id, enrollmentId))
    return
  }

  if (step.stepType !== 'email') {
    // advance to next step
    await advanceEnrollment(enrollmentId, step.position + 1, step.delayDays)
    return
  }

  const contact = enrollment.contact
  const sequence = enrollment.sequence

  // generate or use template
  let subject = step.templateSubject ?? ''
  let body = step.templateBody ?? ''

  if (step.approvalMode === 'auto' || step.position > 0) {
    // Use AI generation
    const generated = await generateEmail({
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        title: contact.title,
        email: contact.email,
      },
      workspaceId: sequence.workspaceId,
      stepPosition: step.position,
      templateSubject: subject,
      templateBody: body,
    })
    subject = generated.subject
    body = generated.body
  }

  const needsApproval = step.approvalMode === 'all' ||
    (step.approvalMode === 'first_only' && step.position === 0)

  const [message] = await db.insert(messages).values({
    contactId: contact.id,
    enrollmentId,
    sequenceStepId: step.id,
    subject,
    body,
    generatedByAi: true,
    status: needsApproval ? 'pending' : 'scheduled',
  }).returning()

  if (!needsApproval) {
    await dispatchMessage(message!.id)
  }

  await logActivity({
    workspaceId: sequence.workspaceId,
    objectType: 'contact',
    objectId: contact.id,
    activityType: needsApproval ? 'message_pending_approval' : 'message_scheduled',
    actorType: 'ai',
    payload: { messageId: message!.id, stepPosition: step.position },
  })
}

export async function dispatchMessage(messageId: string): Promise<void> {
  const message = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
    with: { contact: true, enrollment: { with: { sequence: true } } },
  })
  if (!message) return

  const contact = message.contact
  const result = await sendEmail({
    to: contact.email,
    toName: `${contact.firstName} ${contact.lastName}`.trim(),
    subject: message.subject,
    body: message.body,
    workspaceId: message.enrollment.sequence.workspaceId,
  })

  const now = new Date()
  await db.update(messages)
    .set({
      status: result.success ? 'sent' : 'failed',
      sentAt: result.success ? now : null,
      externalMessageId: result.messageId,
    })
    .where(eq(messages.id, messageId))

  if (result.success) {
    // advance enrollment to next step
    const enrollment = message.enrollment
    const steps = await db.query.sequenceSteps.findMany({
      where: eq(sequenceSteps.sequenceId, enrollment.sequenceId),
      orderBy: (s, { asc }) => [asc(s.position)],
    })
    const currentStep = steps.find((s) => s.position === enrollment.currentStepPosition)
    const nextStep = steps.find((s) => s.position > (currentStep?.position ?? -1))

    if (nextStep) {
      await advanceEnrollment(enrollment.id, nextStep.position, nextStep.delayDays)
    } else {
      await db.update(sequenceEnrollments)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(sequenceEnrollments.id, enrollment.id))
    }
  }
}

async function advanceEnrollment(enrollmentId: string, nextPosition: number, delayDays: number) {
  const nextSendAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000)
  await db.update(sequenceEnrollments)
    .set({ currentStepPosition: nextPosition, nextSendAt })
    .where(eq(sequenceEnrollments.id, enrollmentId))
  await scheduleNextStep(enrollmentId, delayDays * 24 * 60 * 60 * 1000)
}
