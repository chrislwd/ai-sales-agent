import { env } from '../../config/env.js'

const HS_API = 'https://api.hubapi.com'

export interface HubSpotContact {
  id?: string
  properties: {
    email: string
    firstname?: string
    lastname?: string
    jobtitle?: string
    lifecyclestage?: string
    hs_lead_status?: string
    [key: string]: string | undefined
  }
}

export interface HubSpotCompany {
  id?: string
  properties: {
    name: string
    domain?: string
    industry?: string
    country?: string
    numberofemployees?: string
    [key: string]: string | undefined
  }
}

export interface HubSpotEngagement {
  type: 'EMAIL' | 'NOTE' | 'MEETING'
  metadata: Record<string, unknown>
  associations: { contactIds?: string[]; companyIds?: string[] }
}

export class HubSpotClient {
  constructor(private accessToken: string) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${HS_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }))
      throw new Error(`HubSpot ${method} ${path}: ${err.message ?? res.statusText}`)
    }

    return method === 'DELETE' ? (null as T) : res.json()
  }

  // ─── Contacts ───────────────────────────────────────────────────────────────

  async upsertContact(contact: HubSpotContact): Promise<{ id: string }> {
    // search by email first
    const search = await this.request<{ total: number; results: { id: string }[] }>(
      'POST',
      '/crm/v3/objects/contacts/search',
      {
        filterGroups: [{
          filters: [{ propertyName: 'email', operator: 'EQ', value: contact.properties.email }],
        }],
        limit: 1,
      },
    )

    if (search.total > 0 && search.results[0]) {
      const id = search.results[0].id
      await this.request('PATCH', `/crm/v3/objects/contacts/${id}`, { properties: contact.properties })
      return { id }
    }

    return this.request<{ id: string }>('POST', '/crm/v3/objects/contacts', {
      properties: contact.properties,
    })
  }

  // ─── Companies ──────────────────────────────────────────────────────────────

  async upsertCompany(company: HubSpotCompany): Promise<{ id: string }> {
    if (company.properties.domain) {
      const search = await this.request<{ total: number; results: { id: string }[] }>(
        'POST',
        '/crm/v3/objects/companies/search',
        {
          filterGroups: [{
            filters: [{ propertyName: 'domain', operator: 'EQ', value: company.properties.domain }],
          }],
          limit: 1,
        },
      )

      if (search.total > 0 && search.results[0]) {
        const id = search.results[0].id
        await this.request('PATCH', `/crm/v3/objects/companies/${id}`, { properties: company.properties })
        return { id }
      }
    }

    return this.request<{ id: string }>('POST', '/crm/v3/objects/companies', {
      properties: company.properties,
    })
  }

  // Associate contact with company
  async associateContactWithCompany(contactId: string, companyId: string): Promise<void> {
    await this.request(
      'PUT',
      `/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/contact_to_company`,
    )
  }

  // ─── Engagements ────────────────────────────────────────────────────────────

  async createEngagement(engagement: HubSpotEngagement): Promise<{ id: string }> {
    // Use v1 engagements API
    return this.request<{ id: string }>('POST', '/engagements/v1/engagements', {
      engagement: { type: engagement.type, timestamp: Date.now() },
      metadata: engagement.metadata,
      associations: engagement.associations,
    })
  }

  // ─── OAuth ──────────────────────────────────────────────────────────────────

  static getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: env.HUBSPOT_CLIENT_ID ?? '',
      redirect_uri: env.HUBSPOT_REDIRECT_URI ?? '',
      scope: 'crm.objects.contacts.write crm.objects.contacts.read crm.objects.companies.write engagements.read engagements.write',
      response_type: 'code',
    })
    return `https://app.hubspot.com/oauth/authorize?${params}`
  }

  static async exchangeCode(code: string): Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
  }> {
    const res = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: env.HUBSPOT_CLIENT_ID ?? '',
        client_secret: env.HUBSPOT_CLIENT_SECRET ?? '',
        redirect_uri: env.HUBSPOT_REDIRECT_URI ?? '',
        code,
      }),
    })
    if (!res.ok) throw new Error('HubSpot token exchange failed')
    return res.json()
  }

  static async refreshToken(refreshToken: string): Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
  }> {
    const res = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: env.HUBSPOT_CLIENT_ID ?? '',
        client_secret: env.HUBSPOT_CLIENT_SECRET ?? '',
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) throw new Error('HubSpot token refresh failed')
    return res.json()
  }
}
