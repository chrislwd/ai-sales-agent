import { Worker } from 'bullmq'
import { redisConnection } from './index.js'
import { executeStep } from '../modules/sequences/sequences.service.js'
import { enqueueCrmSync } from './index.js'

// ─── Sequence step worker ─────────────────────────────────────────────────────

export const sequenceWorker = new Worker(
  'sequence-steps',
  async (job) => {
    const { enrollmentId } = job.data as { enrollmentId: string }
    await executeStep(enrollmentId)
  },
  {
    connection: redisConnection,
    concurrency: 10,
  },
)

sequenceWorker.on('failed', (job, err) => {
  console.error(`Sequence job ${job?.id} failed:`, err.message)
})

// ─── Notification worker ──────────────────────────────────────────────────────

export const notificationWorker = new Worker(
  'notifications',
  async (job) => {
    const { type, workspaceId, recipientId, data } = job.data
    console.log(`[notification] type=${type} workspace=${workspaceId}`, data)
    // TODO: dispatch emails via email service
  },
  { connection: redisConnection, concurrency: 5 },
)

// ─── CRM sync worker ──────────────────────────────────────────────────────────

export const crmSyncWorker = new Worker(
  'crm-sync',
  async (job) => {
    const { workspaceId, objectType, objectId, action } = job.data
    console.log(`[crm-sync] ${action} ${objectType}:${objectId} workspace=${workspaceId}`)
    // TODO: call CRM sync service
  },
  { connection: redisConnection, concurrency: 3 },
)

export function startWorkers() {
  console.log('BullMQ workers started')
}
