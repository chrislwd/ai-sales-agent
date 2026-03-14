import { db, activityLogs } from '../../db/index.js'

interface ActivityParams {
  workspaceId: string
  objectType: string
  objectId: string
  activityType: string
  actorType: 'ai' | 'user' | 'system'
  actorId?: string
  payload?: Record<string, unknown>
}

export async function logActivity(params: ActivityParams) {
  await db.insert(activityLogs).values({
    workspaceId: params.workspaceId,
    objectType: params.objectType,
    objectId: params.objectId,
    activityType: params.activityType,
    actorType: params.actorType,
    actorId: params.actorId,
    payload: params.payload ?? {},
  })
}
