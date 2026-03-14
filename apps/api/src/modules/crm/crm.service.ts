import { db, crmConnections, contacts, accounts, meetings, activityLogs } from '../../db/index.js'
import { eq, and } from 'drizzle-orm'
import { HubSpotClient } from './hubspot.client.js'
import { logActivity } from '../analytics/activity.js'

// Map our lifecycle status to HubSpot lifecycle stages
const LIFECYCLE_MAP: Record<string, string> = {
  new: 'lead',
  contacted: 'lead',
  replied: 'marketingqualifiedlead',
  meeting_scheduled: 'salesqualifiedlead',
  meeting_completed: 'salesqualifiedlead',
  qualified: 'opportunity',
  disqualified: 'other',
  nurture: 'lead',
}

export async function getCrmClient(workspaceId: string): Promise<HubSpotClient | null> {
  const connection = await db.query.crmConnections.findFirst({
    where: and(
      eq(crmConnections.workspaceId, workspaceId),
      eq(crmConnections.provider, 'hubspot'),
      eq(crmConnections.isActive, true),
    ),
  })

  if (!connection) return null

  // refresh token if expired
  if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date() && connection.refreshToken) {
    try {
      const refreshed = await HubSpotClient.refreshToken(connection.refreshToken)
      const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000)
      await db.update(crmConnections)
        .set({
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          tokenExpiresAt: expiresAt,
        })
        .where(eq(crmConnections.id, connection.id))
      return new HubSpotClient(refreshed.access_token)
    } catch {
      await db.update(crmConnections).set({ isActive: false }).where(eq(crmConnections.id, connection.id))
      return null
    }
  }

  return new HubSpotClient(connection.accessToken)
}

export async function syncContact(contactId: string, workspaceId: string): Promise<void> {
  const client = await getCrmClient(workspaceId)
  if (!client) return

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
    with: { account: true },
  })
  if (!contact) return

  try {
    // Upsert company first
    let hsCompanyId: string | undefined
    if (contact.account) {
      const company = await client.upsertCompany({
        properties: {
          name: contact.account.companyName,
          domain: contact.account.domain ?? undefined,
          industry: contact.account.industry ?? undefined,
          country: contact.account.country ?? undefined,
          numberofemployees: contact.account.employeeSize?.toString(),
        },
      })
      hsCompanyId = company.id

      // Update account with CRM id
      await db.update(accounts)
        .set({ crmAccountId: company.id, crmProvider: 'hubspot' })
        .where(eq(accounts.id, contact.accountId))
    }

    // Upsert contact
    const hsContact = await client.upsertContact({
      properties: {
        email: contact.email,
        firstname: contact.firstName,
        lastname: contact.lastName,
        jobtitle: contact.title ?? undefined,
        lifecyclestage: LIFECYCLE_MAP[contact.lifecycleStatus] ?? 'lead',
      },
    })

    // Associate with company
    if (hsCompanyId) {
      await client.associateContactWithCompany(hsContact.id, hsCompanyId)
    }

    // Update contact with CRM id
    await db.update(contacts)
      .set({ crmContactId: hsContact.id, crmProvider: 'hubspot' })
      .where(eq(contacts.id, contactId))

    await logActivity({
      workspaceId,
      objectType: 'contact',
      objectId: contactId,
      activityType: 'crm_sync_success',
      actorType: 'system',
      payload: { provider: 'hubspot', crmContactId: hsContact.id },
    })
  } catch (err) {
    await logActivity({
      workspaceId,
      objectType: 'contact',
      objectId: contactId,
      activityType: 'crm_sync_failed',
      actorType: 'system',
      payload: { provider: 'hubspot', error: err instanceof Error ? err.message : 'unknown' },
    })
  }
}

export async function syncMeetingActivity(meetingId: string, workspaceId: string): Promise<void> {
  const client = await getCrmClient(workspaceId)
  if (!client) return

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
    with: { contact: true },
  })
  if (!meeting?.contact.crmContactId) return

  try {
    await client.createEngagement({
      type: 'MEETING',
      metadata: {
        title: 'Meeting booked via AI Sales Agent',
        startTime: meeting.scheduledAt?.getTime() ?? Date.now(),
        endTime: meeting.scheduledAt
          ? meeting.scheduledAt.getTime() + meeting.durationMinutes * 60000
          : Date.now(),
        body: meeting.notes ?? '',
      },
      associations: {
        contactIds: [meeting.contact.crmContactId],
      },
    })
  } catch (err) {
    console.error(`CRM meeting sync failed for ${meetingId}:`, err)
  }
}
