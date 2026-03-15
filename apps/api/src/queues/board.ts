import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js'
import { FastifyAdapter } from '@bull-board/fastify'
import type { FastifyInstance } from 'fastify'
import { sequenceQueue, notificationQueue, crmSyncQueue } from './index.js'

export async function registerBullBoard(app: FastifyInstance) {
  const serverAdapter = new FastifyAdapter()
  serverAdapter.setBasePath('/admin/queues')

  createBullBoard({
    queues: [
      new BullMQAdapter(sequenceQueue as any),
      new BullMQAdapter(notificationQueue as any),
      new BullMQAdapter(crmSyncQueue as any),
    ] as any,
    serverAdapter,
  })

  await app.register(serverAdapter.registerPlugin(), {
    basePath: '/admin/queues',
    prefix: '/admin/queues',
  })
}
