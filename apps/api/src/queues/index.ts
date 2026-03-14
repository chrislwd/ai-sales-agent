import { Queue, Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { env } from '../config/env.js'

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })

// ─── Queues ───────────────────────────────────────────────────────────────────

export const sequenceQueue = new Queue('sequence-steps', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

export const notificationQueue = new Queue('notifications', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
  },
})

export const crmSyncQueue = new Queue('crm-sync', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10000 },
  },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function scheduleNextStep(enrollmentId: string, delayMs = 0) {
  const jobId = `step:${enrollmentId}`
  await sequenceQueue.remove(jobId)
  await sequenceQueue.add(
    'execute-step',
    { enrollmentId },
    { jobId, delay: delayMs },
  )
}

export async function enqueueCrmSync(payload: {
  workspaceId: string
  objectType: 'contact' | 'account' | 'meeting' | 'activity'
  objectId: string
  action: 'upsert' | 'delete'
}) {
  await crmSyncQueue.add('sync', payload)
}

export async function enqueueNotification(payload: {
  workspaceId: string
  type: string
  recipientId: string
  data: Record<string, unknown>
}) {
  await notificationQueue.add('notify', payload)
}

export { connection as redisConnection }
